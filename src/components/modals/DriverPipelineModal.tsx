import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, XCircle, X, ShieldCheck } from 'lucide-react';

export const DriverPipelineModal: React.FC = () => {
  const { driverPipeline, closeDriverPipeline } = useApp();

  if (!driverPipeline || !driverPipeline.isOpen) {
    return null;
  }

  const {
    brand,
    phase,
    progress,
    installerFileName,
  } = driverPipeline;

  const isFinished = phase === 'completed' || phase === 'failed';
  const isAmd = brand === 'AMD';

  // Status simples exigido: Instalando... / Concluído / Erro
  const simpleStatus =
    phase === 'completed'
      ? 'Concluído'
      : phase === 'failed'
      ? 'Erro'
      : 'Instalando...';

  const driverName = installerFileName || `Driver ${brand} (Setup.exe)`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#0e0e14] border border-[#262638] shadow-2xl overflow-hidden flex flex-col">
        {/* Header simplificado */}
        <div
          className={`p-5 border-b flex items-center justify-between ${
            phase === 'failed'
              ? 'bg-red-950/40 border-red-900/60'
              : phase === 'completed'
              ? 'bg-emerald-950/40 border-emerald-900/60'
              : 'bg-[#14141e] border-zinc-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm border shadow-md ${
                phase === 'failed'
                  ? 'bg-red-950 text-red-400 border-red-700/80'
                  : phase === 'completed'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-700/80'
                  : isAmd
                  ? 'bg-red-950/80 text-red-400 border-red-700/60'
                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
              }`}
            >
              {isAmd ? 'AMD' : 'NV'}
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-mono uppercase tracking-wide">
                {driverName}
              </h3>
              <span className="text-xs text-zinc-400 font-mono">
                Instalação de Driver de Vídeo
              </span>
            </div>
          </div>

          {isFinished && (
            <button
              onClick={closeDriverPipeline}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Corpo simplificado: Nome do Driver, Status Simples e Barra de Progresso com % */}
        <div className="p-6 space-y-6">
          {/* Status Simples */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {phase === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : phase === 'failed' ? (
                <XCircle className="w-5 h-5 text-red-400" />
              ) : (
                <div
                  className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${
                    isAmd ? 'border-red-400' : 'border-emerald-400'
                  }`}
                />
              )}
              <span
                className={`text-sm font-mono font-bold ${
                  phase === 'completed'
                    ? 'text-emerald-400'
                    : phase === 'failed'
                    ? 'text-red-400'
                    : 'text-white'
                }`}
              >
                {simpleStatus}
              </span>
            </div>
            <span
              className={`text-lg font-mono font-extrabold ${
                phase === 'failed'
                  ? 'text-red-400'
                  : phase === 'completed'
                  ? 'text-emerald-400'
                  : 'text-white'
              }`}
            >
              {progress}%
            </span>
          </div>

          {/* Barra de Progresso com % */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-300 shadow-md ${
                  phase === 'failed'
                    ? 'bg-red-600'
                    : phase === 'completed'
                    ? 'bg-emerald-500'
                    : isAmd
                    ? 'bg-gradient-to-r from-red-600 to-rose-500'
                    : 'bg-gradient-to-r from-emerald-600 to-green-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-zinc-800 bg-[#0c0c12] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-zinc-400" />
            <span>Privilégios de Administrador (UAC)</span>
          </div>

          <div>
            {isFinished && (
              <button
                onClick={closeDriverPipeline}
                className={`px-5 py-2 rounded-xl text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md ${
                  phase === 'completed'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                }`}
              >
                {phase === 'completed' ? 'Concluir' : 'Fechar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
