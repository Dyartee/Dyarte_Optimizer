/**
 * DYARTE OPTIMIZER - Security & Cryptographic Keys Configuration
 *
 * Ponto centralizado e autoritativo de chaves públicas e constantes criptográficas.
 *
 * PROCESSO DE ROTAÇÃO DE CHAVES:
 * 1. Gere um novo par de chaves Ed25519 no padrão RFC 8032:
 *    Node.js:
 *    const { generateKeyPairSync } = require('crypto');
 *    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
 *    const privHex = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('hex');
 *    const pubHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
 *
 * 2. Atualize a variável de ambiente segura no backend/servidor:
 *    OPTIMIZATION_SIGNING_PRIVATE_KEY=<novo_privHex_64_chars>
 *
 * 3. Atualize a chave pública canônica neste arquivo (SERVER_ED25519_PUB_HEX)
 *    e no token_validator.h do Agent C++ (kServerPubKey).
 *
 * 4. Distribua a nova versão do Electron / Agent com a chave pública atualizada.
 *    Tokens emitidos com a chave privada antiga serão rejeitados assim que expirarem (TTL máx: 60s).
 */

export const SERVER_ED25519_PUB_HEX = 'd2d6fbcf8cd1798dc51f89f6ef8cf21d67b86134affa7b6539ebbc80e844568c';
