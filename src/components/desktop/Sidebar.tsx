import React from 'react';
import { useApp, NavView } from '../../context/AppContext';
import {
  LayoutDashboard,
  Zap,
  Trash2,
  Gem,
  UserCircle2,
  Settings,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { DyarteLogo } from '../common/DyarteLogo';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    currentUser,
    logout,
    openLegalModal,
    t,
  } = useApp();

  const navItems: {
    id: NavView;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: t('nav_dashboard'),
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'optimization',
      label: t('nav_optimization'),
      icon: <Zap className="w-4 h-4 text-[#FF3333]" />,
    },
    {
      id: 'cleanup',
      label: t('nav_cleanup'),
      icon: <Trash2 className="w-4 h-4 text-purple-400" />,
    },
    {
      id: 'plans',
      label: t('nav_plans'),
      icon: <Gem className="w-4 h-4 text-rose-400" />,
    },
    {
      id: 'profile',
      label: t('nav_profile'),
      icon: <UserCircle2 className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: t('nav_settings'),
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'admin',
      label: t('nav_admin'),
      icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
      badge: 'ADMIN',
      adminOnly: true,
    },
  ];

  return (
    <aside className="w-60 bg-[#0c0c10] border-r border-[#1c1c24] flex flex-col justify-between shrink-0 select-none z-20 h-full">
      {/* Brand & Top Info */}
      <div className="flex flex-col">
        <div className="p-4 border-b border-[#181822] flex items-center justify-start">
          <DyarteLogo size="md" subtitle="OPTIMIZER PRO" />
        </div>

        {/* Navigation list */}
        <nav className="p-2.5 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
            Navegação Principal
          </div>

          {navItems.map((item) => {
            if (item.adminOnly && currentUser?.role !== 'ADMIN') {
              // Still show with a subtle lock or indicator if wanted, or skip
              return null;
            }

            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-[#E00000] text-white shadow-[0_0_12px_rgba(224,0,0,0.4)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-[#15151d]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                      isActive
                        ? 'bg-black/40 text-white'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: User Card & Active Plan Strip */}
      <div className="p-3 border-t border-[#181822] space-y-2.5">
        {currentUser ? (
          <>
            {/* Plan Badge Card */}
            <div
              onClick={() => setCurrentView('plans')}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer group ${
                (currentUser.nivel_plano ?? 1) === 1
                  ? 'bg-[#14141c] border-emerald-500/30 hover:border-emerald-500/60'
                  : 'bg-[#14141c] border-[#232330] hover:border-[#E00000]/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[10px] font-mono font-bold tracking-wider uppercase ${
                    (currentUser.nivel_plano ?? 1) === 1 ? 'text-emerald-400' : 'text-[#FF4444]'
                  }`}
                >
                  {`PLANO ${currentUser.plano_atual || 'BÁSICO'}`}
                </span>
                {(currentUser.nivel_plano ?? 1) === 1 ? (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40 font-semibold">
                    GRATUITO
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    SINCRONIZADO
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                {(currentUser.nivel_plano ?? 1) === 1 ? (
                  <span className="text-zinc-400 group-hover:text-emerald-300 transition-colors">
                    Plano Básico Ativo • Upgrade
                  </span>
                ) : (
                  <>
                    Válido até:{' '}
                    <span className="text-zinc-200 font-mono">{currentUser.data_expiracao}</span>
                  </>
                )}
              </p>
            </div>

            {/* User Quick Strip */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#0e0e13]">
              <div
                onClick={() => setCurrentView('profile')}
                className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="w-7 h-7 rounded-full bg-[#E00000]/20 border border-[#E00000]/50 flex items-center justify-center text-xs font-bold text-white shrink-0 font-mono">
                  {currentUser.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{currentUser.nome}</p>
                  <p className="text-[10px] text-zinc-500 truncate font-mono">
                    {currentUser.role === 'ADMIN' ? 'Administrador' : currentUser.email}
                  </p>
                </div>
              </div>

              <button
                onClick={logout}
                className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-colors shrink-0 cursor-pointer"
                title="Sair da Conta"
                aria-label="Sair da Conta"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 text-center">Nenhum usuário conectado</p>
          </div>
        )}

        {/* Legal links */}
        <div className="flex items-center justify-center gap-3 text-[10px] text-zinc-600 font-mono pt-1">
          <button
            onClick={() => openLegalModal('terms')}
            className="hover:text-zinc-300 transition-colors"
          >
            Termos
          </button>
          <span>•</span>
          <button
            onClick={() => openLegalModal('privacy')}
            className="hover:text-zinc-300 transition-colors"
          >
            Privacidade
          </button>
          <span>•</span>
          <button
            onClick={() => openLegalModal('support')}
            className="hover:text-zinc-300 transition-colors"
          >
            Suporte
          </button>
        </div>
      </div>
    </aside>
  );
};
