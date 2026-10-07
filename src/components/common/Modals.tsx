import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Lock,
  ExternalLink,
  Zap,
  Check,
  X,
  FileText,
  ShieldAlert,
  ShieldCheck,
  HelpCircle,
  Mail,
  MessageSquare,
} from 'lucide-react';
import { PlanId } from '../../types';
import { EditHardwareModal } from '../modals/EditHardwareModal';
import { SafetyLockModal } from '../modals/SafetyLockModal';
import { DriverPipelineModal } from '../modals/DriverPipelineModal';
import { PlanExecutionModal } from '../modals/PlanExecutionModal';

export const Modals: React.FC = () => {
  const {
    upgradeModal,
    closeUpgradeModal,
    legalModal,
    closeLegalModal,
    plans,
    config,
    adminProcessWebhookPayment,
    currentUser,
    addToast,
  } = useApp();

  // Upgrade Modal
  const renderUpgradeModal = () => {
    if (!upgradeModal?.isOpen) return null;

    const targetPlan =
      plans.find((p) => p.level === upgradeModal.requiredLevel) || plans[2]; // Default to Avançado if not found

    const checkoutUrl = config[targetPlan.checkoutUrlKey] || 'https://dyarte.com/planos';

    const handleExternalCheckout = () => {
      addToast(
        'info',
        'Redirecionando para Checkout Oficial',
        `Abrindo tela de pagamento seguro do ${targetPlan.name}.`
      );
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <div className="w-full max-w-lg rounded-2xl bg-[#121219] border-2 border-[#E00000] p-6 shadow-[0_0_50px_rgba(224,0,0,0.3)] space-y-5 relative">
          <button
            onClick={closeUpgradeModal}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#E00000]/20 border border-[#E00000]/50 flex items-center justify-center text-[#FF4444] shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-[#FF4444] uppercase font-bold tracking-wider">
                RECURSO BLOQUEADO
              </span>
              <h3 className="text-lg font-bold text-white font-mono">
                {upgradeModal.toolName || 'Otimização Bloqueada'}
              </h3>
            </div>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Esta ferramenta avançada requer o{' '}
            <strong className="text-white font-bold uppercase">{targetPlan.name}</strong> (Nível{' '}
            {targetPlan.level}). Faça o upgrade para desbloquear este e todos os outros módulos de
            alto desempenho.
          </p>

          <div className="p-4 rounded-xl bg-[#0c0c10] border border-zinc-800 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-mono text-zinc-400 uppercase">
                Investimento no {targetPlan.name}:
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-zinc-400 font-mono">R$</span>
                <span className="text-2xl font-black text-white font-mono">
                  {targetPlan.price.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-xs text-zinc-500 font-mono">/{targetPlan.period}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              {targetPlan.features.slice(0, 4).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleExternalCheckout}
              className="w-full py-3 rounded-xl bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <span>Comprar Agora no Site Oficial</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Legal Modal
  const renderLegalModal = () => {
    if (!legalModal?.isOpen) return null;

    let title = 'Documento';
    let content = null;

    if (legalModal.type === 'terms') {
      title = 'Termos de Uso do Software DYARTE OPTIMIZER';
      content = (
        <div className="space-y-4 text-xs text-zinc-300 leading-relaxed font-sans">
          <p>
            <strong>1. Aceitação dos Termos:</strong> Ao utilizar o software DYARTE OPTIMIZER e
            seu agente de sistema, você concorda expressamente com as condições aqui estipuladas.
          </p>
          <p>
            <strong>2. Licenciamento e Restrições de Dispositivo:</strong> Cada licença adquirida é
            nominal e concede o direito de ativação em 1 (um) computador por vez. A tentativa de
            compartilhar chaves de produto ou burlar a autenticação de hardware resultará em
            suspensão imediata da conta e da licença sem direito a reembolso.
          </p>
          <p>
            <strong>3. Escopo de Otimização:</strong> O DYARTE OPTIMIZER altera parâmetros do
            registro do Windows (HKLM/HKCU), prioridades de agendador de CPU, timers multimídia e
            políticas de energia com o objetivo de reduzir latência e aumentar taxas de quadros
            (FPS). Nenhuma garantia de overclocking além das especificações do fabricante é
            concedida.
          </p>
          <p>
            <strong>4. Isenção de Responsabilidade:</strong> O usuário é responsável por manter
            backups periódicos de seus dados e criar Pontos de Restauração do Windows antes de
            aplicar modificações profundas de kernel.
          </p>
        </div>
      );
    } else if (legalModal.type === 'privacy') {
      title = 'Política de Privacidade e Proteção de Dados';
      content = (
        <div className="space-y-4 text-xs text-zinc-300 leading-relaxed font-sans">
          <p>
            <strong>1. Coleta de Telemetria:</strong> Coletamos exclusivamente informações de
            especificação de hardware (modelo de CPU, placa de vídeo, quantidade de memória RAM,
            versão da compilação do Windows e identificador de hardware UUID) para garantir o
            correto funcionamento do sistema de licenças e compatibilidade dos scripts de
            otimização.
          </p>
          <p>
            <strong>2. Não Coleta de Arquivos Pessoais:</strong> O DYARTE OPTIMIZER não lê, não
            acessa, não transmite e não armazena arquivos pessoais, senhas de navegador, históricos
            de navegação ou documentos do usuário.
          </p>
          <p>
            <strong>3. Armazenamento e Criptografia:</strong> As chaves de licença e credenciais de
            acesso são trafegadas sob criptografia TLS 1.3 de ponta a ponta e armazenadas com
            hash SHA-256 e salting no backend.
          </p>
        </div>
      );
    } else if (legalModal.type === 'support') {
      title = 'Central de Suporte DYARTE OPTIMIZER';
      content = (
        <div className="space-y-4 text-xs text-zinc-300 leading-relaxed font-sans">
          <p>
            Nossa equipe técnica especializada em otimização de Windows está disponível para tirar
            dúvidas, auxiliar na ativação de chaves e fornecer suporte em jogos específicos.
          </p>
          <div className="p-4 rounded-xl bg-[#09090d] border border-zinc-800 space-y-3 font-mono">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-[#FF4444]" />
              <div>
                <span className="text-zinc-500 block text-[10px]">E-MAIL OFICIAL:</span>
                <span className="text-white font-bold">{config.support_email}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-zinc-500 block text-[10px]">COMUNIDADE VIP:</span>
                <span className="text-white font-bold">{config.discord_url}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-zinc-500 block text-[10px]">HORÁRIO DE ATENDIMENTO:</span>
                <span className="text-white">Segunda a Sábado, das 09h às 21h (Horário de Brasília)</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <div className="w-full max-w-xl rounded-2xl bg-[#121219] border border-[#2c2c3d] p-6 shadow-2xl space-y-5 relative max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-base font-bold text-white font-mono uppercase">{title}</h3>
            <button
              onClick={closeLegalModal}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto pr-2 flex-1">{content}</div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end">
            <button
              onClick={closeLegalModal}
              className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderUpgradeModal()}
      {renderLegalModal()}
      <EditHardwareModal />
      <SafetyLockModal />
      <DriverPipelineModal />
      <PlanExecutionModal />
    </>
  );
};
