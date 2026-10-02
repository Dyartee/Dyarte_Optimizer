import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  Lock,
  Mail,
  ArrowRight,
  Globe,
  ExternalLink,
} from 'lucide-react';

export const AuthView: React.FC = () => {
  const {
    login,
    loginWithGoogle,
    requestPasswordReset,
    openLegalModal,
    addToast,
  } = useApp();

  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  // Login Form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot Password Form
  const [forgotEmail, setForgotEmail] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string>('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!loginEmail || !loginPassword) {
      setAuthError('Informe seu e-mail e senha cadastrados.');
      addToast('error', 'Campos Obrigatórios', 'Informe seu e-mail e senha.');
      return;
    }

    setIsLoading(true);
    const result = await login(loginEmail, loginPassword);
    setIsLoading(false);
    if (!result.success && result.error) {
      setAuthError(result.error);
      addToast('error', 'Falha no Acesso', result.error);
    }
  };

  const handleCreateAccountClick = () => {
    // Redireciona o usuário para o menu de criação de conta no site oficial
    const websiteRegisterUrl = 'https://dyarte.com/criar-conta';
    try {
      window.open(websiteRegisterUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignora restrições de popups
    }
    addToast(
      'info',
      'Criação de Conta no Site',
      'Redirecionando para o menu de criação de conta no site oficial do DYARTE OPTIMIZER.'
    );
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeEmail = (forgotEmail || '').trim();
    if (!safeEmail) {
      addToast('error', 'E-mail Obrigatório', 'Informe o e-mail cadastrado no site.');
      return;
    }
    setIsLoading(true);
    const result = await requestPasswordReset(safeEmail);
    setIsLoading(false);
    if (result.success) {
      addToast('success', 'Instruções Enviadas', result.message);
      setMode('login');
    } else {
      addToast('error', 'Falha na Recuperação', result.message);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center items-center p-6 bg-gradient-to-b from-[#08080c] via-[#0b0b10] to-[#07070a]">
      {/* Background ambient lighting */}
      <div className="w-full max-w-md space-y-5 relative">
        <div className="absolute -top-12 -left-12 w-64 h-64 bg-[#E00000]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#E00000] text-white shadow-[0_0_25px_rgba(224,0,0,0.5)] mb-1">
            <Zap className="w-8 h-8 fill-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white font-mono uppercase">
            DYARTE OPTIMIZER
          </h1>
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">
            SOFTWARE DE OTIMIZAÇÃO PROFISSIONAL PARA WINDOWS
          </p>
        </div>

        {/* Sync Badge Info */}
        <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[#12121a] border border-[#20202e] text-center shadow-md">
          <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-[11px] text-zinc-300 font-mono">
            <span className="text-white font-semibold">Autenticação Oficial:</span> Planos vinculados à sua conta no site, sincronizados em tempo real.
          </p>
        </div>

        {/* Main Card */}
        <div className="p-6 md:p-8 rounded-2xl bg-[#111118] border border-[#232332] shadow-2xl relative z-10 space-y-5">
          {/* Options: ENTRAR NA CONTA e CRIAR CONTA */}
          {mode !== 'forgot' && (
            <div className="flex rounded-xl bg-[#09090d] p-1 border border-[#1e1e2b]">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#E00000] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                ENTRAR NA CONTA
              </button>
              <button
                type="button"
                onClick={handleCreateAccountClick}
                className="flex-1 py-2.5 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800/50 flex items-center justify-center gap-1.5"
                title="Criar conta no site oficial do DYARTE OPTIMIZER"
              >
                <span>CRIAR CONTA</span>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-mono space-y-1 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-red-400 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Aviso de Autenticação
                  </div>
                  <p className="leading-relaxed">{authError}</p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1.5">
                  E-mail Cadastrado no Site:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09090d] border border-[#262635] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#E00000]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">Senha da Conta:</label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setMode('forgot');
                    }}
                    className="text-[11px] font-mono text-[#FF5555] hover:underline cursor-pointer"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09090d] border border-[#262635] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#E00000]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(224,0,0,0.4)] disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>ENTRAR NA CONTA</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-800"></div>
                <span className="flex-shrink mx-3 text-[10px] font-mono text-zinc-500 uppercase">ou acesse com</span>
                <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setAuthError('');
                  setIsLoading(true);
                  const res = await loginWithGoogle();
                  setIsLoading(false);
                  if (!res.success && res.error) {
                    setAuthError(res.error);
                    addToast('error', 'Falha com Google', res.error);
                  }
                }}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-[#12121b] hover:bg-[#1a1a26] border border-zinc-700/80 text-white text-xs font-mono font-medium transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                  <path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
                  <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
                </svg>
                <span>Continuar com Google (Gmail)</span>
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-sm font-bold text-white font-mono uppercase">
                  Recuperação de Acesso
                </h3>
                <p className="text-xs text-zinc-400">
                  Informe o e-mail cadastrado na sua conta do site para redefinir sua senha.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1">
                  E-mail Cadastrado:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09090d] border border-[#262635] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#E00000]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Enviar Link de Redefinição
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full py-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer text-center block"
              >
                Voltar para o Login
              </button>
            </form>
          )}
        </div>

        {/* Legal Links Footer */}
        <div className="flex items-center justify-center gap-4 text-xs font-mono text-zinc-500">
          <button
            onClick={() => openLegalModal('terms')}
            className="hover:text-zinc-300 cursor-pointer transition-colors"
          >
            Termos de Uso
          </button>
          <span>•</span>
          <button
            onClick={() => openLegalModal('privacy')}
            className="hover:text-zinc-300 cursor-pointer transition-colors"
          >
            Privacidade
          </button>
          <span>•</span>
          <button
            onClick={() => openLegalModal('support')}
            className="hover:text-zinc-300 cursor-pointer transition-colors"
          >
            Suporte Oficial
          </button>
        </div>
      </div>
    </div>
  );
};
