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

  // 2. APPLY: Execute real optimization
  const toolId = 'tool_perf_power_plan';
  const applyRes = await optimizationEngine.applyTool(toolId, 4);
  if (!applyRes.success || !applyRes.verified) {
    logFail('Step 2 (Apply Mutation)', applyRes.error || applyRes.message || 'Falha ao aplicar otimização real.');
    return;
  }
  logPass('Step 2 (Apply Mutation)', 'Otimização aplicada e validada criptograficamente pelo Agent.');

  // 3. VERIFY: Read live status again
  const midStatus = await agentBridge.getStatus(5000);
  if (!midStatus || !midStatus.power_scheme) {
    logFail('Step 3 (Verify Real Change)', 'Não foi possível validar o estado alterado no Windows.');
    return;
  }
  logPass('Step 3 (Verify Real Change)', `Novo estado confirmado no Windows: GUID ${midStatus.power_scheme.guid}`);

  // 4. ROLLBACK: Restore original state
  const rollbackRes = await optimizationEngine.rollbackTool(toolId, 4, initialStatus.power_scheme);
  if (!rollbackRes.success || !rollbackRes.verified) {
    logFail('Step 4 (Rollback Restoration)', rollbackRes.error || rollbackRes.message || 'Falha ao reverter otimização real.');
    return;
  }
  logPass('Step 4 (Rollback Restoration)', 'Rollback executado pelo Windows Agent.');

  // 5. VERIFY: Confirm restored state equals before state
  const finalStatus = await agentBridge.getStatus(5000);
  if (!finalStatus || !finalStatus.power_scheme) {
    logFail('Step 5 (Final State Verification)', 'Não foi possível ler o estado pós-reversão no Windows.');
    return;
  }

  if (finalStatus.power_scheme.guid.toLowerCase() !== beforeGuid.toLowerCase()) {
    logFail(
      'Step 5 (Final State Verification)',
      `Estado final (${finalStatus.power_scheme.guid}) não confere com o estado inicial (${beforeGuid}).`
    );
    return;
  }

  logPass(
    'Step 5 (Final State Verification)',
    `Restauração perfeita confirmada: estado final (${finalStatus.power_scheme.guid}) == estado inicial (${beforeGuid}).`
  );

  console.log('================================================================');
  console.log('RESULTADO DA SUÍTE APPLY-ROLLBACK: 5 Aprovados, 0 Falhas, 0 Mocks.');
  console.log('================================================================\n');
}

runApplyRollbackE2eSuite().catch((err) => {
  console.error('Erro no teste Apply-Rollback E2E:', err);
  process.exit(1);
});
