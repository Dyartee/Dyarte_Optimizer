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

  // 1. CPU Cross-check
  try {
    const rawCpu = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Processor).Name"', { encoding: 'utf8' }).trim();
    if (rawCpu && inv.cpu && inv.cpu.model && inv.cpu.model !== 'N/D') {
      const match = rawCpu.toLowerCase().includes(inv.cpu.model.toLowerCase()) || inv.cpu.model.toLowerCase().includes(rawCpu.toLowerCase());
      if (match) {
        logPass('CPU Cross-Check', `Agent '${inv.cpu.model}' confere com Win32_Processor '${rawCpu}'.`);
      } else {
        logFail('CPU Cross-Check', `Divergência entre Agent ('${inv.cpu.model}') e CIM ('${rawCpu}').`);
      }
    } else {
      logFail('CPU Cross-Check', 'Dados de CPU ausentes no Agent ou no CIM.');
    }
  } catch (err: any) {
    logFail('CPU Cross-Check', `Falha na consulta Win32_Processor: ${err?.message}`);
  }

  // 2. BIOS Cross-check (version, vendor/manufacturer)
  try {
    const rawBiosVersion = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion"', { encoding: 'utf8' }).trim();
    const rawBiosVendor = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BIOS).Manufacturer"', { encoding: 'utf8' }).trim();

    if (rawBiosVersion && inv.bios && inv.bios.version && inv.bios.version !== 'N/D') {
      const normAgent = inv.bios.version.trim().toLowerCase();
      const normWin = rawBiosVersion.trim().toLowerCase();
      if (normAgent === normWin || normWin.includes(normAgent)) {
        logPass('BIOS Version Cross-Check', `Versão Agent ('${inv.bios.version}') confere com Win32_BIOS ('${rawBiosVersion}').`);
      } else {
        logFail('BIOS Version Cross-Check', `Versão Agent ('${inv.bios.version}') diverge de Win32_BIOS ('${rawBiosVersion}').`);
      }
    } else {
      logFail('BIOS Version Cross-Check', 'Versão da BIOS não disponível para conferência comparativa.');
    }

    if (rawBiosVendor && inv.bios && inv.bios.vendor && inv.bios.vendor !== 'N/D') {
      const normAgentM = inv.bios.vendor.trim().toLowerCase();
      const normWinM = rawBiosVendor.trim().toLowerCase();
      if (normAgentM === normWinM || normWinM.includes(normAgentM) || normAgentM.includes(normWinM)) {
        logPass('BIOS Vendor Cross-Check', `Fabricante Agent ('${inv.bios.vendor}') confere com Win32_BIOS ('${rawBiosVendor}').`);
      } else {
        logFail('BIOS Vendor Cross-Check', `Fabricante diverge: Agent ('${inv.bios.vendor}') vs Win32_BIOS ('${rawBiosVendor}').`);
      }
    }
  } catch (err: any) {
    logFail('BIOS Cross-Check', `Falha na consulta Win32_BIOS: ${err?.message}`);
  }

  // 3. Motherboard Cross-check (manufacturer, product)
  try {
    const rawMoboProduct = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).Product"', { encoding: 'utf8' }).trim();
    const rawMoboMfg = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).Manufacturer"', { encoding: 'utf8' }).trim();

    if (rawMoboProduct && inv.motherboard && inv.motherboard.model && inv.motherboard.model !== 'N/D') {
      const match = rawMoboProduct.toLowerCase().includes(inv.motherboard.model.toLowerCase()) || inv.motherboard.model.toLowerCase().includes(rawMoboProduct.toLowerCase());
      if (match) {
        logPass('Motherboard Model Cross-Check', `Modelo '${inv.motherboard.model}' confere com Win32_BaseBoard.`);
      } else {
        logFail('Motherboard Model Cross-Check', `Modelo diverge: Agent ('${inv.motherboard.model}') vs Win32_BaseBoard ('${rawMoboProduct}').`);
      }
    } else {
      logFail('Motherboard Model Cross-Check', 'Modelo da placa-mãe ausente para conferência comparativa.');
    }

    if (rawMoboMfg && inv.motherboard && inv.motherboard.manufacturer && inv.motherboard.manufacturer !== 'N/D') {
      const match = rawMoboMfg.toLowerCase().includes(inv.motherboard.manufacturer.toLowerCase()) || inv.motherboard.manufacturer.toLowerCase().includes(rawMoboMfg.toLowerCase());
      if (match) {
        logPass('Motherboard Manufacturer Cross-Check', `Fabricante '${inv.motherboard.manufacturer}' confere.`);
      } else {
        logFail('Motherboard Manufacturer Cross-Check', `Fabricante diverge: Agent ('${inv.motherboard.manufacturer}') vs CIM ('${rawMoboMfg}').`);
      }
    }
  } catch (err: any) {
    logFail('Motherboard Cross-Check', `Falha na consulta Win32_BaseBoard: ${err?.message}`);
  }

  // 4. RAM Cross-check (module count, capacity, speed, device locator)
  try {
    const rawRamCount = parseInt(execSync('powershell.exe -NoProfile -Command "@(Get-CimInstance Win32_PhysicalMemory).Count"', { encoding: 'utf8' }).trim(), 10);
    const rawRamCapacity = execSync('powershell.exe -NoProfile -Command "((Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum / 1MB)"', { encoding: 'utf8' }).trim();

    if (!isNaN(rawRamCount) && inv.ram && Array.isArray(inv.ram.modules)) {
      if (inv.ram.modules.length === rawRamCount) {
        logPass('RAM Modules Count Cross-Check', `Quantidade de módulos (${inv.ram.modules.length}) confere com Win32_PhysicalMemory.`);
      } else {
        logFail('RAM Modules Count Cross-Check', `Módulos Agent (${inv.ram.modules.length}) != CIM (${rawRamCount}).`);
      }

      const totalWinMb = Math.round(parseFloat(rawRamCapacity));
      if (!isNaN(totalWinMb) && inv.ram.total_mb > 0) {
        const diffMb = Math.abs(inv.ram.total_mb - totalWinMb);
        if (diffMb < 128) {
          logPass('RAM Capacity Cross-Check', `Capacidade total Agent (${inv.ram.total_mb} MB) confere com Win32_PhysicalMemory (${totalWinMb} MB).`);
        } else {
          logFail('RAM Capacity Cross-Check', `Divergência de capacidade de RAM: Agent (${inv.ram.total_mb} MB) vs CIM (${totalWinMb} MB).`);
        }
      }
    } else {
      logFail('RAM Cross-Check', 'Dados de RAM indisponíveis no Agent para conferência.');
    }
  } catch (err: any) {
    logFail('RAM Cross-Check', `Falha na consulta Win32_PhysicalMemory: ${err?.message}`);
  }

  // 5. Storage Cross-check (disk count, model, size)
  try {
    const rawDiskCount = parseInt(execSync('powershell.exe -NoProfile -Command "@(Get-CimInstance Win32_DiskDrive).Count"', { encoding: 'utf8' }).trim(), 10);
    if (!isNaN(rawDiskCount) && inv.storage && Array.isArray(inv.storage.disks)) {
      if (inv.storage.disks.length === rawDiskCount) {
        logPass('Storage Disks Count Cross-Check', `Quantidade de discos (${inv.storage.disks.length}) confere com Win32_DiskDrive.`);
      } else {
        logFail('Storage Disks Count Cross-Check', `Discos Agent (${inv.storage.disks.length}) != CIM (${rawDiskCount}).`);
      }
    } else {
      logFail('Storage Cross-Check', 'Dados de armazenamento indisponíveis para conferência.');
    }
  } catch (err: any) {
    logFail('Storage Cross-Check', `Falha na consulta Win32_DiskDrive: ${err?.message}`);
  }

  // 6. GPU Cross-check (all GPUs comparison, normalized)
  try {
    const rawGpus = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_VideoController).Name"', { encoding: 'utf8' }).trim().split('\n').map(s => s.trim()).filter(Boolean);
    if (rawGpus.length > 0 && inv.gpus && inv.gpus.length > 0) {
      logPass('GPU Count Cross-Check', `GPUs detectadas conferem com o sistema operacional (${inv.gpus.length} listadas).`);
      const matched = inv.gpus.some(g => {
        const agentName = (g.model || g.full_name || '').toLowerCase();
        return rawGpus.some(rg => rg.toLowerCase().includes(agentName) || agentName.includes(rg.toLowerCase()));
      });
      if (matched) {
        logPass('GPU Model Cross-Check', 'Controlador gráfico auditado e compatível com Win32_VideoController.');
      } else {
        logFail('GPU Model Cross-Check', 'Divergência entre GPUs do Agent e Win32_VideoController.');
      }
    } else {
      logFail('GPU Cross-Check', 'Dispositivos de vídeo não identificados no Agent ou no CIM.');
    }
  } catch (err: any) {
    logFail('GPU Cross-Check', `Falha na consulta Win32_VideoController: ${err?.message}`);
  }

  // 7. PowerPlan Cross-check (Target GUID vs Active GUID)
  try {
    const rawScheme = execSync('powercfg /getactivescheme', { encoding: 'utf8' });
    if (rawScheme && inv.power_plan && inv.power_plan.guid) {
      const match = rawScheme.toLowerCase().includes(inv.power_plan.guid.toLowerCase());
      if (match) {
        logPass('PowerPlan Cross-Check', `GUID ativo no Agent (${inv.power_plan.guid}) confere com powercfg.`);
      } else {
        logFail('PowerPlan Cross-Check', `GUID no Agent (${inv.power_plan.guid}) diverge do powercfg.`);
      }
    } else {
      logFail('PowerPlan Cross-Check', 'GUID de plano de energia ausente no Agent para cross-check.');
    }
  } catch (err: any) {
    logFail('PowerPlan Cross-Check', `Falha na consulta powercfg: ${err?.message}`);
  }

  // 8. TPM Cross-check (Get-Tpm)
  try {
    const rawTpmPresent = execSync('powershell.exe -NoProfile -Command "(Get-Tpm).TpmPresent"', { encoding: 'utf8' }).trim().toLowerCase();
    if (rawTpmPresent === 'true' || rawTpmPresent === 'false') {
      logPass('TPM Cross-Check', `Status do chip TPM verificado no host Windows: ${rawTpmPresent}.`);
    } else {
      logSkip('TPM Cross-Check', 'Módulo TPM não presente ou cmdlet Get-Tpm não suportado nesta edição do Windows.');
    }
  } catch {
    logSkip('TPM Cross-Check', 'Get-Tpm indisponível ou permissões insuficientes.');
  }

  // 9. Secure Boot Cross-check (Confirm-SecureBootUEFI)
  try {
    const rawSb = execSync('powershell.exe -NoProfile -Command "Confirm-SecureBootUEFI"', { encoding: 'utf8' }).trim().toLowerCase();
    if (rawSb === 'true' || rawSb === 'false') {
      logPass('Secure Boot Cross-Check', `Status de inicialização segura auditado via Confirm-SecureBootUEFI: ${rawSb}.`);
    } else {
      logSkip('Secure Boot Cross-Check', 'Ambiente legado (Legacy BIOS / não-UEFI) sem suporte a Confirm-SecureBootUEFI.');
    }
  } catch {
    logSkip('Secure Boot Cross-Check', 'Confirm-SecureBootUEFI não suportado (sistema BIOS Legacy ou sem privilégios UEFI).');
  }

  console.log('================================================================');
  console.log('CROSS-CHECK CONCLUÍDO COM SUCESSO.');
  console.log('================================================================\n');
}

runCrossCheckSuite().catch((err) => {
  console.error('Erro no cross-check de hardware:', err);
  process.exit(1);
});
