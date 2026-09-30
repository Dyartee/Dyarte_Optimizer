import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ToolCategory, Tool, PlanLevel } from '../../types';
import { IconHelper } from '../common/IconHelper';
import {
  Zap,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Shield,
  Gamepad2,
  Sparkles,
  Info,
  ChevronRight,
  ChevronLeft,
  Flame,
  Eye,
  Activity,
  Play,
  ExternalLink,
  Download,
  Monitor,
  Check,
} from 'lucide-react';

export const OptimizationView: React.FC = () => {
  const {
    tools,
    currentUser,
    executeOptimizationTool,
    executeDriverPipeline,
    isToolActive,
    toggleOptimizationTool,
    isOptimizing,
    activeOptimizingToolId,
    openUpgradeModal,
    setCurrentView,
    config,
    device,
    addToast,
    t,
    getToolName,
    getToolDesc,
  } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'TODOS'>('TODOS');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [selectedToolDetails, setSelectedToolDetails] = useState<Tool | null>(null);
  const [confirmExperimentalTool, setConfirmExperimentalTool] = useState<Tool | null>(null);
  const [gpuSelectedBrand, setGpuSelectedBrand] = useState<'AMD' | 'NVIDIA' | null>(null);
  const [detectedGpuVendor, setDetectedGpuVendor] = useState<'AMD' | 'NVIDIA' | 'UNKNOWN'>('UNKNOWN');

  const handleToggleTool = (targetTool: Tool) => {
    if (targetTool.risk_level === 'EXPERIMENTAL' && !isToolActive(targetTool.tool_id)) {
      setConfirmExperimentalTool(targetTool);
      return;
    }
    toggleOptimizationTool(targetTool.tool_id);
  };

  useEffect(() => {
    let isMounted = true;
    const checkGpu = async () => {
      if (window.dyarte?.drivers) {
        try {
          const res = await window.dyarte.drivers.detectGpuVendor();
          if (isMounted) {
            setDetectedGpuVendor(res.vendor);
            return;
          }
        } catch (e) {
          console.warn('Erro ao detectar GPU via IPC:', e);
        }
      }
      // Fallback usando telemetria
      const devGpu = (device?.gpu || '').toLowerCase();
      if (devGpu.includes('amd') || devGpu.includes('radeon')) {
        if (isMounted) setDetectedGpuVendor('AMD');
      } else if (
        devGpu.includes('nvidia') ||
        devGpu.includes('geforce') ||
        devGpu.includes('rtx') ||
        devGpu.includes('gtx')
      ) {
        if (isMounted) setDetectedGpuVendor('NVIDIA');
      } else {
        if (isMounted) setDetectedGpuVendor('UNKNOWN');
      }
    };
    checkGpu();
    return () => {
      isMounted = false;
    };
  }, [device?.gpu]);

  const userPlanLevel = currentUser?.nivel_plano ?? 1;

  const isAmdGpuDetected = detectedGpuVendor === 'AMD';
  const isNvidiaGpuDetected = detectedGpuVendor === 'NVIDIA';
  const isUnknownGpu = detectedGpuVendor === 'UNKNOWN';

  const categories: { id: ToolCategory | 'TODOS'; label: string; icon: React.ReactNode }[] = [
    { id: 'TODOS', label: t('opt_cat_all'), icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'SISTEMA', label: t('opt_cat_sys'), icon: <Shield className="w-3.5 h-3.5 text-blue-400" /> },
    { id: 'DESEMPENHO', label: t('opt_cat_perf'), icon: <Flame className="w-3.5 h-3.5 text-amber-400" /> },
    { id: 'GAMING', label: t('opt_cat_game'), icon: <Gamepad2 className="w-3.5 h-3.5 text-[#FF3333]" /> },
    { id: 'GPU', label: 'GPU', icon: <Activity className="w-3.5 h-3.5 text-rose-400" /> },
  ];

  const filteredTools = tools.filter((tool) => {
    if (selectedCategory !== 'TODOS' && tool.categoria !== selectedCategory) {
      return false;
    }
    const isUnlocked = userPlanLevel >= tool.required_plan_level;
    if (activeFilter === 'unlocked' && !isUnlocked) return false;
    if (activeFilter === 'locked' && isUnlocked) return false;
    return true;
  });

  const getPlanNameBadge = (level: PlanLevel) => {
    switch (level) {
      case 1:
        return `${t('nav_plans').toUpperCase()} ${t('plan_name_basico')}`;
      case 2:
        return `${t('nav_plans').toUpperCase()} ${t('plan_name_medio')}`;
      case 3:
        return `${t('nav_plans').toUpperCase()} ${t('plan_name_avancado')}`;
      case 4:
        return `${t('nav_plans').toUpperCase()} ${t('plan_name_completo')}`;
      default:
        return t('plan_name_basico');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* View Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">
              {t('opt_title')}
            </h1>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-[#E00000]/20 text-[#FF4444] border border-[#E00000]/40 font-bold">
              {userPlanLevel === 1 ? 'PLANO BÁSICO (GRATUITO)' : t('opt_level_active').replace('{level}', userPlanLevel.toString())}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {t('opt_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView('plans')}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>{t('opt_upgrade_plan')}</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Category Pills and Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2 rounded-xl bg-[#111117] border border-[#20202c]">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  if (cat.id !== 'GPU') {
                    setGpuSelectedBrand(null);
                  }
                }}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)]'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* State Filter Buttons */}
        <div className="flex items-center gap-1 bg-[#0c0c10] p-1 rounded-lg border border-[#1f1f2a] text-[11px] font-mono shrink-0">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t('opt_filter_all')} ({tools.length})
          </button>
          <button
            onClick={() => setActiveFilter('unlocked')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeFilter === 'unlocked' ? 'bg-emerald-950 text-emerald-300 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t('opt_filter_unlocked')}
          </button>
          <button
            onClick={() => setActiveFilter('locked')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeFilter === 'locked' ? 'bg-amber-950 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t('opt_filter_locked')}
          </button>
        </div>
      </div>

      {/* SPECIALIZED GPU SECTION */}
      {selectedCategory === 'GPU' ? (
        <div className="space-y-6">
          {/* TOP SECTION: LIMPEZA DE DRIVERS DE VIDEO */}
          {(() => {
            const cleanTool = tools.find((t) => t.tool_id === 'tool_gpu_clean_drivers') || {
              tool_id: 'tool_gpu_clean_drivers',
              nome: 'Limpeza de Drivers de Vídeo',
              descricao:
                'Executa limpeza profunda de resíduos de drivers de vídeo (DDU Clean Sweep), purga cache de shaders DirectX/Vulkan corrompidos e redefine o subsistema gráfico.',
              categoria: 'GPU',
              required_plan_level: 2,
              status: 'ATIVO',
              icon: 'Sparkles',
              impact: 'Alto',
              details:
                'Elimina stutters provocados por sobreposição de versões antigas de drivers e zera Shader Cache corrompido.',
            } as Tool;

            const isPermitted = userPlanLevel >= cleanTool.required_plan_level;
            const isExecuting = activeOptimizingToolId === cleanTool.tool_id;
            const isActive = isToolActive(cleanTool.tool_id);

            return (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-[#171217] via-[#14141d] to-[#121218] border border-rose-500/30 relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> LIMPEZA DE SUBSISTEMA DE VÍDEO
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {cleanTool.impact} Impacto • Nível {cleanTool.required_plan_level}
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3" /> LIMPEZA APLICADA
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
                      <span>{cleanTool.nome}</span>
                    </h2>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {cleanTool.descricao}
                    </p>
                    <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 pt-1">
                      <span className="text-rose-400 font-semibold">Tecnologia:</span>
                      <span>DDU Clean Sweep + Purga de Shaders DirectX 11/12 & Vulkan + Reset do Pipeline Gráfico</span>
                    </div>
                  </div>

                  <div className="flex sm:items-center gap-3 shrink-0 self-start lg:self-center">
                    <button
                      onClick={() => setSelectedToolDetails(cleanTool)}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>{t('opt_details_btn')}</span>
                    </button>

                    {isPermitted ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await executeOptimizationTool(cleanTool.tool_id);
                          }}
                          disabled={isOptimizing}
                          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                        >
                          {isExecuting ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>EXECUTAR LIMPEZA</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          openUpgradeModal(cleanTool.required_plan_level, cleanTool.nome, 'GPU')
                        }
                        className="px-4 py-2.5 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>DESBLOQUEAR NO {getPlanNameBadge(cleanTool.required_plan_level)}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MAIN HARDWARE ARCHITECTURE SELECTION: AMD OR NVIDIA */}
          {gpuSelectedBrand === null ? (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold font-mono text-white tracking-wide uppercase flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-zinc-400" />
                    ARQUITETURA DE VÍDEO DO SEU COMPUTADOR
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Selecione a fabricante da sua placa de vídeo para acessar as opções exclusivas de driver e otimização:
                  </p>
                </div>
                {device?.gpu && (
                  <div className="text-[11px] font-mono px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                    GPU Ativa: <span className="text-white font-bold">{device.gpu}</span>
                  </div>
                )}
              </div>

              {/* TWO OPTIONS: AMD AND NVIDIA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* AMD CARD OPTION */}
                <div className="p-6 rounded-2xl bg-gradient-to-b from-[#191114] to-[#100c0e] border border-red-900/40 hover:border-red-500/80 transition-all flex flex-col justify-between group shadow-xl relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-500 font-mono font-black text-lg shadow-inner">
                        AMD
                      </div>
                      {isAmdGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5" /> HABILITADO (DETECTADA)
                        </span>
                      ) : isNvidiaGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 text-zinc-500 border border-zinc-700/60 flex items-center gap-1.5 shadow-sm">
                          DRIVER DESABILITADO (NVIDIA ATIVA)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-700/60 flex items-center gap-1.5 shadow-sm">
                          GPU NÃO IDENTIFICADA
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-bold font-mono text-white group-hover:text-red-400 transition-colors">
                          AMD RADEON™
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/40 font-semibold">
                          RDNA / GCN
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                        Configurações avançadas para placas de vídeo AMD Radeon. Inclui o <strong>AMD DRIVER OPTIMIZER</strong> e o <strong>AMD OPTIMIZER</strong> com ajustes de Smart Access Memory (SAM), Radeon Anti-Lag e tempos de resposta.
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-red-950/60 text-xs font-mono text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>AMD DRIVER OPTIMIZER (Instalador Oficial)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>AMD OPTIMIZER (Smart Access Memory & Anti-Lag)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setGpuSelectedBrand('AMD')}
                    className="w-full mt-6 py-3.5 px-5 rounded-xl bg-gradient-to-r from-red-600 via-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer shadow-lg group-hover:shadow-red-900/40"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-4 h-4" />
                      ACESSAR CONFIGURAÇÕES AMD
                    </span>
                    <ChevronRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* NVIDIA CARD OPTION */}
                <div className="p-6 rounded-2xl bg-gradient-to-b from-[#101913] to-[#0c100e] border border-emerald-900/40 hover:border-emerald-500/80 transition-all flex flex-col justify-between group shadow-xl relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400 font-mono font-black text-sm shadow-inner">
                        NV
                      </div>
                      {isNvidiaGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5" /> HABILITADO (DETECTADA)
                        </span>
                      ) : isAmdGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 text-zinc-500 border border-zinc-700/60 flex items-center gap-1.5 shadow-sm">
                          DRIVER DESABILITADO (AMD ATIVA)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-700/60 flex items-center gap-1.5 shadow-sm">
                          GPU NÃO IDENTIFICADA
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-bold font-mono text-white group-hover:text-emerald-400 transition-colors">
                          NVIDIA GEFORCE™
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 font-semibold">
                          RTX / GTX
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                        Configurações de alta precisão para GPUs GeForce. Inclui o <strong>NVIDIA DRIVER OPTIMIZER</strong> e o <strong>NVIDIA OPTIMIZER</strong> com ajustes de Profile Inspector, Modo Desempenho Máximo e Ultra Low Latency.
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-emerald-950/60 text-xs font-mono text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>NVIDIA DRIVER OPTIMIZER (Instalador Oficial)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>NVIDIA OPTIMIZER (Ultra Low Latency & Power Mode)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setGpuSelectedBrand('NVIDIA')}
                    className="w-full mt-6 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer shadow-lg group-hover:shadow-emerald-900/40"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-4 h-4" />
                      ACESSAR CONFIGURAÇÕES NVIDIA
                    </span>
                    <ChevronRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* SUB-PAGE: AMD OR NVIDIA DETAILED CONFIGURATION */
            <div className="space-y-6 pt-1">
              {/* NAVIGATION HEADER FOR SUB-TAB */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#111117] border border-[#21212d]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGpuSelectedBrand(null)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Voltar para Opções GPU</span>
                  </button>
                  <div className="h-5 w-px bg-zinc-800 hidden sm:block" />
                  <div>
                    <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                      <span className={gpuSelectedBrand === 'AMD' ? 'text-red-400' : 'text-emerald-400'}>
                        CONFIGURAÇÕES DE VÍDEO: {gpuSelectedBrand === 'AMD' ? 'AMD RADEON™' : 'NVIDIA GEFORCE™'}
                      </span>
                    </h3>
                  </div>
                </div>

                {/* Quick Toggle to other brand */}
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-zinc-500 hidden md:inline">Trocar placa:</span>
                  {gpuSelectedBrand === 'AMD' ? (
                    <button
                      onClick={() => setGpuSelectedBrand('NVIDIA')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/60 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Ver Opções NVIDIA</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setGpuSelectedBrand('AMD')}
                      className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-400 border border-red-800/60 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Ver Opções AMD</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ACTIVE SYSTEM GPU REMINDER BANNER */}
              {device?.gpu && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-mono ${
                    (gpuSelectedBrand === 'AMD' && isAmdGpuDetected) ||
                    (gpuSelectedBrand === 'NVIDIA' && isNvidiaGpuDetected)
                      ? 'bg-emerald-950/30 border-emerald-700/50 text-emerald-300'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Hardware detectado no seu computador: <strong>{device.gpu}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    PCIe Gen 4.0 / ReBAR Ativo
                  </span>
                </div>
              )}

              {/* RENDER THE 2 TOOLS FOR SELECTED BRAND (DRIVER OPTIMIZER + OPTIMIZER) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tools
                  .filter((t) => {
                    if (gpuSelectedBrand === 'AMD') {
                      return (
                        t.tool_id === 'tool_gpu_amd_driver' || t.tool_id === 'tool_gpu_amd_opt'
                      );
                    } else {
                      return (
                        t.tool_id === 'tool_gpu_nvidia_driver' || t.tool_id === 'tool_gpu_nvidia_opt'
                      );
                    }
                  })
                  .map((tool) => {
                    const isPermitted = userPlanLevel >= tool.required_plan_level;
                    const isExecuting = activeOptimizingToolId === tool.tool_id;
                    const isActive = isToolActive(tool.tool_id);
                    const isDriverOptimizer =
                      tool.tool_id === 'tool_gpu_amd_driver' ||
                      tool.tool_id === 'tool_gpu_nvidia_driver';
                    const driveUrl =
                      gpuSelectedBrand === 'AMD'
                        ? config.amd_driver_drive_url
                        : config.nvidia_driver_drive_url;

                    if (!isPermitted) {
                      return (
                        <div
                          key={tool.tool_id}
                          className="p-6 rounded-2xl bg-[#0e0e13] border border-[#231b1b] flex flex-col justify-between relative overflow-hidden transition-all hover:border-[#422222] group shadow-lg"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                                <IconHelper name={tool.icon} className="w-5 h-5 text-zinc-600" />
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase">
                                {gpuSelectedBrand} GPU
                              </span>
                            </div>

                            <div>
                              <h4 className="text-base font-bold font-mono text-zinc-300">
                                {tool.nome}
                              </h4>
                              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                                {tool.descricao}
                              </p>
                            </div>

                            <div className="p-3 rounded-lg bg-[#140b0b] border border-[#3b1212] space-y-2">
                              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#FF5555]">
                                <Lock className="w-3.5 h-3.5" />
                                <span>REQUER PLANO {getPlanNameBadge(tool.required_plan_level)}</span>
                              </div>
                              <p className="text-[11px] text-zinc-400">
                                Exclusivo para membros com plano nível {tool.required_plan_level} ou superior.
                              </p>
                            </div>
                          </div>

                          <div className="pt-4 mt-4 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                            <button
                              onClick={() => setSelectedToolDetails(tool)}
                              className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-800"
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>{t('opt_details_btn')}</span>
                            </button>
                            <button
                              onClick={() =>
                                openUpgradeModal(tool.required_plan_level, tool.nome, 'GPU')
                              }
                              className="py-2 px-4 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-md"
                            >
                              <span>{t('opt_unlock_btn')}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={tool.tool_id}
                        className={`p-6 rounded-2xl bg-[#121218] border transition-all flex flex-col justify-between group shadow-xl ${
                          gpuSelectedBrand === 'AMD'
                            ? 'hover:border-red-600/50 border-zinc-800/80'
                            : 'hover:border-emerald-600/50 border-zinc-800/80'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${
                                gpuSelectedBrand === 'AMD'
                                  ? 'bg-red-950/50 border-red-700/50 text-red-400'
                                  : 'bg-emerald-950/50 border-emerald-700/50 text-emerald-400'
                              }`}
                            >
                              <IconHelper name={tool.icon} className="w-6 h-6" />
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase">
                                {gpuSelectedBrand} OPTIMIZER
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> DESBLOQUEADO
                              </span>
                            </div>
                          </div>

                          <div>
                            <h4
                              className={`text-base font-bold font-mono text-white transition-colors ${
                                gpuSelectedBrand === 'AMD'
                                  ? 'group-hover:text-red-400'
                                  : 'group-hover:text-emerald-400'
                              }`}
                            >
                              {tool.nome}
                            </h4>
                            <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                              {tool.descricao}
                            </p>
                          </div>

                          <div className="p-3 rounded-lg bg-[#0c0c10] border border-zinc-800/80 text-[11px] font-mono text-zinc-400">
                            <span className="text-white font-semibold block mb-0.5">Ações aplicadas:</span>
                            <span>{tool.details}</span>
                          </div>
                        </div>

                        <div className="pt-4 mt-5 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                          <button
                            onClick={() => setSelectedToolDetails(tool)}
                            className="text-xs text-zinc-400 hover:text-white font-mono flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>{t('opt_details_btn')}</span>
                          </button>

                          <div className="flex items-center gap-3">
                            {/* BOTAO EXECUTAR */}
                            {isDriverOptimizer && detectedGpuVendor !== 'UNKNOWN' && detectedGpuVendor !== gpuSelectedBrand ? (
                              <button
                                disabled
                                className="px-3.5 py-2 rounded-lg bg-zinc-900 text-zinc-500 border border-zinc-800 text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-not-allowed"
                                title={`GPU ativa é ${detectedGpuVendor}. O driver ${gpuSelectedBrand} não é compatível com esta placa.`}
                              >
                                <span>INCOMPATÍVEL ({detectedGpuVendor})</span>
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (isDriverOptimizer && gpuSelectedBrand) {
                                    if (detectedGpuVendor === 'UNKNOWN') {
                                      addToast(
                                        'warning',
                                        'Identificação de GPU Necessária',
                                        'A GPU deste computador não pôde ser identificada com segurança. Nenhum instalador de driver pode ser executado automaticamente.'
                                      );
                                      return;
                                    }
                                    if (detectedGpuVendor !== gpuSelectedBrand) {
                                      addToast(
                                        'error',
                                        'Incompatibilidade Detectada',
                                        `Este driver (${gpuSelectedBrand}) não corresponde à GPU detectada (${detectedGpuVendor}). Ação cancelada por segurança.`
                                      );
                                      return;
                                    }
                                    await executeDriverPipeline(gpuSelectedBrand);
                                  } else {
                                    await executeOptimizationTool(tool.tool_id);
                                  }
                                }}
                                disabled={isOptimizing}
                                className={`px-4 py-2 rounded-lg text-white text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 ${
                                  isDriverOptimizer && detectedGpuVendor === 'UNKNOWN'
                                    ? 'bg-amber-700 hover:bg-amber-600'
                                    : gpuSelectedBrand === 'AMD'
                                    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40'
                                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                                }`}
                                title={
                                  isDriverOptimizer
                                    ? `Executar instalador do driver ${gpuSelectedBrand}`
                                    : 'Executar otimização agora'
                                }
                              >
                                {isExecuting ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                                <span>
                                  {isDriverOptimizer && detectedGpuVendor === 'UNKNOWN'
                                    ? 'VERIFICAR'
                                    : 'EXECUTAR'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* STANDARD TOOLS GRID FOR OTHER CATEGORIES */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => {
            const isPermitted = userPlanLevel >= tool.required_plan_level;
            const isExecuting = activeOptimizingToolId === tool.tool_id;

            if (!isPermitted) {
              return (
                <div
                  key={tool.tool_id}
                  className="p-5 rounded-xl bg-[#0e0e13] border border-[#231b1b] flex flex-col justify-between relative overflow-hidden transition-all hover:border-[#422222] group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-600">
                      <IconHelper name={tool.icon} className="w-5 h-5 text-zinc-600" />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase">
                        {t(`cat_${tool.categoria.toLowerCase()}`) || tool.categoria}
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={() => setSelectedToolDetails(tool)}
                    className="cursor-pointer group/title"
                    title="Clique para visualizar detalhes desta função"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-300 group-hover/title:text-white transition-colors">
                        {getToolName(tool)}
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {t('opt_details_btn')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                      {getToolDesc(tool)}
                    </p>
                  </div>

                  {/* Locked Banner in Box */}
                  <div className="mt-4 p-3.5 rounded-lg bg-[#140b0b] border border-[#3b1212] space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#FF5555]">
                      <Lock className="w-3.5 h-3.5" />
                      <span>{t('upgrade_modal_title').toUpperCase()}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('upgrade_modal_req_level').replace('{level}', tool.required_plan_level.toString())}
                      <div className="text-xs font-mono font-bold text-white mt-0.5">
                        {getPlanNameBadge(tool.required_plan_level)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setSelectedToolDetails(tool)}
                        className="py-2 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] font-mono font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                      >
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{t('opt_details_btn')}</span>
                      </button>
                      <button
                        onClick={() =>
                          openUpgradeModal(tool.required_plan_level, getToolName(tool), tool.categoria)
                        }
                        className="py-2 px-2.5 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white text-[11px] font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md"
                      >
                        <span>{t('opt_unlock_btn')}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // UNLOCKED TOOL CARD
            return (
              <div
                key={tool.tool_id}
                className="p-5 rounded-xl bg-[#121218] border border-[#21212e] hover:border-[#3a3a4e] flex flex-col justify-between transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[#E00000]/10 border border-[#E00000]/30 flex items-center justify-center text-[#FF3333]">
                      <IconHelper name={tool.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        tool.risk_level === 'EXPERIMENTAL'
                          ? 'bg-amber-950/60 border border-amber-600/50 text-amber-400'
                          : tool.risk_level === 'ADVANCED'
                          ? 'bg-blue-950/60 border border-blue-600/50 text-blue-400'
                          : 'bg-emerald-950/60 border border-emerald-600/50 text-emerald-400'
                      }`}>
                        {tool.risk_level || 'SAFE'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase">
                        {t(`cat_${tool.categoria.toLowerCase()}`) || tool.categoria}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t('dash_tool_unlocked').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-[#FF4444] transition-colors">
                    {getToolName(tool)}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    {getToolDesc(tool)}
                  </p>

                  <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                    <span>
                      {t('dash_tool_level')}:{' '}
                      <strong className="text-zinc-300 font-normal">
                        {tool.required_plan_level}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      {t('dash_tool_impact')}{' '}
                      <strong className="text-zinc-300 font-normal">{tool.impact}</strong>
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1f1f2b] flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedToolDetails(tool)}
                    className="text-xs text-zinc-400 hover:text-white font-mono flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>{t('opt_details_btn')}</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    {/* TOGGLE SWITCH */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isToolActive(tool.tool_id)}
                      disabled={isOptimizing}
                      onClick={() => handleToggleTool(tool)}
                      className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                        isToolActive(tool.tool_id)
                          ? 'bg-[#E00000] border-[#FF4444] shadow-[0_0_12px_rgba(224,0,0,0.5)]'
                          : 'bg-[#181822] border-zinc-700 hover:border-zinc-500'
                      }`}
                      title={
                        isToolActive(tool.tool_id)
                          ? 'Clique para desativar e retornar ao padrão do Windows'
                          : 'Clique para ligar e ativar a otimização'
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-flex h-5.5 w-5.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out items-center justify-center mt-[1px] ${
                          isToolActive(tool.tool_id) ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      >
                        {isExecuting ? (
                          <div className="w-2.5 h-2.5 border-2 border-zinc-700 border-t-zinc-900 rounded-full animate-spin" />
                        ) : isToolActive(tool.tool_id) ? (
                          <Zap className="w-3 h-3 text-[#E00000] fill-[#E00000]" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tool Inspection Modal */}
      {selectedToolDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-[#14141d] border border-[#2c2c3d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#242433] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[#E00000]/15 flex items-center justify-center text-[#FF3333]">
                  <IconHelper name={selectedToolDetails.icon} className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-mono">
                    {getToolName(selectedToolDetails)}
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {t(`cat_${selectedToolDetails.categoria.toLowerCase()}`) || selectedToolDetails.categoria} • {t('dash_tool_level')} {selectedToolDetails.required_plan_level}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedToolDetails(null)}
                className="text-zinc-400 hover:text-white text-xs font-mono cursor-pointer"
              >
                ✕ {t('btn_close')}
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div>
                <span className="font-mono text-zinc-500 uppercase block mb-1">{t('opt_details_desc_label')}:</span>
                <p className="leading-relaxed bg-[#0c0c10] p-3 rounded border border-[#20202d]">
                  {getToolDesc(selectedToolDetails)}
                </p>
              </div>

              <div>
                <span className="font-mono text-zinc-500 uppercase block mb-1">
                  {t('opt_details_title')}:
                </span>
                <p className="leading-relaxed bg-[#0c0c10] p-3 rounded border border-[#20202d] font-mono text-zinc-300 text-[11px]">
                  {selectedToolDetails.details}
                </p>
              </div>

              {selectedToolDetails.powershellSnippet && (
                <div>
                  <span className="font-mono text-zinc-500 uppercase block mb-1">
                    {t('opt_details_powershell')}:
                  </span>
                  <pre className="bg-black p-3 rounded border border-zinc-800 font-mono text-[10px] text-emerald-400 overflow-x-auto">
                    {selectedToolDetails.powershellSnippet}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#242433] flex justify-end gap-3">
              <button
                onClick={() => setSelectedToolDetails(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 cursor-pointer"
              >
                {t('btn_close')}
              </button>
              {userPlanLevel >= selectedToolDetails.required_plan_level ? (
                <button
                  onClick={() => {
                    toggleOptimizationTool(selectedToolDetails.tool_id);
                    setSelectedToolDetails(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5 ${
                    isToolActive(selectedToolDetails.tool_id)
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                      : 'bg-[#E00000] hover:bg-[#c50000] text-white shadow-md'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isToolActive(selectedToolDetails.tool_id)
                      ? 'DESATIVAR (PADRÃO WINDOWS)'
                      : 'LIGAR OTIMIZAÇÃO'}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    openUpgradeModal(
                      selectedToolDetails.required_plan_level,
                      selectedToolDetails.nome,
                      selectedToolDetails.categoria
                    );
                    setSelectedToolDetails(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                >
                  {t('opt_unlock_btn')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* EXPERIMENTAL TOOL WARNING MODAL (Requirement 30) */}
      {confirmExperimentalTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#121218] border border-amber-600/50 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold font-mono">Confirmação de Ação Experimental</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed mb-4">
              A otimização <strong className="text-white font-bold">{getToolName(confirmExperimentalTool)}</strong> possui classificação <span className="text-amber-400 font-bold font-mono">EXPERIMENTAL</span>.
              Ela altera parâmetros de baixo nível do sistema operacional e requer ação deliberada do usuário. Não possui aplicação automática.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmExperimentalTool(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 cursor-pointer"
              >
                {t('btn_cancel')}
              </button>
              <button
                onClick={() => {
                  const tId = confirmExperimentalTool.tool_id;
                  setConfirmExperimentalTool(null);
                  toggleOptimizationTool(tId);
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-bold cursor-pointer transition-all"
              >
                Confirmar e Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

