/**
 * DYARTE OPTIMIZER — SOFTWARE DETECTION & AI INTELLIGENCE TEST SUITE (Requirements 46 & 47)
 * Tests software inventory sanitization, deduplication, anti-cheat protection,
 * schema validation, and AI error condition fallbacks.
 */

import { SoftwareInventoryItem } from '../../src/types/software';
import { SoftwareInventoryService } from '../../src/services/softwareInventoryService';
import { MockAiProvider, validateRecommendationSafety } from '../../src/services/aiProvider';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`\x1b[32m[PASS]\x1b[0m ${testName}: ${detail}`);
    passed++;
  } else {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${testName}: ${detail}`);
    failed++;
  }
}

export async function runSoftwareIntelligenceTestSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — SOFTWARE DETECTION & AI INTELLIGENCE TEST SUITE');
  console.log('================================================================');

  // Test 1: Deduplication by publisher, name, version, install_path (Requirement 42)
  const rawItems: SoftwareInventoryItem[] = [
    {
      id: 'sw_1',
      name: 'Google Chrome',
      publisher: 'Google LLC',
      version: '130.0.0.0',
      install_path: 'C:\\Program Files\\Google\\Chrome',
      executable: 'chrome.exe',
      source: 'REGISTRY',
      install_date: '2026-01-10',
      running: false,
      process_name: null,
      signed: true,
      signature_status: 'VALID',
    },
    {
      id: 'sw_2',
      name: 'Google Chrome',
      publisher: 'Google LLC',
      version: '130.0.0.0',
      install_path: 'C:\\Program Files\\Google\\Chrome',
      executable: 'chrome.exe',
      source: 'PROCESS',
      install_date: null,
      running: true,
      process_name: 'chrome.exe',
      signed: true,
      signature_status: 'VALID',
    },
    {
      id: 'sw_3',
      name: 'Discord',
      publisher: 'Discord Inc.',
      version: '1.0.9000',
      install_path: 'C:\\Users\\User\\AppData\\Local\\Discord',
      executable: 'Discord.exe',
      source: 'START_MENU',
      install_date: '2026-02-15',
      running: true,
      process_name: 'Discord.exe',
      signed: true,
      signature_status: 'VALID',
    },
  ];

  const deduped = SoftwareInventoryService.deduplicateSoftware(rawItems);
  assert(
    deduped.length === 2 && deduped.some((d) => d.name === 'Google Chrome' && d.running === true),
    'Test 1 (Software Deduplication)',
    'Itens redundantes de registro e processos consolidados mantendo estado de execução.'
  );

  // Test 2: FiveM and Anti-Cheat Protection (Requirements 44 & 45)
  const fiveMItem: SoftwareInventoryItem = {
    id: 'sw_fivem',
    name: 'FiveM Client',
    publisher: 'Cfx.re / CitizenFX',
    version: '1.0',
    install_path: 'C:\\Users\\User\\AppData\\Local\\FiveM',
    executable: 'FiveM.exe',
    source: 'REGISTRY',
    install_date: null,
    running: false,
    process_name: 'FiveM.exe',
    signed: true,
    signature_status: 'VALID',
  };
  const isProtectedFiveM = SoftwareInventoryService.isProtectedSecurityOrAntiCheat(fiveMItem);
  assert(
    isProtectedFiveM,
    'Test 2 (FiveM Protection Check)',
    'FiveM identificado rigorosamente como componente de jogo protegido (desativação bloqueada).'
  );

  const vanguardItem: SoftwareInventoryItem = {
    id: 'sw_vanguard',
    name: 'Riot Vanguard Anti-Cheat',
    publisher: 'Riot Games',
    version: '2.4',
    install_path: 'C:\\Program Files\\Riot Vanguard',
    executable: 'vgk.sys',
    source: 'SERVICE',
    install_date: null,
    running: true,
    process_name: 'vgc.exe',
    signed: true,
    signature_status: 'VALID',
  };
  const isProtectedVanguard = SoftwareInventoryService.isProtectedSecurityOrAntiCheat(vanguardItem);
  assert(
    isProtectedVanguard,
    'Test 3 (Anti-Cheat Protection Check)',
    'Vanguard Anti-Cheat identificado como componente de segurança intocável.'
  );

  // Test 4: Sanitization for AI (Requirement 36)
  const sanitized = SoftwareInventoryService.sanitizeForAi(rawItems);
  const containsSensitive = sanitized.some(
    (s: any) => s.token || s.password || s.private_key || s.device_secret
  );
  assert(
    !containsSensitive && sanitized.length === 3,
    'Test 4 (AI Data Sanitization)',
    'Apenas metadados não-sensíveis (nome, publisher, versão) são transmitidos à IA.'
  );

  // Test 5: AI Provider Schema & Analysis Success
  const normalAi = new MockAiProvider();
  const analysis = await normalAi.analyzeSoftwareInventory(deduped);
  assert(
    analysis.success &&
      Array.isArray(analysis.classifications) &&
      Array.isArray(analysis.recommendations) &&
      analysis.classifications.length === 2,
    'Test 5 (AI Structured Schema Validation)',
    'Resposta da IA validada frente ao schema oficial (classificações e recomendações).'
  );

  // Test 6: AI Provider Timeout Handling (Requirement 39 & 47)
  const timeoutAi = new MockAiProvider({ timeout: true });
  let timeoutCaught = false;
  try {
    await timeoutAi.analyzeSoftwareInventory(deduped);
  } catch (err: any) {
    timeoutCaught = err?.message?.includes('AI_TIMEOUT');
  }
  assert(
    timeoutCaught,
    'Test 6 (AI Provider Timeout Handling)',
    'Timeout da IA capturado de forma controlada sem interromper o sistema.'
  );

  // Test 7: AI Provider Invalid JSON Handling (Requirement 47)
  const invalidJsonAi = new MockAiProvider({ invalidJson: true });
  let invalidJsonCaught = false;
  try {
    await invalidJsonAi.analyzeSoftwareInventory(deduped);
  } catch (err: any) {
    invalidJsonCaught = err?.message?.includes('AI_INVALID_JSON');
  }
  assert(
    invalidJsonCaught,
    'Test 7 (AI Invalid JSON Validation)',
    'Resposta com JSON malformado rejeitada na camada de abstração do provider.'
  );

  // Test 8: AI Safety Constitution (Requirement 34 & 35)
  const safeRec = {
    software_id: 'discord',
    software: 'Discord',
    category: 'OVERLAY' as const,
    optimization_relevance: 'MEDIUM' as const,
    recommendation: 'Pode possuir recursos em segundo plano relevantes durante jogos.',
    risk: 'LOW' as const,
    confidence: 0.91,
    reason: 'Sobreposição de tela e captura de vídeo ativas.',
  };
  assert(
    validateRecommendationSafety(safeRec),
    'Test 8A (Valid Safety Recommendation)',
    'Recomendação descritiva e moderada aprovada pelo guardião de segurança.'
  );

  const maliciousRec = {
    software_id: 'bad_tweak',
    software: 'Tweaker',
    category: 'SYSTEM' as const,
    optimization_relevance: 'HIGH' as const,
    recommendation: 'Execute powershell reg add HKLM\\Software para ganhar 20 fps',
    risk: 'HIGH' as const,
    confidence: 0.5,
    reason: 'Comando arbitrário não permitido.',
  };
  assert(
    !validateRecommendationSafety(maliciousRec),
    'Test 8B (Malicious Tweak Blocking)',
    'Tentativa de injeção de comandos PowerShell/Registry ou promessas de FPS bloqueada.'
  );

  console.log('\n================================================================');
  console.log(`RESULTADO DA SUÍTE DE SOFTWARE & IA: ${passed} Aprovados, ${failed} Falhas.`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSoftwareIntelligenceTestSuite().catch((err) => {
  console.error('Fatal Software Intelligence Test Error:', err);
  process.exit(1);
});
