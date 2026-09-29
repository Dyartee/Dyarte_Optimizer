#pragma once

#include <string>
#include <vector>
#include <algorithm>
#include <cctype>
#include "json_helper.h"

namespace Dyarte {
namespace Agent {

struct ProtocolConstants {
    static constexpr int PROTOCOL_VERSION = 1;
    static constexpr const char* AGENT_VERSION = "1.1.0";
    static constexpr size_t MAX_MESSAGE_SIZE = 65536; // 64 KB
    static constexpr const char* DEFAULT_LISTEN_IP = "127.0.0.1";
    static constexpr int DEFAULT_PORT = 49152;
};

enum class MessageType {
    UNKNOWN,
    HANDSHAKE,
    HANDSHAKE_ACK,
    PING,
    PONG,
    TEST_CONNECTION,
    TEST_CONNECTION_RESULT,
    GET_STATUS,
    STATUS_RESULT,
    APPLY_OPTIMIZATION,
    ROLLBACK_OPTIMIZATION,
    OPTIMIZATION_RESULT,
    GET_TELEMETRY,
    TELEMETRY_SNAPSHOT,
    GET_HARDWARE_INVENTORY,
    HARDWARE_INVENTORY_RESULT,
    EXECUTE_DRIVER_PACKAGE,
    ERROR_RESPONSE
};

inline std::string MessageTypeToString(MessageType type) {
    switch (type) {
        case MessageType::HANDSHAKE: return "HANDSHAKE";
        case MessageType::HANDSHAKE_ACK: return "HANDSHAKE_ACK";
        case MessageType::PING: return "PING";
        case MessageType::PONG: return "PONG";
        case MessageType::TEST_CONNECTION: return "TEST_CONNECTION";
        case MessageType::TEST_CONNECTION_RESULT: return "TEST_CONNECTION_RESULT";
        case MessageType::GET_STATUS: return "GET_STATUS";
        case MessageType::STATUS_RESULT: return "STATUS_RESULT";
        case MessageType::APPLY_OPTIMIZATION: return "APPLY_OPTIMIZATION";
        case MessageType::ROLLBACK_OPTIMIZATION: return "ROLLBACK_OPTIMIZATION";
        case MessageType::OPTIMIZATION_RESULT: return "OPTIMIZATION_RESULT";
        case MessageType::GET_TELEMETRY: return "GET_TELEMETRY";
        case MessageType::TELEMETRY_SNAPSHOT: return "TELEMETRY_SNAPSHOT";
        case MessageType::GET_HARDWARE_INVENTORY: return "GET_HARDWARE_INVENTORY";
        case MessageType::HARDWARE_INVENTORY_RESULT: return "HARDWARE_INVENTORY_RESULT";
        case MessageType::EXECUTE_DRIVER_PACKAGE: return "EXECUTE_DRIVER_PACKAGE";
        case MessageType::ERROR_RESPONSE: return "ERROR";
        default: return "UNKNOWN";
    }
}

inline MessageType StringToMessageType(const std::string& str) {
    if (str == "HANDSHAKE") return MessageType::HANDSHAKE;
    if (str == "PING") return MessageType::PING;
    if (str == "TEST_CONNECTION") return MessageType::TEST_CONNECTION;
    if (str == "GET_STATUS") return MessageType::GET_STATUS;
    if (str == "APPLY_OPTIMIZATION") return MessageType::APPLY_OPTIMIZATION;
    if (str == "ROLLBACK_OPTIMIZATION") return MessageType::ROLLBACK_OPTIMIZATION;
    if (str == "GET_TELEMETRY") return MessageType::GET_TELEMETRY;
    if (str == "GET_HARDWARE_INVENTORY") return MessageType::GET_HARDWARE_INVENTORY;
    if (str == "EXECUTE_DRIVER_PACKAGE") return MessageType::EXECUTE_DRIVER_PACKAGE;
    return MessageType::UNKNOWN;
}

class SecurityValidator {
public:
    // Rejects payloads that contain forbidden execution keywords
    static bool ContainsForbiddenPatterns(const std::string& raw) {
        std::string lower = raw;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });

        const std::vector<std::string> forbidden = {
            "\"command\"",
            "\"powershell\"",
            "\"script\"",
            "\"shell\"",
            "\"execute\""
        };

        for (const auto& pattern : forbidden) {
            if (lower.find(pattern) != std::string::npos) {
                return true;
            }
        }
        return false;
    }

    static bool ValidateMessageSize(size_t size) {
        return size > 0 && size <= ProtocolConstants::MAX_MESSAGE_SIZE;
    }
};

class ResponseBuilder {
public:
    static std::string BuildHandshakeAck(const std::string& platform = "windows") {
        return "{\"protocol_version\":1,\"type\":\"HANDSHAKE_ACK\",\"agent_version\":\"" + std::string(ProtocolConstants::AGENT_VERSION) + "\",\"platform\":\"" + platform + "\",\"status\":\"ONLINE\",\"capabilities\":{\"telemetry\":true,\"power_plan\":true,\"rollback\":true,\"hardware_telemetry\":true}}";
    }

    static std::string BuildPong(int64_t timestamp) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1,\"type\":\"PONG\",\"timestamp\":" << timestamp << "}";
        return ss.str();
    }

    static std::string BuildTestConnectionResult(const std::string& requestId) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1,\"request_id\":\"" << EscapeString(requestId)
           << "\",\"type\":\"TEST_CONNECTION_RESULT\",\"success\":true,\"agent_version\":\"" << ProtocolConstants::AGENT_VERSION << "\"}";
        return ss.str();
    }

    static std::string BuildOptimizationResult(
        const std::string& requestId,
        const std::string& toolId,
        const std::string& status,
        bool success,
        const std::string& message
    ) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"OPTIMIZATION_RESULT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"tool_id\":\"" << EscapeString(toolId) << "\""
           << ",\"status\":\"" << EscapeString(status) << "\""
           << ",\"success\":" << (success ? "true" : "false")
           << ",\"message\":\"" << EscapeString(message) << "\"}";
        return ss.str();
    }

    static std::string BuildOptimizationAuditResult(
        const std::string& requestId,
        const std::string& toolId,
        const std::string& state,
        bool success,
        bool verified,
        const std::string& beforeStateJson,
        const std::string& afterStateJson,
        bool rollbackAvailable,
        int64_t durationMs,
        const std::string& errorMsg = "",
        const std::string& message = "",
        const std::string& errorCode = "",
        const std::string& receiptJson = "",
        const std::string& receiptSignature = ""
    ) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"OPTIMIZATION_RESULT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"optimization_id\":\"opt_rec_" << EscapeString(requestId) << "\""
           << ",\"tool_id\":\"" << EscapeString(toolId) << "\""
           << ",\"state\":\"" << EscapeString(state) << "\""
           << ",\"success\":" << (success ? "true" : "false")
           << ",\"verified\":" << (verified ? "true" : "false")
           << ",\"before_state\":" << (beforeStateJson.empty() ? "{}" : beforeStateJson)
           << ",\"after_state\":" << (afterStateJson.empty() ? "{}" : afterStateJson)
           << ",\"rollback_available\":" << (rollbackAvailable ? "true" : "false")
           << ",\"duration_ms\":" << (durationMs < 0 ? 0 : durationMs)
           << ",\"agent_version\":\"" << ProtocolConstants::AGENT_VERSION << "\"";
        if (!errorCode.empty()) {
            ss << ",\"error_code\":\"" << EscapeString(errorCode) << "\"";
        }
        if (!errorMsg.empty()) {
            ss << ",\"error\":\"" << EscapeString(errorMsg) << "\"";
        } else {
            ss << ",\"error\":null";
        }
        if (!message.empty()) {
            ss << ",\"message\":\"" << EscapeString(message) << "\"";
        }
        if (!receiptJson.empty()) {
            ss << ",\"receipt\":" << receiptJson;
        }
        if (!receiptSignature.empty()) {
            ss << ",\"receipt_signature\":\"" << EscapeString(receiptSignature) << "\"";
        }
        ss << "}";
        return ss.str();
    }

    static std::string BuildStatusResult(
        const std::string& requestId,
        const std::string& osName,
        bool isWindows,
        const std::string& activePowerSchemeGuid,
        const std::string& activePowerSchemeName,
        const std::string& deviceId = "",
        const std::string& cpu = "",
        const std::string& gpu = "",
        const std::string& ram = "",
        const std::string& storage = "",
        const std::string& motherboard = "",
        const std::string& biosVersion = "",
        int secureBootState = -1,
        const std::string& agentPublicKey = ""
    ) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"STATUS_RESULT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"agent_version\":\"" << ProtocolConstants::AGENT_VERSION << "\""
           << ",\"status\":\"ONLINE\""
           << ",\"os\":\"" << EscapeString(osName) << "\""
           << ",\"is_windows\":" << (isWindows ? "true" : "false")
           << ",\"power_scheme\":{"
           << "\"guid\":\"" << EscapeString(activePowerSchemeGuid) << "\""
           << ",\"name\":\"" << EscapeString(activePowerSchemeName) << "\""
           << "}";
        if (!deviceId.empty()) ss << ",\"device_id\":\"" << EscapeString(deviceId) << "\"";
        if (!agentPublicKey.empty()) ss << ",\"agent_public_key\":\"" << EscapeString(agentPublicKey) << "\"";
        if (!cpu.empty()) ss << ",\"cpu\":\"" << EscapeString(cpu) << "\"";
        if (!gpu.empty()) ss << ",\"gpu\":\"" << EscapeString(gpu) << "\"";
        if (!ram.empty()) ss << ",\"ram\":\"" << EscapeString(ram) << "\"";
        if (!storage.empty()) ss << ",\"storage\":\"" << EscapeString(storage) << "\"";
        if (!motherboard.empty()) ss << ",\"motherboard\":\"" << EscapeString(motherboard) << "\"";
        if (!biosVersion.empty()) ss << ",\"bios_version\":\"" << EscapeString(biosVersion) << "\"";
        if (secureBootState == 1) {
            ss << ",\"secure_boot\":true";
        } else if (secureBootState == 0) {
            ss << ",\"secure_boot\":false";
        } else {
            ss << ",\"secure_boot\":null";
        }
        ss << ",\"capabilities\":{\"telemetry\":true,\"power_plan\":" << (isWindows ? "true" : "false")
           << ",\"rollback\":" << (isWindows ? "true" : "false") << ",\"hardware_telemetry\":true}";
        ss << "}";
        return ss.str();
    }

    static std::string BuildTelemetrySnapshot(
        const std::string& requestId,
        const std::string& cpuUsageStr = "null",
        const std::string& gpuUsageStr = "null",
        const std::string& ramUsageStr = "null",
        const std::string& cpuTempStr = "null",
        const std::string& gpuTempStr = "null",
        const std::string& cpuClockStr = "null",
        const std::string& gpuClockStr = "null",
        const std::string& ramUsedMbStr = "null",
        const std::string& ramTotalMbStr = "null"
    ) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"TELEMETRY_SNAPSHOT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"agent_version\":\"" << ProtocolConstants::AGENT_VERSION << "\""
           << ",\"cpu_usage\":" << cpuUsageStr
           << ",\"gpu_usage\":" << gpuUsageStr
           << ",\"ram_usage\":" << ramUsageStr
           << ",\"cpu_temp\":" << cpuTempStr
           << ",\"gpu_temp\":" << gpuTempStr
           << ",\"cpu_clock_mhz\":" << cpuClockStr
           << ",\"gpu_clock_mhz\":" << gpuClockStr
           << ",\"data\":{"
           << "\"cpu\":{\"usage\":" << cpuUsageStr << ",\"temperature\":" << cpuTempStr << ",\"clock_mhz\":" << cpuClockStr << "}"
           << ",\"gpu\":{\"usage\":" << gpuUsageStr << ",\"temperature\":" << gpuTempStr << ",\"clock_mhz\":" << gpuClockStr << "}"
           << ",\"memory\":{\"usage\":" << ramUsageStr << ",\"used_mb\":" << ramUsedMbStr << ",\"total_mb\":" << ramTotalMbStr << "}"
           << "}}";
        return ss.str();
    }

    static std::string BuildHardwareInventoryResult(
        const std::string& requestId,
        const std::string& inventoryJson
    ) {
        auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"HARDWARE_INVENTORY_RESULT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"agent_version\":\"" << ProtocolConstants::AGENT_VERSION << "\""
           << ",\"timestamp\":" << nowSec
           << ",\"inventory\":" << (inventoryJson.empty() ? "{}" : inventoryJson)
           << "}";
        return ss.str();
    }

    static std::string BuildDriverPackageResult(
        const std::string& requestId,
        const std::string& vendor,
        const std::string& status,
        bool success,
        const std::string& message
    ) {
        std::stringstream ss;
        ss << "{\"protocol_version\":1"
           << ",\"type\":\"DRIVER_PACKAGE_RESULT\""
           << ",\"request_id\":\"" << EscapeString(requestId) << "\""
           << ",\"vendor\":\"" << EscapeString(vendor) << "\""
           << ",\"status\":\"" << EscapeString(status) << "\""
           << ",\"success\":" << (success ? "true" : "false")
           << ",\"message\":\"" << EscapeString(message) << "\"}";
        return ss.str();
    }

    static std::string BuildError(const std::string& requestId, const std::string& errorMsg, const std::string& errorCode = "VALIDATION_FAILED") {
        std::stringstream ss;
        ss << "{\"protocol_version\":1";
        if (!requestId.empty()) {
            ss << ",\"request_id\":\"" << EscapeString(requestId) << "\"";
        }
        ss << ",\"type\":\"ERROR\""
           << ",\"error_code\":\"" << EscapeString(errorCode) << "\""
           << ",\"error\":\"" << EscapeString(errorMsg) << "\"}";
        return ss.str();
    }

private:
    static std::string EscapeString(const std::string& s) {
        std::string res;
        for (char c : s) {
            if (c == '"') res += "\\\"";
            else if (c == '\\') res += "\\\\";
            else res.push_back(c);
        }
        return res;
    }
};

} // namespace Agent
} // namespace Dyarte
