import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Tool, PlanLevel } from '../../types';
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
  Download,
  Monitor,
  Check,
  Trash2,
  HardDrive,
  RefreshCw,
  Layers,
  ShieldCheck,
  RotateCcw,
  MousePointerClick,
  Gauge,
} from 'lucide-react';

export type OptimizationCategoryTab =
  | 'INPUT_LAG'
  | 'DESEMPENHO'
  | 'INICIALIZACAO'
  | 'SISTEMA'
  | 'GPU';

export interface StartupAppItem {
  id: string;
  name: string;
  exe: string;
  publisher: string;
  impact: 'ALTO' | 'MÉDIO' | 'BAIXO';
  delay: string;
  enabled: boolean;
}

const INITIAL_STARTUP_APPS: StartupAppItem[] = [
  { id: 'discord', name: 'Discord', exe: 'Update.exe --processStart Discord.exe', publisher: 'Discord Inc.', impact: 'ALTO', delay: '~1.8s', enabled: false },
  { id: 'spotify', name: 'Spotify Music', exe: 'Spotify.exe --autostart', publisher: 'Spotify AB', impact: 'MÉDIO', delay: '~0.9s', enabled: false },
  { id: 'steam', name: 'Steam Client Bootstrapper', exe: 'steam.exe -silent', publisher: 'Valve Corporation', impact: 'ALTO', delay: '~2.2s', enabled: false },
  { id: 'epic', name: 'Epic Games Launcher', exe: 'EpicGamesLauncher.exe -silent', publisher: 'Epic Games, Inc.', impact: 'ALTO', delay: '~2.5s', enabled: false },
  { id: 'onedrive', name: 'Microsoft OneDrive', exe: 'OneDrive.exe /background', publisher: 'Microsoft Corporation', impact: 'MÉDIO', delay: '~1.1s', enabled: false },
  { id: 'teams', name: 'Microsoft Teams', exe: 'ms-teams.exe --autostart', publisher: 'Microsoft Corporation', impact: 'MÉDIO', delay: '~1.4s', enabled: false },
  { id: 'creative_cloud', name: 'Adobe Creative Cloud', exe: 'Creative Cloud.exe --minimize', publisher: 'Adobe Inc.', impact: 'ALTO', delay: '~2.8s', enabled: false },
  { id: 'edge_boost', name: 'Microsoft Edge Startup Boost', exe: 'msedge.exe --no-startup-window', publisher: 'Microsoft Corporation', impact: 'BAIXO', delay: '~0.6s', enabled: false },
];

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
    detectAndSetRealHardware,
    t,
    getToolName,
    getToolDesc,
  } = useApp();

  const [activeTab, setActiveTab] = useState<OptimizationCategoryTab>('INPUT_LAG');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [selectedToolDetails, setSelectedToolDetails] = useState<Tool | null>(null);
  const [gpuSelectedBrand, setGpuSelectedBrand] = useState<'AMD' | 'NVIDIA' | null>(null);
  const [detectedGpuVendor, setDetectedGpuVendor] = useState<'AMD' | 'NVIDIA' | 'UNKNOWN'>('UNKNOWN');
  const [startupApps, setStartupApps] = useState<StartupAppItem[]>(INITIAL_STARTUP_APPS);


  const handleToggleTool = (targetTool: Tool) => {
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

  // Ferramentas categorizadas nas 4 abas de ajustes do sistema
  const INPUT_LAG_TOOL_IDS = ['tool_game_input_lag', 'tool_perf_latency_settings', 'tool_perf_dpc_extreme'];
  const DESEMPENHO_TOOL_IDS = ['tool_perf_cpu_basic', 'tool_perf_power_plan', 'tool_perf_memory', 'tool_game_fps_tweaks', 'tool_game_exclusive_suite'];
  const INICIALIZACAO_TOOL_IDS = ['tool_sys_startup'];
  const SISTEMA_TOOL_IDS = ['tool_sys_win_opt', 'tool_sys_proc_manager', 'tool_sys_stability', 'tool_sys_advanced_tweaks'];

  const getToolsForCurrentTab = (tab: OptimizationCategoryTab) => {
    let ids: string[] = [];
    if (tab === 'INPUT_LAG') ids = INPUT_LAG_TOOL_IDS;
    else if (tab === 'DESEMPENHO') ids = DESEMPENHO_TOOL_IDS;
    else if (tab === 'INICIALIZACAO') ids = INICIALIZACAO_TOOL_IDS;
    else if (tab === 'SISTEMA') ids = SISTEMA_TOOL_IDS;
    else return [];

    return tools.filter((tool) => {
      if (!ids.includes(tool.tool_id)) return false;
      const isUnlocked = userPlanLevel >= tool.required_plan_level;
      if (activeFilter === 'unlocked' && !isUnlocked) return false;
      if (activeFilter === 'locked' && isUnlocked) return false;
      return true;
    });
  };

  const getPlanNameBadge = (level: PlanLevel): 'FREE' | 'Médio' | 'Avançado' | 'Completo' => {
    switch (level) {
      case 1:
        return 'FREE';
      case 2:
        return 'Médio';
      case 3:
        return 'Avançado';
      case 4:
        return 'Completo';
      default:
        return 'FREE';
    }
  };

  const renderToolPlanTag = (level: PlanLevel) => {
    switch (level) {
      case 1:
        return (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-emerald-950/70 text-emerald-300 border border-emerald-600/50 shadow-sm">
            FREE
          </span>
        );
      case 2:
        return (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-blue-950/70 text-blue-300 border border-blue-600/50 shadow-sm">
            Médio
          </span>
        );
      case 3:
        return (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-purple-950/70 text-purple-300 border border-purple-600/50 shadow-sm">
            Avançado
          </span>
        );
      case 4:
        return (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-rose-950/70 text-rose-300 border border-rose-600/50 shadow-sm">
            Completo
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wider bg-zinc-800 text-zinc-300">
            FREE
          </span>
        );
    }
  };


  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho da Vista */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">
              {t('opt_title')}
            </h1>
            {renderToolPlanTag(userPlanLevel as PlanLevel)}
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

      {/* NAVEGAÇÃO ENTRE AS 6 ABAS DO PAINEL */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-2 rounded-xl bg-[#111117] border border-[#20202c]">
        {/* As 6 Abas Oficiais */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-thin">
          <button
            onClick={() => setActiveTab('INPUT_LAG')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'INPUT_LAG'
                ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>INPUT LAG</span>
          </button>

          <button
            onClick={() => setActiveTab('DESEMPENHO')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'DESEMPENHO'
                ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>DESEMPENHO</span>
          </button>

          <button
            onClick={() => setActiveTab('INICIALIZACAO')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'INICIALIZACAO'
                ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>INICIALIZAÇÃO</span>
          </button>

          <button
            onClick={() => setActiveTab('SISTEMA')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'SISTEMA'
                ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>SISTEMA</span>
          </button>

          <button
            onClick={() => setActiveTab('GPU')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'GPU'
                ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <span>GPU (DRIVERS & TWEAKS)</span>
          </button>
        </div>

        {/* Filtros de desbloqueio para as abas de opções */}
        {['INPUT_LAG', 'DESEMPENHO', 'INICIALIZACAO', 'SISTEMA'].includes(activeTab) && (
          <div className="flex items-center gap-1 bg-[#0c0c10] p-1 rounded-lg border border-[#1f1f2a] text-[11px] font-mono shrink-0">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({getToolsForCurrentTab(activeTab).length})
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
        )}
      </div>

      {/* RENDERIZADOR PADRONIZADO DE GRADE DE CARDS POR CATEGORIA */}
      {['INPUT_LAG', 'DESEMPENHO', 'INICIALIZACAO', 'SISTEMA'].includes(activeTab) && (
        <div className="space-y-6">
          {/* Cabeçalho da Categoria Ativa */}
          <div className="p-4 rounded-xl bg-[#0e0e14] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5 text-zinc-300">
              {activeTab === 'INPUT_LAG' && <MousePointerClick className="w-4 h-4 text-[#FF4444]" />}
              {activeTab === 'DESEMPENHO' && <Gauge className="w-4 h-4 text-[#FF4444]" />}
              {activeTab === 'INICIALIZACAO' && <Zap className="w-4 h-4 text-[#FF4444]" />}
              {activeTab === 'SISTEMA' && <Sliders className="w-4 h-4 text-[#FF4444]" />}
              <span className="font-bold text-white uppercase tracking-wider">
                {activeTab === 'INPUT_LAG' && 'INPUT LAG'}
                {activeTab === 'DESEMPENHO' && 'DESEMPENHO'}
                {activeTab === 'INICIALIZACAO' && 'INICIALIZAÇÃO'}
                {activeTab === 'SISTEMA' && 'SISTEMA'}
              </span>
              <span className="text-zinc-600 hidden sm:inline">•</span>
              <span className="text-zinc-400 font-normal">
                {activeTab === 'INPUT_LAG' && 'Registro de teclado, mouse, polling rate e timer resolution'}
                {activeTab === 'DESEMPENHO' && 'Tweaks de registro de CPU, plano de energia Dyarte, RAM e HAGS'}
                {activeTab === 'INICIALIZACAO' && 'Aceleração de boot e gerenciamento de inicializadores do Windows'}
                {activeTab === 'SISTEMA' && 'Debloat básico do Windows, telemetria e estabilidade de kernel'}
              </span>
            </div>
            <span className="text-zinc-400">
              {getToolsForCurrentTab(activeTab).length} opções disponíveis
            </span>
          </div>

          {/* Grade de Ferramentas com Toggles Interativos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getToolsForCurrentTab(activeTab).map((tool) => {
              const isPermitted = userPlanLevel >= tool.required_plan_level;
              const isExecuting = activeOptimizingToolId === tool.tool_id;
              const active = isToolActive(tool.tool_id);

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
                        {renderToolPlanTag(tool.required_plan_level)}
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
                        <span>REQUER PLANO {getPlanNameBadge(tool.required_plan_level)}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Disponível exclusivamente para membros com plano {getPlanNameBadge(tool.required_plan_level)}.
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

              // Card Desbloqueado com Toggle Interativo
              return (
                <div
                  key={tool.tool_id}
                  className={`p-5 rounded-xl bg-[#121218] border transition-all flex flex-col justify-between group shadow-md ${
                    active
                      ? 'border-[#E00000]/60 shadow-[0_0_15px_rgba(224,0,0,0.15)] bg-[#151117]'
                      : 'border-[#21212e] hover:border-[#3a3a4e]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
                        active
                          ? 'bg-[#E00000]/20 border-[#E00000]/50 text-[#FF4444]'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}>
                        <IconHelper name={tool.icon} className="w-5 h-5" />
                      </div>
                      <div className="flex items-center justify-end">
                        {renderToolPlanTag(tool.required_plan_level)}
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-white group-hover:text-[#FF4444] transition-colors">
                      {getToolName(tool)}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      {getToolDesc(tool)}
                    </p>

                    <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                      <span>Plano: <strong className="text-zinc-300 font-normal">{getPlanNameBadge(tool.required_plan_level)}</strong></span>
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
                      <span className={`text-[10px] font-mono font-bold uppercase ${
                        active ? 'text-[#FF4444]' : 'text-zinc-500'
                      }`}>
                        {active ? 'APLICADO' : 'PADRÃO'}
                      </span>

                      {/* TOGGLE SWITCH OBRIGATÓRIO */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        disabled={isOptimizing}
                        onClick={() => handleToggleTool(tool)}
                        className={`relative inline-flex h-7 w-13 shrink-0 rounded-full border-2 transition-all duration-200 ease-in-out focus:outline-none ${
                          isOptimizing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          active
                            ? 'bg-[#E00000] border-[#FF4444] shadow-[0_0_12px_rgba(224,0,0,0.5)]'
                            : 'bg-[#181822] border-zinc-700 hover:border-zinc-500'
                        }`}
                        title={
                          active
                            ? 'Clique para desmarcar e restaurar o padrão de fábrica do Windows'
                            : 'Clique para ativar e aplicar a otimização no Windows'
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-flex h-5.5 w-5.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out items-center justify-center mt-[1px] ${
                            active ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        >
                          {isExecuting ? (
                            <div className="w-2.5 h-2.5 border-2 border-zinc-700 border-t-zinc-900 rounded-full animate-spin" />
                          ) : active ? (
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

          {/* Gerenciador Adicional de Inicialização exclusivo para a aba INICIALIZAÇÃO */}
          {activeTab === 'INICIALIZACAO' && (
            <div className="p-6 rounded-2xl bg-[#101018] border border-zinc-800 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div>
                  <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Programas que Iniciam com o Windows</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Desative aplicativos em segundo plano para reduzir o tempo de boot e liberar memória RAM ao iniciar o PC.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setStartupApps((prev) => prev.map((app) => ({ ...app, enabled: false })));
                      addToast('success', 'Inicialização Otimizada', 'Todos os aplicativos secundários de inicialização foram desativados.');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all cursor-pointer border border-zinc-700"
                  >
                    Desativar Todos Não Essenciais
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-zinc-500 uppercase text-[10px]">
                      <th className="py-2.5 px-3">Aplicativo</th>
                      <th className="py-2.5 px-3">Fornecedor</th>
                      <th className="py-2.5 px-3">Impacto no Boot</th>
                      <th className="py-2.5 px-3">Atraso Estimado</th>
                      <th className="py-2.5 px-3 text-right">Status / Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {startupApps.map((app) => (
                      <tr key={app.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-3">
                          <strong className="text-white block">{app.name}</strong>
                          <span className="text-[10px] text-zinc-500 truncate max-w-xs block">{app.exe}</span>
                        </td>
                        <td className="py-3 px-3 text-zinc-400">{app.publisher}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            app.impact === 'ALTO'
                              ? 'bg-red-950/80 text-red-400 border border-red-800/50'
                              : app.impact === 'MÉDIO'
                              ? 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                              : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                          }`}>
                            {app.impact}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-zinc-300 font-bold">{app.delay}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setStartupApps((prev) =>
                                prev.map((item) =>
                                  item.id === app.id ? { ...item, enabled: !item.enabled } : item
                                )
                              );
                              addToast(
                                app.enabled ? 'info' : 'success',
                                `Inicialização: ${app.name}`,
                                app.enabled ? `${app.name} ativado na inicialização.` : `${app.name} desativado da inicialização.`
                              );
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                              app.enabled
                                ? 'bg-red-950 text-red-300 hover:bg-red-900 border border-red-800/60'
                                : 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800/60'
                            }`}
                          >
                            {app.enabled ? 'DESATIVAR' : 'ATIVAR'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ========================================================================= */}
      {/* ABA 3: GPU (GERENCIAMENTO DE DRIVERS AMD E NVIDIA)                         */}
      {/* ========================================================================= */}
      {activeTab === 'GPU' && (
        <div className="space-y-6">
          {/* Card DDU Clean Sweep */}
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
                      {renderToolPlanTag(cleanTool.required_plan_level)}
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

          {/* SELEÇÃO DE ARQUITETURA AMD OU NVIDIA */}
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

              {/* CARDS AMD E NVIDIA (Sem bloqueio de acesso mesmo se GPU não identificada) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* AMD CARD */}
                <div className="p-6 rounded-2xl bg-gradient-to-b from-[#191114] to-[#100c0e] border border-red-900/40 hover:border-red-500/80 transition-all flex flex-col justify-between group shadow-xl relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-500 font-mono font-black text-lg shadow-inner">
                        AMD
                      </div>
                      {isAmdGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5" /> DETECTADA NO SISTEMA
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1.5 shadow-sm">
                          DISPONÍVEL
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
                        <span>AMD DRIVER OPTIMIZER (Instalador Setup.exe)</span>
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

                {/* NVIDIA CARD */}
                <div className="p-6 rounded-2xl bg-gradient-to-b from-[#101913] to-[#0c100e] border border-emerald-900/40 hover:border-emerald-500/80 transition-all flex flex-col justify-between group shadow-xl relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400 font-mono font-black text-sm shadow-inner">
                        NV
                      </div>
                      {isNvidiaGpuDetected ? (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5" /> DETECTADA NO SISTEMA
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1.5 shadow-sm">
                          DISPONÍVEL
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
                        <span>NVIDIA DRIVER OPTIMIZER (Instalador Setup.exe)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>NVIDIA OPTIMIZER (Ultra Low Latency & Clocks Estáveis)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setGpuSelectedBrand('NVIDIA')}
                    className="w-full mt-6 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer shadow-lg group-hover:shadow-emerald-900/40"
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
            /* DETALHES DA MARCA SELECIONADA */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#111117] border border-[#222230]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGpuSelectedBrand(null)}
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Voltar para seleção de fabricante"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      Fabricante Selecionada:
                    </span>
                    <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                      <span>{gpuSelectedBrand === 'AMD' ? 'AMD RADEON™' : 'NVIDIA GEFORCE™'}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          gpuSelectedBrand === 'AMD'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}
                      >
                        {gpuSelectedBrand}
                      </span>
                    </h3>
                  </div>
                </div>

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

              {/* RENDER DAS FERRAMENTAS DA FABRICANTE (DRIVER OPTIMIZER + OPTIMIZER) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tools
                  .filter((t) => {
                    if (gpuSelectedBrand === 'AMD') {
                      return t.tool_id === 'tool_gpu_amd_driver' || t.tool_id === 'tool_gpu_amd_opt';
                    } else {
                      return t.tool_id === 'tool_gpu_nvidia_driver' || t.tool_id === 'tool_gpu_nvidia_opt';
                    }
                  })
                  .map((tool) => {
                    const isPermitted = userPlanLevel >= tool.required_plan_level;
                    const isExecuting = activeOptimizingToolId === tool.tool_id;
                    const isDriverOptimizer =
                      tool.tool_id === 'tool_gpu_amd_driver' ||
                      tool.tool_id === 'tool_gpu_nvidia_driver';

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
                              {renderToolPlanTag(tool.required_plan_level)}
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
                                Exclusivo para membros com plano {getPlanNameBadge(tool.required_plan_level)}.
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
                              {renderToolPlanTag(tool.required_plan_level)}
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

                        {/* Botões Essenciais (Sem 'INSTALAR DRIVER' ou 'REMOVER DRIVER') */}
                        <div className="pt-4 mt-5 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                          <button
                            onClick={() => setSelectedToolDetails(tool)}
                            className="text-xs text-zinc-400 hover:text-white font-mono flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>{t('opt_details_btn')}</span>
                          </button>

                          <div className="flex items-center gap-2.5">
                            {/* BOTAO EXCLUSIVO: EXECUTAR */}
                            <button
                              onClick={async () => {
                                if (isDriverOptimizer && gpuSelectedBrand) {
                                  await executeDriverPipeline(gpuSelectedBrand);
                                } else {
                                  await executeOptimizationTool(tool.tool_id);
                                }
                              }}
                              disabled={isOptimizing}
                              className={`px-4 py-2 rounded-lg text-white text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 ${
                                gpuSelectedBrand === 'AMD'
                                  ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40'
                                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                              }`}
                              title={
                                isDriverOptimizer
                                  ? `Executar instalador Setup.exe de ${gpuSelectedBrand} com privilégios de Administrador`
                                  : 'Executar otimização agora'
                              }
                            >
                              {isExecuting ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current" />
                              )}
                              <span>EXECUTAR</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
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
                  <div className="mt-1">
                    {renderToolPlanTag(selectedToolDetails.required_plan_level)}
                  </div>
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
    </div>
  );
};
