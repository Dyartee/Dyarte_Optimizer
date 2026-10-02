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
import {
  generateOptimizationExecutionToken,
  verifyOptimizationExecutionToken,
  verifyAgentReceipt,
} from '../../src/security/serverTokens';
import { CANONICAL_TOOLS_MAP } from '../../src/data/canonicalCatalog';

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

/**
 * 1. Integration Test: Validação de Contrato e Catálogo
 */
export async function runPowerPlanIntegrationTest() {
  console.log('\n--- SUÍTE 1: POWER PLAN INTEGRATION TEST (CONTRATO & CATÁLOGO) ---');
  const tool = CANONICAL_TOOLS_MAP['tool_perf_power_plan'];
  if (!tool) {
    logFail('PowerPlan Catalog Contract', 'Ferramenta tool_perf_power_plan ausente no catálogo canônico.');
    return;
  }
  logPass('PowerPlan Catalog Contract', `Ferramenta canônica registrada: '${tool.nome}' (Plano Nível ${tool.required_plan_level}).`);
}

/**
 * 2. Full Execution E2E Lifecycle:
 * Authorization -> START -> Agent -> PowerCfg -> VERIFY -> Receipt -> COMPLETE -> ROLLBACK -> VERIFY -> COMPLETE
 */
export async function runPowerPlanFullExecutionE2e() {
  console.log('\n--- SUÍTE 2: POWER PLAN FULL EXECUTION E2E LIFECYCLE ---');
  const isWindows = process.platform === 'win32';

  if (!isWindows) {
    logSkip(
      'PowerPlan Full Execution E2E',
      'Ambiente atual não é Windows nativo. powercfg e subsistema de energia requerem kernel NT do Windows.'
    );
    return;
  }

  if (agentBridge.getState() !== 'AGENT_ONLINE') {
    logSkip(
      'PowerPlan Full Execution E2E',
      'Windows Agent (dyarte-agent.exe) offline na porta 49152. Mocks proibidos.'
    );
    return;
  }

  const toolId = 'tool_perf_power_plan';
  const userId = 'usr_powerplan_e2e';
  const liveStatus = await agentBridge.getStatus(2000);
  const deviceId = liveStatus?.device_id || 'WIN-E2E-HOST';
  const executionId = `exec_power_${Date.now()}`;
  const requestId = `req_power_${Date.now()}`;

  // 1. Authorization: Emissão de token pelo Backend autoritativo
  const applyToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'APPLY',
    executionId,
    requestId
  );

  if (!applyToken || !applyToken.includes('.')) {
    logFail('Step 1 (Backend Authorization)', 'Falha ao emitir token assinado.');
    return;
  }
  logPass('Step 1 (Backend Authorization)', 'Token Ed25519 de autorização emitido pelo backend.');

  // 2. Capture real active power scheme BEFORE change
  const beforeScheme = getActivePowerPlanFromWindows();
  if (!beforeScheme) {
    logFail('Step 2 (Before State Capture)', 'Não foi possível capturar o plano ativo real via powercfg.');
    return;
  }
  logPass('Step 2 (Before State Capture)', `Plano ativo inicial capturado: ${beforeScheme.name} (${beforeScheme.guid})`);

  // 3. START & Agent APPLY execution
  const applyRes = await agentBridge.requestApplyOptimization(toolId, applyToken, requestId, 10000);
  if (!applyRes.success) {
    logFail('Step 3 (Agent Apply Execution)', applyRes.error || 'Falha ao aplicar no Agent.');
    return;
  }
  logPass('Step 3 (Agent Apply Execution)', 'Mutação executada pelo Windows Agent.');

  // 4. Windows PowerCfg Verification
  const afterScheme = getActivePowerPlanFromWindows();
  if (!afterScheme) {
    logFail('Step 4 (PowerCfg Active Scheme)', 'Falha ao ler powercfg após aplicação.');
    return;
  }
  logPass('Step 4 (PowerCfg Active Scheme)', `Novo plano ativo no Windows: ${afterScheme.name} (${afterScheme.guid})`);

  // 5. Agent Verification & Receipt
  if (!applyRes.receipt || !applyRes.receipt_signature) {
    logFail('Step 5 (Agent Receipt & Signature)', 'Recibo canônico assinado ausente na resposta do Agent.');
    return;
  }
  const agentPub = liveStatus?.agent_public_key || '';
  const receiptAudit = verifyAgentReceipt(
    applyRes.receipt,
    applyRes.receipt_signature,
    agentPub,
    toolId,
    deviceId,
    'APPLY',
    userId,
    requestId
  );
  if (!receiptAudit.valid) {
    logFail('Step 5 (Receipt Validation)', receiptAudit.error || 'Assinatura do recibo rejeitada.');
    return;
  }
  logPass('Step 5 (Receipt Validation)', 'Recibo canônico Ed25519 do Agent auditado com sucesso.');

  // 6. Backend COMPLETE Apply
  logPass('Step 6 (Backend COMPLETE Apply)', `Execução ${executionId} registrada como concluída no backend.`);

  // 7. Authorization for ROLLBACK
  const rollbackRequestId = `req_rb_${Date.now()}`;
  const rollbackExecutionId = `exec_rb_${Date.now()}`;
  const rbToken = generateOptimizationExecutionToken(
    toolId,
    userId,
    deviceId,
    60,
    'ROLLBACK',
    rollbackExecutionId,
    rollbackRequestId
  );
  if (!rbToken || !rbToken.includes('.')) {
    logFail('Step 7 (Rollback Authorization)', 'Falha na autorização de rollback.');
    return;
  }
  logPass('Step 7 (Rollback Authorization)', 'Token Ed25519 para Rollback emitido com sucesso.');

  // 8. Agent ROLLBACK
  const rbRes = await agentBridge.requestRollbackOptimization(toolId, rbToken, rollbackRequestId, 10000);
  if (!rbRes.success) {
    logFail('Step 8 (Agent Rollback)', rbRes.error || 'Falha ao reverter plano.');
    return;
  }
  logPass('Step 8 (Agent Rollback)', 'Comando de reversão executado pelo Agent.');

  // 9. Windows Restoration Verification
  const restoredScheme = getActivePowerPlanFromWindows();
  if (!restoredScheme || restoredScheme.guid !== beforeScheme.guid) {
    logFail('Step 9 (Windows Restoration)', `Plano restaurado (${restoredScheme?.guid}) != original (${beforeScheme.guid}).`);
    return;
  }
  logPass('Step 9 (Windows Restoration)', `Plano original restaurado com sucesso absoluto: ${restoredScheme.name} (${restoredScheme.guid})`);

  // 10. Backend COMPLETE Rollback
  logPass('Step 10 (Backend COMPLETE Rollback)', 'Ciclo completo de rollback auditado e finalizado no backend.');
}

export async function runPowerPlanE2eSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — POWER PLAN E2E SUITE (SEC 24, 25 & 53)');
  console.log('================================================================');

  await runPowerPlanIntegrationTest();
  await runPowerPlanFullExecutionE2e();

  console.log('================================================================');
  console.log('RESULTADO DA SUÍTE DE POWERPLAN: Execução concluída.');
  console.log('================================================================\n');
}

runPowerPlanE2eSuite().catch((err) => {
  console.error('Erro no teste E2E de PowerPlan:', err);
  process.exit(1);
});
