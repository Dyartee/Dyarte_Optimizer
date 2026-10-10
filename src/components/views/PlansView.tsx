import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plan, Tool } from '../../types';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Gem,
  Zap,
  RotateCcw,
  ListFilter,
  X,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

interface ManualModalState {
  isOpen: boolean;
  action: 'apply' | 'rollback';
  plan: Plan | null;
  selectedToolIds: string[];
  progressText: string | null;
}

export const PlansView: React.FC = () => {
  const {
    plans,
    tools,
    currentUser,
    config,
    addToast,
    t,
    applyPlanOptimizations,
    rollbackPlanOptimizations,
    isOptimizing,
  } = useApp();

  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<'apply' | 'rollback' | null>(null);
  const [stepProgress, setStepProgress] = useState<string | null>(null);

  // Modal para Aplicar Manualmente / Reverter Manualmente
  const [manualModal, setManualModal] = useState<ManualModalState>({
    isOpen: false,
    action: 'apply',
    plan: null,
    selectedToolIds: [],
    progressText: null,
  });

  const handleExternalBuy = (plan: Plan) => {
    const url = config[plan.checkoutUrlKey] || 'https://dyarte.com/planos';
    addToast(
      'info',
      t('toast_checkout_title'),
      `${t('toast_checkout_msg')} ${plan.name}: ${url}`
    );
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openManualModal = (plan: Plan, action: 'apply' | 'rollback') => {
    const planTools = tools.filter((t) => t.required_plan_level <= plan.level);
    const initialIds =
      action === 'rollback'
        ? planTools.filter((t) => t.is_reversible).map((t) => t.tool_id)
        : planTools.map((t) => t.tool_id);

    setManualModal({
      isOpen: true,
      action,
      plan,
      selectedToolIds: initialIds,
      progressText: null,
    });
  };

  const closeManualModal = () => {
    if (isOptimizing) return;
    setManualModal({
      isOpen: false,
      action: 'apply',
      plan: null,
      selectedToolIds: [],
      progressText: null,
    });
  };

  const toggleToolSelection = (toolId: string) => {
    setManualModal((prev) => {
      const exists = prev.selectedToolIds.includes(toolId);
      return {
        ...prev,
        selectedToolIds: exists
          ? prev.selectedToolIds.filter((id) => id !== toolId)
          : [...prev.selectedToolIds, toolId],
      };
    });
  };

  const selectAllTools = (availableIds: string[]) => {
    setManualModal((prev) => ({
      ...prev,
      selectedToolIds: availableIds,
    }));
  };

  const deselectAllTools = () => {
    setManualModal((prev) => ({
      ...prev,
      selectedToolIds: [],
    }));
  };

  const executeManualAction = async () => {
    if (!manualModal.plan || manualModal.selectedToolIds.length === 0) return;

    const plan = manualModal.plan;
    const isApply = manualModal.action === 'apply';
    setExecutingPlanId(plan.id);
    setExecutingAction(isApply ? 'apply' : 'rollback');

    try {
      if (isApply) {
        await applyPlanOptimizations(
          plan.level,
          plan.name,
          manualModal.selectedToolIds,
          (step, total) => {
            const txt = `Aplicando... [${step}/${total}]`;
            setManualModal((prev) => ({ ...prev, progressText: txt }));
            setStepProgress(txt);
          }
        );
      } else {
        await rollbackPlanOptimizations(
          plan.level,
          plan.name,
          manualModal.selectedToolIds,
          (step, total) => {
            const txt = `Revertendo... [${step}/${total}]`;
            setManualModal((prev) => ({ ...prev, progressText: txt }));
            setStepProgress(txt);
          }
        );
      }
      closeManualModal();
    } finally {
      setExecutingPlanId(null);
      setExecutingAction(null);
      setStepProgress(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Title */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E00000]/15 border border-[#E00000]/40 text-[#FF4444] text-xs font-mono font-bold uppercase">
          <Gem className="w-3.5 h-3.5" />
          {t('plans_badge_official')}
        </div>
        <h1 className="text-3xl font-extrabold text-white font-mono uppercase tracking-tight">
          {t('plans_title')}
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          {t('plans_subtitle')}
        </p>
      </div>

      {/* 4 Cards Desktop Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch max-w-7xl mx-auto">
        {plans.map((plan) => {
          const userPlanLevel = currentUser?.nivel_plano ?? 1;
          const isCurrentPlan =
            userPlanLevel === plan.level ||
            currentUser?.plano_atual.toUpperCase() === plan.name.toUpperCase();
          const isPreviousPlan = userPlanLevel > plan.level;
          const isComplete = plan.id === 'completo';
          const isFree = plan.price === 0;

          const isCurrentlyExecuting = executingPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-5 flex flex-col justify-between relative transition-all duration-300 ${
                isCurrentPlan
                  ? 'bg-gradient-to-b from-[#220d0d] via-[#160b0d] to-[#0f0d12] border-2 border-[#E00000] shadow-[0_0_35px_rgba(224,0,0,0.5)] ring-2 ring-[#E00000]/60 z-10'
                  : isPreviousPlan
                  ? 'bg-[#0d0d12] border border-zinc-800 text-zinc-500 opacity-75'
                  : isComplete
                  ? 'bg-gradient-to-b from-[#1c1212] via-[#141015] to-[#0d0d11] border border-[#E00000]/50 hover:border-[#E00000] shadow-[0_0_20px_rgba(224,0,0,0.2)]'
                  : 'bg-[#121218] border border-[#232330] hover:border-[#3a3a4c]'
              }`}
            >
              {/* Badge on Top */}
              {isCurrentPlan ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-[#E00000] text-white shadow-[0_0_15px_rgba(224,0,0,0.7)] whitespace-nowrap flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{t('plan_current_active')}</span>
                  </span>
                </div>
              ) : isPreviousPlan ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700 whitespace-nowrap">
                    {t('plan_included_in_plan')}
                  </span>
                </div>
              ) : plan.badge ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap ${
                      plan.badgeType === 'max'
                        ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.6)]'
                        : 'bg-amber-400 text-black font-bold'
                    }`}
                  >
                    {plan.badgeType === 'max' ? t('plan_badge_max') : t('plan_badge_rec')}
                  </span>
                </div>
              ) : isFree ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 whitespace-nowrap font-bold">
                    GRATUITO
                  </span>
                </div>
              ) : null}

              <div>
                {/* Plan Header */}
                <div className="flex items-center justify-between mb-3 mt-1">
                  <h3
                    className={`text-lg font-extrabold font-mono uppercase ${
                      isCurrentPlan ? 'text-white' : isPreviousPlan ? 'text-zinc-400' : 'text-white'
                    }`}
                  >
                    {t(`plan_name_${plan.id}`) || plan.name}
                  </h3>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isCurrentPlan
                        ? 'bg-[#E00000]/20 text-[#FF5555] border border-[#E00000]/40'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {t('plan_level_label')} {plan.level}
                  </span>
                </div>

                <p
                  className={`text-xs min-h-[34px] leading-relaxed ${
                    isPreviousPlan ? 'text-zinc-500' : 'text-zinc-400'
                  }`}
                >
                  {t(`plan_desc_${plan.id}`) || plan.description}
                </p>

                {/* Price Display */}
                <div className="my-4 py-3 px-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-black font-mono text-white">
                      {isFree ? 'R$ 0' : `R$ ${plan.price.toFixed(0)}`}
                    </span>
                    <span className="text-xs text-zinc-400 ml-1 font-mono">
                      /{plan.period}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {isFree ? 'Livre' : 'Assinatura'}
                  </span>
                </div>

                {/* Features List */}
                <ul className="space-y-2 mb-4">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                      <Check className="w-3.5 h-3.5 text-[#FF3333] shrink-0 mt-0.5" />
                      <span className="leading-tight">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons: 4 Required Buttons + Baixar Driver */}
              <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                {/* Linha 1: APLICAR TUDO & REVERTER TUDO */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      setExecutingPlanId(plan.id);
                      setExecutingAction('apply');
                      try {
                        await applyPlanOptimizations(
                          plan.level,
                          plan.name,
                          undefined,
                          (step, total) => {
                            setStepProgress(`Aplicando... [${step}/${total}]`);
                          }
                        );
                      } finally {
                        setExecutingPlanId(null);
                        setExecutingAction(null);
                        setStepProgress(null);
                      }
                    }}
                    disabled={isOptimizing}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-[#E00000] hover:bg-[#c50000] text-white shadow-[0_0_15px_rgba(224,0,0,0.35)] disabled:opacity-50"
                    title="Aplica todas as otimizações deste plano internamente no Windows"
                  >
                    <Zap className={`w-3.5 h-3.5 fill-current ${isCurrentlyExecuting && executingAction === 'apply' ? 'animate-pulse' : ''}`} />
                    <span className="truncate">
                      {isCurrentlyExecuting && executingAction === 'apply'
                        ? stepProgress || 'Aplicando...'
                        : 'APLICAR TUDO'}
                    </span>
                  </button>

                  <button
                    onClick={async () => {
                      setExecutingPlanId(plan.id);
                      setExecutingAction('rollback');
                      try {
                        await rollbackPlanOptimizations(
                          plan.level,
                          plan.name,
                          undefined,
                          (step, total) => {
                            setStepProgress(`Revertendo... [${step}/${total}]`);
                          }
                        );
                      } finally {
                        setExecutingPlanId(null);
                        setExecutingAction(null);
                        setStepProgress(null);
                      }
                    }}
                    disabled={isOptimizing}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 disabled:opacity-50"
                    title="Reverte todas as otimizações deste plano para o padrão de fábrica do Windows"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isCurrentlyExecuting && executingAction === 'rollback' ? 'animate-spin' : ''}`} />
                    <span className="truncate">
                      {isCurrentlyExecuting && executingAction === 'rollback'
                        ? stepProgress || 'Revertendo...'
                        : 'REVERTER TUDO'}
                    </span>
                  </button>
                </div>

                {/* Linha 2: APLICAR MANUALMENTE & REVERTER MANUALMENTE */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openManualModal(plan, 'apply')}
                    disabled={isOptimizing}
                    className="py-2 px-1.5 rounded-xl text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-[#1c1822] hover:bg-[#282232] text-amber-300 border border-amber-600/30 hover:border-amber-500/60 disabled:opacity-50"
                    title="Lista onde você marca quais otimizações aplicar e aplica somente as selecionadas"
                  >
                    <ListFilter className="w-3 h-3 text-amber-400" />
                    <span className="truncate">APLICAR MANUALMENTE</span>
                  </button>

                  <button
                    onClick={() => openManualModal(plan, 'rollback')}
                    disabled={isOptimizing}
                    className="py-2 px-1.5 rounded-xl text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-[#181a20] hover:bg-[#222530] text-blue-300 border border-blue-600/30 hover:border-blue-500/60 disabled:opacity-50"
                    title="Lista onde você marca quais otimizações reverter e desfaz somente as selecionadas"
                  >
                    <RotateCcw className="w-3 h-3 text-blue-400" />
                    <span className="truncate">REVERTER MANUALMENTE</span>
                  </button>
                </div>



                {/* Linha 4: Status / Link de Assinatura */}
                <div className="pt-1">
                  {isCurrentPlan ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-zinc-900/90 border border-emerald-600/40 text-emerald-400 text-[10px] font-mono font-bold text-center uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('plan_current_active')}</span>
                    </div>
                  ) : isPreviousPlan ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-400 text-[10px] font-mono font-semibold text-center uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <Check className="w-3 h-3 text-zinc-500" />
                      <span>{t('plan_included_in_plan')}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExternalBuy(plan)}
                      className="w-full py-2 px-3 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                    >
                      <span>{isFree ? 'Plano Ativo Grátis' : t('plan_buy_official')}</span>
                      {!isFree && <ExternalLink className="w-3 h-3 text-zinc-400" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Seleção Manual (APLICAR MANUALMENTE / REVERTER MANUALMENTE) */}
      {manualModal.isOpen && manualModal.plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl bg-[#101016] border border-[#2b2b3d] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header do Modal */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-[#151520]">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md ${
                    manualModal.action === 'apply'
                      ? 'bg-amber-950/70 border border-amber-600/50 text-amber-400'
                      : 'bg-blue-950/70 border border-blue-600/50 text-blue-400'
                  }`}
                >
                  {manualModal.action === 'apply' ? (
                    <ListFilter className="w-5 h-5" />
                  ) : (
                    <RotateCcw className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold font-mono text-white uppercase tracking-tight">
                    {manualModal.action === 'apply'
                      ? 'Aplicar Manualmente'
                      : 'Reverter Manualmente'}{' '}
                    • Plano {manualModal.plan.name}
                  </h3>
                  <span className="text-xs text-zinc-400 font-mono">
                    Marque as otimizações que deseja{' '}
                    {manualModal.action === 'apply' ? 'aplicar' : 'reverter'}
                  </span>
                </div>
              </div>

              {!isOptimizing && (
                <button
                  onClick={closeManualModal}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Ações de Seleção Rápida */}
            {(() => {
              const planTools = tools.filter(
                (t) => t.required_plan_level <= (manualModal.plan?.level ?? 1)
              );
              const selectableTools =
                manualModal.action === 'rollback'
                  ? planTools.filter((t) => t.is_reversible)
                  : planTools;
              const selectableIds = selectableTools.map((t) => t.tool_id);

              return (
                <div className="px-5 py-3 border-b border-zinc-800/80 bg-[#0d0d14] flex items-center justify-between text-xs font-mono">
                  <div className="text-zinc-400">
                    <span className="text-white font-bold">
                      {manualModal.selectedToolIds.length}
                    </span>{' '}
                    de {selectableTools.length} selecionadas
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => selectAllTools(selectableIds)}
                      disabled={isOptimizing}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Marcar Todas
                    </button>
                    <button
                      onClick={deselectAllTools}
                      disabled={isOptimizing}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Lista com Checkboxes */}
            <div className="p-5 overflow-y-auto space-y-2.5 flex-1 custom-scrollbar">
              {tools
                .filter(
                  (t) => t.required_plan_level <= (manualModal.plan?.level ?? 1)
                )
                .map((tool) => {
                  const isChecked = manualModal.selectedToolIds.includes(tool.tool_id);
                  const isRevertAction = manualModal.action === 'rollback';
                  const isDisabled = isRevertAction && !tool.is_reversible;

                  return (
                    <div
                      key={tool.tool_id}
                      onClick={() => {
                        if (!isDisabled && !isOptimizing) {
                          toggleToolSelection(tool.tool_id);
                        }
                      }}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isDisabled
                          ? 'bg-zinc-950/40 border-zinc-800/60 opacity-50 cursor-not-allowed'
                          : isChecked
                          ? manualModal.action === 'apply'
                            ? 'bg-amber-950/20 border-amber-600/50 cursor-pointer'
                            : 'bg-blue-950/20 border-blue-600/50 cursor-pointer'
                          : 'bg-[#14141e] border-zinc-800 hover:border-zinc-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked && !isDisabled}
                          disabled={isDisabled || isOptimizing}
                          onChange={() => {}}
                          className={`w-4 h-4 rounded border-zinc-700 focus:ring-0 ${
                            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-white">
                              {tool.nome}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              {tool.categoria}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                            {tool.descricao}
                          </p>
                        </div>
                      </div>

                      {isDisabled ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 whitespace-nowrap">
                          Sem Reversão (Limpeza)
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">
                          {tool.impact}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Rodapé com Botão de Execução e Progresso Claro */}
            <div className="p-4 border-t border-zinc-800 bg-[#0c0c12] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                {isOptimizing ? (
                  <span className="text-amber-400 font-bold animate-pulse">
                    {manualModal.progressText || 'Executando etapa...'}
                  </span>
                ) : (
                  <span>
                    Apenas os itens selecionados serão alterados no Windows.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={closeManualModal}
                  disabled={isOptimizing}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  onClick={executeManualAction}
                  disabled={
                    isOptimizing || manualModal.selectedToolIds.length === 0
                  }
                  className={`px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-white transition-all cursor-pointer shadow-md disabled:opacity-50 ${
                    manualModal.action === 'apply'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {isOptimizing
                    ? manualModal.progressText || 'Executando...'
                    : manualModal.action === 'apply'
                    ? `Aplicar Selecionadas (${manualModal.selectedToolIds.length})`
                    : `Reverter Selecionadas (${manualModal.selectedToolIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
