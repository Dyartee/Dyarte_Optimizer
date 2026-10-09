/**
 * DYARTE OPTIMIZER - DriverService
 * Camada de serviço do processo principal (Node/Electron) para gerenciamento e execução de drivers de GPU.
 * 
 * Arquitetura:
 * React UI -> Electron IPC -> Main Process -> DriverService -> Windows APIs / UAC
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * Resolve o caminho centralizado da pasta de drivers.
 * - PRODUÇÃO / EMPACOTADO: process.resourcesPath/drivers
 * - DESENVOLVIMENTO: <raiz-do-projeto>/drivers
 */
function getDriversPath() {
  const isPackaged = process.resourcesPath && !process.defaultApp && (
    process.mainModule?.filename?.includes('resources') ||
    __dirname.includes('resources') ||
    fs.existsSync(path.join(process.resourcesPath, 'drivers'))
  );

  if (isPackaged) {
    const prodPath = path.join(process.resourcesPath, 'drivers');
    console.log('[DriverService] Modo PRODUÇÃO detectado. Caminho dos drivers:', prodPath);
    return prodPath;
  }

  // Em desenvolvimento, pasta drivers na raiz do projeto
  const devPath = path.resolve(__dirname, 'drivers');
  console.log('[DriverService] Modo DESENVOLVIMENTO detectado. Caminho dos drivers:', devPath);
  return devPath;
}

/**
 * Detecta o fabricante da GPU ativa no Windows através do WMI / CIM / PowerShell.
 * Retornos possíveis: 'AMD' | 'NVIDIA' | 'UNKNOWN'
 */
function detectGpuVendor() {
  console.log('[DriverService] [Hardware] Iniciando detecção de GPU do sistema...');

  // Se não estiver no Windows (ex: Linux no container de desenvolvimento)
  if (process.platform !== 'win32') {
    console.log('[DriverService] Plataforma não-Windows detectada (' + process.platform + '). Detecção nativa WMI não aplicável.');
    return {
      vendor: 'UNKNOWN',
      gpuNames: ['Plataforma de Desenvolvimento (' + process.platform + ')'],
      rawOutput: '',
    };
  }

  try {
    // Consulta Win32_VideoController via PowerShell
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = output.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    console.log('[DriverService] GPUs identificadas pelo Windows:', lines);

    let hasNvidia = false;
    let hasAmd = false;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes('nvidia') ||
        lower.includes('geforce') ||
        lower.includes('rtx') ||
        lower.includes('gtx') ||
        lower.includes('quadro')
      ) {
        hasNvidia = true;
      }
      if (
        lower.includes('amd') ||
        lower.includes('radeon') ||
        lower.includes('advanced micro devices')
      ) {
        hasAmd = true;
      }
    }

    if (hasNvidia && !hasAmd) {
      console.log('[DriverService] Fabricante detectado: NVIDIA');
      return { vendor: 'NVIDIA', gpuNames: lines, rawOutput: lines.join(', ') };
    }

    if (hasAmd && !hasNvidia) {
      console.log('[DriverService] Fabricante detectado: AMD');
      return { vendor: 'AMD', gpuNames: lines, rawOutput: lines.join(', ') };
    }

    if (hasNvidia && hasAmd) {
      // Se tiver ambos (ex: CPU Ryzen com vídeo integrado + GPU dedicada NVIDIA)
      // Geralmente a dedicada NVIDIA é a primária para jogos/otimização
      console.log('[DriverService] Sistema híbrido AMD/NVIDIA detectado. Priorizando GPU dedicada NVIDIA para drivers de performance.');
      return { vendor: 'NVIDIA', gpuNames: lines, rawOutput: lines.join(', ') };
    }

    console.log('[DriverService] Nenhuma GPU AMD ou NVIDIA compatível foi identificada no WMI.');
    return { vendor: 'UNKNOWN', gpuNames: lines, rawOutput: lines.join(', ') };
  } catch (err) {
    console.error('[DriverService] Erro ao consultar Win32_VideoController via PowerShell:', err.message);
    return { vendor: 'UNKNOWN', gpuNames: [], rawOutput: err.message };
  }
}

/**
 * Procura especificamente o arquivo Setup.exe dentro da pasta do fabricante (drivers/AMD/Setup.exe ou drivers/NVIDIA/Setup.exe).
 * Conforme exigência do projeto, o executável deve ser EXATAMENTE Setup.exe.
 * 
 * @param {'AMD' | 'NVIDIA'} vendor 
 */
function findDriverInstaller(vendor) {
  if (vendor !== 'AMD' && vendor !== 'NVIDIA') {
    return {
      found: false,
      error: `Fabricante de driver inválido especificado: "${vendor}". Valores permitidos: AMD ou NVIDIA.`,
    };
  }

  const driversPath = getDriversPath();
  const vendorDir = path.join(driversPath, vendor);
  const targetFileName = 'Setup.exe';
  const fullPath = path.join(vendorDir, targetFileName);

  console.log(`[DriverService] Procurando instalador oficial "${targetFileName}" em: ${vendorDir}`);

  if (!fs.existsSync(vendorDir)) {
    try {
      fs.mkdirSync(vendorDir, { recursive: true });
    } catch (e) {
      // ignore
    }
    return {
      found: false,
      vendorDir,
      error: `A pasta "${vendorDir}" não existia e foi criada agora. O arquivo oficial "${targetFileName}" não foi encontrado.`,
    };
  }

  if (!fs.existsSync(fullPath)) {
    console.log(`[DriverService] Arquivo oficial "${targetFileName}" ausente em: ${vendorDir}`);
    return {
      found: false,
      vendorDir,
      error: `Instalador oficial "${targetFileName}" não encontrado na pasta "${vendorDir}". O arquivo deve ser exatamente "drivers\\${vendor}\\Setup.exe".`,
    };
  }

  let sizeMb = 0;
  try {
    const stats = fs.statSync(fullPath);
    sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
  } catch (e) {
    // ignore
  }

  console.log(`[DriverService] Instalador oficial validado: ${targetFileName} (${sizeMb} MB) em ${fullPath}`);

  return {
    found: true,
    fileName: targetFileName,
    fullPath,
    vendorDir,
    sizeMb: Number(sizeMb),
  };
}

/**
 * Executa o instalador do driver com elevação UAC no Windows.
 * 
 * @param {'AMD' | 'NVIDIA'} vendor 
 */
async function executeDriverInstaller(vendor) {
  console.log(`[DriverService] ========================================`);
  console.log(`[DriverService] Solicitação de execução de driver: ${vendor}`);

  // Se a plataforma não for Windows
  if (process.platform !== 'win32') {
    const msg = 'Execução de drivers de GPU requer ambiente Microsoft Windows nativo.';
    console.error('[DriverService] Plataforma não suportada:', msg);
    return {
      success: false,
      status: 'INSTALLATION_FAILED',
      phase: 'failed',
      error: 'unsupported platform',
      detectedVendor: 'UNKNOWN',
      message: msg,
    };
  }

  // 1. Informar GPU do sistema (sem bloquear caso não haja driver de vídeo instalado)
  const gpuDetection = detectGpuVendor();
  const detectedVendor = gpuDetection.vendor;
  console.log(`[DriverService] Hardware detectado: ${detectedVendor} (${gpuDetection.rawOutput})`);

  // 2. Localizar instalador oficial Setup.exe na pasta drivers/AMD ou drivers/NVIDIA
  const installerResult = findDriverInstaller(vendor);
  if (!installerResult.found) {
    console.error('[DriverService] Instalador não encontrado:', installerResult.error);
    return {
      success: false,
      phase: 'failed',
      error: installerResult.error,
      vendorDir: installerResult.vendorDir,
      detectedVendor,
    };
  }

  // 4. Executar instalador com elevação UAC no Windows
  const targetExe = installerResult.fullPath;
  console.log(`[DriverService] Solicitando elevação UAC para executar: "${targetExe}"...`);

  try {
    // Escapa aspas no PowerShell
    const escapedPath = targetExe.replace(/'/g, "''");
    const workingDir = path.dirname(targetExe).replace(/'/g, "''");

    // PowerShell Start-Process com -Verb RunAs dispara nativamente a caixa do UAC do Windows
    const psScript = `Start-Process -FilePath '${escapedPath}' -WorkingDirectory '${workingDir}' -Verb RunAs`;
    const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript];

    const child = spawn('powershell.exe', psArgs, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    console.log(`[DriverService] Processo de instalação disparado com sucesso via UAC (PID: ${child.pid || 'ativo'}).`);

    return {
      success: true,
      status: 'INSTALLER_LAUNCHED',
      phase: 'executing',
      fileName: installerResult.fileName,
      fullPath: installerResult.fullPath,
      sizeMb: installerResult.sizeMb,
      detectedVendor,
      message: `Instalador oficial do driver ${vendor} disparado com privilégios de Administrador. Conclua o assistente de instalação na tela do Windows.`,
    };
  } catch (execErr) {
    console.error('[DriverService] Erro ao disparar processo com UAC no Windows:', execErr.message);
    return {
      success: false,
      status: 'INSTALLATION_FAILED',
      phase: 'failed',
      error: `Falha ao iniciar o processo do instalador com privilégios de Administrador: ${execErr.message}`,
    };
  }
}

/**
 * Retorna o status consolidado de drivers, pasta e GPU.
 */
function getDriverStatus() {
  const driversPath = getDriversPath();
  const gpuDetection = detectGpuVendor();
  const amdInstaller = findDriverInstaller('AMD');
  const nvidiaInstaller = findDriverInstaller('NVIDIA');

  return {
    driversPath,
    gpu: {
      vendor: gpuDetection.vendor,
      names: gpuDetection.gpuNames,
      raw: gpuDetection.rawOutput,
    },
    installers: {
      amd: amdInstaller,
      nvidia: nvidiaInstaller,
    },
  };
}

/**
 * Localiza especificamente o Display Driver Uninstaller (DDU).
 * Caminho oficial: drivers/DDU/Display Driver Uninstaller.exe
 * O nome deve ser EXATAMENTE "Display Driver Uninstaller.exe".
 */
function getDduPath() {
  const driversPath = getDriversPath();
  const dduDir = path.join(driversPath, 'DDU');
  const targetFileName = 'Display Driver Uninstaller.exe';
  const fullPath = path.join(dduDir, targetFileName);

  console.log(`[DriverService] [DDU] Verificando existência do executável oficial em: ${fullPath}`);

  if (!fs.existsSync(fullPath)) {
    console.log(`[DriverService] [DDU] Executável "${targetFileName}" não encontrado em: ${dduDir}`);
    return {
      found: false,
      fullPath: null,
      fileName: targetFileName,
      dirPath: dduDir,
      error: `DDU não encontrado em "${fullPath}". Adicione o arquivo "${targetFileName}" na pasta "drivers/DDU/".`,
    };
  }

  let sizeMb = 0;
  try {
    const stats = fs.statSync(fullPath);
    sizeMb = Number((stats.size / (1024 * 1024)).toFixed(1));
  } catch {
    // ignore
  }

  return {
    found: true,
    fullPath,
    fileName: targetFileName,
    dirPath: dduDir,
    sizeMb,
  };
}

/**
 * Executa o Display Driver Uninstaller (DDU) de forma isolada e segura.
 * O frontend NÃO envia caminhos arbitrários. O executável deve estar estritamente
 * no caminho validado por getDduPath().
 * 
 * Status emitidos:
 * - DDU_NOT_FOUND (quando o arquivo não existe)
 * - DDU_LAUNCHED (quando iniciado com UAC no Windows — aguardando usuário)
 * - DDU_FAILED (quando o processo falha ao ser disparado)
 * 
 * NUNCA emite DDU_COMPLETED apenas por iniciar o processo.
 */
async function executeDdu() {
  console.log('[DriverService] [DDU] Solicitação de inicialização do DDU recebida...');

  const dduInfo = getDduPath();
  if (!dduInfo.found || !dduInfo.fullPath) {
    return {
      status: 'DDU_NOT_FOUND',
      success: false,
      message: dduInfo.error || 'Display Driver Uninstaller.exe não encontrado.',
      fullPath: null,
      error: dduInfo.error,
    };
  }

  const targetExe = dduInfo.fullPath;
  const targetDir = dduInfo.dirPath;

  if (process.platform === 'win32') {
    try {
      const escapedPath = targetExe.replace(/'/g, "''");
      const workingDir = targetDir.replace(/'/g, "''");

      const psScript = `Start-Process -FilePath '${escapedPath}' -WorkingDirectory '${workingDir}' -Verb RunAs`;
      const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript];

      const child = spawn('powershell.exe', psArgs, {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      console.log(`[DriverService] [DDU] Processo disparado via UAC (PID: ${child.pid || 'ativo'}).`);

      return {
        status: 'DDU_LAUNCHED',
        success: true,
        message: 'DDU iniciado. Aguardando operação do usuário.',
        fullPath: targetExe,
        fileName: dduInfo.fileName,
      };
    } catch (err) {
      console.error('[DriverService] [DDU] Erro ao disparar processo via UAC:', err.message);
      return {
        status: 'DDU_FAILED',
        success: false,
        message: `Falha ao iniciar o processo do DDU: ${err.message}`,
        fullPath: targetExe,
        error: err.message,
      };
    }
  } else {
    return {
      status: 'DDU_FAILED',
      success: false,
      message: 'Operação não suportada nesta plataforma (' + process.platform + '). O DDU requer ambiente Microsoft Windows nativo.',
      fullPath: targetExe,
      fileName: dduInfo.fileName,
      error: 'unsupported platform',
    };
  }
}

module.exports = {
  getDriversPath,
  detectGpuVendor,
  findDriverInstaller,
  executeDriverInstaller,
  getDriverStatus,
  getDduPath,
  executeDdu,
};
