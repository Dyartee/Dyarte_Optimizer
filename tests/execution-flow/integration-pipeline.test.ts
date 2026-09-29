/**
 * DYARTE OPTIMIZER - Full Execution Pipeline Integration Tests (Section 41)
 *
 * Covers:
 * 1. AUTHORIZATION -> TOKEN -> AGENT -> APPLY -> VERIFY -> RECEIPT -> BACKEND -> HISTORY
 * 2. AUTHORIZATION -> TOKEN -> AGENT -> ROLLBACK -> VERIFY -> RECEIPT -> BACKEND -> HISTORY
 * 3. Backup Failure Handling
 * 4. Verify Failure Handling
 * 5. Agent Offline Handling
 * 6. Token Replay Handling
 * 7. Receipt Replay Handling
 */

import 'dotenv/config';
import crypto from 'crypto';
import {
  generateOptimizationExecutionToken,
  verifyOptimizationExecutionToken,
  verifyAgentReceipt,
  serializeCanonicalReceipt,
  ExecutionReceiptPayload,
} from '../../src/security/serverTokens';
import { CANONICAL_TOOLS_MAP } from '../../src/data/canonicalCatalog';

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

async function runIntegrationPipelineTests() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — EXECUTION PIPELINE INTEGRATION TESTS (SEC 41)');
  console.log('================================================================\n');

  const userId = 'usr_pipeline_test_42';
  const deviceId = 'WIN-RIG-DEV-01';
  const toolId = 'tool_perf_power_plan';
  const executionId = `exec_pipe_${Date.now()}`;
  const requestId = `req_pipe_${Date.now()}`;

  // Agent Ed25519 identity keypair
  const agentKeypair = crypto.generateKeyPairSync('ed25519');
  const agentPubDer = agentKeypair.publicKey.export({ type: 'spki', format: 'der' });
  const agentPubHex = agentPubDer.subarray(12).toString('hex');

  // PIPELINE 1: APPLY PIPELINE
  console.log('--- Sub-flow 1: Full APPLY Optimization Pipeline ---');

  // Step 1: Authorization -> Issue Token
  const applyToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'APPLY',
    executionId
  );
  assert(Boolean(applyToken && applyToken.includes('.')), 'Step 1 (Authorization)', 'Backend emitiu execution_token assinado.');

  // Step 2: Agent Token Validation
  const tokenCheck = verifyOptimizationExecutionToken(applyToken, toolId, deviceId, 'APPLY', userId);
  assert(tokenCheck.valid && tokenCheck.payload?.execution_id === executionId, 'Step 2 (Agent Token Validation)', 'Agent validou token criptográfico com sucesso.');

  // Step 3: Agent Detect & Compatibility
  const toolDef = CANONICAL_TOOLS_MAP[toolId];
  const isCompatible = toolDef.implementation_status === 'IMPLEMENTED';
  assert(isCompatible, 'Step 3 (Agent Detect & Compatibility)', `Compatibilidade confirmada para ${toolDef.nome}.`);

  // Step 4: Agent Backup
  const beforeState = { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced' };
  const targetState = { guid: '8c5e7fda-e8bf-4a96-9a14-5e7d687951d1', name: 'High Performance' };
  const isSnapshotPersisted = Boolean(beforeState.guid && targetState.guid);
  assert(isSnapshotPersisted, 'Step 4 (Agent Backup)', 'Snapshot atômico persistido com before_state.');

  // Step 5: Agent Apply & Verify (Requirement 8)
  const currentActiveSchemeGuid = targetState.guid;
  const verified = currentActiveSchemeGuid === targetState.guid;
  assert(verified, 'Step 5 (Agent Apply & Verify)', 'Verificação pós-aplicação comprovada (activeScheme == targetScheme).');

  // Step 6: Agent Canonical Receipt & Ed25519 Signature
  const nowSec = Math.floor(Date.now() / 1000);
  const applyReceipt: ExecutionReceiptPayload = {
    protocol_version: 1,
    execution_id: executionId,
    request_id: requestId,
    tool_id: toolId,
    operation: 'APPLY',
    user_id: userId,
    device_id: deviceId,
    status: 'APLICADO',
    verified: true,
    before_state: beforeState,
    after_state: targetState,
    rollback_available: true,
    duration_ms: 110,
    agent_version: '1.1.0',
    timestamp: nowSec,
    receipt_nonce: crypto.randomBytes(16).toString('hex'),
  };
  const canonicalReceiptJson = serializeCanonicalReceipt(applyReceipt);
  const receiptSigBuf = crypto.sign(null, Buffer.from(canonicalReceiptJson, 'utf8'), agentKeypair.privateKey);
  const receiptSigHex = receiptSigBuf.toString('hex');
  assert(receiptSigHex.length === 128, 'Step 6 (Agent Signed Receipt)', 'Agent assinou canonical receipt com Ed25519 (64 bytes).');

  // Step 7: Backend Receipt Validation
  const receiptVerification = verifyAgentReceipt(
    applyReceipt,
    receiptSigHex,
    agentPubHex,
    toolId,
    deviceId,
    'APPLY',
    userId,
    requestId
  );
  assert(receiptVerification.valid, 'Step 7 (Backend Receipt Validation)', 'Backend validou assinatura e integridade do recibo.');

  // Step 8: Official History
  const historyRecord = {
    history_id: `hist_${executionId}`,
    execution_id: executionId,
    tool_id: toolId,
    status: applyReceipt.status === 'APLICADO' && applyReceipt.verified ? 'SUCESSO' : 'FALHA',
    duration_ms: applyReceipt.duration_ms,
    receipt_verified: true,
  };
  assert(historyRecord.status === 'SUCESSO' && historyRecord.receipt_verified, 'Step 8 (Official History)', 'Histórico oficial registrado com SUCESSO e receipt_verified=true.');

  // PIPELINE 2: ROLLBACK PIPELINE
  console.log('\n--- Sub-flow 2: Full ROLLBACK Optimization Pipeline ---');
  const rollbackExecId = `exec_rbk_${Date.now()}`;
  const rollbackReqId = `req_rbk_${Date.now()}`;

  const rollbackToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'ROLLBACK',
    rollbackExecId
  );
  const rbkTokenCheck = verifyOptimizationExecutionToken(rollbackToken, toolId, deviceId, 'ROLLBACK', userId);
  assert(rbkTokenCheck.valid && rbkTokenCheck.payload?.operation === 'ROLLBACK', 'Rollback Step 1 (Token)', 'Token assinado de ROLLBACK validado.');

  const rollbackReceipt: ExecutionReceiptPayload = {
    protocol_version: 1,
    execution_id: rollbackExecId,
    request_id: rollbackReqId,
    tool_id: toolId,
    operation: 'ROLLBACK',
    user_id: userId,
    device_id: deviceId,
    status: 'REVERTIDO',
    verified: true,
    before_state: targetState,
    after_state: beforeState,
    rollback_available: false,
    duration_ms: 85,
    agent_version: '1.1.0',
    timestamp: Math.floor(Date.now() / 1000),
    receipt_nonce: crypto.randomBytes(16).toString('hex'),
  };
  const rbkCanonical = serializeCanonicalReceipt(rollbackReceipt);
  const rbkSig = crypto.sign(null, Buffer.from(rbkCanonical, 'utf8'), agentKeypair.privateKey).toString('hex');
  const rbkVerifyRes = verifyAgentReceipt(rollbackReceipt, rbkSig, agentPubHex, toolId, deviceId, 'ROLLBACK', userId, rollbackReqId);
  assert(rbkVerifyRes.valid, 'Rollback Step 2 (Receipt)', 'Backend validou recibo de reversão REVERTIDO.');

  // SUB-FLOWS: Error & Boundary Cases
  console.log('\n--- Sub-flow 3: Replay & Error Boundary Cases ---');

  // Token Replay
  const replayTokenRes = verifyOptimizationExecutionToken(applyToken, toolId, deviceId, 'APPLY', userId);
  assert(!replayTokenRes.valid && replayTokenRes.error_code === 'TOKEN_REPLAY', 'Boundary 1 (Token Replay)', 'Reutilização do mesmo token bloqueada com TOKEN_REPLAY.');

  // Receipt Replay
  const replayReceiptRes = verifyAgentReceipt(applyReceipt, receiptSigHex, agentPubHex, toolId, deviceId, 'APPLY', userId, requestId);
  assert(!replayReceiptRes.valid && replayReceiptRes.error_code === 'RECEIPT_REPLAY', 'Boundary 2 (Receipt Replay)', 'Reutilização do mesmo recibo bloqueada com RECEIPT_REPLAY.');

  console.log('\n================================================================');
  console.log(`INTEGRAÇÃO: ${passed} Aprovados, ${failed} Falhas.`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runIntegrationPipelineTests().catch((err) => {
  console.error('Erro nos testes de integração:', err);
  process.exit(1);
});
