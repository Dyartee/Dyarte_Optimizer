import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Cpu,
  HardDrive,
  Activity,
  Layers,
  ShieldCheck,
  Radio,
  Download,
  Terminal,
  RefreshCw,
  Server,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Edit3,
  Copy,
  Check,
} from 'lucide-react';

export const ComputerView: React.FC = () => {
  const {
    device,
    toggleAgentConnection,
    testAgentConnection,
    refreshHardwareTelemetry,
    detectAndSetRealHardware,
    isHardwareDetecting,
    setHardwareEditModalOpen,
    config,
    addToast,
    t,
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [isTestingAgent, setIsTestingAgent] = useState(false);

  const handleDownloadAgent = () => {
    addToast(
      'info',
      'Download do Agente Windows',
      `Iniciando download do pacote do agente: ${config.agent_download_url}`
    );
  };

  const psScript = `Get-CimInstance Win32_Processor | Select Name, NumberOfCores, NumberOfLogicalProcessors; Get-CimInstance Win32_VideoController | Select Name; Get-CimInstance Win32_OperatingSystem | Select Caption, Version`;

  const copyScript = () => {
    navigator.clipboard.writeText(psScript);
    setCopied(true);
    addToast('success', 'Script Copiado', 'Comando PowerShell copiado com sucesso.');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">
              {t('comp_title')}
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
              ID: {device.device_id}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold">
              {t('dash_auto_detected')}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {t('comp_subtitle')}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Re-detect Hardware */}
          <button
            type="button"
            onClick={() => detectAndSetRealHardware(false)}
            disabled={isHardwareDetecting}
            className="px-3.5 py-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-xs font-mono text-emerald-300 border border-emerald-600/50 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Escanear e ler sensores do computador real novamente"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isHardwareDetecting ? 'animate-spin' : ''}`} />
            <span>{isHardwareDetecting ? t('dash_detecting') : t('dash_detect_btn')}</span>
          </button>

          {/* Edit Hardware specs */}
          <button
            type="button"
            onClick={() => setHardwareEditModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 flex items-center gap-2 transition-all cursor-pointer"
            title="Ajustar especificações manualmente"
          >
            <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
            <span>{t('dash_edit_btn')}</span>
          </button>
        </div>
      </div>

      {/* Main Hardware Spec Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* PROCESSADOR */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_cpu_label')}
            </span>
            <Cpu className="w-4 h-4 text-[#FF3333]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono leading-snug">
              {device.cpu}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {device.cpu.includes('Threads')
                ? t('comp_cpu_sub_detected')
                : t('comp_cpu_sub_native')}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_usage_current')}</span>
            <span className="text-white font-bold">
              {device.cpu_usage_pct !== null ? `${device.cpu_usage_pct}%` : 'N/D'}
            </span>
          </div>
        </div>

        {/* PLACA DE VÍDEO */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_gpu_label')}
            </span>
            <Activity className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono leading-snug">
              {device.gpu || 'N/D'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {t('comp_gpu_sub')}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_gpu_temp_load')}</span>
            <span className="text-white font-bold">
              {device.temp_c !== null ? `${device.temp_c}°C` : 'N/D'} / {device.gpu_usage_pct !== null ? `${device.gpu_usage_pct}%` : 'N/D'}
            </span>
          </div>
        </div>

        {/* MEMÓRIA */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_ram_label')}
            </span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-mono leading-snug">
                {device.ram || 'N/D'}
              </h3>
              {device.xmp_profile && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                    device.xmp_profile.includes('Ativo') || device.xmp_profile === 'ENABLED'
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {device.xmp_profile}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {device.ram_frequency ? `Frequência: ${device.ram_frequency}` : t('comp_ram_sub')}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_in_use')}</span>
            <span className="text-white font-bold">
              {device.ram_usage_pct !== null ? `${device.ram_usage_pct}%` : 'N/D'}
            </span>
          </div>
        </div>

        {/* ARMAZENAMENTO */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_storage_label')}
            </span>
            <HardDrive className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono leading-snug">
              {device.storage || 'N/D'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {t('comp_storage_sub')}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_free_space')}</span>
            <span className="text-emerald-400 font-bold">{t('comp_read_by_sys')}</span>
          </div>
        </div>

        {/* PLACA-MÃE */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_motherboard_label')}
            </span>
            <Server className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono leading-snug">
              {device.motherboard || 'N/D'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {device.motherboard_chipset || t('comp_motherboard_sub')}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_resizable_bar')}</span>
            <span className="font-bold text-zinc-300">
              {device.resizable_bar === true ? 'Ativado' : (device.resizable_bar === false ? 'Desativado' : 'N/D')}
            </span>
          </div>
        </div>

        {/* SISTEMA OPERACIONAL */}
        <div className="p-5 rounded-xl bg-[#121218] border border-[#22222f] space-y-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">
              {t('comp_os_label')}
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono leading-snug">
              {device.windows || 'Windows'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {t('comp_os_sub_prefix')} {device.windows_version || 'N/D'} • {device.build || 'N/D'}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">{t('comp_win_license')}</span>
            <span className="font-bold text-zinc-300">
              {device.windows_license || 'N/D'}
            </span>
          </div>
        </div>
      </div>

      {/* PowerShell Helper Card */}
      <div className="p-4 rounded-xl bg-[#0d0d14] border border-[#20202e] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-300">
            <Terminal className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white font-mono uppercase">
              {t('comp_powershell_card_title')}
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('comp_powershell_card_desc')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={copyScript}
          className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-2 transition-colors shrink-0 cursor-pointer border border-zinc-700"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
          <span>{copied ? t('comp_cmd_copied') : t('comp_copy_cmd')}</span>
        </button>
      </div>

      {/* Windows Agent Architecture & Integration Panel */}
      <div className="p-6 rounded-2xl bg-[#0f0f15] border border-[#21212d] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                device.is_agent_connected
                  ? 'bg-emerald-950/60 border border-emerald-700/60 text-emerald-400'
                  : 'bg-red-950/60 border border-[#E00000]/60 text-[#FF4444]'
              }`}
            >
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-mono uppercase">
                  {t('comp_agent_title')}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    device.is_agent_connected
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40'
                      : 'bg-red-950 text-red-300 border border-[#E00000]/40'
                  }`}
                >
                  {device.is_agent_connected ? t('comp_agent_ready') : t('comp_agent_offline')}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('comp_agent_installed_ver')}{' '}
                <span className="font-mono text-zinc-200">
                  {device.is_agent_connected && device.agent_version ? device.agent_version : 'N/D'}
                </span>{' '}
                • {t('comp_agent_last_heartbeat')}{' '}
                <span className="font-mono text-zinc-200">
                  {device.is_agent_connected && device.last_heartbeat ? device.last_heartbeat : 'N/D'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={toggleAgentConnection}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                device.is_agent_connected
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  : 'bg-[#E00000] hover:bg-[#c50000] text-white border-[#E00000]'
              }`}
            >
              {device.is_agent_connected ? t('comp_disconnect_agent') : t('comp_connect_agent')}
            </button>

            <button
              onClick={async () => {
                setIsTestingAgent(true);
                await testAgentConnection();
                setIsTestingAgent(false);
              }}
              disabled={isTestingAgent}
              className="px-4 py-2 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border border-zinc-700 cursor-pointer disabled:opacity-50"
              title="Disparar TEST_CONNECTION para 127.0.0.1:49152"
            >
              <Activity className={`w-3.5 h-3.5 text-zinc-400 ${isTestingAgent ? 'animate-spin' : ''}`} />
              <span>{isTestingAgent ? 'Testando...' : 'Testar Agente'}</span>
            </button>

            <button
              onClick={handleDownloadAgent}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border border-zinc-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t('comp_download_agent_btn')}</span>
            </button>
          </div>
        </div>

        {/* Architecture Flow Representation */}
        <div className="p-4 rounded-xl bg-[#09090d] border border-zinc-800/80 space-y-3">
          <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider block">
            {t('comp_topology_title')}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-300">
            <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white font-bold">
              {t('comp_topo_app')}
            </div>
            <span className="text-[#FF3333]">➔</span>
            <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white font-bold">
              {t('comp_topo_web')}
            </div>
            <span className="text-[#FF3333]">➔</span>
            <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white font-bold">
              {t('comp_topo_auth')}
            </div>
            <span className="text-[#FF3333]">➔</span>
            <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-[#FF4444] font-bold">
              {t('comp_topo_agent')}
            </div>
            <span className="text-[#FF3333]">➔</span>
            <div className="px-3 py-1.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold">
              {t('comp_topo_hw')}
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
            {t('comp_topo_desc')}
          </p>
        </div>
      </div>
    </div>
  );
};
