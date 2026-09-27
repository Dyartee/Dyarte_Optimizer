#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <cstdint>
#include <unordered_map>
#include <mutex>
#include "ed25519_verify.h"
#include "json_helper.h"
#include "logger.h"

namespace Dyarte {
namespace Agent {

// Result of cryptographic token validation
struct TokenValidationResult {
    bool valid = false;
    std::string toolId;
    std::string userId;
    std::string deviceId;
    std::string executionId;
    std::string operation;
    std::string nonce;
    int64_t iat = 0;
    int64_t exp = 0;
    std::string errorCode;
    std::string error;
};

class TokenValidator {
public:
    // Official public key for DYARTE OPTIMIZER backend execution authority (32-byte Ed25519 raw pubkey)
    // Hex: 9fc58ae7dd4361cad6a68dabefa3e061fbe684a76c0e91d53ad85a120e2d6666
    static const uint8_t* GetServerPublicKey() {
        static const uint8_t kServerPubKey[32] = {
            0x9f, 0xc5, 0x8a, 0xe7, 0xdd, 0x43, 0x61, 0xca,
            0xd6, 0xa6, 0x8d, 0xab, 0xef, 0xa3, 0xe0, 0x61,
            0xfb, 0xe6, 0x84, 0xa7, 0x6c, 0x0e, 0x91, 0xd5,
            0x3a, 0xd8, 0x5a, 0x12, 0x0e, 0x2d, 0x66, 0x66
        };
        return kServerPubKey;
    }

    static std::vector<uint8_t> Base64UrlDecode(const std::string& input) {
        std::string base64 = input;
        for (char& c : base64) {
            if (c == '-') c = '+';
            else if (c == '_') c = '/';
        }
        while (base64.size() % 4 != 0) {
            base64.push_back('=');
        }

        static const int8_t table[256] = {
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
            52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
            -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
            15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
            -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
            41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1
        };

        std::vector<uint8_t> out;
        out.reserve((base64.size() / 4) * 3);

        uint32_t val = 0;
        int valb = -8;
        for (uint8_t c : base64) {
            if (c == '=') break;
            int8_t v = table[c];
            if (v == -1) continue;
            val = (val << 6) | v;
            valb += 6;
            if (valb >= 0) {
                out.push_back(static_cast<uint8_t>((val >> valb) & 0xFF));
                valb -= 8;
            }
        }
        return out;
    }

    /**
     * Purges only expired nonces (exp < nowSec).
     * Section 5: NUNCA usar consumedNonces.clear().
     */
    static void PurgeExpiredNonces(std::unordered_map<std::string, int64_t>& store, int64_t nowSec) {
        for (auto it = store.begin(); it != store.end(); ) {
            if (it->second < nowSec) {
                it = store.erase(it);
            } else {
                ++it;
            }
        }
    }

    /**
     * Checks if a nonce was already consumed (replay protection).
     * Returns empty string if success, or errorCode string on failure.
     */
    static std::string CheckAndConsumeNonce(const std::string& nonce, int64_t exp, int64_t nowSec) {
        if (nonce.empty()) return "NONCE_EMPTY";

        static std::unordered_map<std::string, int64_t> s_consumedNonces;
        static std::mutex s_nonceMutex;
        static const size_t kMaxNonces = 10000;

        std::lock_guard<std::mutex> lock(s_nonceMutex);

        // 1. Remove only expired nonces
        PurgeExpiredNonces(s_consumedNonces, nowSec);

        // 2. Replay check
        if (s_consumedNonces.find(nonce) != s_consumedNonces.end()) {
            return "TOKEN_REPLAY";
        }

        // 3. Store full check
        if (s_consumedNonces.size() >= kMaxNonces) {
            return "NONCE_STORE_FULL";
        }

        // 4. Record new nonce
        s_consumedNonces[nonce] = exp;
        return "";
    }

    /**
     * Validates an optimization execution token against expected parameters.
     * Format: <base64url(payload)>.<base64url(signature)>
     */
    static TokenValidationResult ValidateToken(
        const std::string& expectedToolId,
        const std::string& tokenStr,
        const std::string& localDeviceId = "",
        const std::string& expectedOperation = "APPLY",
        const std::string& expectedUserId = ""
    ) {
        TokenValidationResult res;

        if (tokenStr.empty()) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Token de autorizacao ausente no payload.";
            return res;
        }

        size_t dotPos = tokenStr.find('.');
        if (dotPos == std::string::npos) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Formato de token invalido: ausente delimitador de assinatura.";
            return res;
        }

        std::string payloadB64 = tokenStr.substr(0, dotPos);
        std::string sigB64 = tokenStr.substr(dotPos + 1);

        std::vector<uint8_t> payloadBytes = Base64UrlDecode(payloadB64);
        std::vector<uint8_t> sigBytes = Base64UrlDecode(sigB64);

        if (payloadBytes.empty() || sigBytes.size() != 64) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Comprimento ou decodificacao de assinatura invalida.";
            return res;
        }

        // 1. Verify cryptographic signature with embedded public key
        bool sigValid = Ed25519::Verify(sigBytes.data(), payloadBytes.data(), payloadBytes.size(), GetServerPublicKey());
        if (!sigValid) {
            Logger::Instance().Warn("[Security] Cryptographic signature check FAILED for optimization token.");
            res.errorCode = "TOKEN_SIGNATURE_INVALID";
            res.error = "Assinatura criptografica do servidor rejeitada.";
            return res;
        }

        // 2. Parse payload JSON
        std::string payloadStr(reinterpret_cast<const char*>(payloadBytes.data()), payloadBytes.size());
        JsonValue payloadJson = JsonValue::parse(payloadStr);

        if (!payloadJson.is_object()) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Conteudo de token assinado nao e um JSON valido.";
            return res;
        }

        int64_t protocolVersion = payloadJson.get_field_int64("protocol_version", 1);
        if (protocolVersion != 1) {
            res.errorCode = "PROTOCOL_MISMATCH";
            res.error = "Versao de protocolo do token incompativel.";
            return res;
        }

        res.toolId = payloadJson.get_field_string("tool_id", "");
        res.userId = payloadJson.get_field_string("user_id", "");
        res.deviceId = payloadJson.get_field_string("device_id", "");
        res.executionId = payloadJson.get_field_string("execution_id", "");
        res.operation = payloadJson.get_field_string("operation", "APPLY");
        res.nonce = payloadJson.get_field_string("nonce", "");
        res.iat = payloadJson.get_field_int64("iat", 0);
        res.exp = payloadJson.get_field_int64("exp", 0);

        // 3. Validate operation
        if (res.operation != "APPLY" && res.operation != "ROLLBACK") {
            res.errorCode = "TOKEN_OPERATION_MISMATCH";
            res.error = "Operacao desconhecida no token: " + res.operation;
            return res;
        }
        if (!expectedOperation.empty() && res.operation != expectedOperation) {
            res.errorCode = "TOKEN_OPERATION_MISMATCH";
            res.error = "Operacao do token ('" + res.operation + "') diverge da solicitada ('" + expectedOperation + "').";
            return res;
        }

        // 4. Validate tool_id matching
        if (!expectedToolId.empty() && res.toolId != expectedToolId) {
            res.errorCode = "TOKEN_TOOL_MISMATCH";
            res.error = "Token emitido para ferramenta '" + res.toolId + "' nao corresponde a ferramenta solicitada '" + expectedToolId + "'.";
            return res;
        }

        // 5. Validate user_id
        if (res.userId.empty()) {
            res.errorCode = "TOKEN_USER_MISMATCH";
            res.error = "Token de autorizacao sem identificador de usuario valido.";
            return res;
        }
        if (!expectedUserId.empty() && res.userId != expectedUserId) {
            res.errorCode = "TOKEN_USER_MISMATCH";
            res.error = "Usuario do token ('" + res.userId + "') diverge do esperado ('" + expectedUserId + "').";
            return res;
        }

        // 6. Validate device_id: must be non-empty, never N/D, and match local device if known
        if (res.deviceId.empty() || res.deviceId == "N/D") {
            res.errorCode = "DEVICE_NOT_REGISTERED";
            res.error = "Token sem identificador de dispositivo valido.";
            return res;
        }
        if (!localDeviceId.empty() && localDeviceId != "N/D") {
            if (res.deviceId != localDeviceId) {
                res.errorCode = "DEVICE_MISMATCH";
                res.error = "Dispositivo do token ('" + res.deviceId + "') nao corresponde ao identificador do Agent ('" + localDeviceId + "').";
                return res;
            }
        }

        // 7. Validate timestamps and TTL
        auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();

        // Expired check with 15-second clock skew grace period (evaluated first for expired tokens)
        if (res.exp < (nowSec - 15) || res.exp <= nowSec) {
            res.errorCode = "TOKEN_EXPIRED";
            res.error = "Token de autorizacao expirado no servidor.";
            return res;
        }

        // iat in future beyond 15s clock skew
        if (res.iat > (nowSec + 15)) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Token emitido com data futura alem da tolerancia.";
            return res;
        }

        // exp <= iat
        if (res.exp <= res.iat) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "Tempo de expiracao invalido no token (exp <= iat).";
            return res;
        }

        // TTL > 60s
        if ((res.exp - res.iat) > 60) {
            res.errorCode = "INVALID_TOKEN";
            res.error = "TTL do token superior ao limite maximo de 60 segundos.";
            return res;
        }

        // 8. Nonce validation and Replay Protection
        if (res.nonce.empty()) {
            res.errorCode = "NONCE_EMPTY";
            res.error = "Nonce ausente ou vazio no token.";
            return res;
        }

        std::string nonceErr = CheckAndConsumeNonce(res.nonce, res.exp, nowSec);
        if (!nonceErr.empty()) {
            res.errorCode = nonceErr;
            if (nonceErr == "TOKEN_REPLAY") {
                res.error = "Token de autorizacao ja consumido anteriormente (replay detectado).";
            } else if (nonceErr == "NONCE_STORE_FULL") {
                res.error = "Capacidade do registro de nonces atingida (rejeitado por seguranca).";
            } else {
                res.error = "Erro na validacao do nonce do token.";
            }
            return res;
        }

        res.valid = true;
        return res;
    }
};

} // namespace Agent
} // namespace Dyarte
