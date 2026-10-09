import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  ShieldCheck,
  Cpu,
  HardDrive,
  Activity,
  ArrowUpRight,
  Clock,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Lock,
  Flame,
  Radio,
  Sliders,
  BatteryCharging,
  RefreshCw,
  Edit3,
  Check,
  Server,
  RotateCcw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { RealtimeTelemetryCharts } from '../dashboard/RealtimeTelemetryCharts';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    device,
    history,
    tools,
    setCurrentView,
    executeFullSystemOptimization,
    executeOptimizationTool,
    isOptimizing,
    activeOptimizingToolId,
    openUpgradeModal,
    syncWithWebsite,
    isSyncingWithWeb,
    detectAndSetRealHardware,
    isHardwareDetecting,
    setHardwareEditModalOpen,
    safetyLockActive,
    setSafetyModalOpen,
    t,
    getToolName,
    getToolDesc,
  } = useApp();

  const [optProgress, setOptProgress] = useState(0);

  const handleStartMainOptimization = async () => {
    if (isOptimizing) return;
    setOptProgress(50);
    try {
      await executeFullSystemOptimization();
    } finally {
      setOptProgress(0);
    }
  };

  const lastOpt = history.length > 0 ? history[0] : null;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header section with User greeting */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              {t('dash_hello')}, {currentUser?.nome || t('dash_user_default')}
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
              {t('dash_desktop_edition')}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {t('dash_ready_sub')}
          </p>
        </div>

        {/* Web Synchronization & Plan Status Ribbon Card */}
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#121218] border border-[#232330] shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E00000]/15 border border-[#E00000]/40 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-[#FF3333]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                  {`PLANO ${currentUser?.plano_atual || 'BÁSICO'}`}
                </span>
                {(currentUser?.nivel_plano ?? 1) === 1 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-700/40 font-semibold">
                    GRATUITO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-700/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {t('plan_synchronized')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {(currentUser?.nivel_plano ?? 1) === 1 ? (
                  <span className="text-zinc-400">
                    Plano Básico Gratuito ativo • <button onClick={() => setCurrentView('plans')} className="text-[#FF4444] hover:underline cursor-pointer font-mono">Fazer Upgrade</button>
                  </span>
                ) : (
                  <>
                    {t('dash_synced_with')} <span className="text-zinc-200">dyarte.com</span> • {t('dash_validity')}{' '}
                    <span className="text-zinc-200 font-mono">
                      {currentUser?.data_expiracao || t('dash_active')}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={() => syncWithWebsite()}
            disabled={isSyncingWithWeb}
            title={t('titlebar_web_sync')}
            className="px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-[11px] font-mono text-zinc-300 hover:text-white border border-zinc-700/80 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingWithWeb ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncingWithWeb ? t('dash_syncing') : t('dash_sync_site')}</span>
          </button>
        </div>
      </div>

      {/* Main Massive Optimization Action Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#170505] via-[#14141c] to-[#0f0f14] border border-[#331111] p-6 shadow-2xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#E00000]/15 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-center lg:text-left max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#E00000]/20 border border-[#E00000]/40 text-[#FF4444] text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              {t('dash_banner_badge')}
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase font-mono">
              {t('dash_banner_title')}
            </h2>
            <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
              {t('dash_banner_desc')}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full lg:w-auto shrink-0">
            <button
              onClick={() => setCurrentView('optimization')}
              className="w-full lg:w-72 px-6 py-4 rounded-xl font-bold uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg bg-[#E00000] hover:bg-[#c50000] text-white shadow-[0_0_25px_rgba(224,0,0,0.45)] hover:shadow-[0_0_35px_rgba(224,0,0,0.6)]"
            >
              <Zap className="w-5 h-5 fill-white" />
              <span>{t('dash_btn_optimize')}</span>
            </button>
          </div>
        </div>

        {/* Progress bar during optimization */}
        {isOptimizing && (
          <div className="mt-4 pt-4 border-t border-[#2a1414] space-y-2">
            <div className="flex justify-between text-xs font-mono text-zinc-300">
              <span>{t('dash_kernel_progress')}</span>
              <span>{optProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#E00000] to-[#FF4444]"
                initial={{ width: '0%' }}
                animate={{ width: `${optProgress}%` }}
                transition={{ ease: 'easeOut', duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hardware Metrics Horizontal Panels Header & Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#FF3333]" />
              <span>{t('dash_hw_title')}</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
              {t('dash_auto_detected')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => detectAndSetRealHardware(false)}
              disabled={isHardwareDetecting}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-emerald-300 bg-emerald-950/30 border border-emerald-600/40 hover:bg-emerald-950/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              title="Ler sensores reais e GPU do seu computador via navegador e hardware local"
            >
              <RefreshCw className={`w-3 h-3 text-emerald-400 ${isHardwareDetecting ? 'animate-spin' : ''}`} />
              <span>{isHardwareDetecting ? t('dash_detecting') : t('dash_detect_btn')}</span>
            </button>

            <button
              onClick={() => setHardwareEditModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Ajustar manualmente modelo exato do processador, placa de vídeo, placa-mãe ou SSD"
            >
              <Edit3 className="w-3 h-3 text-zinc-400" />
              <span>{t('dash_edit_btn')}</span>
            </button>
          </div>
        </div>

        {/* Hardware Metrics Horizontal Panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* CPU */}
          <div className="p-4 rounded-xl bg-[#121217] border border-[#22222d] flex flex-col justify-between hover:border-[#333345] transition-all group">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-[#FF3333]" />
                <span>CPU</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {device.cpu && device.cpu.includes('Threads') ? device.cpu.split('(')[1]?.replace(')', '') || t('dash_hw_real') : t('dash_hw_boost')}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {device.cpu_usage_pct !== null ? `${device.cpu_usage_pct}%` : 'N/D'}
              </span>
              <span className="text-xs text-zinc-300 font-mono truncate max-w-[160px]" title={device.cpu}>
                {device.cpu || 'N/D'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-[#E00000] rounded-full transition-all duration-500"
                style={{ width: `${device.cpu_usage_pct ?? 0}%` }}
              />
            </div>
          </div>

          {/* GPU */}
          <div className="p-4 rounded-xl bg-[#121217] border border-[#22222d] flex flex-col justify-between hover:border-[#333345] transition-all group">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                <Activity className="w-4 h-4 text-rose-400" />
                <span>GPU</span>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {device.temp_c !== null ? `${device.temp_c}°C` : 'N/D'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {device.gpu_usage_pct !== null ? `${device.gpu_usage_pct}%` : 'N/D'}
              </span>
              <span className="text-xs text-zinc-300 font-mono truncate max-w-[160px]" title={device.gpu}>
                {device.gpu || 'N/D'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${device.gpu_usage_pct ?? 0}%` }}
              />
            </div>
          </div>

          {/* RAM */}
          <div className="p-4 rounded-xl bg-[#121217] border border-[#22222d] flex flex-col justify-between hover:border-[#333345] transition-all group">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span>RAM</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                    device.xmp_profile && (device.xmp_profile.includes('Ativo') || device.xmp_profile === 'ENABLED')
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {device.xmp_profile || 'XMP Desativado'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/40">
                  {device.ram_frequency || 'N/D'}
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {device.ram_usage_pct !== null ? `${device.ram_usage_pct}%` : 'N/D'}
              </span>
              <span className="text-xs text-zinc-300 font-mono truncate max-w-[160px]" title={device.ram}>
                {device.ram || 'N/D'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${device.ram_usage_pct ?? 0}%` }}
              />
            </div>
          </div>

          {/* ARMAZENAMENTO */}
          <div className="p-4 rounded-xl bg-[#121217] border border-[#22222d] flex flex-col justify-between hover:border-[#333345] transition-all group">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span>DISCO</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/50 text-blue-300 border border-blue-800/40">
                {device.storage_free_gb !== null ? `${device.storage_free_gb} GB Livres` : 'Detectado'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {device.storage_free_gb !== null && device.storage_total_gb
                  ? `${Math.round(((device.storage_total_gb - device.storage_free_gb) / device.storage_total_gb) * 100)}%`
                  : device.storage_free_gb !== null
                  ? `${device.storage_free_gb} GB`
                  : 'OK'}
              </span>
              <span className="text-xs text-zinc-300 font-mono truncate max-w-[160px]" title={device.storage}>
                {device.storage || 'N/D'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{
                  width: `${device.storage_free_gb !== null && device.storage_total_gb
                    ? Math.min(100, Math.round(((device.storage_total_gb - device.storage_free_gb) / device.storage_total_gb) * 100))
                    : 50}%`
                }}
              />
            </div>
          </div>

          {/* PLACA-MÃE */}
          <div className="p-4 rounded-xl bg-[#121217] border border-purple-900/30 flex flex-col justify-between hover:border-purple-600/50 transition-all group relative overflow-hidden">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-purple-300">
                <Server className="w-4 h-4 text-purple-400" />
                <span>PLACA-MÃE</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">
                {device.resizable_bar === true ? 'ReBAR Ativo' : (device.resizable_bar === false ? 'ReBAR Desativado' : 'ReBAR N/D')}
              </span>
            </div>
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold text-white font-mono truncate" title={device.motherboard}>
                {device.motherboard || 'N/D'}
              </h4>
              <p className="text-[11px] text-zinc-400 font-mono truncate" title={device.motherboard_chipset}>
                {device.motherboard_chipset || 'Chipset: N/D'}
              </p>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-2.5 pt-2 border-t border-zinc-800/80">
              <span>BIOS: {device.bios_version || 'N/D'}</span>
              <span className="text-zinc-500 font-semibold">{device.motherboard && device.motherboard !== 'N/D' ? 'Detectada' : 'Aguardando'}</span>
            </div>
          </div>

          {/* WINDOWS */}
          <div className="p-4 rounded-xl bg-[#121217] border border-[#22222d] flex flex-col justify-between hover:border-[#333345] transition-all group">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>WINDOWS</span>
              </div>
              <span className="text-xs font-mono text-emerald-400">{t('dash_hw_active_status')}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-white font-mono truncate max-w-[110px]">
                {device.windows || 'Windows'}
              </span>
              <span className="text-xs text-zinc-400 font-mono truncate">
                {device.windows_version || 'N/D'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-3 truncate" title={device.build}>
              {device.build || 'Build N/D'}
            </div>
          </div>
        </div>
      </div>

      {/* Security Reset Key (Chave de Segurança Rollback) Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-[#0d1612] via-[#10131b] to-[#12121a] border border-emerald-800/40 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-600/50 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wide">
                CHAVE DE SEGURANÇA WINDOWS ATIVA
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                FACTORY ROLLBACK
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 max-w-2xl leading-relaxed">
              Ao <strong>desinstalar o DYARTE Optimizer</strong> ou ao <strong>expirar sua assinatura</strong>, todas as otimizações aplicadas retornam automaticamente para o padrão original de fábrica do Windows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSafetyModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-600/50 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Gerenciar Chave & Rollback</span>
          </button>
        </div>
      </div>

      {/* Real-time Component Telemetry & Performance Charts */}
      <RealtimeTelemetryCharts />

      {/* Windows Agent Connection Status Banner */}
      <div className="p-4 rounded-xl bg-[#0f0f15] border border-[#21212c] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              device.is_agent_connected
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50'
                : 'bg-red-950/60 text-[#FF4444] border border-red-700/50'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white font-mono uppercase">
                {t('dash_agent_banner_title')}
              </h4>
              <span
                className={`text-[10px] font-mono px-2 py-0.2 rounded font-bold ${
                  device.is_agent_connected
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : 'bg-red-900/40 text-red-300'
                }`}
              >
                {device.is_agent_connected ? t('dash_agent_connected') : t('dash_agent_waiting')}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('dash_agent_banner_desc')}
            </p>
          </div>
        </div>

        <button
          onClick={() => setHardwareEditModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
        >
          <span>{t('dash_agent_see_specs')}</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
    </div>
  );
};
