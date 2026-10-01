/**
 * DYARTE OPTIMIZER — POWER PLAN REAL E2E TEST (Sections 24 & 53)
 *
 * Rules:
 * - Runs strictly on Windows with real powercfg utility and real Windows Agent.
 * - Captures real active power scheme before change.
 * - Applies optimization via Agent.
 * - Reads real active power scheme after apply with powercfg /getactivescheme.
 * - Verifies real change representation (never hardcoded GUIDs).
 * - Performs real rollback.
 * - Re-reads real active power scheme with powercfg.
 * - Confirms original scheme is restored.
 * - If non-Windows or Agent is offline: SKIPPED with explicit reason.
 * - Never converts FAIL to PASS.
 */

import { execSync } from 'child_process';
import { agentBridge } from '../../src/services/agentBridge';
import { optimizationEngine } from '../../src/services/optimizationEngine';

function logPass(testName: string, detail: string) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${testName}: ${detail}`);
}

function logSkip(testName: string, reason: string) {
  console.log(`\x1b[33m[SKIPPED]\x1b[0m ${testName}: ${reason}`);
}

function logFail(testName: string, detail: string) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${testName}: ${detail}`);
  process.exit(1);
}

interface PowerSchemeInfo {
  guid: string;
  name: string;
}

function getActivePowerPlanFromWindows(): PowerSchemeInfo | null {
  if (process.platform !== 'win32') return null;
  try {
    const output = execSync('powercfg /getactivescheme', { encoding: 'utf8' });
    const guidMatch = output.match(/GUID:\s*([a-f0-9\-]{36})/i);
    const nameMatch = output.match(/\(([^)]+)\)/);
    if (guidMatch && guidMatch[1]) {
      return {
        guid: guidMatch[1].toLowerCase(),
        name: nameMatch ? nameMatch[1] : 'N/D',
      };
    }
  } catch (err: any) {
    console.error('Falha ao executar powercfg /getactivescheme:', err?.message || err);
  }
  return null;
}

export async function runPowerPlanE2eSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — POWER PLAN REAL E2E TEST (SEC 24 & 53)');
  console.log('================================================================');

  const isWindows = process.platform === 'win32';
  console.log(`[Platform Check] Environment: ${process.platform} (isWindows: ${isWindows})`);

  if (!isWindows) {
    logSkip(
      'PowerPlan Live E2E Lifecycle',
      'Ambiente atual não é Windows nativo. powercfg e subsistema de energia requerem kernel NT do Windows.'
    );
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE DE POWERPLAN: 0 Aprovados, 1 Pulado (Não-Windows).');
    console.log('================================================================\n');
    return;
  }

  // Check if Windows Agent is connected
  const agentState = agentBridge.getState();
  if (agentState !== 'AGENT_ONLINE') {
    logSkip(
      'PowerPlan Live E2E Lifecycle',
      'Windows Agent (dyarte-agent.exe) offline na porta 49152. Mocks e simulações proibidos (Section 1 & 24).'
    );
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE DE POWERPLAN: 0 Aprovados, 1 Pulado (Agent Offline).');
    console.log('================================================================\n');
    return;
  }

  // 1. Capture real active power scheme BEFORE change
  const beforeScheme = getActivePowerPlanFromWindows();
  if (!beforeScheme) {
    logFail('PowerPlan Before Capture', 'Não foi possível capturar o plano ativo real via powercfg.');
    return;
  }
  logPass('PowerPlan Step 1 (Before State)', `Plano ativo capturado: ${beforeScheme.name} (${beforeScheme.guid})`);

  // 2. Request authorization and apply through optimizationEngine
  const toolId = 'tool_perf_power_plan';
  const applyRes = await optimizationEngine.applyTool(toolId, 4);

  if (!applyRes.success || !applyRes.verified) {
    logFail('PowerPlan Step 2 (Apply Execution)', applyRes.error || applyRes.message || 'Falha ao aplicar plano de energia.');
    return;
  }
  logPass('PowerPlan Step 2 (Apply Execution)', 'Plano de energia aplicado e verificado com sucesso pelo Agent.');

  // 3. Re-read real active power scheme from Windows
  const afterApplyScheme = getActivePowerPlanFromWindows();
  if (!afterApplyScheme) {
    logFail('PowerPlan Step 3 (After Apply Check)', 'Não foi possível ler o estado pós-aplicação via powercfg.');
    return;
  }

  // Verify that a real change occurred (or customized performance name applied)
  const isChanged = afterApplyScheme.guid !== beforeScheme.guid ||
    afterApplyScheme.name.toLowerCase().includes('desempenho') ||
    afterApplyScheme.name.toLowerCase().includes('performance') ||
    afterApplyScheme.name.toLowerCase().includes('dyarte');

  if (!isChanged) {
    logFail('PowerPlan Step 3 (Verify Real Change)', `Plano de energia permaneceu inalterado: ${afterApplyScheme.guid}`);
    return;
  }
  logPass('PowerPlan Step 3 (Verify Real Change)', `Novo plano ativo confirmado via powercfg: ${afterApplyScheme.name} (${afterApplyScheme.guid})`);

  // 4. Perform real rollback
  const rollbackRes = await optimizationEngine.rollbackTool(toolId, 4, beforeScheme);
  if (!rollbackRes.success || !rollbackRes.verified) {
    logFail('PowerPlan Step 4 (Rollback Execution)', rollbackRes.error || rollbackRes.message || 'Falha ao reverter plano de energia.');
    return;
  }
  logPass('PowerPlan Step 4 (Rollback Execution)', 'Rollback executado e verificado pelo Agent.');

  // 5. Re-read real active power scheme to confirm restoration
  const afterRollbackScheme = getActivePowerPlanFromWindows();
  if (!afterRollbackScheme) {
    logFail('PowerPlan Step 5 (After Rollback Check)', 'Não foi possível ler o estado pós-rollback via powercfg.');
    return;
  }

  if (afterRollbackScheme.guid !== beforeScheme.guid) {
    logFail(
      'PowerPlan Step 5 (Confirm Restoration)',
      `Plano restaurado (${afterRollbackScheme.guid}) difere do plano original (${beforeScheme.guid}).`
    );
    return;
  }
  logPass(
    'PowerPlan Step 5 (Confirm Restoration)',
    `Plano original restaurado com sucesso absoluto: ${afterRollbackScheme.name} (${afterRollbackScheme.guid})`
  );

  console.log('================================================================');
  console.log('RESULTADO DA SUÍTE DE POWERPLAN: 5 Aprovados, 0 Falhas, 0 Mocks.');
  console.log('================================================================\n');
}

runPowerPlanE2eSuite().catch((err) => {
  console.error('Erro no teste E2E de PowerPlan:', err);
  process.exit(1);
});
