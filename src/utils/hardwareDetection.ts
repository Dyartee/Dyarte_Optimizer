import { DeviceInfo } from '../types';
import { agentBridge } from '../services/agentBridge';

/**
 * DYARTE OPTIMIZER - Hardware Detection Service
 * Regra: Browser APIs NÃO são fontes oficiais de hardware para o Windows.
 * Fontes oficiais: Electron -> IPC -> Native Agent -> Windows APIs (WMI/DirectX/Win32).
 * 
 * Se o dado não vier de fonte oficial, deve ser explicitamente rotulado como
 * "(Reportado pelo navegador)" ou retornar "N/D" / null.
 */

/**
 * Limpa a string de renderer do WebGL para exibição secundária do navegador.
 */
export function cleanGpuRenderer(raw: string): string {
  if (!raw || !raw.trim()) return 'N/D';
  let cleaned = raw;

  if (cleaned.includes('ANGLE (')) {
    const parts = cleaned.match(/ANGLE \([^,]+,\s*([^,]+)/);
    if (parts && parts[1]) {
      cleaned = parts[1].trim();
    } else {
      cleaned = cleaned.replace(/^ANGLE \(/, '').replace(/\)$/, '');
    }
  }

  cleaned = cleaned.replace(/\(R\)/gi, '').replace(/\(TM\)/gi, '').trim();
  return cleaned || 'N/D';
}

/**
 * Inspeciona GPU via WebGL apenas como informação do navegador.
 * NUNCA deve ser tratada como confirmação definitiva de hardware nativo.
 */
export function detectRealGPU(): string {
  try {
    if (typeof document === 'undefined') return 'N/D';
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) return 'N/D';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'N/D';

    const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const cleaned = cleanGpuRenderer(String(unmasked));
    if (!cleaned || cleaned === 'N/D') return 'N/D';

    return `${cleaned} (WebGL / Navegador)`;
  } catch {
    return 'N/D';
  }
}

/**
 * Detecta núcleos lógicos reportados pelo navegador.
 * NUNCA inventa modelo comercial de CPU (e.g. Ryzen, Intel Core i7).
 */
export function detectRealCPU(): {
  name: string;
  cores: number;
  arch: string;
} {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const is64 = ua.includes('Win64') || ua.includes('x64') || ua.includes('WOW64') || ua.includes('x86_64');
  const arch = is64 ? '64-bit' : '32-bit';

  if (!cores) {
    return {
      name: 'N/D',
      cores: 0,
      arch,
    };
  }

  return {
    name: `${cores} Núcleos Lógicos (Reportado pelo navegador)`,
    cores,
    arch,
  };
}

/**
 * Informa memória aproximada reportada pela API do navegador.
 * Não deve ser tratada como capacidade física exata instalada na placa-mãe.
 */
export function detectRealRAM(): {
  gb: number;
  formatted: string;
} {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const deviceMem = nav.deviceMemory;

  if (deviceMem && typeof deviceMem === 'number') {
    return {
      gb: deviceMem,
      formatted: `${deviceMem} GB RAM (Estimado pelo navegador)`,
    };
  }

  return {
    gb: 0,
    formatted: 'N/D',
  };
}

/**
 * Detecta OS aproximado a partir do User-Agent
 */
export function detectRealOS(): {
  name: string;
  version: string;
  build: string;
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  let name = 'N/D';
  let version = 'N/D';
  let build = 'N/D';

  if (ua.includes('Windows NT 10.0')) {
    name = 'Windows 10 / 11';
    version = 'Reportado via Browser';
    build = 'Kernel NT 10.0';
  } else if (ua.includes('Windows NT 6.3')) {
    name = 'Windows 8.1';
    version = 'Reportado via Browser';
    build = 'Kernel NT 6.3';
  } else if (ua.includes('Windows NT 6.1')) {
    name = 'Windows 7';
    version = 'Reportado via Browser';
    build = 'Kernel NT 6.1';
  } else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) {
    name = 'macOS';
    version = 'Darwin';
    build = 'Darwin x64';
  } else if (ua.includes('Linux')) {
    name = 'Linux';
    version = 'GNU/Linux';
    build = 'Kernel Linux';
  }

  return { name, version, build };
}

/**
 * Detecta resolução do monitor via Screen API
 */
export function detectRealScreen(): string {
  if (typeof window === 'undefined' || !window.screen) {
    return 'N/D';
  }
  const dpr = window.devicePixelRatio || 1;
  const realW = Math.round(window.screen.width * dpr);
  const realH = Math.round(window.screen.height * dpr);
  const colorDepth = window.screen.colorDepth || 24;

  let tag = '';
  if (realW >= 3840) tag = ' (4K Ultra HD)';
  else if (realW >= 2560) tag = ' (2K QHD)';
  else if (realW >= 1920) tag = ' (Full HD)';

  return `${realW}x${realH} @ ${colorDepth}-bit${tag}`;
}

/**
 * Constrói as especificações do dispositivo respeitando a hierarquia de fontes estrita:
 * 1. Windows Agent nativo via WMI / SetupAPI / NVAPI
 * 2. Electron IPC nativo verificado
 * 3. Se desconectado / não detectado: "Aguardando conexão com o Windows..." ou "N/D"
 *
 * REGRA ABSOLUTA: NUNCA inferir modelo comercial de hardware via WebGL ou navigator.
 */
export async function detectFullComputerSpecs(
  existingDevice?: DeviceInfo,
  pingMsOverride?: number | null,
  overrideInventory?: any
): Promise<DeviceInfo> {
  // Teste de latência real com backend local (apenas se rota responder)
  let pingMs: number | null = pingMsOverride ?? null;
  if (pingMs === null) {
    try {
      const start = performance.now();
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const end = performance.now();
        pingMs = Math.max(1, Math.round(end - start));
      }
    } catch {
      pingMs = null;
    }
  }

  // Tentar detecção oficial de GPU via Electron IPC se disponível
  let officialGpu: string | null = null;
  if (typeof window !== 'undefined' && window.dyarte?.drivers?.detectGpuVendor) {
    try {
      const detection = await window.dyarte.drivers.detectGpuVendor();
      if (detection?.gpuNames && detection.gpuNames.length > 0) {
        officialGpu = detection.gpuNames.join(' / ');
      }
    } catch {
      officialGpu = null;
    }
  }

  const isAgentOnline = agentBridge.getState() === 'AGENT_ONLINE';

  let agentStatus: any = agentBridge.getLatestStatus();
  let hardwareInv: any = overrideInventory || agentBridge.getLatestHardwareInventory();

  if (typeof hardwareInv === 'string') {
    try {
      hardwareInv = JSON.parse(hardwareInv);
    } catch {
      hardwareInv = null;
    }
  }

  if (isAgentOnline) {
    try {
      // Se não temos inventário completo em cache, busca ativamente do agente
      if (!hardwareInv || !hardwareInv.cpu) {
        const results = await Promise.allSettled([
          agentBridge.getStatus(3000),
          agentBridge.getHardwareInventory(5000),
        ]);
        if (results[0].status === 'fulfilled' && results[0].value) {
          agentStatus = results[0].value;
        }
        if (results[1].status === 'fulfilled' && results[1].value?.success && results[1].value?.inventory) {
          let freshInv = results[1].value.inventory;
          if (typeof freshInv === 'string') {
            try { freshInv = JSON.parse(freshInv); } catch {}
          }
          hardwareInv = freshInv;
        }
      }
    } catch {
      // Manter valores em cache se a requisição pontual falhar
    }
  }

  // CPU REAL
  let verifiedCpu: string | null = null;
  if (hardwareInv?.cpu?.commercial_name && hardwareInv.cpu.commercial_name !== 'N/D') {
    verifiedCpu = hardwareInv.cpu.commercial_name;
  } else if (hardwareInv?.cpu?.model && hardwareInv.cpu.model !== 'N/D') {
    verifiedCpu = hardwareInv.cpu.model;
  } else if (isAgentOnline && agentStatus?.cpu && agentStatus.cpu !== 'N/D') {
    verifiedCpu = agentStatus.cpu;
  } else if (existingDevice?.cpu && existingDevice.cpu !== 'N/D' && !existingDevice.cpu.includes('Aguardando') && !existingDevice.cpu.includes('Não reportado')) {
    verifiedCpu = existingDevice.cpu;
  } else {
    const browserCpu = detectRealCPU();
    if (browserCpu && browserCpu.name !== 'N/D') {
      verifiedCpu = browserCpu.name;
    }
  }

  // GPU REAL
  let verifiedGpu: string | null = officialGpu;
  const latestTel = agentBridge.getLatestTelemetry();
  if (!verifiedGpu && hardwareInv?.gpu?.full_name && hardwareInv.gpu.full_name !== 'N/D') {
    verifiedGpu = hardwareInv.gpu.full_name;
  } else if (!verifiedGpu && Array.isArray(hardwareInv?.gpus) && hardwareInv.gpus[0]?.name && hardwareInv.gpus[0].name !== 'N/D') {
    verifiedGpu = hardwareInv.gpus.map((g: any) => g.name).filter(Boolean).join(' / ');
  } else if (!verifiedGpu && isAgentOnline && agentStatus?.gpu && agentStatus.gpu !== 'N/D') {
    verifiedGpu = agentStatus.gpu;
  } else if (!verifiedGpu && latestTel?.gpu_model && latestTel.gpu_model !== 'N/D') {
    verifiedGpu = latestTel.gpu_model;
  } else if (!verifiedGpu && existingDevice?.gpu && existingDevice.gpu !== 'N/D' && !existingDevice.gpu.includes('Aguardando') && !existingDevice.gpu.includes('Não reportado')) {
    verifiedGpu = existingDevice.gpu;
  } else if (!verifiedGpu) {
    const browserGpu = detectRealGPU();
    if (browserGpu && browserGpu !== 'N/D') {
      verifiedGpu = browserGpu;
    }
  }

  // Escopo estrito: somente AMD e NVIDIA. Excluir GPUs Intel
  if (verifiedGpu && (verifiedGpu.toLowerCase().includes('intel') || verifiedGpu.toLowerCase().includes('arc'))) {
    verifiedGpu = null;
  }

  // RAM REAL
  let verifiedRam: string | null = null;
  const ramTotalMb = typeof hardwareInv?.ram?.total_mb === 'number'
    ? hardwareInv.ram.total_mb
    : (typeof hardwareInv?.memory?.total_mb === 'number'
      ? hardwareInv.memory.total_mb
      : (typeof latestTel?.ram_total_mb === 'number' ? latestTel.ram_total_mb : null));

  if (ramTotalMb && ramTotalMb > 0) {
    const gb = Math.round((ramTotalMb / 1024) * 10) / 10;
    verifiedRam = `${gb} GB RAM`;
  } else if (isAgentOnline && agentStatus?.ram && agentStatus.ram !== 'N/D') {
    verifiedRam = agentStatus.ram;
  } else if (existingDevice?.ram && existingDevice.ram !== 'N/D' && !existingDevice.ram.includes('Aguardando') && !existingDevice.ram.includes('Não reportado')) {
    verifiedRam = existingDevice.ram;
  } else {
    const browserRam = detectRealRAM();
    if (browserRam && browserRam.formatted !== 'N/D') {
      verifiedRam = browserRam.formatted;
    }
  }

  // STORAGE REAL (Disks and Volumes)
  let verifiedStorage: string | null = null;
  let storageFreeGb: number | null = null;
  let storageTotalGb: number | null = null;

  if (Array.isArray(hardwareInv?.storage?.volumes) && hardwareInv.storage.volumes.length > 0) {
    const primaryVol = hardwareInv.storage.volumes.find((v: any) => v.is_system) || hardwareInv.storage.volumes[0];
    if (typeof primaryVol.free_gb === 'number' && typeof primaryVol.total_gb === 'number') {
      storageFreeGb = primaryVol.free_gb;
      storageTotalGb = primaryVol.total_gb;
      verifiedStorage = `Disco ${primaryVol.drive} (${primaryVol.free_gb} GB livres de ${primaryVol.total_gb} GB)`;
    } else {
      verifiedStorage = `Volume ${primaryVol.drive} (${primaryVol.total_gb || 'N/D'} GB)`;
    }
  } else if (Array.isArray(hardwareInv?.storage?.disks) && hardwareInv.storage.disks.length > 0) {
    const primaryDisk = hardwareInv.storage.disks.find((d: any) => d.is_system) || hardwareInv.storage.disks[0];
    const diskModel = primaryDisk.model && primaryDisk.model !== 'N/D' ? primaryDisk.model : (primaryDisk.manufacturer && primaryDisk.manufacturer !== 'N/D' ? primaryDisk.manufacturer : 'Disco');
    const diskType = primaryDisk.media_type && primaryDisk.media_type !== 'N/D' ? ` ${primaryDisk.media_type}` : '';
    const diskCap = primaryDisk.size_gb > 0 ? ` (${primaryDisk.size_gb} GB${diskType})` : '';
    storageTotalGb = primaryDisk.size_gb || null;
    verifiedStorage = `${diskModel}${diskCap}`.trim();
  } else if (agentStatus?.storage && agentStatus.storage !== 'N/D') {
    verifiedStorage = agentStatus.storage;
    if (storageFreeGb === null) {
      const match = agentStatus.storage.match(/(\d+)\s*GB.*?\((\d+)\s*GB livres\)/i);
      if (match) {
        storageTotalGb = parseInt(match[1], 10);
        storageFreeGb = parseInt(match[2], 10);
      }
    }
  } else if (existingDevice?.storage && existingDevice.storage !== 'N/D') {
    verifiedStorage = existingDevice.storage;
    storageFreeGb = existingDevice.storage_free_gb ?? null;
    storageTotalGb = existingDevice.storage_total_gb ?? null;
  }

  // MOTHERBOARD REAL
  let verifiedMobo: string | null = null;
  if (hardwareInv?.motherboard?.product_name && hardwareInv.motherboard.product_name !== 'N/D') {
    const mfg = hardwareInv.motherboard.manufacturer && hardwareInv.motherboard.manufacturer !== 'N/D' ? `${hardwareInv.motherboard.manufacturer} ` : '';
    verifiedMobo = `${mfg}${hardwareInv.motherboard.product_name}`.trim();
  } else if (hardwareInv?.motherboard?.model && hardwareInv.motherboard.model !== 'N/D') {
    const mfg = hardwareInv.motherboard.manufacturer && hardwareInv.motherboard.manufacturer !== 'N/D' ? `${hardwareInv.motherboard.manufacturer} ` : '';
    verifiedMobo = `${mfg}${hardwareInv.motherboard.model}`.trim();
  } else if (agentStatus?.motherboard && agentStatus.motherboard !== 'N/D') {
    verifiedMobo = agentStatus.motherboard;
  } else if (existingDevice?.motherboard && existingDevice.motherboard !== 'N/D') {
    verifiedMobo = existingDevice.motherboard;
  }

  // BIOS REAL
  const verifiedBios = hardwareInv?.bios?.version && hardwareInv.bios.version !== 'N/D'
    ? hardwareInv.bios.version
    : (agentStatus?.bios_version && agentStatus.bios_version !== 'N/D'
      ? agentStatus.bios_version
      : (existingDevice?.bios_version && existingDevice.bios_version !== 'N/D' ? existingDevice.bios_version : undefined));

  // SECURE BOOT REAL
  let verifiedSecureBoot: boolean | null = null;
  if (typeof hardwareInv?.security?.secure_boot === 'boolean') {
    verifiedSecureBoot = hardwareInv.security.secure_boot;
  } else if (typeof agentStatus?.secure_boot === 'boolean') {
    verifiedSecureBoot = agentStatus.secure_boot;
  } else if (typeof existingDevice?.secure_boot === 'boolean') {
    verifiedSecureBoot = existingDevice.secure_boot;
  }

  // RESIZABLE BAR REAL (SUPPORTED, ENABLED, DISABLED, N/D, null)
  let verifiedRebar: boolean | null = null;
  const rebarStatus = hardwareInv?.gaming?.resizable_bar || hardwareInv?.gaming_features?.resizable_bar;
  if (rebarStatus === 'ENABLED') {
    verifiedRebar = true;
  } else if (rebarStatus === 'DISABLED') {
    verifiedRebar = false;
  } else if (typeof latestTel?.rebar_enabled === 'boolean') {
    verifiedRebar = latestTel.rebar_enabled;
  } else if (typeof existingDevice?.resizable_bar === 'boolean') {
    verifiedRebar = existingDevice.resizable_bar;
  }

  // XMP / EXPO REAL
  const xmpStatus = hardwareInv?.gaming?.xmp_expo || hardwareInv?.gaming_features?.xmp_expo || hardwareInv?.xmp_profile || (agentStatus as any)?.xmp_profile;
  let verifiedXmp: string | null = null;
  if (xmpStatus && xmpStatus !== 'UNKNOWN' && xmpStatus !== 'N/D') {
    verifiedXmp = xmpStatus === 'ENABLED' ? 'XMP Ativo' : (xmpStatus === 'DISABLED' ? 'XMP Desativado' : xmpStatus);
  } else if (existingDevice?.xmp_profile) {
    verifiedXmp = existingDevice.xmp_profile;
  } else if (isAgentOnline) {
    verifiedXmp = 'XMP Desativado';
  }

  // AGENT VERSION REAL (Requirement 21: Never hardcode '1.1.0')
  const detectedAgentVersion = hardwareInv?.agent_version && hardwareInv.agent_version !== 'N/D'
    ? hardwareInv.agent_version
    : (agentStatus?.agent_version && agentStatus.agent_version !== 'N/D' ? agentStatus.agent_version : 'N/D');

  const offlineLabel = 'Aguardando dados do Agent';

  const ramUsedMb = typeof hardwareInv?.ram?.used_mb === 'number' ? hardwareInv.ram.used_mb : null;
  const vramTotalMb = typeof hardwareInv?.gpu?.vram_mb === 'number' ? hardwareInv.gpu.vram_mb : null;
  const cpuTemp = typeof hardwareInv?.temperatures?.cpu_c === 'number' ? hardwareInv.temperatures.cpu_c : null;
  const gpuTemp = typeof hardwareInv?.temperatures?.gpu_c === 'number' ? hardwareInv.temperatures.gpu_c : null;

  const rawRamFreq = hardwareInv?.ram?.frequency_mhz || hardwareInv?.ram?.speed_mhz || hardwareInv?.ram?.modules?.[0]?.speed_mhz;
  const ramFreqFormatted = rawRamFreq ? `${rawRamFreq} MHz` : (existingDevice?.ram_frequency || null);

  return {
    cpu: verifiedCpu || (isAgentOnline ? 'Não reportado pelo Agent' : offlineLabel),
    gpu: verifiedGpu || (isAgentOnline ? 'Não reportado pelo Agent' : offlineLabel),
    ram: verifiedRam || (isAgentOnline ? 'Não reportado pelo Agent' : 'N/D'),
    storage: verifiedStorage || 'N/D',
    storage_free_gb: storageFreeGb,
    storage_total_gb: storageTotalGb,
    motherboard: verifiedMobo || 'N/D',
    motherboard_chipset: hardwareInv?.motherboard?.chipset && hardwareInv.motherboard.chipset !== 'N/D' ? hardwareInv.motherboard.chipset : undefined,
    bios_version: verifiedBios,
    resizable_bar: verifiedRebar,
    secure_boot: verifiedSecureBoot,
    xmp_profile: verifiedXmp,
    input_lag_ms: null,
    ram_frequency: ramFreqFormatted,
    gpu_clock_mhz: null,
    cpu_clock_mhz: typeof hardwareInv?.cpu?.current_frequency_mhz === 'number' ? hardwareInv.cpu.current_frequency_mhz : null,
    cpu_power_w: null,
    cpu_temperature: cpuTemp,
    gpu_temperature: gpuTemp,
    gpu_power_w: null,
    gpu_memory_used_mb: null,
    gpu_memory_total_mb: vramTotalMb,
    ram_used_mb: ramUsedMb,
    ram_total_mb: ramTotalMb,
    fps: null,
    frametime_ms: null,
    gpu_latency_ms: null,
    active_process: null,
    active_game_pid: hardwareInv?.active_game?.pid || null,
    active_game_name: hardwareInv?.active_game?.title || hardwareInv?.active_game?.name || null,
    driver_version: hardwareInv?.gpu?.driver_version && hardwareInv.gpu.driver_version !== 'N/D' ? hardwareInv.gpu.driver_version : null,
    windows_license: null,
    windows: hardwareInv?.windows?.product_name || agentStatus?.os || (isAgentOnline ? 'Windows' : 'Windows (Aguardando Agent)'),
    windows_version: hardwareInv?.windows?.edition || hardwareInv?.windows?.version || 'N/D',
    build: hardwareInv?.windows?.build && hardwareInv.windows.build !== 'N/D' ? `Build ${hardwareInv.windows.build}` : 'N/D',
    device_id: (agentStatus?.device_id && agentStatus.device_id !== 'N/D')
      ? agentStatus.device_id
      : ((existingDevice?.device_id && existingDevice.device_id !== 'N/D' && !existingDevice.device_id.includes('LOCAL'))
        ? existingDevice.device_id
        : 'N/D'),
    is_agent_connected: isAgentOnline,
    agent_version: detectedAgentVersion,
    last_heartbeat: isAgentOnline ? 'Conectado' : 'Desconectado',
    cpu_usage_pct: typeof hardwareInv?.usage?.cpu_percent === 'number' ? hardwareInv.usage.cpu_percent : (typeof hardwareInv?.telemetry?.cpu_percent === 'number' ? hardwareInv.telemetry.cpu_percent : null),
    gpu_usage_pct: typeof hardwareInv?.usage?.gpu_percent === 'number' ? hardwareInv.usage.gpu_percent : (typeof hardwareInv?.telemetry?.gpu_percent === 'number' ? hardwareInv.telemetry.gpu_percent : null),
    ram_usage_pct: typeof hardwareInv?.ram?.usage_percent === 'number' ? hardwareInv.ram.usage_percent : (typeof hardwareInv?.usage?.ram_percent === 'number' ? hardwareInv.usage.ram_percent : null),
    temp_c: cpuTemp,
    ping_ms: pingMs,
  };
}
