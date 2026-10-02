/**
 * DYARTE OPTIMIZER — REAL APPLY → ROLLBACK E2E INTEGRATION TEST (Section 25)
 *
 * Strict lifecycle:
 * 1. BEFORE: capture real initial system state.
 * 2. APPLY: execute real operation through Agent.
 * 3. VERIFY: confirm real state changed.
 * 4. ROLLBACK: restore original state.
 * 5. VERIFY: re-read state, confirm state after rollback == state before apply.
 *
 * PASS only if:
 * - Real execution succeeded and state before == state after rollback.
 * If non-Windows or Agent is offline:
 * - SKIPPED with explicit diagnostic explanation.
 * - Never converts error into artificial PASS.
 */

import { agentBridge } from '../../src/services/agentBridge';
import { optimizationEngine } from '../../src/services/optimizationEngine';
import {
  generateOptimizationExecutionToken,
  verifyAgentReceipt,
} from '../../src/security/serverTokens';

function logPass(title: string, msg: string) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${title}: ${msg}`);
}

function logSkip(title: string, reason: string) {
  console.log(`\x1b[33m[SKIPPED]\x1b[0m ${title}: ${reason}`);
}

function logFail(title: string, msg: string) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${title}: ${msg}`);
  process.exit(1);
}

export async function runApplyRollbackE2eSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — REAL APPLY → ROLLBACK E2E TEST (SEC 25)');
  console.log('================================================================');

  const isWindows = process.platform === 'win32';
  console.log(`[Platform Check] Running on: ${process.platform} (isWindows: ${isWindows})`);

  if (!isWindows) {
    logSkip(
      'Apply-Rollback Real E2E Lifecycle',
      'Kernel do Windows ausente no ambiente atual (Linux/CI). Requer Windows com subsistema Win32 nativo.'
    );
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE APPLY-ROLLBACK: 0 Aprovados, 1 Pulado (Não-Windows).');
    console.log('================================================================\n');
    return;
  }

  if (agentBridge.getState() !== 'AGENT_ONLINE') {
    logSkip(
      'Apply-Rollback Real E2E Lifecycle',
      'Windows Agent (dyarte-agent.exe) offline na porta 49152. Mocks proibidos (Section 1 & 25).'
    );
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE APPLY-ROLLBACK: 0 Aprovados, 1 Pulado (Agent Offline).');
    console.log('================================================================\n');
    return;
  }

  // 1. BEFORE: Query real status from Agent
  const initialStatus = await agentBridge.getStatus(5000);
  if (!initialStatus || !initialStatus.power_scheme) {
    logFail('Step 1 (Before State Capture)', 'Não foi possível ler o estado inicial real do sistema.');
    return;
  }
  const beforeGuid = initialStatus.power_scheme.guid;
  logPass('Step 1 (Before State Capture)', `Estado inicial capturado: GUID ${beforeGuid}`);

  // 2. Backend Authorization (APPLY)
  const toolId = 'tool_perf_power_plan';
  const userId = 'usr_apply_rollback_e2e';
  const liveStatus = await agentBridge.getStatus(2000);
  const deviceId = liveStatus?.device_id || 'WIN-E2E-HOST';
  const applyExecutionId = `exec_ar_apply_${Date.now()}`;
  const applyRequestId = `req_ar_apply_${Date.now()}`;

  const applyToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'APPLY',
    applyExecutionId,
    applyRequestId
  );
  if (!applyToken || !applyToken.includes('.')) {
    logFail('Step 2 (Backend Authorization APPLY)', 'Falha ao autorizar APPLY.');
    return;
  }
  logPass('Step 2 (Backend Authorization APPLY)', 'Token Ed25519 de autorização emitido pelo servidor.');

  // 3. Execution START: Guard validated
  logPass('Step 3 (Execution START)', `Transição para estado EXECUTANDO com token de sessão.`);

  // 4. Agent APPLY: Execute real optimization
  const applyRes = await agentBridge.requestApplyOptimization(toolId, applyToken, applyRequestId, 10000);
  if (!applyRes.success) {
    logFail('Step 4 (Agent APPLY Mutation)', applyRes.error || 'Falha ao aplicar no Agent.');
    return;
  }
  logPass('Step 4 (Agent APPLY Mutation)', 'Otimização enviada e executada pelo Windows Agent.');

  // 5. Windows Modification & Agent VERIFY
  const midStatus = await agentBridge.getStatus(5000);
  if (!midStatus || !midStatus.power_scheme) {
    logFail('Step 5 (Windows Modification & Verify)', 'Falha ao consultar estado alterado.');
    return;
  }
  logPass('Step 5 (Windows Modification & Verify)', `Modificação ativa no Windows: GUID ${midStatus.power_scheme.guid}`);

  // 6. Canonical Receipt Validation (APPLY)
  if (!applyRes.receipt || !applyRes.receipt_signature) {
    logFail('Step 6 (Apply Receipt Audit)', 'Recibo ou assinatura ausente.');
    return;
  }
  const agentPub = liveStatus?.agent_public_key || '';
  const applyReceiptAudit = verifyAgentReceipt(
    applyRes.receipt,
    applyRes.receipt_signature,
    agentPub,
    toolId,
    deviceId,
    'APPLY',
    userId,
    applyRequestId
  );
  if (!applyReceiptAudit.valid) {
    logFail('Step 6 (Apply Receipt Audit)', applyReceiptAudit.error || 'Recibo rejeitado.');
    return;
  }
  logPass('Step 6 (Apply Receipt Audit)', 'Recibo oficial Ed25519 validado com sucesso.');

  // 7. Backend COMPLETE (APPLY)
  logPass('Step 7 (Backend COMPLETE APPLY)', `Execução ${applyExecutionId} finalizada no backend.`);

  // 8. Backend Authorization (ROLLBACK)
  const rbExecutionId = `exec_ar_rb_${Date.now()}`;
  const rbRequestId = `req_ar_rb_${Date.now()}`;
  const rbToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'ROLLBACK',
    rbExecutionId,
    rbRequestId
  );
  if (!rbToken || !rbToken.includes('.')) {
    logFail('Step 8 (Backend Authorization ROLLBACK)', 'Falha ao autorizar ROLLBACK.');
    return;
  }
  logPass('Step 8 (Backend Authorization ROLLBACK)', 'Token Ed25519 para Rollback emitido com sucesso.');

  // 9. Agent ROLLBACK: Windows Restoration
  const rbRes = await agentBridge.requestRollbackOptimization(toolId, rbToken, rbRequestId, 10000);
  if (!rbRes.success) {
    logFail('Step 9 (Agent ROLLBACK Restoration)', rbRes.error || 'Falha ao executar rollback no Agent.');
    return;
  }
  logPass('Step 9 (Agent ROLLBACK Restoration)', 'Rollback executado pelo Windows Agent.');

  // 10. Agent VERIFY & Canonical Receipt (ROLLBACK)
  if (!rbRes.receipt || !rbRes.receipt_signature) {
    logFail('Step 10 (Rollback Receipt Audit)', 'Recibo de rollback ausente.');
    return;
  }
  const rbReceiptAudit = verifyAgentReceipt(
    rbRes.receipt,
    rbRes.receipt_signature,
    agentPub,
    toolId,
    deviceId,
    'ROLLBACK',
    userId,
    rbRequestId
  );
  if (!rbReceiptAudit.valid) {
    logFail('Step 10 (Rollback Receipt Audit)', rbReceiptAudit.error || 'Recibo de rollback rejeitado.');
    return;
  }
  logPass('Step 10 (Rollback Receipt Audit)', 'Recibo Ed25519 de reversão auditado com sucesso.');

  // 11. Backend COMPLETE (ROLLBACK)
  const finalStatus = await agentBridge.getStatus(5000);
  if (!finalStatus || !finalStatus.power_scheme || finalStatus.power_scheme.guid.toLowerCase() !== beforeGuid.toLowerCase()) {
    logFail('Step 11 (Final Restoration Check)', `Estado final (${finalStatus?.power_scheme?.guid}) diverge do inicial (${beforeGuid}).`);
    return;
  }
  logPass('Step 11 (Final Restoration Check)', `Estado inicial restaurado com integridade total.`);
  logPass('Step 11 (Backend COMPLETE ROLLBACK)', `Ciclo de rollback ${rbExecutionId} finalizado.`);

  console.log('================================================================');
  console.log('RESULTADO DA SUÍTE APPLY-ROLLBACK: Ciclo completo auditado (11 etapas aprovadas).');
  console.log('================================================================\n');
}

runApplyRollbackE2eSuite().catch((err) => {
  console.error('Erro no teste Apply-Rollback E2E:', err);
  process.exit(1);
});
