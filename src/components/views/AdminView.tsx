import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { auth } from '../../lib/firebase';
import { PlanId, Tool, ToolCategory, PlanLevel, User, License } from '../../types';
import {
  Users,
  KeyRound,
  ShoppingBag,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Wrench,
  Gem,
  Link,
  FileText,
  Lock,
  Unlock,
  Sliders,
  DollarSign,
  AlertTriangle,
  Play,
  ExternalLink,
  HardDrive,
  Check,
  Save,
  Cpu,
  Layers,
  Database,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  const {
    currentUser,
    users,
    plans,
    licenses,
    tools,
    adminLogs,
    config,
    adminUpdateConfig,
    executeOptimizationTool,
    executeDriverPipeline,
    isOptimizing,
    activeOptimizingToolId,
    updateUserPlan,
    toggleUserAccountStatus,
    adminCreateLicense,
    adminRevokeLicense,
    adminSuspendLicense,
    adminReactivateLicense,
    adminUpdateLicenseExpiry,
    adminUpdatePlanPrice,
    adminTogglePlanStatus,
    adminUpdateTool,
    adminToggleToolStatus,
    adminAddTool,
    deleteUserAccount,
    addToast,
    getToolName,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<
    'users' | 'plans' | 'licenses' | 'tools' | 'logs' | 'gpu_drivers'
  >('users');

  // Deletion modal state for users
  const [userPendingDelete, setUserPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Real database captured states
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [dbLicenses, setDbLicenses] = useState<License[]>([]);
  const [dbStats, setDbStats] = useState<{
    totalUsers: number;
    activeLicenses: number;
    paidUsers: number;
    monthlyRevenue: number;
  } | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [lastDbSyncTime, setLastDbSyncTime] = useState<string>('Recém sincronizado');

  // Load real data from backend API / Firestore
  const loadRealDataFromDb = useCallback(async () => {
    setIsLoadingDb(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [usersRes, licRes, statsRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/licenses', { headers }),
        fetch('/api/admin/stats', { headers }),
      ]);

      if (usersRes.ok) {
        const uData = await usersRes.json();
        if (Array.isArray(uData.users) && uData.users.length > 0) {
          setDbUsers(uData.users);
        }
      }

      if (licRes.ok) {
        const lData = await licRes.json();
        if (Array.isArray(lData.licenses) && lData.licenses.length > 0) {
          setDbLicenses(lData.licenses);
        }
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        setDbStats(sData);
      }

      const now = new Date();
      setLastDbSyncTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    } catch (err) {
      console.warn('Sincronização com o banco administrativo:', err);
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  useEffect(() => {
    loadRealDataFromDb();
  }, [loadRealDataFromDb]);

  // Use real database data if available, otherwise context data
  const effectiveUsers = dbUsers.length > 0 ? dbUsers : users;
  const effectiveLicenses = dbLicenses.length > 0 ? dbLicenses : licenses;

  // External GPU Drive URLs configuration state
  const [amdDriveUrl, setAmdDriveUrl] = useState(config.amd_driver_drive_url || '');
  const [nvidiaDriveUrl, setNvidiaDriveUrl] = useState(config.nvidia_driver_drive_url || '');
  const [savedAmdSuccess, setSavedAmdSuccess] = useState(false);
  const [savedNvidiaSuccess, setSavedNvidiaSuccess] = useState(false);

  // Sync state if config changes externally
  React.useEffect(() => {
    if (config.amd_driver_drive_url !== undefined) {
      setAmdDriveUrl(config.amd_driver_drive_url);
    }
  }, [config.amd_driver_drive_url]);

  React.useEffect(() => {
    if (config.nvidia_driver_drive_url !== undefined) {
      setNvidiaDriveUrl(config.nvidia_driver_drive_url);
    }
  }, [config.nvidia_driver_drive_url]);

  const handleSaveAmdUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    adminUpdateConfig({ amd_driver_drive_url: amdDriveUrl.trim() });
    setSavedAmdSuccess(true);
    setTimeout(() => setSavedAmdSuccess(false), 2500);
  };

  const handleSaveNvidiaUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    adminUpdateConfig({ nvidia_driver_drive_url: nvidiaDriveUrl.trim() });
    setSavedNvidiaSuccess(true);
    setTimeout(() => setSavedNvidiaSuccess(false), 2500);
  };

  // Search in users
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserForAction, setSelectedUserForAction] = useState<string | null>(null);

  // New License Modal State
  const [isCreatingLicense, setIsCreatingLicense] = useState(false);
  const [newLicUserId, setNewLicUserId] = useState(effectiveUsers[0]?.user_id || '');
  const [newLicPlanId, setNewLicPlanId] = useState<PlanId>('completo');
  const [newLicDays, setNewLicDays] = useState(30);

  // Edit Plan Price State
  const [editingPlanId, setEditingPlanId] = useState<PlanId | null>(null);
  const [newPriceVal, setNewPriceVal] = useState<number>(0);

  // Create Tool State
  const [isCreatingTool, setIsCreatingTool] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolCat, setNewToolCat] = useState<ToolCategory>('SISTEMA');
  const [newToolLevel, setNewToolLevel] = useState<PlanLevel>(1);
  const [newToolImpact, setNewToolImpact] = useState<'Médio' | 'Alto' | 'Máximo'>('Médio');

  // Security gate - Admin account check (Section 39)
  const isMasterAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  if (!isMasterAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 text-center rounded-2xl bg-[#140e0e] border border-[#3d1a1a] p-8 space-y-4">
        <ShieldAlert className="w-12 h-12 text-[#FF3333] mx-auto" />
        <h2 className="text-xl font-bold text-white font-mono uppercase">
          Acesso Restrito ao Painel Administrativo
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Somente contas com privilégios de Administrador autorizadas
          possuem privilégios de acesso ao gerenciamento de clientes, planos, licenças e logs do sistema.
        </p>
        <p className="text-[11px] text-zinc-500 font-mono">
          Autentique-se com a conta de Administrador oficial no menu de acesso.
        </p>
      </div>
    );
  }

  const filteredUsers = effectiveUsers.filter(
    (u) =>
      u.nome.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.user_id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const realActiveLicensesCount = dbStats?.activeLicenses ?? effectiveLicenses.filter((l) => l.status === 'ATIVA').length;
  const realTotalUsersCount = dbStats?.totalUsers ?? effectiveUsers.length;
  const realPaidUsersCount = dbStats?.paidUsers ?? effectiveUsers.filter((u) => Number(u.nivel_plano) > 1 && u.status_plano === 'ATIVO').length;
  const realMonthlyRevenue = dbStats?.monthlyRevenue ?? effectiveUsers.reduce((acc, u) => {
    if (u.status_plano === 'ATIVO') {
      const lvl = Number(u.nivel_plano);
      if (lvl === 2) return acc + 30;
      if (lvl === 3) return acc + 45;
      if (lvl === 4) return acc + 60;
    }
    return acc;
  }, 0);

  // Real Database Update Handlers
  const handleUpdateUserPlan = async (userId: string, newPlanId: PlanId) => {
    const targetPlan = plans.find((p) => p.id === newPlanId);
    if (!targetPlan) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/user/plan', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_user_id: userId,
          plan_name: targetPlan.name,
          plan_level: targetPlan.level,
        }),
      });

      if (res.ok) {
        addToast('success', 'Plano Atualizado no Banco', `Usuário alterado para ${targetPlan.name}.`);
      } else {
        updateUserPlan(userId, newPlanId);
      }
    } catch {
      updateUserPlan(userId, newPlanId);
    }
    await loadRealDataFromDb();
  };

  const handleToggleUserAccountStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/user/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_user_id: userId,
          status: nextStatus,
        }),
      });

      if (res.ok) {
        addToast('info', 'Status Atualizado no Banco', `Usuário ${nextStatus === 'BLOQUEADO' ? 'bloqueado' : 'desbloqueado'}.`);
      } else {
        toggleUserAccountStatus(userId);
      }
    } catch {
      toggleUserAccountStatus(userId);
    }
    await loadRealDataFromDb();
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setUserPendingDelete({ id: userId, name: userName });
  };

  const confirmDeleteUser = async () => {
    if (!userPendingDelete) return;
    const { id: userId, name: userName } = userPendingDelete;
    setIsDeletingUser(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/admin/user/${userId}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        addToast('success', 'Conta Excluída', `A conta de ${userName} foi removida com sucesso.`);
      } else {
        const data = await res.json().catch(() => ({}));
        addToast('info', 'Conta Removida', data.error || `A conta de ${userName} foi removida.`);
      }
    } catch {
      addToast('info', 'Conta Removida', `A conta de ${userName} foi removida localmente.`);
    } finally {
      deleteUserAccount(userId);
      setDbUsers((prev) => prev.filter((u) => u.user_id !== userId));
      setIsDeletingUser(false);
      setUserPendingDelete(null);
      await loadRealDataFromDb();
    }
  };

  const handleCreateLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/license/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'CREATE',
          user_id: newLicUserId,
          plan_id: newLicPlanId,
        }),
      });

      if (res.ok) {
        addToast('success', 'Licença Criada no Banco', 'Nova chave registrada no banco oficial.');
      } else {
        adminCreateLicense(newLicUserId, newLicPlanId, newLicDays);
      }
    } catch {
      adminCreateLicense(newLicUserId, newLicPlanId, newLicDays);
    }
    setIsCreatingLicense(false);
    await loadRealDataFromDb();
  };

  const handleSuspendLicense = async (licId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/admin/license/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'SUSPEND', license_id: licId }),
      });
    } catch (e) {
      console.warn(e);
    }
    adminSuspendLicense(licId);
    await loadRealDataFromDb();
  };

  const handleReactivateLicense = async (licId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/admin/license/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'REACTIVATE', license_id: licId }),
      });
    } catch (e) {
      console.warn(e);
    }
    adminReactivateLicense(licId);
    await loadRealDataFromDb();
  };

  const handleRevokeLicense = async (licId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/admin/license/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'REVOKE', license_id: licId }),
      });
    } catch (e) {
      console.warn(e);
    }
    adminRevokeLicense(licId);
    await loadRealDataFromDb();
  };

  const handleCreateToolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeToolName = (newToolName || '').trim();
    if (!safeToolName) return;

    const tool: Tool = {
      tool_id: `tool_custom_${Date.now()}`,
      nome: safeToolName,
      descricao: (newToolDesc || '').trim() || 'Otimização avançada personalizada.',
      categoria: newToolCat,
      required_plan_level: newToolLevel,
      status: 'ATIVO',
      icon: 'Sliders',
      impact: newToolImpact,
      details: 'Rotina injetada via painel administrativo DYARTE.',
      risk_level: 'SAFE',
      is_reversible: true,
      implementation_status: 'NOT_IMPLEMENTED',
    };

    adminAddTool(tool);
    setIsCreatingTool(false);
    setNewToolName('');
    setNewToolDesc('');
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Admin Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">
              DYARTE ADMIN CONTROL PANEL
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
              ROOT ACCESS
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
              <Database className="w-2.5 h-2.5" />
              FIRESTORE REAL-TIME
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Gestão centralizada com captação direta do banco de dados (clientes, licenças, planos e auditoria).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadRealDataFromDb}
            disabled={isLoadingDb}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 flex items-center gap-2 cursor-pointer transition-colors"
            title="Atualizar dados reais do banco de dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
            <span>{isLoadingDb ? 'Sincronizando...' : `Atualizar Banco (${lastDbSyncTime})`}</span>
          </button>
        </div>
      </div>

      {/* Top 3 Metric Cards - Real Data from Database */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-[#121218] border border-[#222230] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
              USUÁRIOS NO BANCO
            </span>
            <span className="text-3xl font-extrabold text-white font-mono">
              {realTotalUsersCount}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono block mt-1">
              {realPaidUsersCount} clientes com plano ativo
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-950/60 border border-blue-700/50 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#121218] border border-[#222230] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
              LICENÇAS ATIVAS
            </span>
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">
              {realActiveLicensesCount}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono block mt-1">
              {effectiveLicenses.length} licenças no registro
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#121218] border border-[#222230] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
              RECEITA MENSAL ATIVA
            </span>
            <span className="text-3xl font-extrabold text-[#FF4444] font-mono">
              R$ {realMonthlyRevenue.toFixed(2)}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono block mt-1">
              Calculado sobre planos vigentes
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-[#E00000]/50 flex items-center justify-center text-[#FF4444]">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#111117] border border-[#21212d] overflow-x-auto">
        <button
          onClick={() => setActiveAdminTab('users')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'users'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          [ USUÁRIOS ]
        </button>

        <button
          onClick={() => setActiveAdminTab('plans')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'plans'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          [ PLANOS ]
        </button>

        <button
          onClick={() => setActiveAdminTab('licenses')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'licenses'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          [ LICENÇAS ]
        </button>

        <button
          onClick={() => setActiveAdminTab('tools')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'tools'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          [ FERRAMENTAS ]
        </button>

        <button
          onClick={() => setActiveAdminTab('gpu_drivers')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeAdminTab === 'gpu_drivers'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>[ DRIVERS & LINKS GPU ]</span>
        </button>

        <button
          onClick={() => setActiveAdminTab('logs')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
            activeAdminTab === 'logs'
              ? 'bg-[#E00000] text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          [ LOGS ADMINISTRATIVOS ]
        </button>
      </div>

      {/* TAB CONTENT: USUÁRIOS */}
      {activeAdminTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-[#111117] border border-[#21212d]">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Pesquisar por nome, email ou ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#09090d] border border-[#262635] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E00000]"
              />
            </div>
            <span className="text-xs font-mono text-zinc-400">
              Exibindo {filteredUsers.length} usuários
            </span>
          </div>

          <div className="rounded-xl border border-[#21212d] bg-[#111117] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#21212d] bg-[#0c0c11] text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                    <th className="p-3 pl-4">Usuário</th>
                    <th className="p-3">Plano Atual</th>
                    <th className="p-3">Expiração</th>
                    <th className="p-3">Dispositivo</th>
                    <th className="p-3">Status Conta</th>
                    <th className="p-3 text-right pr-4">Ações Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c28]">
                  {filteredUsers.map((user) => {
                    return (
                      <tr key={user.user_id} className="hover:bg-[#15151f] transition-colors">
                        <td className="p-3 pl-4">
                          <p className="font-bold text-white">{user.nome}</p>
                          <p className="text-[11px] text-zinc-400 font-mono">{user.email}</p>
                          <span className="text-[9px] text-zinc-600 font-mono">{user.user_id}</span>
                        </td>

                        <td className="p-3">
                          <select
                            value={user.plano_atual.toLowerCase()}
                            onChange={(e) =>
                              handleUpdateUserPlan(user.user_id, e.target.value as PlanId)
                            }
                            className="px-2 py-1 rounded bg-[#09090d] border border-[#29293a] text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#E00000] cursor-pointer"
                          >
                            <option value="basico">Plano Básico (Lv 1)</option>
                            <option value="medio">Plano Médio (Lv 2)</option>
                            <option value="avancado">Plano Avançado (Lv 3)</option>
                            <option value="completo">Plano Completo (Lv 4)</option>
                          </select>
                        </td>

                        <td className="p-3 font-mono text-zinc-300">{user.data_expiracao}</td>

                        <td className="p-3 font-mono text-zinc-400 text-[11px] truncate max-w-[140px]">
                          {user.device_id}
                        </td>

                        <td className="p-3">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              user.status === 'ATIVO'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                                : 'bg-red-950 text-red-400 border border-red-800/40'
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>

                        <td className="p-3 text-right pr-4 space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleUserAccountStatus(user.user_id, user.status)}
                            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                              user.status === 'ATIVO'
                                ? 'bg-amber-950/40 hover:bg-amber-950 text-amber-400 border border-amber-800/40'
                                : 'bg-emerald-950/50 hover:bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                            }`}
                          >
                            {user.status === 'ATIVO' ? 'Bloquear' : 'Desbloquear'}
                          </button>
                          {user.role !== 'ADMIN' && user.user_id !== currentUser?.user_id && (
                            <button
                              onClick={() => handleDeleteUser(user.user_id, user.nome)}
                              className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-red-950/50 hover:bg-red-950 text-red-400 border border-red-800/50 transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Remover conta permanentemente"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Excluir</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PLANOS */}
      {activeAdminTab === 'plans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="p-5 rounded-xl bg-[#121218] border border-[#21212e] flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white font-mono uppercase">
                      {plan.name}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      Nível {plan.level}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{plan.description}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-mono">Preço Atual:</span>
                    <span className="text-base font-bold text-white font-mono">
                      R$ {plan.price.toFixed(2)}
                    </span>
                  </div>

                  {editingPlanId === plan.id ? (
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="number"
                        step="0.50"
                        value={newPriceVal}
                        onChange={(e) => setNewPriceVal(parseFloat(e.target.value))}
                        className="w-full px-2 py-1 rounded bg-black border border-zinc-700 text-xs text-white font-mono"
                      />
                      <button
                        onClick={() => {
                          adminUpdatePlanPrice(plan.id, newPriceVal);
                          setEditingPlanId(null);
                        }}
                        className="px-2.5 py-1 rounded bg-[#E00000] text-white text-xs font-mono font-bold cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPlanId(plan.id);
                        setNewPriceVal(plan.price);
                      }}
                      className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
                    >
                      Alterar Preço
                    </button>
                  )}

                  <button
                    onClick={() => adminTogglePlanStatus(plan.id)}
                    className="w-full py-1.5 rounded-lg bg-[#181822] hover:bg-[#202030] text-[11px] font-mono text-zinc-400 transition-colors cursor-pointer"
                  >
                    Status: {plan.active ? 'Ativo na Loja' : 'Inativo na Loja'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: LICENÇAS */}
      {activeAdminTab === 'licenses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#111117] border border-[#21212d]">
            <span className="text-xs font-mono text-zinc-400">
              Total de {licenses.length} chaves emitidas
            </span>
            <button
              onClick={() => setIsCreatingLicense(true)}
              className="px-4 py-1.5 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Gerar Nova Licença</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#21212d] bg-[#111117] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#21212d] bg-[#0c0c11] text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                    <th className="p-3 pl-4">Chave de Licença</th>
                    <th className="p-3">Usuário Associado</th>
                    <th className="p-3">Plano</th>
                    <th className="p-3">Validade</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Gerenciar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c28]">
                  {effectiveLicenses.map((lic) => {
                    return (
                      <tr key={lic.license_id} className="hover:bg-[#15151f] transition-colors">
                        <td className="p-3 pl-4 font-mono font-bold text-white">
                          {lic.license_key}
                          <span className="text-[9px] text-zinc-600 block font-normal">
                            {lic.license_id}
                          </span>
                        </td>
                        <td className="p-3">
                          <p className="font-semibold text-zinc-200">{lic.user_name}</p>
                          <p className="text-[11px] text-zinc-400 font-mono">{lic.user_email}</p>
                        </td>
                        <td className="p-3 font-mono uppercase font-bold text-[#FF4444]">
                          {lic.plan_id}
                        </td>
                        <td className="p-3 font-mono text-zinc-300">{lic.expires_at}</td>
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              lic.status === 'ATIVA'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                                : lic.status === 'SUSPENSA'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                                : 'bg-red-950 text-red-400 border border-red-800/40'
                            }`}
                          >
                            {lic.status}
                          </span>
                        </td>
                        <td className="p-3 text-right pr-4 space-x-2">
                          {lic.status === 'ATIVA' ? (
                            <button
                              onClick={() => handleSuspendLicense(lic.license_id)}
                              className="px-2 py-1 rounded bg-amber-950/50 hover:bg-amber-950 text-amber-300 text-[11px] font-mono cursor-pointer"
                            >
                              Suspender
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivateLicense(lic.license_id)}
                              className="px-2 py-1 rounded bg-emerald-950/50 hover:bg-emerald-950 text-emerald-300 text-[11px] font-mono cursor-pointer"
                            >
                              Reativar
                            </button>
                          )}
                          <button
                            onClick={() => handleRevokeLicense(lic.license_id)}
                            className="px-2 py-1 rounded bg-red-950/50 hover:bg-red-950 text-red-400 text-[11px] font-mono cursor-pointer"
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: FERRAMENTAS */}
      {activeAdminTab === 'tools' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#111117] border border-[#21212d]">
            <span className="text-xs font-mono text-zinc-400">
              Total de {tools.length} ferramentas de otimização
            </span>
            <button
              onClick={() => setIsCreatingTool(true)}
              className="px-4 py-1.5 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Ferramenta</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#21212d] bg-[#111117] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#21212d] bg-[#0c0c11] text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                    <th className="p-3 pl-4">Ferramenta</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Plano Mínimo</th>
                    <th className="p-3">Impacto</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c28]">
                  {tools.map((tool) => (
                    <tr key={tool.tool_id} className="hover:bg-[#15151f] transition-colors">
                      <td className="p-3 pl-4 font-semibold text-white">
                        {getToolName(tool)}
                        <span className="text-[10px] text-zinc-500 block font-normal capitalize">
                          {tool.tool_id.replace(/^tool_/, '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-zinc-400">{tool.categoria}</td>
                      <td className="p-3">
                        <select
                          value={tool.required_plan_level}
                          onChange={(e) =>
                            adminUpdateTool(tool.tool_id, {
                              required_plan_level: parseInt(e.target.value) as PlanLevel,
                            })
                          }
                          className="px-2 py-1 rounded bg-[#09090d] border border-zinc-700 text-xs font-mono text-white cursor-pointer"
                        >
                          <option value="1">Nível 1 (Básico)</option>
                          <option value="2">Nível 2 (Médio)</option>
                          <option value="3">Nível 3 (Avançado)</option>
                          <option value="4">Nível 4 (Completo)</option>
                        </select>
                      </td>
                      <td className="p-3 font-mono text-zinc-300">{tool.impact}</td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            tool.status === 'ATIVO'
                              ? 'bg-emerald-950 text-emerald-400'
                              : 'bg-red-950 text-red-400'
                          }`}
                        >
                          {tool.status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        <button
                          onClick={() => adminToggleToolStatus(tool.tool_id)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono cursor-pointer"
                        >
                          {tool.status === 'ATIVO' ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: LOGS ADMINISTRATIVOS */}
      {activeAdminTab === 'logs' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#21212d] bg-[#111117] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#21212d] bg-[#0c0c11] text-[10px] uppercase text-zinc-500 tracking-wider">
                    <th className="p-3 pl-4">Timestamp</th>
                    <th className="p-3">Ação</th>
                    <th className="p-3">Operador / Origem</th>
                    <th className="p-3">Alvo</th>
                    <th className="p-3 pr-4">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c28]">
                  {adminLogs.map((log) => (
                    <tr key={log.log_id} className="hover:bg-[#15151f] transition-colors">
                      <td className="p-3 pl-4 text-zinc-400">{log.timestamp}</td>
                      <td className="p-3 text-[#FF4444] font-bold">{log.action}</td>
                      <td className="p-3 text-zinc-300">{log.admin_name}</td>
                      <td className="p-3 text-zinc-400">{log.target_user || '-'}</td>
                      <td className="p-3 pr-4 text-zinc-300">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: DRIVERS & LINKS GPU (AMD & NVIDIA) */}
      {activeAdminTab === 'gpu_drivers' && (
        <div className="space-y-6">
          {/* Header Info Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#13131c] via-[#101016] to-[#181116] border border-[#2c222c] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-950/70 border border-[#E00000]/50 flex items-center justify-center text-[#FF4444]">
                <HardDrive className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                GERENCIAMENTO DE PACOTES DE DRIVERS DE VÍDEO (GOOGLE DRIVE)
              </h2>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-4xl">
              Configure abaixo os links externos de repositórios/pastas do Google Drive com as versões
              otimizadas e enxutas de drivers para <strong>AMD Radeon</strong> e <strong>NVIDIA GeForce</strong>.
              Os clientes com plano compatível poderão baixar estes pacotes ou aplicar as otimizações
              nativas diretamente na aba <strong>GPU</strong>. Como administrador, você também pode testar e
              acionar a execução imediata de cada otimizador pelos botões abaixo.
            </p>
          </div>

          {/* Grid: AMD and NVIDIA Configurations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AMD DRIVER OPTIMIZER CARD */}
            <div className="rounded-2xl bg-[#111015] border border-[#3b1c1c] p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#2d1919]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-700/60 flex items-center justify-center text-red-400 font-mono font-black text-sm shadow-md">
                    AMD
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white font-mono uppercase">
                        AMD DRIVER OPTIMIZED
                      </h3>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-500/20 text-red-300 border border-red-500/30 font-bold">
                        RADEON
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      tool_gpu_amd_driver • Nível 3 (Avançado)
                    </span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  ATIVO
                </span>
              </div>

              {/* Form Link Google Drive */}
              <form onSubmit={handleSaveAmdUrl} className="space-y-3">
                <div>
                  <label className="text-[11px] font-mono uppercase text-zinc-300 font-semibold block mb-1.5">
                    Link do Google Drive (Driver Otimizado AMD):
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={amdDriveUrl}
                      onChange={(e) => setAmdDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090d] border border-[#2d1d1d] focus:border-red-600 text-white font-mono text-xs focus:outline-none transition-all placeholder:text-zinc-600"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Link público do Google Drive com o instalador limpo dos drivers AMD Adrenalin.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-mono text-xs font-bold transition-all cursor-pointer shadow-md"
                    >
                      {savedAmdSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Salvo com Sucesso!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Link AMD</span>
                        </>
                      )}
                    </button>

                    {amdDriveUrl && (
                      <a
                        href={amdDriveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
                        title="Testar Link Externo"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Link</span>
                      </a>
                    )}
                  </div>
                </div>
              </form>

              {/* Technical Profile Details */}
              <div className="p-3.5 rounded-xl bg-[#0b0a0e] border border-[#241717] space-y-2 text-xs font-mono">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-bold">
                  Parâmetros Injetados no Registro:
                </span>
                <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside">
                  <li>Radeon Anti-Lag habilitado globalmente</li>
                  <li>Radeon Boost calibrado com dynamic resolution scale 83.3%</li>
                  <li>Tessellation Mode forçado para <strong>x8 / Application Controlled</strong></li>
                  <li>DXNavi / Shader Cache desativado de throttling e travado em disco rápido</li>
                </ul>
              </div>

              {/* Execute Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await executeDriverPipeline('AMD');
                  }}
                  disabled={isOptimizing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#B30000] to-[#E00000] hover:from-[#c50000] hover:to-[#ff1a1a] text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Play
                    className={`w-4 h-4 fill-white ${
                      isOptimizing && activeOptimizingToolId === 'tool_gpu_amd_driver'
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                  <span>
                    {isOptimizing && activeOptimizingToolId === 'tool_gpu_amd_driver'
                      ? 'Executando Otimização AMD...'
                      : 'Executar Otimizador AMD (Teste do Administrador)'}
                  </span>
                </button>
              </div>
            </div>

            {/* NVIDIA DRIVER OPTIMIZER CARD */}
            <div className="rounded-2xl bg-[#101311] border border-[#1c3320] p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#18291a]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-600/60 flex items-center justify-center text-emerald-400 font-mono font-black text-xs shadow-md">
                    NVIDIA
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white font-mono uppercase">
                        NVIDIA DRIVER OPTIMIZED
                      </h3>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        GEFORCE
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      tool_gpu_nvidia_driver • Nível 3 (Avançado)
                    </span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  ATIVO
                </span>
              </div>

              {/* Form Link Google Drive */}
              <form onSubmit={handleSaveNvidiaUrl} className="space-y-3">
                <div>
                  <label className="text-[11px] font-mono uppercase text-zinc-300 font-semibold block mb-1.5">
                    Link do Google Drive (Driver Otimizado NVIDIA):
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={nvidiaDriveUrl}
                      onChange={(e) => setNvidiaDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090c0a] border border-[#1d2d1f] focus:border-emerald-500 text-white font-mono text-xs focus:outline-none transition-all placeholder:text-zinc-600"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Link público do Google Drive com o instalador enxuto sem telemetria NVIDIA GeForce.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-xs font-bold transition-all cursor-pointer shadow-md"
                    >
                      {savedNvidiaSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Salvo com Sucesso!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Link NVIDIA</span>
                        </>
                      )}
                    </button>

                    {nvidiaDriveUrl && (
                      <a
                        href={nvidiaDriveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
                        title="Testar Link Externo"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Link</span>
                      </a>
                    )}
                  </div>
                </div>
              </form>

              {/* Technical Profile Details */}
              <div className="p-3.5 rounded-xl bg-[#0a0f0c] border border-[#162719] space-y-2 text-xs font-mono">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-bold">
                  Ajustes Nvidia Profile Inspector Aplicados:
                </span>
                <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside">
                  <li>Low Latency Mode forçado em <strong>Ultra (0x00000002)</strong></li>
                  <li>Power Management Mode: <strong>Prefer Maximum Performance</strong></li>
                  <li>Shader Cache Size: expandido para <strong>10 GB / Ilimitado</strong></li>
                  <li>Maximum Pre-rendered Frames: travado estritamente em <strong>1</strong></li>
                </ul>
              </div>

              {/* Execute Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await executeDriverPipeline('NVIDIA');
                  }}
                  disabled={isOptimizing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#0d6e32] to-[#16a34a] hover:from-[#13823d] hover:to-[#22c55e] text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Play
                    className={`w-4 h-4 fill-white ${
                      isOptimizing && activeOptimizingToolId === 'tool_gpu_nvidia_driver'
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                  <span>
                    {isOptimizing && activeOptimizingToolId === 'tool_gpu_nvidia_driver'
                      ? 'Executando Otimização NVIDIA...'
                      : 'Executar Otimizador NVIDIA (Teste do Administrador)'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick DDU Utility Card */}
          <div className="p-5 rounded-2xl bg-[#12121a] border border-[#222233] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white font-mono uppercase">
                  Limpeza Profunda de Drivers e Cache de Shaders (DDU Engine)
                </h4>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  UNIVERSAL
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                tool_gpu_clean_drivers • Remove vestígios residuais de registros e limpa cache de shaders para evitar stutters e conflitos.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await executeOptimizationTool('tool_gpu_clean_drivers');
              }}
              disabled={isOptimizing}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 border border-zinc-700 disabled:opacity-50"
            >
              <Play
                className={`w-3.5 h-3.5 fill-white ${
                  isOptimizing && activeOptimizingToolId === 'tool_gpu_clean_drivers'
                    ? 'animate-spin'
                    : ''
                }`}
              />
              <span>
                {isOptimizing && activeOptimizingToolId === 'tool_gpu_clean_drivers'
                  ? 'Executando Limpeza...'
                  : 'Executar Limpeza DDU'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: Gerar Licença Manual */}
      {isCreatingLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#14141d] border border-[#2c2c3d] p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white font-mono uppercase">
              Gerar Licença Digital Manual
            </h3>
            <form onSubmit={handleCreateLicenseSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-mono">Usuário Destino:</label>
                <select
                  value={newLicUserId}
                  onChange={(e) => setNewLicUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono"
                >
                  {users.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.nome} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-mono">Plano a Ativar:</label>
                <select
                  value={newLicPlanId}
                  onChange={(e) => setNewLicPlanId(e.target.value as PlanId)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono"
                >
                  <option value="basico">BÁSICO (R$ 20,00)</option>
                  <option value="medio">MÉDIO (R$ 30,00)</option>
                  <option value="avancado">AVANÇADO (R$ 45,00)</option>
                  <option value="completo">COMPLETO (R$ 60,00)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-mono">Duração (Dias):</label>
                <input
                  type="number"
                  value={newLicDays}
                  onChange={(e) => setNewLicDays(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingLicense(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-mono"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#E00000] text-white font-mono font-bold uppercase"
                >
                  Emitir Chave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Criar Nova Ferramenta */}
      {isCreatingTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-[#14141d] border border-[#2c2c3d] p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white font-mono uppercase">
              Cadastrar Nova Ferramenta de Otimização
            </h3>
            <form onSubmit={handleCreateToolSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-mono">Nome da Ferramenta:</label>
                <input
                  type="text"
                  required
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  placeholder="Ex: Afinamento de Buffer USB"
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-mono">Descrição:</label>
                <textarea
                  rows={2}
                  value={newToolDesc}
                  onChange={(e) => setNewToolDesc(e.target.value)}
                  placeholder="O que esta otimização faz..."
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-400 block mb-1 font-mono">Categoria:</label>
                  <select
                    value={newToolCat}
                    onChange={(e) => setNewToolCat(e.target.value as ToolCategory)}
                    className="w-full px-2 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono text-xs"
                  >
                    <option value="SISTEMA">SISTEMA</option>
                    <option value="DESEMPENHO">DESEMPENHO</option>
                    <option value="GAMING">GAMING</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1 font-mono">Plano Mínimo:</label>
                  <select
                    value={newToolLevel}
                    onChange={(e) => setNewToolLevel(parseInt(e.target.value) as PlanLevel)}
                    className="w-full px-2 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono text-xs"
                  >
                    <option value="1">1 (Básico)</option>
                    <option value="2">2 (Médio)</option>
                    <option value="3">3 (Avançado)</option>
                    <option value="4">4 (Completo)</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1 font-mono">Impacto:</label>
                  <select
                    value={newToolImpact}
                    onChange={(e) =>
                      setNewToolImpact(e.target.value as 'Médio' | 'Alto' | 'Máximo')
                    }
                    className="w-full px-2 py-2 rounded-lg bg-black border border-zinc-700 text-white font-mono text-xs"
                  >
                    <option value="Médio">Médio</option>
                    <option value="Alto">Alto</option>
                    <option value="Máximo">Máximo</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingTool(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-mono"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#E00000] text-white font-mono font-bold uppercase"
                >
                  Cadastrar Ferramenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO DE USUÁRIO */}
      {userPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#141010] border border-red-900/60 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-[#E00000]/60 flex items-center justify-center text-[#FF4444] shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-mono uppercase">
                  Excluir Conta Permanentemente
                </h3>
                <p className="text-xs text-zinc-400">Ação irreversível de administração</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Tem certeza que deseja remover permanentemente a conta de{' '}
              <strong className="text-white font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                {userPendingDelete.name}
              </strong>
              ? Todos os dados cadastrais, licenças emitidas e permissões vinculadas serão revogados do sistema.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserPendingDelete(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isDeletingUser}
                onClick={confirmDeleteUser}
                className="px-4 py-2 rounded-lg bg-[#E00000] hover:bg-[#c50000] text-white text-xs font-mono font-bold uppercase transition-all shadow-lg shadow-red-950/50 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeletingUser ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
