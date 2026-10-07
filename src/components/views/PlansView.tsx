import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plan } from '../../types';
import {
  Check,
  CheckCircle2,
  Crown,
  ExternalLink,
  Flame,
  Gem,
  HelpCircle,
  ShieldCheck,
  Zap,
  RotateCcw,
  Download,
  Play,
} from 'lucide-react';

export const PlansView: React.FC = () => {
  const {
    plans,
    currentUser,
    config,
    addToast,
    t,
    applyPlanOptimizations,
    rollbackPlanOptimizations,
    downloadDriverForVendor,
    installDriverForVendor,
    isOptimizing,
  } = useApp();

  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<'apply' | 'rollback' | null>(null);

  const handleExternalBuy = (plan: Plan) => {
    const url = config[plan.checkoutUrlKey] || 'https://dyarte.com/planos';
    addToast(
      'info',
      t('toast_checkout_title'),
      `${t('toast_checkout_msg')} ${plan.name}: ${url}`
    );
    window.open(url, '_blank', 'noopener,noreferrer');
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

          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-5 flex flex-col justify-between relative transition-all duration-300 ${
                isCurrentPlan
                  ? 'bg-gradient-to-b from-[#220d0d] via-[#160b0d] to-[#0f0d12] border-2 border-[#E00000] shadow-[0_0_35px_rgba(224,0,0,0.5)] ring-2 ring-[#E00000]/60 z-10'
                  : isPreviousPlan
                  ? 'bg-[#0d0d12] border border-zinc-800 text-zinc-500 opacity-60 grayscale-[35%]'
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
                <div
                  className={`my-5 pb-5 border-b ${
                    isCurrentPlan
                      ? 'border-[#E00000]/40'
                      : isPreviousPlan
                      ? 'border-zinc-800/80'
                      : 'border-zinc-800'
                  }`}
                >
                  {isFree ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black font-mono text-emerald-400">
                        GRATUITO
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">/ Vitalício</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-zinc-400 font-mono">R$</span>
                      <span
                        className={`text-3xl font-black font-mono ${
                          isPreviousPlan ? 'text-zinc-400' : 'text-white'
                        }`}
                      >
                        {plan.price.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">/{t('plan_period_month')}</span>
                    </div>
                  )}
                </div>

                {/* Features List */}
                <div className="space-y-2.5 mb-6">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider block">
                    {t('plan_features_label')}:
                  </span>
                  {plan.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 text-xs ${
                        isPreviousPlan ? 'text-zinc-500' : 'text-zinc-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isCurrentPlan
                            ? 'bg-[#E00000] text-white'
                            : isPreviousPlan
                            ? 'bg-zinc-800 text-zinc-500'
                            : isComplete
                            ? 'bg-[#E00000]/20 text-[#FF4444]'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span className="leading-tight">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4 Plan Buttons & Actions */}
              <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                {/* Row 1: APLICAR TUDO & REVERTER TUDO */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      setExecutingPlanId(plan.id);
                      setExecutingAction('apply');
                      try {
                        await applyPlanOptimizations(plan.level, plan.name);
                      } finally {
                        setExecutingPlanId(null);
                        setExecutingAction(null);
                      }
                    }}
                    disabled={isOptimizing}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-[#E00000] hover:bg-[#c50000] text-white shadow-[0_0_15px_rgba(224,0,0,0.35)] disabled:opacity-50"
                    title="Aplica todas as otimizações deste plano internamente no Windows com status Antes/Depois"
                  >
                    <Zap className={`w-3.5 h-3.5 fill-current ${executingPlanId === plan.id && executingAction === 'apply' ? 'animate-pulse' : ''}`} />
                    <span>{executingPlanId === plan.id && executingAction === 'apply' ? 'Aplicando...' : 'APLICAR TUDO'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      setExecutingPlanId(plan.id);
                      setExecutingAction('rollback');
                      try {
                        await rollbackPlanOptimizations(plan.level, plan.name);
                      } finally {
                        setExecutingPlanId(null);
                        setExecutingAction(null);
                      }
                    }}
                    disabled={isOptimizing}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 disabled:opacity-50"
                    title="Reverte todas as otimizações deste plano para o padrão de fábrica do Windows com status Antes/Depois"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${executingPlanId === plan.id && executingAction === 'rollback' ? 'animate-spin' : ''}`} />
                    <span>{executingPlanId === plan.id && executingAction === 'rollback' ? 'Revertendo...' : 'REVERTER TUDO'}</span>
                  </button>
                </div>

                {/* Row 2: BAIXAR DRIVER & INSTALAR DRIVER */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => downloadDriverForVendor()}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 shadow-sm"
                    title="Baixar pacote de driver oficial otimizado para o seu hardware"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>BAIXAR DRIVER</span>
                  </button>

                  <button
                    onClick={() => installDriverForVendor()}
                    className="py-2.5 px-2 rounded-xl text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-700/50 shadow-sm"
                    title="Iniciar rotina de instalação e calibração do driver no Windows"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-blue-400" />
                    <span>INSTALAR DRIVER</span>
                  </button>
                </div>

                {/* Status / Purchase Link */}
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
    </div>
  );
};
