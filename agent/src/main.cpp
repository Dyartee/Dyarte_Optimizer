#include <iostream>
#include <string>
#include <atomic>
#include <csignal>
#include <chrono>
#include <thread>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "logger.h"
#include "protocol.h"
#include "websocket_server.h"
#include "json_helper.h"
#include "token_validator.h"
#include "agent_identity.h"
#include "hardware_inventory.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace fs = std::filesystem;
using namespace Dyarte::Agent;

static std::atomic<bool> g_keepRunning{true};
static WebSocketServer* g_serverInstance = nullptr;

struct PowerSchemeInfo {
    std::string guid;
    std::string name;
    bool valid = false;
};

static bool IsValidGuid(const std::string& guid) {
    if (guid.length() != 36) return false;
    for (size_t i = 0; i < 36; ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (guid[i] != '-') return false;
        } else {
            if (!std::isxdigit(static_cast<unsigned char>(guid[i]))) return false;
        }
    }
    return true;
}

static std::string GetAgentDataDirectory() {
#ifdef _WIN32
    char localAppData[MAX_PATH];
    if (GetEnvironmentVariableA("LOCALAPPDATA", localAppData, MAX_PATH) > 0) {
        fs::path p = fs::path(localAppData) / "DYARTE" / "Agent";
        std::error_code ec;
        fs::create_directories(p, ec);
        return p.string();
    }
#endif
    fs::path p = fs::current_path() / "agent_data";
    std::error_code ec;
    fs::create_directories(p, ec);
    return p.string();
}

static std::string GetPersistentDeviceId() {
    static std::string s_cachedDeviceId = "";
    if (!s_cachedDeviceId.empty()) {
        return s_cachedDeviceId;
    }

    std::string dataDir = GetAgentDataDirectory();
    fs::path idFile = fs::path(dataDir) / "device_id.txt";

    // 1. Try reading from persistent file
    if (fs::exists(idFile)) {
        std::ifstream ifs(idFile);
        std::string line;
        if (std::getline(ifs, line)) {
            line.erase(0, line.find_first_not_of(" \t\r\n"));
            line.erase(line.find_last_not_of(" \t\r\n") + 1);
            if (!line.empty() && line.find(" ") == std::string::npos) {
                s_cachedDeviceId = line;
                return s_cachedDeviceId;
            }
        }
    }

    // 2. On Windows, read official MachineGuid from Registry
#ifdef _WIN32
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        char guidBuf[128];
        DWORD bufSize = sizeof(guidBuf);
        if (RegQueryValueExA(hKey, "MachineGuid", NULL, NULL, (LPBYTE)guidBuf, &bufSize) == ERROR_SUCCESS) {
            std::string regGuid(guidBuf);
            RegCloseKey(hKey);
            if (!regGuid.empty()) {
                s_cachedDeviceId = "WIN-" + regGuid;
                std::ofstream ofs(idFile);
                if (ofs.is_open()) {
                    ofs << s_cachedDeviceId << std::endl;
                }
                return s_cachedDeviceId;
            }
        }
        RegCloseKey(hKey);
    }
#endif

    // Fallback: Generate stable host-based ID
    std::string fallbackId = "DEV-AGENT-" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
    s_cachedDeviceId = fallbackId;
    std::ofstream ofs(idFile);
    if (ofs.is_open()) {
        ofs << s_cachedDeviceId << std::endl;
    }
    return s_cachedDeviceId;
}

static fs::path GetSnapshotPath(const std::string& deviceId, const std::string& toolId) {
    fs::path base = fs::path(GetAgentDataDirectory()) / "backups" / deviceId / toolId;
    std::error_code ec;
    fs::create_directories(base, ec);
    return base / "snapshot.json";
}

static bool SavePersistentSnapshot(
    const std::string& optimizationId,
    const std::string& executionId,
    const std::string& deviceId,
    const std::string& toolId,
    const std::string& beforeStateJson,
    const std::string& targetStateJson
) {
    fs::path finalPath = GetSnapshotPath(deviceId, toolId);
    fs::path tmpPath = finalPath;
    tmpPath.replace_extension(".tmp");

    {
        std::ofstream ofs(tmpPath, std::ios::trunc);
        if (!ofs.is_open()) return false;

        auto now = std::chrono::system_clock::now();
        auto nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

        ofs << "{\n"
            << "  \"optimization_id\": \"" << optimizationId << "\",\n"
            << "  \"execution_id\": \"" << executionId << "\",\n"
            << "  \"device_id\": \"" << deviceId << "\",\n"
            << "  \"tool_id\": \"" << toolId << "\",\n"
            << "  \"created_at\": " << nowMs << ",\n"
            << "  \"agent_version\": \"" << ProtocolConstants::AGENT_VERSION << "\",\n"
            << "  \"before_state\": " << (beforeStateJson.empty() ? "{}" : beforeStateJson) << ",\n"
            << "  \"target_state\": " << (targetStateJson.empty() ? "{}" : targetStateJson) << ",\n"
            << "  \"rollback_supported\": true\n"
            << "}\n";
        ofs.flush();
        if (!ofs.good()) return false;
    }

    std::error_code ec;
    fs::rename(tmpPath, finalPath, ec);
    if (ec) {
        fs::copy_file(tmpPath, finalPath, fs::copy_options::overwrite_existing, ec);
        fs::remove(tmpPath, ec);
    }
    return fs::exists(finalPath);
}

static bool LoadPersistentSnapshot(
    const std::string& deviceId,
    const std::string& toolId,
    std::string& outBeforeJson,
    std::string& outBeforeGuid
) {
    fs::path path = GetSnapshotPath(deviceId, toolId);
    if (!fs::exists(path)) return false;

    std::ifstream ifs(path);
    if (!ifs.is_open()) return false;

    std::string content((std::istreambuf_iterator<char>(ifs)), std::istreambuf_iterator<char>());
    JsonValue json;
    if (!JsonParser::Parse(content, json) || !json.is_object()) return false;

    if (json.has_field("before_state")) {
        const JsonValue& before = json.get_field("before_state");
        if (before.is_object()) {
            outBeforeGuid = before.get_field_string("guid", "");
            outBeforeJson = before.to_json();
            return !outBeforeGuid.empty();
        }
    }
    return false;
}

static PowerSchemeInfo GetActivePowerScheme() {
    PowerSchemeInfo info;
#ifdef _WIN32
    FILE* pipe = _popen("powercfg /getactivescheme", "r");
    if (!pipe) return info;
    char buffer[256];
    std::string result = "";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        result += buffer;
    }
    _pclose(pipe);

    size_t guidPos = result.find("GUID: ");
    if (guidPos != std::string::npos) {
        std::string sub = result.substr(guidPos + 6);
        size_t spacePos = sub.find_first_of(" \t\r\n");
        if (spacePos != std::string::npos) {
            info.guid = sub.substr(0, spacePos);
        }
    }
    size_t parenStart = result.find("(");
    size_t parenEnd = result.rfind(")");
    if (parenStart != std::string::npos && parenEnd != std::string::npos && parenEnd > parenStart) {
        info.name = result.substr(parenStart + 1, parenEnd - parenStart - 1);
    }
    info.valid = IsValidGuid(info.guid);
#endif
    return info;
}

static std::string FindExistingHighPerformanceSchemeGuid() {
#ifdef _WIN32
    FILE* pipe = _popen("powercfg /list", "r");
    if (!pipe) return "";
    char buffer[512];
    std::string output = "";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        output += buffer;
    }
    _pclose(pipe);

    const std::string highPerfBase = "8c5e7fda-e8bf-4a96-9a14-5e7d687951d1";
    if (output.find(highPerfBase) != std::string::npos) {
        return highPerfBase;
    }

    std::istringstream stream(output);
    std::string line;
    while (std::getline(stream, line)) {
        std::string lower = line;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });
        if (lower.find("alto desempenho") != std::string::npos ||
            lower.find("high performance") != std::string::npos ||
            lower.find("ultimate performance") != std::string::npos) {
            size_t guidPos = line.find("GUID: ");
            if (guidPos != std::string::npos) {
                std::string sub = line.substr(guidPos + 6);
                size_t spacePos = sub.find_first_of(" \t\r\n");
                if (spacePos != std::string::npos) {
                    std::string g = sub.substr(0, spacePos);
                    if (IsValidGuid(g)) return g;
                }
            }
        }
    }
#endif
    return "";
}

static std::string DuplicateHighPerformanceScheme() {
#ifdef _WIN32
    FILE* pipe = _popen("powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a14-5e7d687951d1", "r");
    if (!pipe) return "";
    char buffer[512];
    std::string result = "";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        result += buffer;
    }
    _pclose(pipe);

    size_t colonPos = result.find(":");
    if (colonPos != std::string::npos) {
        std::string sub = result.substr(colonPos + 1);
        size_t firstNonSpace = sub.find_first_not_of(" \t\r\n");
        if (firstNonSpace != std::string::npos) {
            std::string afterTrim = sub.substr(firstNonSpace);
            size_t spacePos = afterTrim.find_first_of(" \t\r\n");
            if (spacePos != std::string::npos) {
                std::string g = afterTrim.substr(0, spacePos);
                if (IsValidGuid(g)) return g;
            }
        }
    }
#endif
    return "";
}

static bool SetActivePowerScheme(const std::string& guid) {
#ifdef _WIN32
    if (!IsValidGuid(guid)) return false;
    std::string cmd = "powercfg /setactive " + guid;
    int res = system(cmd.c_str());
    return res == 0;
#else
    (void)guid;
    return false;
#endif
}

#ifdef _WIN32
BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    switch (ctrlType) {
        case CTRL_C_EVENT:
        case CTRL_BREAK_EVENT:
        case CTRL_CLOSE_EVENT:
        case CTRL_LOGOFF_EVENT:
        case CTRL_SHUTDOWN_EVENT:
            Logger::Instance().Info("Received termination signal from Windows. Initiating graceful shutdown...");
            g_keepRunning.store(false);
            if (g_serverInstance) {
                g_serverInstance->Stop();
            }
            return TRUE;
        default:
            return FALSE;
    }
}
#else
void PosixSignalHandler(int signal) {
    Logger::Instance().Info("Received POSIX signal (" + std::to_string(signal) + "). Initiating graceful shutdown...");
    g_keepRunning.store(false);
    if (g_serverInstance) {
        g_serverInstance->Stop();
    }
}
#endif

void HandleIncomingClientMessage(SocketHandle clientSock, const std::string& rawMessage) {
    // 1. Validate payload size
    if (!SecurityValidator::ValidateMessageSize(rawMessage.size())) {
        Logger::Instance().Error("Message rejected: Size exceeded 64 KB limit.");
        std::string err = ResponseBuilder::BuildError("", "Payload size exceeded 64 KB limit.");
        g_serverInstance->SendTextMessage(clientSock, err);
        return;
    }

    // 2. Security validation against arbitrary execution / forbidden words
    if (SecurityValidator::ContainsForbiddenPatterns(rawMessage)) {
        Logger::Instance().Error("SECURITY ALERT: Forbidden execution pattern detected in client message. Rejected.");
        std::string err = ResponseBuilder::BuildError("", "Security validation failed: Forbidden command execution keyword detected.");
        g_serverInstance->SendTextMessage(clientSock, err);
        return;
    }

    // 3. JSON Syntax parsing
    JsonValue json;
    if (!JsonParser::Parse(rawMessage, json) || !json.is_object()) {
        Logger::Instance().Error("Invalid JSON payload received from client.");
        std::string err = ResponseBuilder::BuildError("", "Malformed JSON message.");
        g_serverInstance->SendTextMessage(clientSock, err);
        return;
    }

    // 4. Protocol Version Validation
    int protocolVer = json.get_field_int("protocol_version", 0);
    if (protocolVer != ProtocolConstants::PROTOCOL_VERSION) {
        Logger::Instance().Error("Protocol version mismatch. Expected: 1, Received: " + std::to_string(protocolVer));
        std::string err = ResponseBuilder::BuildError("", "Protocol version mismatch.");
        g_serverInstance->SendTextMessage(clientSock, err);
        return;
    }

    // 5. Message Type Routing
    std::string typeStr = json.get_field_string("type", "");
    std::string requestId = json.get_field_string("request_id", "");
    MessageType msgType = StringToMessageType(typeStr);

    switch (msgType) {
        case MessageType::HANDSHAKE: {
            std::string clientName = json.get_field_string("client", "UNKNOWN");
            Logger::Instance().Info("HANDSHAKE received from client: " + clientName);

            std::string response = ResponseBuilder::BuildHandshakeAck();
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("HANDSHAKE_ACK sent to client. Status: ONLINE");
            break;
        }

        case MessageType::PING: {
            int64_t timestamp = json.get_field_int64("timestamp", 0);
            Logger::Instance().Debug("PING received. Timestamp: " + std::to_string(timestamp));

            std::string response = ResponseBuilder::BuildPong(timestamp);
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Debug("PONG dispatched.");
            break;
        }

        case MessageType::TEST_CONNECTION: {
            Logger::Instance().Info("TEST_CONNECTION command received. Request ID: " + requestId);

            // Phase 1 Safe Test Command: Returns verified agent status without OS mutations
            std::string response = ResponseBuilder::BuildTestConnectionResult(requestId);
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("TEST_CONNECTION_RESULT dispatched. Success: true.");
            break;
        }

        case MessageType::GET_STATUS: {
            Logger::Instance().Info("GET_STATUS command received. Request ID: " + requestId);
            std::string persistentDeviceId = GetPersistentDeviceId();
#ifdef _WIN32
            PowerSchemeInfo curScheme = GetActivePowerScheme();
            std::string ramTotalStr = "";
            MEMORYSTATUSEX memInfo;
            memInfo.dwLength = sizeof(MEMORYSTATUSEX);
            if (GlobalMemoryStatusEx(&memInfo)) {
                int64_t totalGb = static_cast<int64_t>((memInfo.ullTotalPhys / (1024 * 1024 * 1024)) + 0.5);
                ramTotalStr = std::to_string(totalGb) + " GB";
            }

            JsonValue cpuJ = JsonValue::parse(HardwareInventory::detectCPU());
            JsonValue gpuJ = JsonValue::parse(HardwareInventory::detectGPU());
            JsonValue moboJ = JsonValue::parse(HardwareInventory::detectMotherboard());
            JsonValue biosJ = JsonValue::parse(HardwareInventory::detectBIOS());
            JsonValue secJ = JsonValue::parse(HardwareInventory::detectSecurity());

            std::string cpuName = cpuJ.get_field_string("commercial_name", "");
            std::string gpuName = gpuJ.get_field_string("full_name", "");
            std::string moboName = moboJ.get_field_string("product_name", "");
            std::string biosVer = biosJ.get_field_string("version", "");
            int sbState = -1;
            if (secJ.has_field("secure_boot") && secJ.get("secure_boot").is_bool()) {
                sbState = secJ.get("secure_boot").get_bool() ? 1 : 0;
            }

            std::string agentPubHex = AgentIdentity::GetPublicKeyHex();
            std::string response = ResponseBuilder::BuildStatusResult(
                requestId,
                "Windows",
                true,
                curScheme.guid,
                curScheme.name,
                persistentDeviceId,
                cpuName,
                gpuName,
                ramTotalStr,
                "",
                moboName,
                biosVer,
                sbState,
                agentPubHex
            );
#else
            std::string agentPubHex = AgentIdentity::GetPublicKeyHex();
            std::string response = ResponseBuilder::BuildStatusResult(
                requestId,
                "Linux / Container",
                false,
                "",
                "",
                persistentDeviceId,
                "N/D",
                "N/D",
                "N/D",
                "N/D",
                "N/D",
                "N/D",
                -1,
                agentPubHex
            );
#endif
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("STATUS_RESULT dispatched with real hardware inventory.");
            break;
        }

        case MessageType::GET_HARDWARE_INVENTORY: {
            Logger::Instance().Info("GET_HARDWARE_INVENTORY received. Request ID: " + requestId);
            std::string persistentDeviceId = GetPersistentDeviceId();
            std::string fullInvJson = HardwareInventory::getFullInventory(persistentDeviceId, ProtocolConstants::AGENT_VERSION);
            std::string response = ResponseBuilder::BuildHardwareInventoryResult(requestId, fullInvJson);
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("HARDWARE_INVENTORY_RESULT dispatched.");
            break;
        }

        case MessageType::APPLY_OPTIMIZATION: {
            std::string toolId = json.get_field_string("tool_id", "");
            std::string executionToken = json.get_field_string("execution_token", "");
            int64_t protocolVersion = json.get_field_int64("protocol_version", 1);

            Logger::Instance().Info("APPLY_OPTIMIZATION received for tool: " + toolId + " (Request ID: " + requestId + ")");

            if (protocolVersion != 1) {
                std::string response = ResponseBuilder::BuildError(requestId, "Versao do protocolo invalida.", "PROTOCOL_MISMATCH");
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
            }

            if (toolId.empty()) {
                std::string response = ResponseBuilder::BuildError(requestId, "tool_id obrigatorio para aplicacao de otimizacao.", "REQUEST_INVALID");
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
            }

            if (executionToken.empty()) {
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "FALHA",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    "Token de autorizacao assinado obrigatorio nao fornecido.",
                    "Execucao negada pelo Agent: ausente execution_token assinado.",
                    "INVALID_TOKEN"
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                Logger::Instance().Warn("APPLY_OPTIMIZATION rejected: missing execution_token.");
                break;
            }

            std::string persistentDeviceId = GetPersistentDeviceId();
            TokenValidationResult tokenRes = TokenValidator::ValidateToken(toolId, executionToken, persistentDeviceId, "APPLY");
            if (!tokenRes.valid) {
                Logger::Instance().Warn("APPLY_OPTIMIZATION rejected by TokenValidator: " + tokenRes.error + " (Code: " + tokenRes.errorCode + ")");
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "FALHA",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    tokenRes.error,
                    "Execucao rejeitada por validacao criptografica do Agent.",
                    tokenRes.errorCode
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
            }

            Logger::Instance().Info("Execution Token cryptographically verified for tool: " + toolId + " (User: " + tokenRes.userId + ")");

            if (toolId == "tool_perf_power_plan") {
                auto startTime = std::chrono::steady_clock::now();
#ifndef _WIN32
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "INCOMPATIVEL",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    "PLATFORM_INCOMPATIBLE: Otimizacao nativa de energia via PowerCfg requer Windows 10 ou Windows 11.",
                    "Falha: Sistema operacional não é Windows."
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                Logger::Instance().Warn("tool_perf_power_plan rejected: Non-Windows platform.");
                break;
#else
                PowerSchemeInfo before = GetActivePowerScheme();
                if (!before.valid) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        "{}",
                        "{}",
                        false,
                        0,
                        "Falha ao consultar plano de energia ativo via PowerCfg.",
                        "Erro ao executar PowerCfg no Windows."
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    break;
                }

                std::string deviceId = GetPersistentDeviceId();
                std::string beforeJson = "{\"guid\":\"" + before.guid + "\",\"name\":\"" + before.name + "\"}";
                const std::string highPerfBase = "8c5e7fda-e8bf-4a96-9a14-5e7d687951d1";

                // Se o plano atual já for High Performance
                if (before.guid == highPerfBase || before.name.find("Alto desempenho") != std::string::npos || before.name.find("High performance") != std::string::npos) {
                    auto endTime = std::chrono::steady_clock::now();
                    int64_t dur = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
                    std::string afterJson = beforeJson;

                    std::string receiptNonce = AgentIdentity::GenerateRandomNonce(16);
                    auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                    std::string canonicalReceipt = AgentIdentity::BuildCanonicalReceiptJson(
                        tokenRes.executionId, requestId, toolId, "APPLY", tokenRes.userId, deviceId,
                        "JA_APLICADO", true, beforeJson, afterJson, true, dur, ProtocolConstants::AGENT_VERSION, nowSec, receiptNonce
                    );
                    std::string receiptSig = AgentIdentity::SignReceipt(canonicalReceipt);

                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "JA_APLICADO",
                        true,
                        true,
                        beforeJson,
                        afterJson,
                        true,
                        dur,
                        "",
                        "Plano de Alto Desempenho já está ativo no Windows.",
                        "",
                        canonicalReceipt,
                        receiptSig
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Info("tool_perf_power_plan already applied.");
                    break;
                }

                // Requirement 8: Fluxo obrigatório
                // 1. Detectar plano atual
                // 2. Detectar plano-alvo
                std::string targetGuid = FindExistingHighPerformanceSchemeGuid();
                if (targetGuid.empty()) {
                    targetGuid = DuplicateHighPerformanceScheme();
                }

                // 3. Validar GUID: NUNCA assumir GUID padrão se o GUID real não foi encontrado!
                if (targetGuid.empty() || !IsValidGuid(targetGuid)) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        beforeJson,
                        "{}",
                        false,
                        0,
                        "POWER_PLAN_NOT_FOUND: Nenhum plano de Alto Desempenho válido pôde ser localizado ou duplicado no Windows.",
                        "Plano-alvo não encontrado no sistema operacional.",
                        "POWER_PLAN_NOT_FOUND"
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Error("tool_perf_power_plan aborted: Target GUID not found.");
                    break;
                }

                // 4. Criar snapshot do estado real com before_state e target_state (usando o GUID realmente encontrado/criado)
                std::string targetStateJson = "{\"guid\":\"" + targetGuid + "\",\"name\":\"Alto desempenho\"}";
                const bool backupOk = SavePersistentSnapshot(requestId, tokenRes.executionId, deviceId, toolId, beforeJson, targetStateJson);
                if (!backupOk) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        beforeJson,
                        "{}",
                        false,
                        0,
                        "BACKUP_FAILED: Falha ao persistir snapshot atômico pré-otimização.",
                        "Operação abortada por segurança: o backup inicial falhou.",
                        "BACKUP_FAILED"
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Error("tool_perf_power_plan aborted: SavePersistentSnapshot failed.");
                    break;
                }

                // 5. Aplicar
                bool applied = SetActivePowerScheme(targetGuid);

                // 6. Ler novamente
                PowerSchemeInfo after = GetActivePowerScheme();

                // 7. Comparar GUID real
                bool verified = (after.valid && after.guid == targetGuid);

                // 8. Somente então retornar APLICADO!

                auto endTime = std::chrono::steady_clock::now();
                int64_t dur = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();

                std::string afterJson = "{\"guid\":\"" + after.guid + "\",\"name\":\"" + after.name + "\"}";

                // Section 16 & 17: Gera e assina Execution Receipt canônico
                std::string receiptNonce = AgentIdentity::GenerateRandomNonce(16);
                auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                std::string canonicalReceipt = AgentIdentity::BuildCanonicalReceiptJson(
                    tokenRes.executionId, requestId, toolId, "APPLY", tokenRes.userId, deviceId,
                    verified ? "APLICADO" : "FALHA", verified, beforeJson, afterJson, true, dur, ProtocolConstants::AGENT_VERSION, nowSec, receiptNonce
                );
                std::string receiptSig = AgentIdentity::SignReceipt(canonicalReceipt);

                if (verified) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "APLICADO",
                        true,
                        true,
                        beforeJson,
                        afterJson,
                        true,
                        dur,
                        "",
                        "Plano de Alto Desempenho aplicado e verificado com sucesso via PowerCfg.",
                        "",
                        canonicalReceipt,
                        receiptSig
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Info("tool_perf_power_plan applied and verified successfully.");
                } else {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        beforeJson,
                        afterJson,
                        false,
                        dur,
                        "Falha na verificação do plano de energia via PowerCfg.",
                        "O Windows não confirmou a alteração do plano de energia.",
                        "VERIFY_FAILED",
                        canonicalReceipt,
                        receiptSig
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Error("tool_perf_power_plan verification failed.");
                }
                break;
#endif
            }

            // For all other tools: return honest NOT_IMPLEMENTED status with full audit format
            std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                requestId,
                toolId,
                "INCOMPATIVEL",
                false,
                false,
                "{}",
                "{}",
                false,
                0,
                "TOOL_NOT_IMPLEMENTED: Esta otimização está em desenvolvimento e não possui rotina nativa no Windows Agent.",
                "Rotina nativa ainda não disponível no Agent.",
                "TOOL_NOT_IMPLEMENTED"
            );
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Warn("APPLY_OPTIMIZATION: Routine not implemented for tool " + toolId);
            break;
        }

        case MessageType::ROLLBACK_OPTIMIZATION: {
            std::string toolId = json.get_field_string("tool_id", "");
            std::string executionToken = json.get_field_string("execution_token", "");
            Logger::Instance().Info("ROLLBACK_OPTIMIZATION received for tool: " + toolId + " (Request ID: " + requestId + ")");

            // Section 10: ROLLBACK_OPTIMIZATION também exige execution_token assinado com operation=ROLLBACK
            if (executionToken.empty()) {
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "FALHA",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    "Token de autorizacao de rollback obrigatorio ausente.",
                    "Rollback negado pelo Agent: ausente execution_token assinado.",
                    "INVALID_TOKEN"
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
            }

            std::string persistentDeviceId = GetPersistentDeviceId();
            TokenValidationResult tokenRes = TokenValidator::ValidateToken(toolId, executionToken, persistentDeviceId, "ROLLBACK");
            if (!tokenRes.valid) {
                Logger::Instance().Warn("ROLLBACK_OPTIMIZATION rejected by TokenValidator: " + tokenRes.error + " (Code: " + tokenRes.errorCode + ")");
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "FALHA",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    tokenRes.error,
                    "Rollback rejeitado por validacao criptografica do Agent.",
                    tokenRes.errorCode
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
            }

            if (toolId == "tool_perf_power_plan") {
#ifndef _WIN32
                std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                    requestId,
                    toolId,
                    "INCOMPATIVEL",
                    false,
                    false,
                    "{}",
                    "{}",
                    false,
                    0,
                    "PLATFORM_INCOMPATIBLE: Rollback via PowerCfg requer Windows 10 ou Windows 11.",
                    "Falha: Sistema operacional não é Windows."
                );
                g_serverInstance->SendTextMessage(clientSock, response);
                break;
#else
                auto startRollback = std::chrono::steady_clock::now();
                std::string deviceId = GetPersistentDeviceId();
                std::string beforeJson = "";
                std::string beforeGuid = "";
                bool loaded = LoadPersistentSnapshot(deviceId, toolId, beforeJson, beforeGuid);

                if (!loaded || beforeGuid.empty() || !IsValidGuid(beforeGuid)) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        "{}",
                        "{}",
                        false,
                        0,
                        "Nenhum snapshot persistido encontrado para reversao.",
                        "Falha: Snapshot de estado anterior nao encontrado em disco.",
                        "ROLLBACK_FAILED"
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    break;
                }

                PowerSchemeInfo before = GetActivePowerScheme();
                bool reverted = SetActivePowerScheme(beforeGuid);
                PowerSchemeInfo after = GetActivePowerScheme();
                bool verified = (after.valid && after.guid == beforeGuid);

                auto endRollback = std::chrono::steady_clock::now();
                int64_t dur = std::chrono::duration_cast<std::chrono::milliseconds>(endRollback - startRollback).count();

                std::string beforeCurrJson = "{\"guid\":\"" + before.guid + "\",\"name\":\"" + before.name + "\"}";
                std::string afterJson = "{\"guid\":\"" + after.guid + "\",\"name\":\"" + after.name + "\"}";

                // Section 16 & 17: Gera e assina Execution Receipt canônico para Rollback
                std::string receiptNonce = AgentIdentity::GenerateRandomNonce(16);
                auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                std::string canonicalReceipt = AgentIdentity::BuildCanonicalReceiptJson(
                    tokenRes.executionId, requestId, toolId, "ROLLBACK", tokenRes.userId, deviceId,
                    verified ? "REVERTIDO" : "FALHA", verified, beforeCurrJson, afterJson, false, dur, ProtocolConstants::AGENT_VERSION, nowSec, receiptNonce
                );
                std::string receiptSig = AgentIdentity::SignReceipt(canonicalReceipt);

                if (verified) {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "REVERTIDO",
                        true,
                        true,
                        beforeCurrJson,
                        afterJson,
                        false,
                        dur,
                        "",
                        "Plano de energia restaurado com sucesso para o estado anterior via PowerCfg.",
                        "",
                        canonicalReceipt,
                        receiptSig
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                    Logger::Instance().Info("tool_perf_power_plan rollback verified successfully.");
                } else {
                    std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                        requestId,
                        toolId,
                        "FALHA",
                        false,
                        false,
                        beforeCurrJson,
                        afterJson,
                        true,
                        dur,
                        "Falha ao restaurar plano de energia anterior.",
                        "O Windows não confirmou a restauração do plano de energia anterior.",
                        "ROLLBACK_FAILED",
                        canonicalReceipt,
                        receiptSig
                    );
                    g_serverInstance->SendTextMessage(clientSock, response);
                }
                break;
#endif
            }

            std::string response = ResponseBuilder::BuildOptimizationAuditResult(
                requestId,
                toolId,
                "DISPONIVEL",
                false,
                false,
                "{}",
                "{}",
                false,
                0,
                "Reversao nao disponivel: nenhuma operacao de baixo nivel foi aplicada anteriormente para " + toolId + ".",
                "Nenhuma alteração registrada para rollback."
            );
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Warn("ROLLBACK_OPTIMIZATION dispatched with status: NOT_APPLIED");
            break;
        }

        case MessageType::EXECUTE_DRIVER_PACKAGE: {
            std::string vendor = json.get_field_string("vendor", "UNKNOWN");
            Logger::Instance().Info("EXECUTE_DRIVER_PACKAGE received for vendor: " + vendor + " (Request ID: " + requestId + ")");

            std::string response = ResponseBuilder::BuildDriverPackageResult(
                requestId,
                vendor,
                "NOT_IMPLEMENTED",
                false,
                "Execucao de driver via socket no Agent nao implementada. Utilize o DriverService nativo do Electron com Setup.exe verificado."
            );
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Warn("EXECUTE_DRIVER_PACKAGE rejected: Driver execution not implemented in Agent socket.");
            break;
        }

        case MessageType::GET_TELEMETRY: {
            Logger::Instance().Info("GET_TELEMETRY received (Request ID: " + requestId + ")");
#ifdef _WIN32
            std::string ramUsageStr = "null";
            std::string ramUsedMbStr = "null";
            std::string ramTotalMbStr = "null";

            MEMORYSTATUSEX memInfo;
            memInfo.dwLength = sizeof(MEMORYSTATUSEX);
            if (GlobalMemoryStatusEx(&memInfo)) {
                ramUsageStr = std::to_string(memInfo.dwMemoryLoad);
                int64_t totalMb = static_cast<int64_t>(memInfo.ullTotalPhys / (1024 * 1024));
                int64_t availMb = static_cast<int64_t>(memInfo.ullAvailPhys / (1024 * 1024));
                ramTotalMbStr = std::to_string(totalMb);
                ramUsedMbStr = std::to_string(totalMb - availMb);
            }

            static FILETIME prevIdleTime = {0, 0};
            static FILETIME prevKernelTime = {0, 0};
            static FILETIME prevUserTime = {0, 0};
            static bool hasPrevTimes = false;
            std::string cpuUsageStr = "null";

            FILETIME idleTime, kernelTime, userTime;
            if (GetSystemTimes(&idleTime, &kernelTime, &userTime)) {
                if (hasPrevTimes) {
                    auto FileTimeToUint64 = [](const FILETIME& ft) -> uint64_t {
                        return (static_cast<uint64_t>(ft.dwHighDateTime) << 32) | ft.dwLowDateTime;
                    };
                    uint64_t idleDiff = FileTimeToUint64(idleTime) - FileTimeToUint64(prevIdleTime);
                    uint64_t kernelDiff = FileTimeToUint64(kernelTime) - FileTimeToUint64(prevKernelTime);
                    uint64_t userDiff = FileTimeToUint64(userTime) - FileTimeToUint64(prevUserTime);
                    uint64_t totalDiff = kernelDiff + userDiff;
                    if (totalDiff > 0) {
                        double cpuPercent = (static_cast<double>(totalDiff - idleDiff) / totalDiff) * 100.0;
                        if (cpuPercent < 0.0) cpuPercent = 0.0;
                        if (cpuPercent > 100.0) cpuPercent = 100.0;
                        char buf[32];
                        snprintf(buf, sizeof(buf), "%.1f", cpuPercent);
                        cpuUsageStr = buf;
                    }
                }
                prevIdleTime = idleTime;
                prevKernelTime = kernelTime;
                prevUserTime = userTime;
                hasPrevTimes = true;
            }

            std::string response = ResponseBuilder::BuildTelemetrySnapshot(
                requestId,
                cpuUsageStr,
                "null",
                ramUsageStr,
                "null",
                "null",
                "null",
                "null",
                ramUsedMbStr,
                ramTotalMbStr
            );
#else
            std::string response = ResponseBuilder::BuildTelemetrySnapshot(
                requestId,
                "null", "null", "null", "null", "null", "null", "null", "null", "null"
            );
#endif
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("TELEMETRY_SNAPSHOT dispatched.");
            break;
        }

        case MessageType::GET_HARDWARE_INVENTORY: {
            Logger::Instance().Info("GET_HARDWARE_INVENTORY received (Request ID: " + requestId + ")");
            std::string persistentDeviceId = GetPersistentDeviceId();
            std::string inventoryJson = HardwareInventory::getFullInventory(persistentDeviceId, ProtocolConstants::AGENT_VERSION);
            std::string response = ResponseBuilder::BuildHardwareInventoryResult(requestId, inventoryJson);
            g_serverInstance->SendTextMessage(clientSock, response);
            Logger::Instance().Info("HARDWARE_INVENTORY_RESULT dispatched.");
            break;
        }

        default: {
            Logger::Instance().Warn("Rejected unknown or unauthorized message type: " + typeStr);
            std::string response = ResponseBuilder::BuildError(requestId, "Unknown or unauthorized message type: " + typeStr);
            g_serverInstance->SendTextMessage(clientSock, response);
            break;
        }
    }
}

int main(int argc, char* argv[]) {
    // Exact Console Output requirement:
    // DYARTE AGENT
    // Version: 1.0.0
    // Status: STARTING
    std::cout << "========================================" << std::endl;
    std::cout << "DYARTE AGENT" << std::endl;
    std::cout << "Version: 1.1.0" << std::endl;
    std::cout << "Status: STARTING" << std::endl;
    std::cout << "========================================" << std::endl;

    // Initialize local file logger
    Logger::Instance().Initialize("logs/dyarte-agent.log");
    Logger::Instance().Info("Initializing DYARTE AGENT v1.1.0...");

    // Register OS termination handler
#ifdef _WIN32
    if (!SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE)) {
        Logger::Instance().Warn("Could not register Windows ConsoleCtrlHandler.");
    } else {
        Logger::Instance().Info("Windows ConsoleCtrlHandler registered for safe shutdown.");
    }
#else
    std::signal(SIGINT, PosixSignalHandler);
    std::signal(SIGTERM, PosixSignalHandler);
#endif

    // Instantiate and start WebSocket server strictly on 127.0.0.1:49152
    WebSocketServer server(ProtocolConstants::DEFAULT_LISTEN_IP, ProtocolConstants::DEFAULT_PORT);
    g_serverInstance = &server;

    if (!server.Start(HandleIncomingClientMessage)) {
        Logger::Instance().Error("Fatal: Failed to start WebSocket server on 127.0.0.1:49152");
        std::cout << "Status: ERROR (Failed to bind 127.0.0.1:49152)" << std::endl;
        return 1;
    }

    // Status: ONLINE transition
    std::cout << "Status: ONLINE" << std::endl;
    std::cout << "Listening exclusively on 127.0.0.1:49152" << std::endl;
    std::cout << "Press Ctrl+C to stop the agent." << std::endl;
    std::cout << "========================================" << std::endl;
    Logger::Instance().Info("Agent Status transitioned to ONLINE. Ready for client connections.");

    // Main execution keep-alive loop
    while (g_keepRunning.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    Logger::Instance().Info("Shutting down DYARTE AGENT...");
    server.Stop();
    Logger::Instance().Info("DYARTE AGENT terminated safely.");
    Logger::Instance().Shutdown();

    std::cout << "DYARTE AGENT Status: STOPPED" << std::endl;
    return 0;
}
