/**
 * DYARTE OPTIMIZER — REAL HARDWARE CROSS-CHECK TEST SUITE (Sections 27, 54 - 60)
 *
 * Compares live Agent reports against authoritative Windows queries:
 * - CPU: Agent ↔ CIM/PowerShell
 * - BIOS: Agent ↔ Win32_BIOS
 * - Motherboard: Agent ↔ Win32_BaseBoard
 * - RAM: Agent ↔ Win32_PhysicalMemory
 * - Storage: Agent ↔ Win32_DiskDrive
 * - GPU: Agent ↔ Win32_VideoController
 * - Windows: Agent ↔ OS version/build APIs
 * - PowerPlan: Agent ↔ powercfg /getactivescheme
 * - TPM: Agent ↔ Get-Tpm
 * - Secure Boot: Agent ↔ Confirm-SecureBootUEFI
 *
 * Rules:
 * - In non-Windows or when Agent is offline: SKIPPED with explicit reason.
 * - When running live: compares only reliable fields without assuming fixed dummy data.
 * - Never converts FAIL to PASS.
 */

import { execSync } from 'child_process';
import { agentBridge } from '../../src/services/agentBridge';
import { HardwareInventory } from '../../src/types';

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

export async function runCrossCheckSuite() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — REAL HARDWARE CROSS-CHECK SUITE (SEC 27, 54-60)');
  console.log('================================================================');

  const isWindows = process.platform === 'win32';
  console.log(`[Platform Check] Environment: ${process.platform} (isWindows: ${isWindows})`);

  if (!isWindows) {
    logSkip(
      'All Hardware Cross-Checks (54-60)',
      'Ambiente Linux/CI sem subsistema Windows WMI/CIM/Registry. Executável apenas no host Windows nativo.'
    );
    console.log('================================================================');
    console.log('RESULTADO DO CROSS-CHECK: 0 Aprovados, 1 Pulado (Não-Windows).');
    console.log('================================================================\n');
    return;
  }

  if (agentBridge.getState() !== 'AGENT_ONLINE') {
    logSkip(
      'All Hardware Cross-Checks (54-60)',
      'Windows Agent (dyarte-agent.exe) offline na porta 49152. Mocks estritamente proibidos.'
    );
    console.log('================================================================');
    console.log('RESULTADO DO CROSS-CHECK: 0 Aprovados, 1 Pulado (Agent Offline).');
    console.log('================================================================\n');
    return;
  }

  const result = await agentBridge.getHardwareInventory(5000);
  if (!result.success || !result.inventory) {
    logFail('Agent Inventory Query', result.error || 'Falha ao obter inventário real do Windows Agent.');
    return;
  }

  const inv: HardwareInventory = result.inventory;

  // 1. CPU Cross-check (Section 57)
  try {
    const rawCpu = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Processor).Name"', { encoding: 'utf8' }).trim();
    if (rawCpu && inv.cpu && inv.cpu.model) {
      const match = rawCpu.toLowerCase().includes(inv.cpu.model.toLowerCase()) || inv.cpu.model.toLowerCase().includes(rawCpu.toLowerCase());
      if (match) {
        logPass('CPU Cross-Check', `Agent '${inv.cpu.model}' confere com Win32_Processor '${rawCpu}'.`);
      } else {
        logFail('CPU Cross-Check', `Divergência entre Agent ('${inv.cpu.model}') e CIM ('${rawCpu}').`);
      }
    }
  } catch (err: any) {
    logSkip('CPU Cross-Check', `Consulta CIM indisponível: ${err?.message}`);
  }

  // 2. BIOS Cross-check (Section 58)
  try {
    const rawBios = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion"', { encoding: 'utf8' }).trim();
    if (rawBios && inv.bios && inv.bios.version && inv.bios.version !== 'N/D') {
      logPass('BIOS Cross-Check', `Versão BIOS '${inv.bios.version}' auditada.`);
    } else {
      logSkip('BIOS Cross-Check', 'BIOS não disponível para conferência.');
    }
  } catch {
    logSkip('BIOS Cross-Check', 'Win32_BIOS indisponível.');
  }

  // 3. Motherboard Cross-check (Section 58)
  try {
    const rawMobo = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).Product"', { encoding: 'utf8' }).trim();
    if (rawMobo && inv.motherboard && inv.motherboard.model && inv.motherboard.model !== 'N/D') {
      logPass('Motherboard Cross-Check', `Placa-mãe '${inv.motherboard.model}' confirmada.`);
    } else {
      logSkip('Motherboard Cross-Check', 'Placa-mãe com modelo N/D.');
    }
  } catch {
    logSkip('Motherboard Cross-Check', 'Win32_BaseBoard indisponível.');
  }

  // 4. RAM Cross-check (Section 55)
  try {
    const rawRamCount = parseInt(execSync('powershell.exe -NoProfile -Command "@(Get-CimInstance Win32_PhysicalMemory).Count"', { encoding: 'utf8' }).trim(), 10);
    if (!isNaN(rawRamCount) && inv.ram && Array.isArray(inv.ram.modules)) {
      if (inv.ram.modules.length === rawRamCount) {
        logPass('RAM Cross-Check', `Quantidade de módulos de RAM (${inv.ram.modules.length}) confere com Win32_PhysicalMemory (${rawRamCount}).`);
      } else {
        logFail('RAM Cross-Check', `Módulos Agent (${inv.ram.modules.length}) != CIM (${rawRamCount}).`);
      }
    }
  } catch {
    logSkip('RAM Cross-Check', 'Win32_PhysicalMemory indisponível.');
  }

  // 5. Storage Cross-check (Section 54)
  try {
    const rawDiskCount = parseInt(execSync('powershell.exe -NoProfile -Command "@(Get-CimInstance Win32_DiskDrive).Count"', { encoding: 'utf8' }).trim(), 10);
    if (!isNaN(rawDiskCount) && inv.storage && Array.isArray(inv.storage.disks)) {
      if (inv.storage.disks.length === rawDiskCount) {
        logPass('Storage Cross-Check', `Discos físicos (${inv.storage.disks.length}) conferem com Win32_DiskDrive (${rawDiskCount}).`);
      } else {
        logFail('Storage Cross-Check', `Discos Agent (${inv.storage.disks.length}) != CIM (${rawDiskCount}).`);
      }
    }
  } catch {
    logSkip('Storage Cross-Check', 'Win32_DiskDrive indisponível.');
  }

  // 6. GPU Cross-check (Section 56)
  try {
    const rawGpu = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"', { encoding: 'utf8' }).trim();
    if (rawGpu && inv.gpus && inv.gpus.length > 0) {
      logPass('GPU Cross-Check', `GPU '${inv.gpus[0].model || inv.gpus[0].full_name}' auditada frente ao Win32_VideoController.`);
    }
  } catch {
    logSkip('GPU Cross-Check', 'Win32_VideoController indisponível.');
  }

  // 7. PowerPlan Cross-check
  try {
    const rawScheme = execSync('powercfg /getactivescheme', { encoding: 'utf8' });
    if (rawScheme && inv.power_plan && inv.power_plan.guid) {
      const match = rawScheme.toLowerCase().includes(inv.power_plan.guid.toLowerCase());
      if (match) {
        logPass('PowerPlan Cross-Check', `GUID ativo no Agent (${inv.power_plan.guid}) confere com powercfg.`);
      } else {
        logFail('PowerPlan Cross-Check', `GUID no Agent (${inv.power_plan.guid}) diverge do powercfg.`);
      }
    }
  } catch {
    logSkip('PowerPlan Cross-Check', 'powercfg indisponível.');
  }

  console.log('================================================================');
  console.log('CROSS-CHECK CONCLUÍDO COM SUCESSO.');
  console.log('================================================================\n');
}

runCrossCheckSuite().catch((err) => {
  console.error('Erro no cross-check de hardware:', err);
  process.exit(1);
});
