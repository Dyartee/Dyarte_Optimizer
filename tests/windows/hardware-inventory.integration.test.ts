/**
 * DYARTE OPTIMIZER — REAL HARDWARE INVENTORY INTEGRATION TEST SUITE
 * Requirements 23, 24, 25:
 * Zero mock hardware: NUNCA fabricar dados se o Agent estiver offline ou em plataforma não-Windows.
 * Para testes sem Agent: marcar explicitamente como SKIPPED/UNAVAILABLE.
 * Em ambiente Windows com Agent ativo: comparar diretamente dados do Agent com fontes reais do Windows
 * (Win32_Processor, Win32_PhysicalMemory, Win32_DiskDrive, Win32_BaseBoard, Win32_BIOS, CIM/APIs).
 */

import { execSync } from 'child_process';
import { agentBridge } from '../../src/services/agentBridge';
import { HardwareInventory } from '../../src/types';

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

function assert(condition: boolean, testName: string, detail: string) {
  if (!condition) {
    logFail(testName, detail);
  } else {
    logPass(testName, detail);
  }
}

export async function runHardwareInventoryIntegrationSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — REAL HARDWARE INVENTORY INTEGRATION TEST');
  console.log('================================================================');

  const isWindows = process.platform === 'win32';
  console.log(`[Platform Check] Running on platform: ${process.platform} (isWindows: ${isWindows})`);

  // Test 1: Protocol Interface Safety
  const bridgeResult = await agentBridge.getHardwareInventory(1000);
  assert(
    typeof bridgeResult === 'object' && ('success' in bridgeResult),
    'Test 1 (Protocol Interface)',
    'agentBridge.getHardwareInventory() expõe interface padronizada.'
  );

  // Test 2: Offline Safety (Zero mock data if agent is offline)
  if (!bridgeResult.success) {
    assert(
      bridgeResult.error?.includes('offline') || bridgeResult.error?.includes('Tempo limite'),
      'Test 2 (Offline Safety)',
      'Sem o Agent online, o sistema rejeita dados e reporta status offline (Zero mock data).'
    );
  }

  // Requirement 23: Se o Agent não estiver conectado, NÃO fabricar sampleRealInv nem hardware fictício!
  if (!bridgeResult.success || !bridgeResult.inventory) {
    logSkip('Test 3 (Live Agent Hardware Discovery)', 'Windows Agent (dyarte-agent.exe) offline na porta 49152. Mocks proibidos (Requirement 23).');
    logSkip('Test 4 (Windows Native Consistency Verification)', 'Requer Windows nativo e dyarte-agent.exe ativo para comparação com Win32/CIM.');
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE DE HARDWARE: 2 Aprovados, 2 Pulados por ausência de Agent físico, 0 Mocks.');
    console.log('================================================================');
    return;
  }

  // If we reach here, a real Agent provided live inventory!
  const realInv: HardwareInventory = bridgeResult.inventory;

  // Validate live inventory schema strictly
  assert(
    typeof realInv.cpu === 'object' && realInv.cpu !== null,
    'Live CPU Contract',
    `CPU real detectada pelo Agent: ${realInv.cpu.model || 'N/D'}`
  );

  assert(
    Array.isArray(realInv.gpus) && realInv.gpus.length > 0,
    'Live GPU Contract',
    `GPUs físicas enumeradas: ${realInv.gpus.length} (${realInv.gpus[0].full_name || realInv.gpus[0].model || 'N/D'})`
  );

  assert(
    typeof realInv.ram === 'object' && typeof realInv.ram.total_bytes === 'number',
    'Live RAM Contract',
    `RAM física total: ${realInv.ram.total_mb} MB (${realInv.ram.usage_percent}% em uso)`
  );

  assert(
    typeof realInv.storage === 'object' && Array.isArray(realInv.storage.disks),
    'Live Storage Contract',
    `Discos físicos detectados: ${realInv.storage.disks.length}`
  );

  assert(
    typeof realInv.windows === 'object' && realInv.windows.architecture !== '64-bit', // must be real arch like x64, ARM64, or N/D
    'Live Windows Architecture',
    `Arquitetura real do sistema: ${realInv.windows.architecture}`
  );

  // Requirement 12, 24 & 25: On Windows, compare live Agent data directly against Windows native commands
  if (isWindows) {
    // 1. CPU vs Win32_Processor
    try {
      const wmiCpu = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Processor).Name"', { encoding: 'utf8' }).trim();
      if (!wmiCpu) {
        logFail('Test 24 (Agent CPU vs Win32_Processor)', 'Consulta ao Win32_Processor retornou vazia.');
      } else if (realInv.cpu.model && realInv.cpu.model !== 'N/D') {
        const match = wmiCpu.toLowerCase().includes(realInv.cpu.model.toLowerCase().slice(0, 10));
        assert(match, 'Test 24 (Agent CPU vs Win32_Processor)', `Agent ('${realInv.cpu.model}') confere com Windows ('${wmiCpu}').`);
      } else {
        logFail('Test 24 (Agent CPU vs Win32_Processor)', 'Modelo de CPU não informado pelo Agent.');
      }
    } catch (winErr: any) {
      logFail('Test 24 (Agent CPU vs Win32_Processor)', `Falha na consulta Win32_Processor: ${winErr.message}`);
    }

    // 2. BIOS vs Win32_BIOS
    try {
      const wmiBios = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion"', { encoding: 'utf8' }).trim();
      if (!wmiBios) {
        logFail('Test 24 (Agent BIOS vs Win32_BIOS)', 'Consulta ao Win32_BIOS retornou vazia.');
      } else if (realInv.bios.version && realInv.bios.version !== 'N/D') {
        assert(realInv.bios.version === wmiBios, 'Test 24 (Agent BIOS vs Win32_BIOS)', `Versão de BIOS confere com Windows: ${wmiBios}.`);
      } else {
        logFail('Test 24 (Agent BIOS vs Win32_BIOS)', 'Versão de BIOS não informada pelo Agent.');
      }
    } catch (winErr: any) {
      logFail('Test 24 (Agent BIOS vs Win32_BIOS)', `Falha na consulta Win32_BIOS: ${winErr.message}`);
    }

    // 3. Power Plan vs powercfg
    try {
      const realPowerScheme = execSync('powercfg /getactivescheme', { encoding: 'utf8' }).trim();
      if (!realPowerScheme) {
        logFail('Test 25 (Agent Power Plan vs powercfg)', 'Consulta powercfg /getactivescheme retornou vazia.');
      } else if (realInv.power_plan?.guid) {
        assert(
          realPowerScheme.toLowerCase().includes(realInv.power_plan.guid.toLowerCase()),
          'Test 25 (Agent Power Plan vs powercfg)',
          `GUID ativo ('${realInv.power_plan.guid}') confere com powercfg.`
        );
      } else {
        logFail('Test 25 (Agent Power Plan vs powercfg)', 'GUID de plano de energia não informado pelo Agent.');
      }
    } catch (winErr: any) {
      logFail('Test 25 (Agent Power Plan vs powercfg)', `Falha na consulta powercfg: ${winErr.message}`);
    }

    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE DE HARDWARE: Todas as verificações Windows executadas e aprovadas com sucesso.');
    console.log('================================================================');
  } else {
    logSkip('Windows Native Commands', 'Ambiente Linux/CI sem subsistema Windows nativo.');
    console.log('================================================================');
    console.log('RESULTADO DA SUÍTE DE HARDWARE: Contratos de protocolo aprovados, verificações nativas puladas (Ambiente não-Windows).');
    console.log('================================================================');
  }
}

// Run suite directly if executed as standalone script
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('hardware-inventory')) {
  runHardwareInventoryIntegrationSuite().catch((err) => {
    console.error('Fatal Hardware Integration Error:', err);
    process.exit(1);
  });
}
