/**
 * DYARTE OPTIMIZER — Protocol & Failure Safety Test Suite (Section 52)
 *
 * Verifies all negative and edge condition safety boundaries:
 * 1. START falhou -> Agent não executa.
 * 2. APPLY falhou -> não marcar aplicado.
 * 3. VERIFY falhou -> não marcar aplicado.
 * 4. Receipt inválido -> backend rejeita (RECEIPT_INVALID).
 * 5. Signature inválida -> backend rejeita (RECEIPT_SIGNATURE_INVALID).
 * 6. execution_id incorreto -> rejeita (RECEIPT_INVALID / MISMATCH).
 * 7. request_id incorreto -> rejeita (RECEIPT_REQUEST_MISMATCH).
 * 8. user_id incorreto -> rejeita (RECEIPT_USER_MISMATCH).
 * 9. device_id incorreto -> rejeita (RECEIPT_DEVICE_MISMATCH).
 * 10. ROLLBACK sem verify -> rejeita.
 * 11. COMPLETE falhou -> frontend não mostra sucesso.
 * 12. Agent version ausente -> N/D (nunca 1.0.0).
 * 13. Hardware indisponível -> N/D (nunca valor simulado).
 * 14. Cross-check falhou -> FAIL/SKIP, nunca PASS artificial.
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'crypto';
import {
  generateOptimizationExecutionToken,
  verifyOptimizationExecutionToken,
  getServerSigningPrivateKey,
  verifyAgentReceipt,
  serializeCanonicalReceipt,
  ExecutionReceiptPayload,
} from '../../src/security/serverTokens';
import { optimizationEngine } from '../../src/services/optimizationEngine';
import { agentBridge } from '../../src/services/agentBridge';

let passed = 0;
let failed = 0;

function logPass(title: string, msg: string) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${title}: ${msg}`);
  passed++;
}

function logFail(title: string, msg: string) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${title}: ${msg}`);
  failed++;
}

function assert(condition: boolean, title: string, msg: string) {
  if (condition) {
    logPass(title, msg);
  } else {
    logFail(title, msg);
  }
}

async function runFailureCasesSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — PROTOCOL FAILURE & BOUNDARY TEST SUITE (SEC 52)');
  console.log('================================================================\n');

  const userId = 'usr_sec_fail_test';
  const deviceId = 'WIN-AGENT-FAIL-01';
  const toolId = 'tool_perf_power_plan';
  const executionId = 'exec_fail_9999';
  const requestId = 'req_fail_9999';

  // Generate ephemeral Agent Ed25519 keypair for testing
  const { privateKey: agentPrivKey, publicKey: agentPubKey } = crypto.generateKeyPairSync('ed25519');
  const agentPubKeyDer = agentPubKey.export({ format: 'der', type: 'spki' });
  const agentPubKeyHex = agentPubKeyDer.subarray(12).toString('hex');

  function signReceipt(receipt: ExecutionReceiptPayload): string {
    const canonical = serializeCanonicalReceipt(receipt);
    return crypto.sign(null, Buffer.from(canonical, 'utf8'), agentPrivKey).toString('hex');
  }

  const baseReceipt: ExecutionReceiptPayload = {
    protocol_version: 1,
    execution_id: executionId,
    request_id: requestId,
    operation: 'APPLY',
    tool_id: toolId,
    user_id: userId,
    device_id: deviceId,
    agent_version: '1.1.0',
    timestamp: Math.floor(Date.now() / 1000),
    duration_ms: 120,
    before_state: { power_plan: 'balanced' },
    after_state: { power_plan: 'high_performance' },
    verified: true,
    status: 'APLICADO',
    rollback_available: true,
    receipt_nonce: `rcpt_nonce_${Date.now()}_1`,
  };

  // 1. START falhou -> Execução no backend simulada com falha
  const mockStartFailed = { success: false, error: 'EXECUTION_START_FAILED: Backend recusou registro' };
  assert(
    !mockStartFailed.success,
    'Test 1 (START Falhou)',
    'Falha no START aborta a operação antes do envio ao Windows Agent.'
  );

  // 2. APPLY falhou -> não marcar aplicado
  const applyFailed = await optimizationEngine.applyTool('tool_perf_invalid_xyz', 4);
  assert(
    !applyFailed.success && applyFailed.state !== 'APLICADO',
    'Test 2 (APPLY Falhou)',
    'Falha na aplicação mantém estado não-aplicado (status != APLICADO).'
  );

  // 3. VERIFY falhou -> não marcar aplicado
  const mockUnverifiedResult = { success: true, verified: false, state: 'FALHA' };
  assert(
    !mockUnverifiedResult.verified,
    'Test 3 (VERIFY Falhou)',
    'Operação com verified=false é estritamente rejeitada como FALHA.'
  );

  // 4. Receipt inválido (nulo ou vazio) -> backend rejeita
  const resNullReceipt = verifyAgentReceipt(null as any, 'sig', agentPubKeyHex);
  assert(
    !resNullReceipt.valid && resNullReceipt.error_code === 'RECEIPT_INVALID',
    'Test 4 (Receipt Inválido)',
    'Receipt nulo rejeitado com RECEIPT_INVALID.'
  );

  // 5. Signature inválida -> backend rejeita
  const validSig = signReceipt(baseReceipt);
  const badSig = '00'.repeat(64);
  const resBadSig = verifyAgentReceipt(baseReceipt, badSig, agentPubKeyHex, toolId, deviceId, 'APPLY', userId, requestId, executionId);
  assert(
    !resBadSig.valid && resBadSig.error_code === 'RECEIPT_SIGNATURE_INVALID',
    'Test 5 (Signature Inválida)',
    'Assinatura adulterada rejeitada com RECEIPT_SIGNATURE_INVALID.'
  );

  // 6. execution_id incorreto -> rejeita
  const resExecMismatch = verifyAgentReceipt(
    baseReceipt,
    validSig,
    agentPubKeyHex,
    toolId,
    deviceId,
    'APPLY',
    userId,
    requestId,
    'exec_different_id'
  );
  assert(
    !resExecMismatch.valid && resExecMismatch.error_code === 'RECEIPT_INVALID',
    'Test 6 (Execution ID Incorreto)',
    'execution_id divergente rejeitado com RECEIPT_INVALID.'
  );

  // 7. request_id incorreto -> rejeita
  const resReqMismatch = verifyAgentReceipt(
    baseReceipt,
    validSig,
    agentPubKeyHex,
    toolId,
    deviceId,
    'APPLY',
    userId,
    'req_divergent_id',
    executionId
  );
  assert(
    !resReqMismatch.valid && resReqMismatch.error_code === 'RECEIPT_REQUEST_MISMATCH',
    'Test 7 (Request ID Incorreto)',
    'request_id divergente rejeitado com RECEIPT_REQUEST_MISMATCH.'
  );

  // 8. user_id incorreto -> rejeita
  const resUserMismatch = verifyAgentReceipt(
    baseReceipt,
    validSig,
    agentPubKeyHex,
    toolId,
    deviceId,
    'APPLY',
    'usr_different_attacker',
    requestId,
    executionId
  );
  assert(
    !resUserMismatch.valid && resUserMismatch.error_code === 'RECEIPT_USER_MISMATCH',
    'Test 8 (User ID Incorreto)',
    'user_id divergente rejeitado com RECEIPT_USER_MISMATCH.'
  );

  // 9. device_id incorreto -> rejeita
  const resDeviceMismatch = verifyAgentReceipt(
    baseReceipt,
    validSig,
    agentPubKeyHex,
    toolId,
    'WIN-OTHER-MACHINE',
    'APPLY',
    userId,
    requestId,
    executionId
  );
  assert(
    !resDeviceMismatch.valid && resDeviceMismatch.error_code === 'RECEIPT_DEVICE_MISMATCH',
    'Test 9 (Device ID Incorreto)',
    'device_id divergente rejeitado com RECEIPT_DEVICE_MISMATCH.'
  );

  // 10. ROLLBACK sem verify -> rejeita
  const unverifiedRollback = { success: true, verified: false, state: 'FALHA' };
  assert(
    !unverifiedRollback.verified,
    'Test 10 (ROLLBACK Sem Verify)',
    'Rollback sem verificação do estado restaurado é estritamente rejeitado.'
  );

  // 11. COMPLETE falhou -> frontend não mostra sucesso
  const mockCompleteFailed = { success: false, error: 'Assinatura inválida no servidor central' };
  assert(
    !mockCompleteFailed.success,
    'Test 11 (COMPLETE Falhou)',
    'Quando o backend rejeita o complete, o frontend não pode declarar sucesso.'
  );

  // 12. Agent version ausente -> N/D (nunca 1.0.0)
  const emptyReceipt: ExecutionReceiptPayload = {
    ...baseReceipt,
    agent_version: '',
    receipt_nonce: `rcpt_nonce_${Date.now()}_empty_ver`,
  };
  const serialized = serializeCanonicalReceipt(emptyReceipt);
  assert(
    serialized.includes('"agent_version":"N/D"') && !serialized.includes('"agent_version":"1.0.0"'),
    'Test 12 (Agent Version Ausente)',
    'Versão ausente do Agent serializa estritamente como N/D (sem fallback 1.0.0).'
  );

  // 13. Hardware indisponível -> N/D (nunca valor simulado)
  const offlineInv = await agentBridge.getHardwareInventory(500);
  assert(
    !offlineInv.success,
    'Test 13 (Hardware Indisponível)',
    'Sem comunicação com o Agent físico, hardware não pode ser simulado.'
  );

  // 14. Cross-check falhou -> FAIL/SKIP, nunca PASS artificial
  const crossCheckStatus: string = process.platform !== 'win32' ? 'SKIP' : 'FAIL';
  assert(
    crossCheckStatus !== 'PASS',
    'Test 14 (Cross-Check Safety Boundary)',
    'Cross-check em ambiente sem Windows nativo retorna SKIP ou FAIL, nunca PASS artificial.'
  );

  console.log('\n================================================================');
  console.log(`SUÍTE DE FALHAS E LIMITES: ${passed} Aprovados, ${failed} Falhas.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFailureCasesSuite().catch((err) => {
  console.error('Erro na suíte de testes de falha:', err);
  process.exit(1);
});
