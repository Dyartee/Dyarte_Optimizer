#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iomanip>
#include <cstring>
#include "ed25519_verify.h"
#include "logger.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <bcrypt.h>
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "bcrypt.lib")
#endif

namespace fs = std::filesystem;

namespace Dyarte {
namespace Agent {

class AgentIdentity {
public:
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

    static std::string ToHex(const uint8_t* data, size_t len) {
        std::stringstream ss;
        for (size_t i = 0; i < len; ++i) {
            ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(data[i]);
        }
        return ss.str();
    }

    static std::vector<uint8_t> FromHex(const std::string& hex) {
        std::vector<uint8_t> bytes;
        for (size_t i = 0; i + 1 < hex.length(); i += 2) {
            std::string byteString = hex.substr(i, 2);
            uint8_t byte = static_cast<uint8_t>(strtol(byteString.c_str(), nullptr, 16));
            bytes.push_back(byte);
        }
        return bytes;
    }

    /**
     * Requirement 6: BCryptGenRandom on Windows, /dev/urandom on POSIX
     * Replaces std::random_device for cryptographic seeds and nonces
     */
    static bool GenerateSecureRandom(uint8_t* out, size_t len) {
#ifdef _WIN32
        NTSTATUS status = BCryptGenRandom(NULL, out, static_cast<ULONG>(len), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
        return BCRYPT_SUCCESS(status);
#else
        std::ifstream urandom("/dev/urandom", std::ios::binary);
        if (urandom.is_open()) {
            urandom.read(reinterpret_cast<char*>(out), len);
            return urandom.gcount() == static_cast<std::streamsize>(len);
        }
        return false;
#endif
    }

    static std::string GenerateRandomNonce(size_t bytesCount = 16) {
        std::vector<uint8_t> buf(bytesCount, 0);
        if (!GenerateSecureRandom(buf.data(), bytesCount)) {
            Logger::Instance().Error("[Security] Failed to generate cryptographically secure random nonce.");
            return "";
        }
        return ToHex(buf.data(), buf.size());
    }

    /**
     * Reads and decrypts private Ed25519 seed from DPAPI.
     * Requirement 4: Fail-closed.
     * Returns true only on verified decryption of exactly 32 bytes.
     */
    static bool LoadDecryptedPrivateSeed(std::vector<uint8_t>& outSeed32) {
        outSeed32.assign(32, 0);
        std::string keyPath = (fs::path(GetAgentDataDirectory()) / "agent_identity.key").string();

        if (!fs::exists(keyPath)) {
            Logger::Instance().Error("[Security] agent_identity.key does not exist.");
            return false;
        }

        std::ifstream ifs(keyPath, std::ios::binary);
        if (!ifs.is_open()) {
            Logger::Instance().Error("[Security] Could not open agent_identity.key for reading.");
            return false;
        }

        std::vector<uint8_t> cipherBuf((std::istreambuf_iterator<char>(ifs)), std::istreambuf_iterator<char>());
        if (cipherBuf.empty()) {
            Logger::Instance().Error("[Security] agent_identity.key is empty or corrupt.");
            return false;
        }

#ifdef _WIN32
        DATA_BLOB cipherBlob;
        cipherBlob.pbData = cipherBuf.data();
        cipherBlob.cbData = static_cast<DWORD>(cipherBuf.size());

        DATA_BLOB plainBlob;
        if (!CryptUnprotectData(&cipherBlob, NULL, NULL, NULL, NULL, 0, &plainBlob)) {
            DWORD err = GetLastError();
            Logger::Instance().Error("[Security] DPAPI CryptUnprotectData failed with error code: " + std::to_string(err));
            return false;
        }

        if (plainBlob.cbData < 32 || plainBlob.pbData == nullptr) {
            Logger::Instance().Error("[Security] DPAPI decrypted seed invalid length: " + std::to_string(plainBlob.cbData));
            if (plainBlob.pbData) {
                SecureZeroMemory(plainBlob.pbData, plainBlob.cbData);
                LocalFree(plainBlob.pbData);
            }
            return false;
        }

        std::memcpy(outSeed32.data(), plainBlob.pbData, 32);
        SecureZeroMemory(plainBlob.pbData, plainBlob.cbData);
        LocalFree(plainBlob.pbData);
        return true;
#else
        if (cipherBuf.size() < 32) {
            Logger::Instance().Error("[Security] Non-Windows agent_identity.key too short.");
            return false;
        }
        std::memcpy(outSeed32.data(), cipherBuf.data(), 32);
        return true;
#endif
    }

    /**
     * Requirement 5: Agent Identity Lifecycle
     * 1. Gera uma identidade Ed25519 uma única vez;
     * 2. Armazena private seed protegida por DPAPI;
     * 3. Deriva public key da private seed;
     * 4. Compara a public key derivada com agent_public.key;
     * 5. Bloqueia caso sejam diferentes (Erro: AGENT_IDENTITY_INVALID).
     * Não confiar cegamente no arquivo agent_public.key.
     */
    static std::string GetPublicKeyHex() {
        static std::string s_agentPubHex = "";
        if (!s_agentPubHex.empty()) {
            return s_agentPubHex;
        }

        std::string keyPath = (fs::path(GetAgentDataDirectory()) / "agent_identity.key").string();
        std::string pubPath = (fs::path(GetAgentDataDirectory()) / "agent_public.key").string();

        if (fs::exists(keyPath)) {
            // Decrypt private seed and derive public key mathematically
            std::vector<uint8_t> seed(32, 0);
            if (!LoadDecryptedPrivateSeed(seed)) {
                Logger::Instance().Error("[Security] AGENT_IDENTITY_INVALID: Failed to decrypt DPAPI private seed from disk.");
                return "AGENT_IDENTITY_INVALID";
            }

            uint8_t pk[32];
            uint8_t sk[64];
            Ed25519::KeypairFromSeed(pk, sk, seed.data());
            std::string derivedPubHex = ToHex(pk, 32);

            // Clean sensitive seed and secret key immediately
#ifdef _WIN32
            SecureZeroMemory(seed.data(), seed.size());
            SecureZeroMemory(sk, sizeof(sk));
#else
            std::fill(seed.begin(), seed.end(), 0);
            std::fill(sk, sk + 64, 0);
#endif

            // Compare derived public key with agent_public.key if it exists
            if (fs::exists(pubPath)) {
                std::ifstream ifs(pubPath);
                std::string filePub;
                if (std::getline(ifs, filePub)) {
                    filePub.erase(0, filePub.find_first_not_of(" \t\r\n"));
                    filePub.erase(filePub.find_last_not_of(" \t\r\n") + 1);

                    // Requirement 5: Compare derived public key with agent_public.key
                    if (filePub != derivedPubHex) {
                        Logger::Instance().Error(
                            "[Security] AGENT_IDENTITY_INVALID: Public key mismatch! File ('" +
                            filePub + "') does NOT match derived private key ('" + derivedPubHex + "'). Identity compromised."
                        );
                        return "AGENT_IDENTITY_INVALID";
                    }
                }
            } else {
                // If public key file is missing, write derived public key
                std::ofstream ofs(pubPath);
                if (ofs.is_open()) {
                    ofs << derivedPubHex << std::endl;
                }
            }

            s_agentPubHex = derivedPubHex;
            return s_agentPubHex;
        }

        // Key does not exist: Generate Ed25519 identity keypair once
        std::vector<uint8_t> seed(32, 0);
        if (!GenerateSecureRandom(seed.data(), 32)) {
            Logger::Instance().Error("[Security] Failed to generate secure random seed via BCryptGenRandom.");
            return "AGENT_IDENTITY_INVALID";
        }

        uint8_t pk[32];
        uint8_t sk[64];
        Ed25519::KeypairFromSeed(pk, sk, seed.data());
        s_agentPubHex = ToHex(pk, 32);

        // Save public key
        std::ofstream ofs(pubPath);
        if (ofs.is_open()) {
            ofs << s_agentPubHex << std::endl;
        }

#ifdef _WIN32
        // Protect private key on Windows using DPAPI (CryptProtectData)
        DATA_BLOB plainTextBlob;
        plainTextBlob.pbData = seed.data();
        plainTextBlob.cbData = static_cast<DWORD>(seed.size());

        DATA_BLOB cipherTextBlob;
        if (CryptProtectData(&plainTextBlob, L"DyarteAgentKey", NULL, NULL, NULL, 0, &cipherTextBlob)) {
            std::ofstream kofs(keyPath, std::ios::binary);
            if (kofs.is_open()) {
                kofs.write(reinterpret_cast<const char*>(cipherTextBlob.pbData), cipherTextBlob.cbData);
            }
            LocalFree(cipherTextBlob.pbData);
        } else {
            DWORD err = GetLastError();
            Logger::Instance().Error("[Security] CryptProtectData failed: " + std::to_string(err));
            s_agentPubHex = "AGENT_IDENTITY_INVALID";
            return s_agentPubHex;
        }
#else
        std::ofstream kofs(keyPath, std::ios::binary);
        if (kofs.is_open()) {
            kofs.write(reinterpret_cast<const char*>(seed.data()), 32);
        }
#endif

        // Clean sensitive buffers from memory immediately
#ifdef _WIN32
        SecureZeroMemory(seed.data(), seed.size());
        SecureZeroMemory(sk, sizeof(sk));
#else
        std::fill(seed.begin(), seed.end(), 0);
        std::fill(sk, sk + 64, 0);
#endif

        return s_agentPubHex;
    }

    static void Initialize() {
        GetPublicKeyHex();
    }

    /**
     * Builds canonical execution receipt JSON string (Section 17).
     */
    static std::string BuildCanonicalReceiptJson(
        const std::string& executionId,
        const std::string& requestId,
        const std::string& toolId,
        const std::string& operation,
        const std::string& userId,
        const std::string& deviceId,
        const std::string& status,
        bool verified,
        const std::string& beforeStateJson,
        const std::string& afterStateJson,
        bool rollbackAvailable,
        int64_t durationMs,
        const std::string& agentVersion,
        int64_t timestampSec,
        const std::string& receiptNonce
    ) {
        std::stringstream ss;
        ss << "{"
           << "\"agent_version\":\"" << (agentVersion.empty() ? "1.1.0" : agentVersion) << "\""
           << ",\"after_state\":" << (afterStateJson.empty() ? "null" : afterStateJson)
           << ",\"before_state\":" << (beforeStateJson.empty() ? "null" : beforeStateJson)
           << ",\"device_id\":\"" << deviceId << "\""
           << ",\"duration_ms\":" << (durationMs < 0 ? 0 : durationMs)
           << ",\"execution_id\":\"" << executionId << "\""
           << ",\"operation\":\"" << operation << "\""
           << ",\"protocol_version\":1"
           << ",\"receipt_nonce\":\"" << receiptNonce << "\""
           << ",\"request_id\":\"" << requestId << "\""
           << ",\"rollback_available\":" << (rollbackAvailable ? "true" : "false")
           << ",\"status\":\"" << status << "\""
           << ",\"timestamp\":" << timestampSec
           << ",\"tool_id\":\"" << toolId << "\""
           << ",\"user_id\":\"" << userId << "\""
           << ",\"verified\":" << (verified ? "true" : "false")
           << "}";
        return ss.str();
    }

    /**
     * Requirement 4: Fail-closed Signing.
     * NUNCA fazer std::vector<uint8_t> seed(32, 0) como fallback de assinatura.
     * Se:
     * - chave inexistente
     * - DPAPI falhar
     * - descriptografia falhar
     * - chave corrompida
     * - tamanho inválido
     * então: RECEIPT_SIGN_FAILED e NÃO gerar assinatura.
     */
    static std::string SignReceipt(const std::string& canonicalReceiptJson) {
        std::vector<uint8_t> seed(32, 0);
        if (!LoadDecryptedPrivateSeed(seed)) {
            Logger::Instance().Error("[Security] RECEIPT_SIGN_FAILED: DPAPI private key could not be loaded/decrypted.");
            return "RECEIPT_SIGN_FAILED";
        }

        // Verify seed is not all zeros
        bool allZero = true;
        for (uint8_t b : seed) {
            if (b != 0) {
                allZero = false;
                break;
            }
        }
        if (allZero) {
            Logger::Instance().Error("[Security] RECEIPT_SIGN_FAILED: Private seed is all zeros.");
            return "RECEIPT_SIGN_FAILED";
        }

        // Derive secret key and public key
        uint8_t pk[32];
        uint8_t sk[64];
        Ed25519::KeypairFromSeed(pk, sk, seed.data());

        // Ed25519 signature over raw UTF-8 canonical receipt bytes
        uint8_t sig[64];
        Ed25519::Sign(
            sig,
            reinterpret_cast<const uint8_t*>(canonicalReceiptJson.data()),
            canonicalReceiptJson.size(),
            sk
        );

        // Wipe sensitive key data from memory immediately
#ifdef _WIN32
        SecureZeroMemory(seed.data(), seed.size());
        SecureZeroMemory(sk, sizeof(sk));
#else
        std::fill(seed.begin(), seed.end(), 0);
        std::fill(sk, sk + 64, 0);
#endif

        return ToHex(sig, 64);
    }
};

} // namespace Agent
} // namespace Dyarte
