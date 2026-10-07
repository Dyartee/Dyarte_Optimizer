import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, XCircle, RotateCcw, Zap, ArrowRight, X, Clock, ShieldCheck } from 'lucide-react';

export const PlanExecutionModal: React.FC = () => {
  const { planExecutionModal, closePlanExecutionModal, setCurrentView } = useApp();

  if (!planExecutionModal.isOpen) return null;

  const isApply = planExecutionModal.actionType === 'APPLY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-[#101016] border border-[#2b2b3d] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-6 border-b border-[#212130] flex items-center justify-between bg-gradient-to-r from-[#171115] via-[#12121c] to-[#101017]">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg ${
                isApply
                  ? 'bg-[#E00000]/20 text-[#FF4444] border border-[#E00000]/40'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50'
              }`}
            >
              {isApply ? <Zap className="w-5 h-5 fill-current" /> : <RotateCcw className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-mono text-white uppercase tracking-tight">
                  {isApply ? 'Otimizações Aplicadas:' : 'Otimizações Revertidas:'} {planExecutionModal.planName}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    isApply
                      ? 'bg-[#E00000]/20 text-[#FF5555] border border-[#E00000]/40'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                  }`}
                >
                  NÍVEL {planExecutionModal.planLevel}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {planExecutionModal.successCount} de {planExecutionModal.totalCount} ações confirmadas internamente no Windows
              </p>
            </div>
          </div>

          <button
            onClick={closePlanExecutionModal}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body with Items List */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1 custom-scrollbar">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1 pb-1">
            <span>FERRAMENTA / CATEGORIA</span>
            <span>STATUS ANTES ➔ DEPOIS</span>
          </div>

          {planExecutionModal.items.map((item) => {
            const isSuccess = item.status === 'SUCESSO' || item.status === 'REVERTIDO';

            return (
              <div
                key={item.toolId}
                className="p-4 rounded-xl bg-[#14141e] border border-[#232332] hover:border-zinc-700 transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="text-sm font-bold font-mono text-white">{item.toolName}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {item.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        item.status === 'SUCESSO'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/40'
                          : item.status === 'REVERTIDO'
                          ? 'bg-blue-950/80 text-blue-400 border border-blue-700/40'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-700/40'
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.durationMs}ms
                    </span>
                  </div>
                </div>

                {/* Before and After Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="p-2.5 rounded-lg bg-[#0e0e14] border border-zinc-800/80 text-zinc-400">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-0.5">
                      Estado Anterior (Antes):
                    </span>
                    <p className="text-zinc-300 truncate" title={item.before}>
                      {item.before}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#0d1612] border border-emerald-900/40 text-emerald-300">
                    <span className="text-[10px] uppercase font-bold text-emerald-500 block mb-0.5">
                      Estado Novo (Depois):
                    </span>
                    <p className="text-emerald-200 truncate font-semibold" title={item.after}>
                      {item.after}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#20202e] bg-[#0c0c11] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Execução realizada e confirmada no subsistema local.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                closePlanExecutionModal();
                setCurrentView('history');
              }}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors cursor-pointer border border-zinc-700"
            >
              Ver no Histórico
            </button>
            <button
              onClick={closePlanExecutionModal}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-xs font-mono font-bold text-white transition-colors cursor-pointer shadow-md"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
