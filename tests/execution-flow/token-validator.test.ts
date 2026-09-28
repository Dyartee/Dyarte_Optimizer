/**
 * DYARTE OPTIMIZER - Agent TokenValidator Test Suite (Section 42)
 *
 * Validates the Agent's TokenValidator contract:
 * - Assinatura correta
 * - Assinatura errada
 * - Tool correta
 * - Tool errada
 * - Device correto
 * - Device errado
 * - Nonce válido
 * - Nonce vazio
 * - Nonce repetido
 * - Token expirado
 * - IAT inválido
 * - Operation inválida
 */

import 'dotenv/config';
import crypto from 'crypto';
import {
  generateOptimizationExecutionToken,
  verifyOptimizationExecutionToken,
  getServerSigningPrivateKey,
} from '../../src/security/serverTokens';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, msg: string) {
  if (condition) {
    console.log(`[PASS] ${title}: ${msg}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}: ${msg}`);
    failed++;
  }
}

async function runTokenValidatorTests() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — AGENT TOKEN VALIDATOR TEST SUITE (SEC 42)');
  console.log('================================================================\n');

  const userId = 'usr_agent_test_42';
  const deviceId = 'WIN-AGENT-BOX-01';
  const toolId = 'tool_perf_power_plan';
  const serverPrivKey = getServerSigningPrivateKey();

  function craftAndSign(payload: any): string {
    const jsonStr = JSON.stringify(payload);
    const b64Payload = Buffer.from(jsonStr, 'utf8').toString('base64url');
    const sig = crypto.sign(null, Buffer.from(jsonStr, 'utf8'), serverPrivKey).toString('base64url');
    return `${b64Payload}.${sig}`;
  }

  // 1. Assinatura correta
  const validToken = generateOptimizationExecutionToken(toolId, userId, deviceId, 60, 'APPLY', 'exec_tv_01');
  const res1 = verifyOptimizationExecutionToken(validToken, toolId, deviceId, 'APPLY', userId);
  assert(res1.valid, 'Test 1 (Assinatura Correta)', 'Assinatura Ed25519 verificada com sucesso.');

  // 2. Assinatura errada
  const [b64P, b64S] = validToken.split('.');
  const badSig = (b64S[0] === 'x' ? 'y' : 'x') + b64S.slice(1);
  const res2 = verifyOptimizationExecutionToken(`${b64P}.${badSig}`, toolId, deviceId);
  assert(!res2.valid && res2.error_code === 'TOKEN_SIGNATURE_INVALID', 'Test 2 (Assinatura Errada)', 'Assinatura inválida rejeitada.');

  // 3. Tool correta
  assert(res1.payload?.tool_id === toolId, 'Test 3 (Tool Correta)', 'tool_id confere com o autorizado.');

  // 4. Tool errada
  const res4 = verifyOptimizationExecutionToken(validToken, 'tool_perf_other', deviceId);
  assert(!res4.valid && res4.error_code === 'TOKEN_TOOL_MISMATCH', 'Test 4 (Tool Errada)', 'Tool divergente rejeitada com TOKEN_TOOL_MISMATCH.');

  // 5. Device correto
  assert(res1.payload?.device_id === deviceId, 'Test 5 (Device Correto)', 'device_id confere com o esperado.');

  // 6. Device errado
  const res6 = verifyOptimizationExecutionToken(validToken, toolId, 'WIN-DIFFERENT-DEVICE');
  assert(!res6.valid && res6.error_code === 'DEVICE_MISMATCH', 'Test 6 (Device Errado)', 'Device divergente rejeitado com DEVICE_MISMATCH.');

  // 7. Nonce válido
  assert(Boolean(res1.payload?.nonce && res1.payload.nonce.length > 0), 'Test 7 (Nonce Válido)', 'Nonce presente e registrado no consumo.');

  // 8. Nonce vazio
  const emptyNonceTok = craftAndSign({
    protocol_version: 1,
    execution_id: 'exec_tv_empty_nonce',
    request_id: 'req_tv_empty_nonce',
    operation: 'APPLY',
    tool_id: toolId,
    user_id: userId,
    device_id: deviceId,
    nonce: '',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const res8 = verifyOptimizationExecutionToken(emptyNonceTok, toolId, deviceId);
  assert(!res8.valid && res8.error_code === 'NONCE_EMPTY', 'Test 8 (Nonce Vazio)', 'Nonce vazio rejeitado com NONCE_EMPTY.');

  // 9. Nonce repetido
  const res9 = verifyOptimizationExecutionToken(validToken, toolId, deviceId);
  assert(!res9.valid && res9.error_code === 'TOKEN_REPLAY', 'Test 9 (Nonce Repetido)', 'Token reutilizado rejeitado com TOKEN_REPLAY.');

  // 10. Token expirado
  const expiredTok = generateOptimizationExecutionToken(toolId, userId, deviceId, -20, 'APPLY', 'exec_tv_exp');
  const res10 = verifyOptimizationExecutionToken(expiredTok, toolId, deviceId);
  assert(!res10.valid && res10.error_code === 'TOKEN_EXPIRED', 'Test 10 (Token Expirado)', 'Token expirado rejeitado com TOKEN_EXPIRED.');

  // 11. IAT inválido (no futuro além da tolerância)
  const futureIatTok = craftAndSign({
    protocol_version: 1,
    execution_id: 'exec_tv_future_iat',
    request_id: 'req_tv_future_iat',
    operation: 'APPLY',
    tool_id: toolId,
    user_id: userId,
    device_id: deviceId,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: Math.floor(Date.now() / 1000) + 200,
    exp: Math.floor(Date.now() / 1000) + 250,
  });
  const res11 = verifyOptimizationExecutionToken(futureIatTok, toolId, deviceId);
  assert(!res11.valid && res11.error_code === 'INVALID_TOKEN', 'Test 11 (IAT Inválido)', 'IAT futuro rejeitado com INVALID_TOKEN.');

  // 12. Operation inválida
  const invalidOpTok = craftAndSign({
    protocol_version: 1,
    execution_id: 'exec_tv_bad_op',
    request_id: 'req_tv_bad_op',
    operation: 'UNKNOWN_OP',
    tool_id: toolId,
    user_id: userId,
    device_id: deviceId,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const res12 = verifyOptimizationExecutionToken(invalidOpTok, toolId, deviceId);
  assert(!res12.valid && res12.error_code === 'TOKEN_OPERATION_MISMATCH', 'Test 12 (Operation Inválida)', 'Operação inválida rejeitada com TOKEN_OPERATION_MISMATCH.');

  console.log('\n================================================================');
  console.log(`TOKEN VALIDATOR: ${passed} Aprovados, ${failed} Falhas.`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTokenValidatorTests().catch((err) => {
  console.error('Erro nos testes de token validator:', err);
  process.exit(1);
});
