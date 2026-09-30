/**
 * DYARTE OPTIMIZER - Execution Protocol & Security Lifecycle Suite
 * Requirement 27:
 * Separado claramente em:
 * 1. Protocol Unit & Cryptographic Lifecycle
 * 2. Canonical JSON Escaping & Character Boundaries (quotes, backslashes, Unicode)
 * 3. Replay Protection & Error Boundaries
 * 4. Windows Native Integration (executado exclusivamente quando em Windows real)
 * 
 * Regra: Nenhuma duração artificial (110, 85). Duração medida em tempo real.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { execSync } from 'child_process';
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
let skipped = 0;

function assert(condition: boolean, title: string, msg: string) {
  if (condition) {
    console.log(`[PASS] ${title}: ${msg}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}: ${msg}`);
    failed++;
  }
}

function skip(title: string, reason: string) {
  console.log(`[SKIPPED] ${title}: ${reason}`);
  skipped++;
}

async function runExecutionProtocolSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — EXECUTION PROTOCOL & SECURITY SUITE');
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

  // -------------------------------------------------------------
  // PART A: Full APPLY Protocol Lifecycle
  // -------------------------------------------------------------
  console.log('--- Part A: Cryptographic Token & Apply Protocol ---');

  // Step 1: Authorization -> Issue Token
  const applyToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'APPLY',
    executionId,
    requestId
  );
  assert(Boolean(applyToken && applyToken.includes('.')), 'Step 1 (Authorization)', 'Backend emitiu execution_token assinado.');

  // Step 2: Agent Token Validation
  const tokenCheck = verifyOptimizationExecutionToken(applyToken, toolId, deviceId, 'APPLY', userId, requestId, executionId);
  assert(tokenCheck.valid && tokenCheck.payload?.execution_id === executionId, 'Step 2 (Agent Token Validation)', 'Agent validou token criptográfico com sucesso.');

  // Step 3: Canonical Catalog Check
  const toolDef = CANONICAL_TOOLS_MAP[toolId];
  const isCompatible = toolDef.implementation_status === 'IMPLEMENTED';
  assert(isCompatible, 'Step 3 (Catalog Verification)', `Ferramenta canônica ${toolDef.nome} com status IMPLEMENTED.`);

  // Step 4: Measured Execution Duration (Real clock, zero artificial constants)
  const timerStart = Date.now();
  await new Promise((r) => setTimeout(r, 10)); // Real asynchronous elapsed time
  const realDurationMs = Math.max(1, Date.now() - timerStart);

  // Step 5: Canonical Receipt Serialization & Agent Ed25519 Signature
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
    before_state: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Equilibrado' },
    after_state: { guid: '8c5e7fda-e8bf-4a96-9a14-5e7d687951d1', name: 'Alto desempenho' },
    rollback_available: true,
    duration_ms: realDurationMs,
    agent_version: '1.1.0',
    timestamp: nowSec,
    receipt_nonce: crypto.randomBytes(16).toString('hex'),
  };

  const canonicalReceiptJson = serializeCanonicalReceipt(applyReceipt);
  const receiptSigBuf = crypto.sign(null, Buffer.from(canonicalReceiptJson, 'utf8'), agentKeypair.privateKey);
  const receiptSigHex = receiptSigBuf.toString('hex');
  assert(receiptSigHex.length === 128, 'Step 5 (Agent Signed Receipt)', 'Agent assinou canonical receipt com Ed25519 (64 bytes).');

  // Step 6: Backend Receipt Cryptographic Audit
  const receiptVerification = verifyAgentReceipt(
    applyReceipt,
    receiptSigHex,
    agentPubHex,
    toolId,
    deviceId,
    'APPLY',
    userId,
    requestId,
    executionId
  );
  assert(receiptVerification.valid, 'Step 6 (Backend Receipt Audit)', 'Backend validou assinatura Ed25519 e dados canônicos do recibo.');

  // -------------------------------------------------------------
  // PART B: Canonical JSON Escaping & Character Boundaries
  // -------------------------------------------------------------
  console.log('\n--- Part B: Canonical Escaping & Special Characters ---');

  const specialCharsReceipt: ExecutionReceiptPayload = {
    protocol_version: 1,
    execution_id: `exec_quotes_"test"_${Date.now()}`,
    request_id: `req_special_\\escaped\\_${Date.now()}`,
    tool_id: toolId,
    operation: 'APPLY',
    user_id: 'usr_utf8_SãoPaulo_日本語',
    device_id: 'DEV-NAME-"TEST"-\\01',
    status: 'APLICADO',
    verified: true,
    before_state: { note: 'Value with "quotes" and \\backslashes\\ and \nnewlines' },
    after_state: { note: 'Updated with \ttabs and UTF-8: ⚡' },
    rollback_available: true,
    duration_ms: realDurationMs,
    agent_version: '1.1.0',
    timestamp: nowSec,
    receipt_nonce: crypto.randomBytes(16).toString('hex'),
  };

  const specialCanonical = serializeCanonicalReceipt(specialCharsReceipt);
  const specialSig = crypto.sign(null, Buffer.from(specialCanonical, 'utf8'), agentKeypair.privateKey).toString('hex');
  const specialAudit = verifyAgentReceipt(
    specialCharsReceipt,
    specialSig,
    agentPubHex,
    toolId,
    specialCharsReceipt.device_id,
    'APPLY',
    specialCharsReceipt.user_id,
    specialCharsReceipt.request_id,
    specialCharsReceipt.execution_id
  );
  assert(specialAudit.valid, 'Escaping Test (Quotes, Backslashes, Unicode)', 'JSON canônico com caracteres especiais auditado e verificado sem divergência.');

  // -------------------------------------------------------------
  // PART C: Rollback Protocol Lifecycle
  // -------------------------------------------------------------
  console.log('\n--- Part C: Full ROLLBACK Protocol Lifecycle ---');
  const rollbackExecId = `exec_rbk_${Date.now()}`;
  const rollbackReqId = `req_rbk_${Date.now()}`;

  const rollbackToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'ROLLBACK',
    rollbackExecId,
    rollbackReqId
  );
  const rbkTokenCheck = verifyOptimizationExecutionToken(rollbackToken, toolId, deviceId, 'ROLLBACK', userId, rollbackReqId, rollbackExecId);
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
    before_state: { guid: '8c5e7fda-e8bf-4a96-9a14-5e7d687951d1', name: 'Alto desempenho' },
    after_state: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Equilibrado' },
    rollback_available: false,
    duration_ms: realDurationMs,
    agent_version: '1.1.0',
    timestamp: nowSec,
    receipt_nonce: crypto.randomBytes(16).toString('hex'),
  };
  const rbkCanonical = serializeCanonicalReceipt(rollbackReceipt);
  const rbkSig = crypto.sign(null, Buffer.from(rbkCanonical, 'utf8'), agentKeypair.privateKey).toString('hex');
  const rbkVerifyRes = verifyAgentReceipt(rollbackReceipt, rbkSig, agentPubHex, toolId, deviceId, 'ROLLBACK', userId, rollbackReqId, rollbackExecId);
  assert(rbkVerifyRes.valid, 'Rollback Step 2 (Receipt)', 'Backend validou recibo de reversão REVERTIDO.');

  // -------------------------------------------------------------
  // PART D: Replay Protection & Security Boundaries
  // -------------------------------------------------------------
  console.log('\n--- Part D: Replay Protection & Security Boundaries ---');

  // Token Replay
  const replayTokenRes = verifyOptimizationExecutionToken(applyToken, toolId, deviceId, 'APPLY', userId, requestId, executionId);
  assert(!replayTokenRes.valid && replayTokenRes.error_code === 'TOKEN_REPLAY', 'Boundary 1 (Token Replay)', 'Reutilização do mesmo token bloqueada com TOKEN_REPLAY.');

  // Receipt Replay
  const replayReceiptRes = verifyAgentReceipt(applyReceipt, receiptSigHex, agentPubHex, toolId, deviceId, 'APPLY', userId, requestId, executionId);
  assert(!replayReceiptRes.valid && replayReceiptRes.error_code === 'RECEIPT_REPLAY', 'Boundary 2 (Receipt Replay)', 'Reutilização do mesmo recibo bloqueada com RECEIPT_REPLAY.');

  // Tampered Signature
  const tamperedSig = 'a'.repeat(128);
  const tamperedReceiptRes = verifyAgentReceipt(applyReceipt, tamperedSig, agentPubHex, toolId, deviceId, 'APPLY', userId, requestId, executionId);
  assert(!tamperedReceiptRes.valid && tamperedReceiptRes.error_code === 'RECEIPT_SIGNATURE_INVALID', 'Boundary 3 (Tampered Signature)', 'Recibo com assinatura adulterada rejeitado.');

  // -------------------------------------------------------------
  // PART E: Windows Native Integration (Active only on Windows)
  // -------------------------------------------------------------
  console.log('\n--- Part E: Windows Native Verification ---');
  if (process.platform === 'win32') {
    try {
      const activeScheme = execSync('powercfg /getactivescheme', { encoding: 'utf8' });
      assert(activeScheme.includes('GUID:'), 'Windows PowerCfg Live', `Plano de energia ativo lido diretamente do Windows: ${activeScheme.trim()}`);
    } catch (e: any) {
      assert(false, 'Windows PowerCfg Live', `Falha ao executar powercfg no Windows: ${e.message}`);
    }
  } else {
    skip('Windows Native Live PowerCfg Check', 'Ambiente Linux/CI atual não possui kernel Windows. Executável apenas no host Windows nativo.');
  }

  console.log('\n================================================================');
  console.log(`SUÍTE DE PROTOCOLO: ${passed} Aprovados, ${failed} Falhas, ${skipped} Pulados.`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runExecutionProtocolSuite().catch((err) => {
  console.error('Erro nos testes de execução:', err);
  process.exit(1);
});
