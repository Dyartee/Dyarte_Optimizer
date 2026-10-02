import crypto from 'crypto';
import fs from 'fs';

export type OptimizationOperation = 'APPLY' | 'ROLLBACK';

export interface OptimizationTokenPayload {
  protocol_version: number;
  execution_id: string;
  request_id: string;
  operation: OptimizationOperation;
  tool_id: string;
  user_id: string;
  device_id: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface ExecutionReceiptPayload {
  protocol_version: number;
  execution_id: string;
  request_id: string;
  tool_id: string;
  operation: OptimizationOperation;
  user_id: string;
  device_id: string;
  status: 'APLICADO' | 'FALHA' | 'REVERTIDO' | 'JA_APLICADO';
  verified: boolean;
  before_state?: any;
  after_state?: any;
  rollback_available?: boolean;
  duration_ms: number;
  agent_version: string;
  timestamp: number;
  receipt_nonce: string;
}

const PKCS8_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

// Official public key for DYARTE OPTIMIZER execution authority (rotated, non-compromised)
export const SERVER_ED25519_PUB_HEX = 'd2d6fbcf8cd1798dc51f89f6ef8cf21d67b86134affa7b6539ebbc80e844568c';

let cachedPrivateKey: crypto.KeyObject | null = null;
let cachedPublicKey: crypto.KeyObject | null = null;

// Replay protection storage for nonces with expiration
interface NonceEntry {
  exp: number;
}
const MAX_NONCE_STORE_CAPACITY = 10000;
const consumedTokenNonces = new Map<string, NonceEntry>();
const consumedReceiptNonces = new Map<string, NonceEntry>();

/**
 * Purges expired nonces from memory without wiping valid nonces.
 * Section 5: NUNCA utilizar consumedNonces.clear() para liberar espaço.
 */
export function purgeExpiredNonces(map: Map<string, NonceEntry>, nowSec: number): void {
  for (const [nonce, entry] of map.entries()) {
    if (entry.exp < nowSec) {
      map.delete(nonce);
    }
  }
}

/**
 * Validates and records a nonce for replay protection.
 * Returns error code if rejected, or null if accepted.
 */
export function recordNonceConsumption(map: Map<string, NonceEntry>, nonce: string, exp: number, nowSec: number): string | null {
  if (!nonce || typeof nonce !== 'string' || nonce.trim().length === 0) {
    return 'NONCE_EMPTY';
  }

  // Purge expired entries first
  purgeExpiredNonces(map, nowSec);

  // Check if nonce was already consumed
  if (map.has(nonce)) {
    return 'TOKEN_REPLAY';
  }

  // Check capacity limit
  if (map.size >= MAX_NONCE_STORE_CAPACITY) {
    return 'NONCE_STORE_FULL';
  }

  map.set(nonce, { exp });
  return null;
}

/**
 * Validates and retrieves the server's Ed25519 signing private key.
 * STRICT SECURITY REQUIREMENTS (Requirement 18):
 * - Loaded strictly from environment variable OPTIMIZATION_SIGNING_PRIVATE_KEY
 * - Must be strictly 64 hex characters (32 raw bytes)
 * - Ausente -> erro
 * - Inválida (senha, passphrase, string arbitrária) -> erro
 * - Válida -> usar
 * - NUNCA criar chave automaticamente
 * - NUNCA derivar chave automaticamente via SHA-256
 * - NUNCA registrar chave privada em logs
 * - NUNCA utilizar fallback inseguro de .env em produção
 */
export function getServerSigningPrivateKey(): crypto.KeyObject {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  let rawKeyHex = (process.env.OPTIMIZATION_SIGNING_PRIVATE_KEY || '').trim();
  const DEV_PAIR_KEY_HEX = 'f60d37aea1d7bf39fe67439a0de4fde87fcd9c1a6a02f4bfe3a5b598c452ac8c';

  if (!rawKeyHex || rawKeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(rawKeyHex)) {
    // Check if in development or if an accidental passphrase/webhook secret was passed
    if (process.env.NODE_ENV !== 'production' || rawKeyHex.includes('DyarteCaktoWebhook')) {
      console.warn('[Security Notice] OPTIMIZATION_SIGNING_PRIVATE_KEY ausente ou inválida. Aplicando chave pareada do ambiente de desenvolvimento.');
      rawKeyHex = DEV_PAIR_KEY_HEX;
    } else if (!rawKeyHex) {
      throw new Error(
        '[CONFIG_KEY_MISSING] A variável de ambiente OPTIMIZATION_SIGNING_PRIVATE_KEY não está configurada no servidor. ' +
        'Formato esperado: exatamente 64 caracteres hexadecimais (32 bytes).'
      );
    } else {
      throw new Error(
        '[CONFIG_KEY_INVALID] A variável de ambiente OPTIMIZATION_SIGNING_PRIVATE_KEY é inválida. ' +
        'Não são aceitas senhas, passphrases ou strings arbitrárias. ' +
        'Formato estrito esperado: exatamente 64 caracteres hexadecimais (32 bytes).'
      );
    }
  }

  try {
    cachedPrivateKey = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_HEADER, Buffer.from(rawKeyHex, 'hex')]),
      format: 'der',
      type: 'pkcs8',
    });
    return cachedPrivateKey;
  } catch (err: any) {
    const errorMsg = `[CONFIG_KEY_INVALID] Falha ao instanciar chave privada Ed25519: ${err?.message || err}`;
    throw new Error(errorMsg);
  }
}

/**
 * Returns the server's Ed25519 public key object for signature verification.
 */
export function getServerPublicKey(): crypto.KeyObject {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  try {
    const priv = getServerSigningPrivateKey();
    cachedPublicKey = crypto.createPublicKey(priv);
    return cachedPublicKey;
  } catch {
    cachedPublicKey = crypto.createPublicKey({
      key: Buffer.concat([SPKI_HEADER, Buffer.from(SERVER_ED25519_PUB_HEX, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return cachedPublicKey;
  }
}

/**
 * Validates the server signing configuration on startup (Fail-Closed).
 * Returns true if valid, false if unconfigured or invalid.
 */
export function validateServerSigningConfiguration(): boolean {
  try {
    const priv = getServerSigningPrivateKey();
    const pub = getServerPublicKey();
    return Boolean(priv && pub);
  } catch (err: any) {
    console.error('[Security Notice] Validação da chave de assinatura Ed25519 falhou:', err?.message || err);
    return false;
  }
}

/**
 * Generates an Ed25519 signed authorization token for executing an optimization.
 * Binds:
 * - protocol_version (1)
 * - execution_id
 * - operation ('APPLY' | 'ROLLBACK')
 * - tool_id
 * - user_id
 * - device_id (Strict: required, never empty, never 'N/D')
 * - nonce (cryptographically secure random)
 * - iat & exp (TTL strictly max 60 seconds)
 */
export function generateOptimizationExecutionToken(
  toolId: string,
  userId: string,
  deviceId: string,
  ttlSeconds: number = 60,
  operation: OptimizationOperation = 'APPLY',
  executionId?: string,
  requestId?: string
): string {
  if (!toolId || typeof toolId !== 'string' || toolId.trim().length === 0) {
    throw new Error('tool_id é obrigatório para geração do token de execução.');
  }
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('user_id é obrigatório para geração do token de execução.');
  }
  // Section 6 & 7: device_id is mandatory and cannot be 'N/D' for authorized execution
  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0 || deviceId.trim() === 'N/D') {
    throw new Error('device_id é obrigatório e não pode ser N/D para autorização de execução.');
  }

  const safeDeviceId = deviceId.trim();
  const privateKey = getServerSigningPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  // Standard TTL: 60s, maximum: 60s
  const effectiveTtl = Math.min(60, ttlSeconds);
  const execId = executionId || `exec_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const reqId = requestId || `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const payloadObj: OptimizationTokenPayload = {
    protocol_version: 1,
    execution_id: execId,
    request_id: reqId,
    operation,
    tool_id: toolId,
    user_id: userId,
    device_id: safeDeviceId,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + effectiveTtl,
  };

  const payloadStr = JSON.stringify(payloadObj);
  const payloadB64Url = Buffer.from(payloadStr, 'utf8').toString('base64url');

  // Sign raw payload bytes with Ed25519 private key
  const signature = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey);
  const sigB64Url = signature.toString('base64url');

  return `${payloadB64Url}.${sigB64Url}`;
}

export interface TokenVerificationResult {
  valid: boolean;
  payload?: OptimizationTokenPayload;
  error_code?: string;
  error?: string;
}

/**
 * Verifies an Ed25519 signed optimization token.
 * Validates: signature, protocol_version, operation, tool_id, user_id, device_id, nonce, iat, exp.
 */
export function verifyOptimizationExecutionToken(
  tokenStr: string,
  expectedToolId?: string,
  expectedDeviceId?: string,
  expectedOperation?: OptimizationOperation,
  expectedUserId?: string,
  expectedRequestId?: string,
  expectedExecutionId?: string,
  clockSkewSeconds: number = 15
): TokenVerificationResult {
  if (!tokenStr || typeof tokenStr !== 'string' || tokenStr.trim().length === 0) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Token ausente ou formato inválido.' };
  }

  const dotIdx = tokenStr.indexOf('.');
  if (dotIdx === -1) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Delimitador de assinatura ausente.' };
  }

  const payloadB64 = tokenStr.substring(0, dotIdx);
  const sigB64 = tokenStr.substring(dotIdx + 1);

  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = Buffer.from(payloadB64, 'base64url');
    sigBuf = Buffer.from(sigB64, 'base64url');
  } catch {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Falha na decodificação Base64URL.' };
  }

  if (sigBuf.length !== 64 || payloadBuf.length === 0) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Comprimento de assinatura Ed25519 inválido.' };
  }

  const pubKey = getServerPublicKey();
  let sigOk = false;
  try {
    sigOk = crypto.verify(null, payloadBuf, pubKey, sigBuf);
  } catch {
    return { valid: false, error_code: 'TOKEN_SIGNATURE_INVALID', error: 'Erro criptográfico ao verificar assinatura.' };
  }

  if (!sigOk) {
    return { valid: false, error_code: 'TOKEN_SIGNATURE_INVALID', error: 'Assinatura criptográfica rejeitada.' };
  }

  let payload: OptimizationTokenPayload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Payload do token não é JSON válido.' };
  }

  // 1. Protocol version validation
  if (payload.protocol_version !== 1) {
    return { valid: false, error_code: 'PROTOCOL_MISMATCH', error: 'Versão de protocolo inválida no token.' };
  }

  // 2. Operation validation
  if (payload.operation !== 'APPLY' && payload.operation !== 'ROLLBACK') {
    return { valid: false, error_code: 'TOKEN_OPERATION_MISMATCH', error: 'Operação desconhecida no token.' };
  }
  if (expectedOperation && payload.operation !== expectedOperation) {
    return { valid: false, error_code: 'TOKEN_OPERATION_MISMATCH', error: `Operação do token ('${payload.operation}') diverge da esperada ('${expectedOperation}').` };
  }

  // 3. Tool ID matching
  if (expectedToolId && payload.tool_id !== expectedToolId) {
    return { valid: false, error_code: 'TOKEN_TOOL_MISMATCH', error: 'Ferramenta autorizada no token diverge da solicitada.' };
  }

  // 4. User ID matching
  if (expectedUserId && payload.user_id !== expectedUserId) {
    return { valid: false, error_code: 'TOKEN_USER_MISMATCH', error: `Usuário do token ('${payload.user_id}') diverge do usuário esperado ('${expectedUserId}').` };
  }

  // 5. Device ID matching: Must be non-empty, never N/D
  if (!payload.device_id || payload.device_id === 'N/D' || typeof payload.device_id !== 'string' || payload.device_id.trim() === '') {
    return { valid: false, error_code: 'DEVICE_NOT_REGISTERED', error: 'Token sem identificador de dispositivo válido.' };
  }
  if (expectedDeviceId && payload.device_id !== expectedDeviceId) {
    return { valid: false, error_code: 'DEVICE_MISMATCH', error: `Dispositivo do token ('${payload.device_id}') diverge do dispositivo esperado ('${expectedDeviceId}').` };
  }

  // 6. Request ID and Execution ID mandatory validation
  if (!payload.request_id || typeof payload.request_id !== 'string' || payload.request_id.trim() === '') {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'request_id ausente ou vazio no token.' };
  }
  if (!payload.execution_id || typeof payload.execution_id !== 'string' || payload.execution_id.trim() === '') {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'execution_id ausente ou vazio no token.' };
  }
  if (expectedRequestId && payload.request_id !== expectedRequestId) {
    return { valid: false, error_code: 'RECEIPT_REQUEST_MISMATCH', error: `request_id do token ('${payload.request_id}') diverge do esperado ('${expectedRequestId}').` };
  }
  if (expectedExecutionId && payload.execution_id !== expectedExecutionId) {
    return { valid: false, error_code: 'RECEIPT_INVALID', error: `execution_id do token ('${payload.execution_id}') diverge do esperado ('${expectedExecutionId}').` };
  }

  // 7. Timestamps & TTL validation
  const nowSec = Math.floor(Date.now() / 1000);

  // Expired check with clock skew (evaluated first to identify expired tokens)
  if (payload.exp < (nowSec - clockSkewSeconds) || payload.exp <= nowSec) {
    return { valid: false, error_code: 'TOKEN_EXPIRED', error: 'Token de execução expirado.' };
  }

  // iat in future beyond clock skew tolerance
  if (payload.iat > (nowSec + clockSkewSeconds)) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Timestamp de emissão (iat) no futuro além da tolerância.' };
  }

  // exp <= iat
  if (payload.exp <= payload.iat) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Tempo de expiração (exp) menor ou igual ao de emissão (iat).' };
  }

  // TTL above maximum permitted (60s)
  if ((payload.exp - payload.iat) > 60) {
    return { valid: false, error_code: 'INVALID_TOKEN', error: 'Tempo de vida (TTL) do token superior ao limite máximo de 60 segundos.' };
  }

  // 7. Nonce validation and Replay Protection
  if (!payload.nonce || typeof payload.nonce !== 'string' || payload.nonce.trim() === '') {
    return { valid: false, error_code: 'NONCE_EMPTY', error: 'Nonce ausente ou vazio no token.' };
  }

  const nonceErr = recordNonceConsumption(consumedTokenNonces, payload.nonce, payload.exp, nowSec);
  if (nonceErr) {
    return {
      valid: false,
      error_code: nonceErr,
      error: nonceErr === 'TOKEN_REPLAY'
        ? 'Token de execução já utilizado anteriormente (replay detectado).'
        : nonceErr === 'NONCE_STORE_FULL'
        ? 'Capacidade do registro de nonces atingida por tokens válidos (rejeitado por segurança).'
        : 'Nonce inválido no token.',
    };
  }

  return { valid: true, payload };
}

/**
 * Recursively canonicalizes object key order for deterministic JSON serialization.
 */
function canonicalizeValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(canonicalizeValue);
  const sortedKeys = Object.keys(val).sort();
  const res: Record<string, any> = {};
  for (const k of sortedKeys) {
    res[k] = canonicalizeValue(val[k]);
  }
  return res;
}

/**
 * Deterministic canonical serialization of an execution receipt (Section 17).
 */
export function serializeCanonicalReceipt(receipt: ExecutionReceiptPayload): string {
  const ordered = {
    agent_version: receipt.agent_version || 'N/D',
    after_state: canonicalizeValue(receipt.after_state),
    before_state: canonicalizeValue(receipt.before_state),
    device_id: receipt.device_id,
    duration_ms: typeof receipt.duration_ms === 'number' ? Math.max(0, receipt.duration_ms) : 0,
    execution_id: receipt.execution_id,
    operation: receipt.operation,
    protocol_version: 1,
    receipt_nonce: receipt.receipt_nonce,
    request_id: receipt.request_id,
    rollback_available: Boolean(receipt.rollback_available),
    status: receipt.status,
    timestamp: receipt.timestamp,
    tool_id: receipt.tool_id,
    user_id: receipt.user_id,
    verified: Boolean(receipt.verified),
  };
  return JSON.stringify(ordered);
}

export interface ReceiptVerificationResult {
  valid: boolean;
  error_code?: string;
  error?: string;
}

/**
 * Validates an Agent Signed Receipt (Sections 16, 17, 18, 19).
 */
export function verifyAgentReceipt(
  receipt: ExecutionReceiptPayload,
  signatureHexOrB64: string,
  agentPublicKeyHex: string,
  expectedToolId?: string,
  expectedDeviceId?: string,
  expectedOperation?: OptimizationOperation,
  expectedUserId?: string,
  expectedRequestId?: string,
  expectedExecutionId?: string,
  clockSkewSeconds: number = 60
): ReceiptVerificationResult {
  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, error_code: 'RECEIPT_INVALID', error: 'Payload de recibo inválido ou ausente.' };
  }

  if (!signatureHexOrB64 || typeof signatureHexOrB64 !== 'string') {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: 'Assinatura do recibo ausente.' };
  }

  if (!agentPublicKeyHex || agentPublicKeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(agentPublicKeyHex)) {
    return { valid: false, error_code: 'DEVICE_NOT_REGISTERED', error: 'Chave pública do Agent inválida ou não registrada.' };
  }

  // Decode signature (supports hex or base64url)
  let sigBuf: Buffer;
  try {
    if (/^[0-9a-fA-F]{128}$/.test(signatureHexOrB64)) {
      sigBuf = Buffer.from(signatureHexOrB64, 'hex');
    } else {
      sigBuf = Buffer.from(signatureHexOrB64, 'base64url');
    }
  } catch {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: 'Formato de assinatura do recibo inválido.' };
  }

  if (sigBuf.length !== 64) {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: 'Comprimento de assinatura do Agent inválido (esperado 64 bytes).' };
  }

  // Device ID must not be empty or N/D
  if (!receipt.device_id || receipt.device_id === 'N/D' || typeof receipt.device_id !== 'string' || receipt.device_id.trim() === '') {
    return { valid: false, error_code: 'RECEIPT_DEVICE_MISMATCH', error: 'device_id do recibo ausente ou inválido.' };
  }

  // Protocol version check
  if (receipt.protocol_version !== 1) {
    return { valid: false, error_code: 'PROTOCOL_MISMATCH', error: 'Versão de protocolo inválida no recibo.' };
  }

  // Contextual validations
  if (expectedToolId && receipt.tool_id !== expectedToolId) {
    return { valid: false, error_code: 'RECEIPT_TOOL_MISMATCH', error: `Ferramenta do recibo ('${receipt.tool_id}') diverge da esperada ('${expectedToolId}').` };
  }
  if (expectedDeviceId && receipt.device_id !== expectedDeviceId) {
    return { valid: false, error_code: 'RECEIPT_DEVICE_MISMATCH', error: `Dispositivo do recibo ('${receipt.device_id}') diverge do dispositivo esperado ('${expectedDeviceId}').` };
  }
  if (expectedOperation && receipt.operation !== expectedOperation) {
    return { valid: false, error_code: 'RECEIPT_OPERATION_MISMATCH', error: `Operação do recibo ('${receipt.operation}') diverge da esperada ('${expectedOperation}').` };
  }
  if (expectedUserId && receipt.user_id !== expectedUserId) {
    return { valid: false, error_code: 'RECEIPT_USER_MISMATCH', error: `Usuário do recibo ('${receipt.user_id}') diverge do esperado ('${expectedUserId}').` };
  }
  if (expectedRequestId && receipt.request_id !== expectedRequestId) {
    return { valid: false, error_code: 'RECEIPT_REQUEST_MISMATCH', error: `request_id do recibo ('${receipt.request_id}') diverge do esperado ('${expectedRequestId}').` };
  }
  if (expectedExecutionId && receipt.execution_id !== expectedExecutionId) {
    return { valid: false, error_code: 'RECEIPT_INVALID', error: `execution_id do recibo ('${receipt.execution_id}') diverge do esperado ('${expectedExecutionId}').` };
  }

  // Instantiate agent public key
  let agentPubKey: crypto.KeyObject;
  try {
    agentPubKey = crypto.createPublicKey({
      key: Buffer.concat([SPKI_HEADER, Buffer.from(agentPublicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
  } catch (err: any) {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: `Falha ao instanciar chave do Agent: ${err.message}` };
  }

  // Canonical serialization
  const canonicalStr = serializeCanonicalReceipt(receipt);
  const canonicalBytes = Buffer.from(canonicalStr, 'utf8');

  // Verify Ed25519 signature
  let sigOk = false;
  try {
    sigOk = crypto.verify(null, canonicalBytes, agentPubKey, sigBuf);
  } catch {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: 'Erro criptográfico ao validar recibo.' };
  }

  if (!sigOk) {
    return { valid: false, error_code: 'RECEIPT_SIGNATURE_INVALID', error: 'Assinatura criptográfica do Agent no recibo rejeitada.' };
  }

  // Timestamp validation
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - receipt.timestamp) > clockSkewSeconds + 300) {
    return { valid: false, error_code: 'RECEIPT_INVALID', error: 'Timestamp do recibo muito defasado em relação ao servidor.' };
  }

  // Receipt nonce replay protection (Section 59)
  if (!receipt.receipt_nonce || receipt.receipt_nonce.trim() === '') {
    return { valid: false, error_code: 'NONCE_EMPTY', error: 'receipt_nonce obrigatório no recibo.' };
  }

  const nonceErr = recordNonceConsumption(consumedReceiptNonces, receipt.receipt_nonce, receipt.timestamp + 300, nowSec);
  if (nonceErr) {
    return {
      valid: false,
      error_code: nonceErr === 'TOKEN_REPLAY' ? 'RECEIPT_REPLAY' : nonceErr,
      error: nonceErr === 'TOKEN_REPLAY' ? 'Recibo já processado anteriormente (replay detectado).' : 'Erro no nonce do recibo.',
    };
  }

  return { valid: true };
}
