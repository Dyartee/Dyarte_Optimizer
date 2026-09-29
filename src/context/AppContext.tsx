import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Plan,
  Tool,
  License,
  OptimizationHistoryItem,
  DeviceInfo,
  AppConfig,
  AdminLog,
  PlanLevel,
  PlanId,
  LicenseStatus,
  DriverPipelineResult,
  DduStatus,
  DduPathResult,
  DduExecutionResult,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_PLANS,
  INITIAL_TOOLS,
  INITIAL_LICENSES,
  INITIAL_HISTORY,
  INITIAL_DEVICE,
  INITIAL_CONFIG,
  INITIAL_ADMIN_LOGS,
} from '../data/initialData';
import { detectFullComputerSpecs } from '../utils/hardwareDetection';
import { isDevFixturesEnabled } from '../data/devFixtures';
import { LanguageCode, translations } from '../i18n/translations';
import { auth, db, googleAuthProvider } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  signInWithPopup,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { agentBridge } from '../services/agentBridge';
import { optimizationEngine } from '../services/optimizationEngine';

export type NavView =
  | 'dashboard'
  | 'optimization'
  | 'plans'
  | 'computer'
  | 'history'
  | 'languages'
  | 'profile'
  | 'settings'
  | 'admin';

interface UpgradeModalData {
  isOpen: boolean;
  requiredLevel: PlanLevel;
  toolName: string;
  category?: string;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

export interface DriverPipelineStage {
  isOpen: boolean;
  brand: 'AMD' | 'NVIDIA';
  phase: 'preparing' | 'detecting' | 'locating' | 'executing' | 'completed' | 'failed';
  progress: number;
  downloadedMb?: number;
  totalMb?: number;
  speed?: string;
  actionText: string;
  logs: string[];
  installerFileName?: string;
  errorMessage?: string;
  folderPath?: string;
  detectedVendor?: string;
  gpuDetails?: string;
  fileSizeMb?: number;
  successMessage?: string;
}

interface AppContextType {
  // Navigation
  currentView: NavView;
  setCurrentView: (view: NavView) => void;

  // Web Synchronization
  isSyncingWithWeb: boolean;
  lastWebSync: string;
  syncWithWebsite: (targetEmail?: string) => Promise<{ success: boolean; message: string }>;
  webBrowserLoginSync: () => Promise<{ success: boolean; error?: string }>;

  // Auth & User
  currentUser: User | null;
  users: User[];
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  changePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    dataOrName:
      | {
          nome: string;
          email: string;
          senha: string;
          confirmacao?: string;
          termos?: boolean;
          privacidade?: boolean;
        }
      | string,
    email?: string,
    senha?: string,
    confirmacao?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUserRole: (role: 'USER' | 'ADMIN') => void;
  updateCurrentUserProfile: (updates: Partial<User>) => void;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;

  // Data
  plans: Plan[];
  tools: Tool[];
  licenses: License[];
  history: OptimizationHistoryItem[];
  device: DeviceInfo;
  config: AppConfig;
  adminLogs: AdminLog[];

  // Optimizations
  isOptimizing: boolean;
  activeOptimizingToolId: string | null;
  activeToolsState: Record<string, boolean>;
  isToolActive: (toolId: string) => boolean;
  toggleOptimizationTool: (
    toolId: string
  ) => Promise<{ success: boolean; message: string; active?: boolean }>;
  executeOptimizationTool: (toolId: string) => Promise<{ success: boolean; message: string }>;
  executeFullSystemOptimization: () => Promise<{ success: boolean; message: string }>;

  // Modals & Notices
  upgradeModal: UpgradeModalData;
  openUpgradeModal: (requiredLevel: PlanLevel, toolName: string, category?: string) => void;
  closeUpgradeModal: () => void;
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  removeToast: (id: string) => void;

  // Language & Internationalization
  currentLanguage: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
  getToolName: (tool: { tool_id: string; nome?: string; tool_name?: string }) => string;
  getToolDesc: (tool: { tool_id: string; descricao?: string }) => string;

  // Device & Agent
  toggleAgentConnection: () => void;
  testAgentConnection: () => Promise<{ success: boolean; agent_version?: string; request_id?: string; error?: string }>;
  refreshHardwareTelemetry: () => void;
  isHardwareDetecting: boolean;
  detectAndSetRealHardware: (silent?: boolean) => Promise<void>;
  updateHardwareSpecs: (specs: Partial<DeviceInfo>) => void;
  hardwareEditModalOpen: boolean;
  setHardwareEditModalOpen: (open: boolean) => void;

  // Manual License Activation
  activateLicenseKey: (key: string) => { success: boolean; message: string };

  // Admin Operations
  updateUserPlan: (userId: string, newPlanId: PlanId) => void;
  toggleUserAccountStatus: (userId: string) => void;
  deleteUserAccount: (userId: string) => void;
  adminCreateLicense: (userId: string, planId: PlanId, durationDays: number) => License;
  adminRevokeLicense: (licenseId: string) => void;
  adminSuspendLicense: (licenseId: string) => void;
  adminReactivateLicense: (licenseId: string) => void;
  adminUpdateLicenseExpiry: (licenseId: string, newDate: string) => void;
  adminUpdatePlanPrice: (planId: PlanId, newPrice: number) => void;
  adminUpdatePlanFeatures: (planId: PlanId, features: string[]) => void;
  adminTogglePlanStatus: (planId: PlanId) => void;
  adminUpdateTool: (toolId: string, updates: Partial<Tool>) => void;
  adminToggleToolStatus: (toolId: string) => void;
  adminAddTool: (tool: Tool) => void;
  adminUpdateConfig: (newConfig: Partial<AppConfig>) => void;
  adminProcessWebhookPayment: (payload: {
    email: string;
    plan_id: PlanId;
    transaction_id: string;
    amount: number;
  }) => { success: boolean; message: string; license_key?: string };

  // Legal Modals
  legalModal: { isOpen: boolean; type: 'terms' | 'privacy' | 'support' | 'about' };
  openLegalModal: (type: 'terms' | 'privacy' | 'support' | 'about') => void;
  closeLegalModal: () => void;

  // Security Lock (Revert to Windows Factory Defaults on uninstall or plan expiration)
  safetyLockActive: boolean;
  toggleSafetyLock: () => void;
  isRestoringDefaults: boolean;
  restoreWindowsFactoryDefaults: (reason?: string) => Promise<{ success: boolean; message: string }>;
  safetyModalOpen: boolean;
  setSafetyModalOpen: (open: boolean) => void;

  // Driver Pipeline (Download, Extract & Execute)
  driverPipeline: DriverPipelineStage | null;
  executeDriverPipeline: (brand: 'AMD' | 'NVIDIA') => Promise<DriverPipelineResult>;
  closeDriverPipeline: () => void;

  // DDU Dedicated Pipeline (Display Driver Uninstaller)
  dduInfo: DduPathResult | null;
  dduStatus: DduStatus | null;
  isDduRunning: boolean;
  checkDdu: () => Promise<DduPathResult>;
  executeDduPipeline: () => Promise<DduExecutionResult>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Stored state with local storage fallback
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('dyarte_users');
    const list: User[] = saved ? JSON.parse(saved) : INITIAL_USERS;
    return list.map((u) => {
      if (!u.nivel_plano || u.nivel_plano < 1) {
        return { ...u, nivel_plano: 1 as PlanLevel, plano_atual: 'BÁSICO', status_plano: 'ATIVO' };
      }
      return u;
    });
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('dyarte_current_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u) {
          if (!u.nivel_plano || u.nivel_plano < 1) {
            u.nivel_plano = 1;
            u.plano_atual = 'BÁSICO';
            u.status_plano = 'ATIVO';
          }
          return u;
        }
      } catch {
        // fallback
      }
    }
    return isDevFixturesEnabled() ? INITIAL_USERS[0] : null;
  });

  const [currentView, setCurrentView] = useState<NavView>(() => {
    const saved = localStorage.getItem('dyarte_current_view') as NavView | null;
    if (saved && saved !== 'history') {
      return saved;
    }
    return 'dashboard';
  });

  const handleSetCurrentView = (view: NavView) => {
    const target = view === 'history' ? 'dashboard' : view;
    setCurrentView(target);
    localStorage.setItem('dyarte_current_view', target);
  };

  const [plans, setPlans] = useState<Plan[]>(() => {
    const saved = localStorage.getItem('dyarte_plans');
    const loaded: Plan[] = saved ? JSON.parse(saved) : INITIAL_PLANS;
    const hasBasico = loaded.some((p) => p.id === 'basico');
    if (!hasBasico) {
      return INITIAL_PLANS;
    }
    return loaded;
  });

  const [tools, setTools] = useState<Tool[]>(() => {
    const saved = localStorage.getItem('dyarte_tools');
    if (saved) {
      try {
        const parsed: Tool[] = JSON.parse(saved);
        // Sanitize tool names and descriptions: repair any corrupted keys or underscores
        const sanitized = parsed.map((tool) => {
          const initial = INITIAL_TOOLS.find((it) => it.tool_id === tool.tool_id);
          const isBadName =
            !tool.nome ||
            tool.nome.includes('_') ||
            tool.nome.startsWith('tool_') ||
            tool.nome.endsWith('_name');
          const isBadDesc =
            !tool.descricao ||
            tool.descricao.includes('_desc') ||
            tool.descricao.startsWith('tool_');

          let cleanName =
            isBadName && initial
              ? initial.nome
              : (tool.nome && !tool.nome.includes('_') ? tool.nome : initial?.nome) ||
                tool.tool_id.replace(/^tool_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

          if (tool.tool_id === 'tool_gpu_amd_driver') {
            cleanName = 'AMD DRIVER OPTIMIZED';
          } else if (tool.tool_id === 'tool_gpu_nvidia_driver') {
            cleanName = 'NVIDIA DRIVER OPTIMIZED';
          }

          const cleanDesc =
            isBadDesc && initial
              ? initial.descricao
              : (tool.descricao && !tool.descricao.includes('_desc') ? tool.descricao : initial?.descricao) ||
                '';

          return {
            ...tool,
            nome: cleanName,
            descricao: cleanDesc,
          };
        });

        // Ensure all new tools (e.g. GPU section) are included even with old cache
        const missingTools = INITIAL_TOOLS.filter(
          (it) => !sanitized.some((st) => st.tool_id === it.tool_id)
        );
        const combined = [...sanitized, ...missingTools];
        localStorage.setItem('dyarte_tools', JSON.stringify(combined));
        return combined;
      } catch {
        return INITIAL_TOOLS;
      }
    }
    return INITIAL_TOOLS;
  });

  const [licenses, setLicenses] = useState<License[]>(() => {
    const saved = localStorage.getItem('dyarte_licenses');
    return saved ? JSON.parse(saved) : INITIAL_LICENSES;
  });

  const [history, setHistory] = useState<OptimizationHistoryItem[]>(() => {
    const saved = localStorage.getItem('dyarte_history');
    if (saved) {
      try {
        const parsed: OptimizationHistoryItem[] = JSON.parse(saved);
        return parsed.map((item) => {
          const initial = INITIAL_TOOLS.find((it) => it.tool_id === item.tool_id);
          const isBadName = !item.tool_name || item.tool_name.includes('_');
          return {
            ...item,
            tool_name:
              isBadName && initial
                ? initial.nome
                : (item.tool_name && !item.tool_name.includes('_')
                    ? item.tool_name
                    : (initial?.nome || item.tool_id.replace(/^tool_/, '').replace(/_/g, ' '))),
          };
        });
      } catch {
        return INITIAL_HISTORY;
      }
    }
    return INITIAL_HISTORY;
  });

  const [device, setDevice] = useState<DeviceInfo>(() => {
    const saved = localStorage.getItem('dyarte_device');
    return saved ? JSON.parse(saved) : INITIAL_DEVICE;
  });

  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('dyarte_config');
    return saved ? JSON.parse(saved) : INITIAL_CONFIG;
  });

  const [adminLogs, setAdminLogs] = useState<AdminLog[]>(() => {
    const saved = localStorage.getItem('dyarte_admin_logs');
    return saved ? JSON.parse(saved) : INITIAL_ADMIN_LOGS;
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [activeOptimizingToolId, setActiveOptimizingToolId] = useState<string | null>(null);

  const [activeToolsState, setActiveToolsState] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('dyarte_active_tools');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing active tools:', e);
      }
    }
    return {
      clean_temp: true,
      ram_cache: true,
    };
  });

  const isToolActive = (toolId: string): boolean => {
    return !!activeToolsState[toolId];
  };

  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalData>({
    isOpen: false,
    requiredLevel: 3,
    toolName: '',
  });

  const [legalModal, setLegalModal] = useState<{
    isOpen: boolean;
    type: 'terms' | 'privacy' | 'support' | 'about';
  }>({
    isOpen: false,
    type: 'terms',
  });

  // Safety Lock State (Reverts all optimizations to Windows factory defaults on uninstall or plan expiry)
  const [safetyLockActive, setSafetyLockActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('dyarte_safety_lock');
    return saved !== null ? saved === 'true' : true;
  });
  const [isRestoringDefaults, setIsRestoringDefaults] = useState<boolean>(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState<boolean>(false);

  const toggleSafetyLock = () => {
    setSafetyLockActive((prev) => {
      const next = !prev;
      localStorage.setItem('dyarte_safety_lock', String(next));
      addToast(
        next ? 'success' : 'warning',
        next ? 'Chave de Segurança Ativada' : 'Chave de Segurança Desativada',
        next
          ? 'Rollback automático para o padrão de fábrica do Windows habilitado ao desinstalar ou expirar plano.'
          : 'Aviso: Ao desativar, as otimizações permanecerão no registro mesmo após expiração.'
      );
      return next;
    });
  };

  const restoreWindowsFactoryDefaults = async (
    reason: string = 'Solicitação do usuário'
  ): Promise<{ success: boolean; message: string }> => {
    setIsRestoringDefaults(true);

    // Reset all optimization switches to off locally
    setActiveToolsState({});
    localStorage.removeItem('dyarte_active_tools');

    // Registrar histórico oficial de desativação de ferramentas
    const historyItem: OptimizationHistoryItem = {
      history_id: `hist_factory_reset_${Date.now()}`,
      user_id: currentUser?.user_id || 'system',
      tool_id: 'tool_safety_factory_reset',
      tool_name: 'Desativação de Otimizações (Chave de Segurança)',
      category: 'SISTEMA',
      date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: 'SUCESSO',
      result: `Otimizações locais desativadas no painel. Chave de segurança acionada. Motivo: ${reason}.`,
      duration_ms: 0,
      details: 'Mecanismo de segurança executado no painel.',
    };

    setHistory((prev) => [historyItem, ...prev]);
    setIsRestoringDefaults(false);

    addToast(
      'success',
      'Otimizações Desativadas',
      'As configurações ativas do aplicativo foram revertidas com sucesso.'
    );

    return {
      success: true,
      message: 'Otimizações locais desativadas com sucesso.',
    };
  };

  // Driver Pipeline State (Download, Extract, Execute)
  const [driverPipeline, setDriverPipeline] = useState<DriverPipelineStage | null>(null);

  // DDU Dedicated Pipeline State
  const [dduInfo, setDduInfo] = useState<DduPathResult | null>(null);
  const [dduStatus, setDduStatus] = useState<DduStatus | null>(null);
  const [isDduRunning, setIsDduRunning] = useState<boolean>(false);

  const closeDriverPipeline = () => {
    setDriverPipeline(null);
  };

  const checkDdu = async (): Promise<DduPathResult> => {
    if (!window.dyarte?.ddu) {
      const res: DduPathResult = {
        found: false,
        fullPath: null,
        fileName: 'Display Driver Uninstaller.exe',
        error: 'Aplicativo desktop DYARTE OPTIMIZER requerido para consultar DDU.',
      };
      setDduInfo(res);
      setDduStatus('DDU_NOT_FOUND');
      return res;
    }
    try {
      const res = await window.dyarte.ddu.getDduPath();
      setDduInfo(res);
      setDduStatus(res.found ? 'DDU_FOUND' : 'DDU_NOT_FOUND');
      return res;
    } catch (err: any) {
      const res: DduPathResult = {
        found: false,
        fullPath: null,
        fileName: 'Display Driver Uninstaller.exe',
        error: err?.message || 'Falha ao consultar caminho do DDU.',
      };
      setDduInfo(res);
      setDduStatus('DDU_FAILED');
      return res;
    }
  };

  const executeDduPipeline = async (): Promise<DduExecutionResult> => {
    if (!currentUser) {
      return {
        status: 'DDU_FAILED',
        success: false,
        message: 'Usuário não autenticado.',
        error: 'Usuário não autenticado.',
      };
    }

    if (currentUser.role !== 'ADMIN' && currentUser.nivel_plano < 3) {
      openUpgradeModal(3, 'DDU Clean Sweep', 'GPU');
      addToast(
        'info',
        'Plano Necessário',
        'A execução do Display Driver Uninstaller requer plano Avançado ou Completo.'
      );
      return {
        status: 'DDU_FAILED',
        success: false,
        message: 'Plano insuficiente para executar o DDU.',
        error: 'Plano insuficiente.',
      };
    }

    if (!window.dyarte?.ddu) {
      const errMsg =
        'A execução direta do DDU requer o aplicativo desktop nativo DYARTE OPTIMIZER para Windows.';
      addToast('warning', 'Aplicativo Desktop Requerido', errMsg);
      setDduStatus('DDU_FAILED');
      return {
        status: 'DDU_FAILED',
        success: false,
        message: errMsg,
        error: errMsg,
      };
    }

    // Requirement 9: Central backend authorization before DDU mutation
    const authRes = await requestExecutionAuthorization('tool_gpu_clean_drivers', device.device_id, 'APPLY');
    if (!authRes.authorized || !authRes.execution_token || !authRes.execution_id || !authRes.request_id) {
      const errMsg = authRes.error || 'Autorização negada pelo servidor central para execução do DDU.';
      addToast('error', 'Autorização Negada', errMsg);
      setDduStatus('DDU_FAILED');
      return {
        status: 'DDU_FAILED',
        success: false,
        message: errMsg,
        error: errMsg,
      };
    }

    await startExecutionOnBackend(authRes.execution_id, authRes.request_id);

    setIsDduRunning(true);
    try {
      const execResult = await window.dyarte.ddu.executeDdu(authRes.execution_token);
      setDduStatus(execResult.status);

      if (execResult.status === 'DDU_NOT_FOUND') {
        const historyItem: OptimizationHistoryItem = {
          history_id: `hist_ddu_${Date.now()}`,
          user_id: currentUser.user_id,
          tool_id: 'tool_gpu_clean_drivers',
          tool_name: 'DDU Clean Sweep (Display Driver Uninstaller)',
          category: 'GPU',
          date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'FALHA',
          result: 'DDU_NOT_FOUND: Display Driver Uninstaller.exe não encontrado em drivers/DDU/.',
          duration_ms: 0,
          details: execResult.error || 'Arquivo executável oficial ausente.',
        };
        setHistory((prev) => [historyItem, ...prev]);
        addToast('error', 'DDU Não Encontrado', 'Display Driver Uninstaller.exe não encontrado em drivers/DDU/.');
        return execResult;
      }

      if (execResult.status === 'DDU_LAUNCHED') {
        const historyItem: OptimizationHistoryItem = {
          history_id: `hist_ddu_${Date.now()}`,
          user_id: currentUser.user_id,
          tool_id: 'tool_gpu_clean_drivers',
          tool_name: 'DDU Clean Sweep (Display Driver Uninstaller)',
          category: 'GPU',
          date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'PENDENTE',
          result: 'DDU_LAUNCHED: DDU iniciado. Aguardando operação do usuário.',
          duration_ms: 0,
          details: 'Display Driver Uninstaller.exe executado via UAC. Operação manual em andamento no DDU.',
        };
        setHistory((prev) => [historyItem, ...prev]);
        addToast('info', 'DDU Iniciado', 'DDU iniciado. Aguardando operação do usuário.');
        return execResult;
      }

      // DDU_FAILED
      const historyItem: OptimizationHistoryItem = {
        history_id: `hist_ddu_${Date.now()}`,
        user_id: currentUser.user_id,
        tool_id: 'tool_gpu_clean_drivers',
        tool_name: 'DDU Clean Sweep (Display Driver Uninstaller)',
        category: 'GPU',
        date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        status: 'FALHA',
        result: `DDU_FAILED: ${execResult.error || 'Falha ao iniciar processo do DDU.'}`,
        duration_ms: 0,
        details: execResult.error || 'Erro na execução via UAC.',
      };
      setHistory((prev) => [historyItem, ...prev]);
      addToast('error', 'Falha no DDU', execResult.error || 'Não foi possível iniciar o DDU.');
      return execResult;
    } catch (err: any) {
      setDduStatus('DDU_FAILED');
      return {
        status: 'DDU_FAILED',
        success: false,
        message: err?.message || 'Erro inesperado ao executar DDU.',
        error: err?.message || 'Erro inesperado ao executar DDU.',
      };
    } finally {
      setIsDduRunning(false);
    }
  };

  const executeDriverPipeline = async (brand: 'AMD' | 'NVIDIA'): Promise<DriverPipelineResult> => {
    if (!currentUser) {
      return {
        status: 'FAILED',
        code: 'DESKTOP_REQUIRED',
        success: false,
        message: 'Usuário não autenticado.',
      };
    }

    if (currentUser.role !== 'ADMIN' && currentUser.nivel_plano < 3) {
      openUpgradeModal(3, `Driver ${brand} Otimizado`, 'GPU');
      addToast(
        'info',
        'Plano Necessário',
        `A instalação dos drivers ${brand} requer plano Avançado ou Completo.`
      );
      return {
        status: 'FAILED',
        code: 'DESKTOP_REQUIRED',
        success: false,
        message: 'Plano insuficiente.',
      };
    }

    // Modal de acompanhamento
    setDriverPipeline({
      isOpen: true,
      brand,
      phase: 'detecting',
      progress: 25,
      actionText: `Detectando GPU e verificando compatibilidade de hardware para ${brand}...`,
      logs: [
        `[INÍCIO] Inicializando validação de hardware para ${brand} DRIVER OPTIMIZED...`,
        `[SISTEMA] Consultando subsistema gráfico do Windows...`,
      ],
      installerFileName: brand === 'AMD' ? 'Instalador AMD (*.exe)' : 'Instalador NVIDIA (*.exe)',
    });

    let detectedVendor: 'AMD' | 'NVIDIA' | 'UNKNOWN' = 'UNKNOWN';
    let gpuNames = '';

    if (window.dyarte?.drivers) {
      try {
        const gpuResult = await window.dyarte.drivers.detectGpuVendor();
        detectedVendor = gpuResult.vendor;
        gpuNames = gpuResult.gpuNames?.join(', ') || gpuResult.rawOutput || 'GPU Primária';
      } catch (err) {
        console.warn('Erro ao consultar detectGpuVendor:', err);
      }
    } else {
      const devGpu = (device?.gpu || '').toLowerCase();
      if (
        devGpu.includes('nvidia') ||
        devGpu.includes('geforce') ||
        devGpu.includes('rtx') ||
        devGpu.includes('gtx')
      ) {
        detectedVendor = 'NVIDIA';
      } else if (devGpu.includes('amd') || devGpu.includes('radeon')) {
        detectedVendor = 'AMD';
      } else {
        detectedVendor = 'UNKNOWN';
      }
      gpuNames = device?.gpu || 'Desconhecido';
    }

    if (detectedVendor === 'UNKNOWN') {
      const errorMsg =
        'A GPU deste computador não pôde ser identificada com segurança. Nenhum instalador foi executado automaticamente.';
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: 'Falha: GPU não identificada com segurança.',
              errorMessage: errorMsg,
              logs: [
                ...prev.logs,
                `[ALERTA] Hardware gráfico não identificado no barramento PCI do Windows.`,
                `[BLOQUEIO] Operação cancelada preventivamente para proteger a estabilidade do sistema.`,
              ],
            }
          : null
      );
      addToast('error', 'GPU não Identificada', errorMsg);
      return {
        status: 'FAILED',
        code: 'GPU_UNKNOWN',
        success: false,
        message: errorMsg,
      };
    }

    if (detectedVendor !== brand) {
      const errorMsg = `Este driver (${brand}) não corresponde à GPU detectada no computador (${detectedVendor}: ${gpuNames}). Operação bloqueada por segurança para evitar incompatibilidade.`;
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: `Incompatibilidade: GPU detectada é ${detectedVendor}.`,
              errorMessage: errorMsg,
              detectedVendor,
              logs: [
                ...prev.logs,
                `[DETECÇÃO] GPU Ativa identificada: ${detectedVendor} (${gpuNames}).`,
                `[BLOQUEIO] Tentativa de instalar driver ${brand} em hardware ${detectedVendor}.`,
                `[SEGURANÇA] Instalação interrompida por proteção contra incompatibilidade.`,
              ],
            }
          : null
      );
      addToast('warning', 'Driver Incompatível', errorMsg);
      return {
        status: 'FAILED',
        code: 'GPU_INCOMPATIBLE',
        success: false,
        message: errorMsg,
      };
    }

    if (!window.dyarte?.drivers) {
      const errorMsg =
        'A execução direta de instaladores locais requer o aplicativo desktop nativo DYARTE OPTIMIZER para Windows. Abra o aplicativo desktop ou acesse os drivers pelo Google Drive.';
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: 'Execução local restrita ao aplicativo desktop.',
              errorMessage: errorMsg,
              logs: [
                ...prev.logs,
                `[AMBIENTE] Aplicação executada em modo navegador web.`,
                `[INFO] O navegador web não possui acesso direto à execução de instaladores de driver do Windows.`,
              ],
            }
          : null
      );
      addToast('info', 'Aplicativo Desktop Requerido', errorMsg);
      return {
        status: 'FAILED',
        code: 'DESKTOP_REQUIRED',
        success: false,
        message: errorMsg,
      };
    }

    // Localizar executável via DriverService nativo
    let installerInfo;
    try {
      installerInfo = await window.dyarte.drivers.findDriverInstaller(brand);
    } catch (err: any) {
      installerInfo = {
        found: false,
        error: err?.message || 'Falha ao consultar diretório de drivers.',
      };
    }

    if (!installerInfo.found || !installerInfo.fullPath) {
      const errorMsg = `Instalador oficial "Setup.exe" do driver ${brand} não encontrado na pasta: ${
        installerInfo.vendorDir || `drivers/${brand}`
      }.`;
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: 'Instalador Setup.exe não encontrado.',
              errorMessage: `${errorMsg} Adicione o arquivo "Setup.exe" dentro desta pasta e tente novamente.`,
              folderPath: installerInfo.vendorDir,
              logs: [
                ...prev.logs,
                `[VERIFICAÇÃO] Varredura realizada em: ${installerInfo.vendorDir || `drivers/${brand}`}`,
                `[ERRO] O arquivo oficial "Setup.exe" não foi localizado no diretório.`,
                `[AÇÃO NECESSÁRIA] Coloque o executável renomeado como "Setup.exe" na pasta acima.`,
              ],
            }
          : null
      );
      addToast(
        'error',
        'Instalador Setup.exe Ausente',
        `O arquivo Setup.exe não foi localizado na pasta drivers/${brand}.`
      );
      return {
        status: 'FAILED',
        code: 'INSTALLER_NOT_FOUND',
        success: false,
        message: errorMsg,
      };
    }

    // Requirement 9: Central backend authorization before Driver mutation
    const toolId = brand === 'AMD' ? 'tool_gpu_amd_driver' : 'tool_gpu_nvidia_driver';
    const authRes = await requestExecutionAuthorization(toolId, device.device_id, 'APPLY');
    if (!authRes.authorized || !authRes.execution_token || !authRes.execution_id || !authRes.request_id) {
      const errorMsg = authRes.error || `Autorização negada pelo servidor para instalação do driver ${brand}.`;
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: 'Falha: Operação de driver não autorizada pelo servidor central.',
              errorMessage: errorMsg,
              logs: [
                ...prev.logs,
                `[BLOQUEIO] Autorização central negada para execução do driver.`,
                `[DETALHE] ${errorMsg}`,
              ],
            }
          : null
      );
      addToast('error', 'Autorização Negada', errorMsg);
      return {
        status: 'FAILED',
        code: 'UNAUTHORIZED_MUTATION',
        success: false,
        message: errorMsg,
      };
    }

    await startExecutionOnBackend(authRes.execution_id, authRes.request_id);

    // Executa o instalador através do DriverService nativo passando o execution token assinado
    let execResult;
    try {
      execResult = await window.dyarte.drivers.executeDriverInstaller(brand, authRes.execution_token);
    } catch (err: any) {
      execResult = {
        success: false,
        error: err?.message || 'Erro inesperado ao executar instalador.',
      };
    }

    if (!execResult.success) {
      setDriverPipeline((prev) =>
        prev
          ? {
              ...prev,
              phase: 'failed',
              progress: 100,
              actionText: 'Falha na inicialização do instalador.',
              errorMessage:
                execResult.error || 'O Windows não pôde iniciar o executável do driver.',
              logs: [
                ...prev.logs,
                `[FALHA] Não foi possível disparar o instalador do driver.`,
                `[MOTIVO] ${execResult.error || 'Erro desconhecido.'}`,
              ],
            }
          : null
      );
      addToast('error', 'Erro na Instalação', execResult.error || 'Falha ao iniciar o instalador.');
      return {
        status: 'FAILED',
        code: 'EXECUTION_FAILED',
        success: false,
        message: execResult.error || 'Falha ao iniciar o instalador.',
      };
    }

    // Instalador disparado (AGUARDANDO CONCLUSÃO DO ASSISTENTE)
    const successMsg =
      execResult.message || `Instalador do driver ${brand} iniciado no Windows. Conclua no assistente da GPU.`;
    setDriverPipeline((prev) =>
      prev
        ? {
            ...prev,
            phase: 'completed',
            progress: 100,
            actionText: 'Instalador aberto no Windows — aguardando conclusão do usuário.',
            successMessage: successMsg,
            logs: [
              ...prev.logs,
              `[PROCESSO DISPARADO] Executável ${installerInfo.fileName} iniciado com privilégios de Administrador.`,
              `[STATUS] INSTALLER_LAUNCHED (Aguardando conclusão manual no assistente da ${brand}).`,
              `[AVISO] A instalação física do driver ocorre fora do aplicativo, no instalador oficial.`,
            ],
          }
        : null
    );

    // Registra no histórico com status PENDENTE (nunca sucesso prematuro antes de concluir)
    const historyItem: OptimizationHistoryItem = {
      history_id: `hist_${Date.now()}`,
      user_id: currentUser.user_id,
      tool_id: brand === 'AMD' ? 'tool_gpu_amd_driver' : 'tool_gpu_nvidia_driver',
      tool_name: brand === 'AMD' ? 'AMD DRIVER OPTIMIZED' : 'NVIDIA DRIVER OPTIMIZED',
      category: 'GPU',
      date:
        'Hoje às ' +
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: 'PENDENTE',
      result: `INSTALLER_LAUNCHED: Instalador ${installerInfo.fileName} aberto via UAC. Aguardando conclusão do usuário no instalador oficial.`,
      duration_ms: 0,
      details: `Executável do driver ${brand} localizado em ${installerInfo.fullPath} e executado via UAC.`,
    };
    setHistory((prev) => [historyItem, ...prev]);

    addToast('info', 'Instalador Aberto', `Instalador do driver ${brand} iniciado. Conclua as etapas no assistente.`);

    return {
      status: 'PENDING',
      code: 'INSTALLER_LAUNCHED',
      success: false,
      message: successMsg,
    };
  };

  // Monitor plan expiration: if expired and safety lock active, trigger automatic factory reset
  useEffect(() => {
    if (safetyLockActive && currentUser) {
      const isExpired = currentUser.status_plano === 'EXPIRADO';
      const hadActiveTools = Object.values(activeToolsState).some(Boolean);

      if (isExpired && hadActiveTools) {
        restoreWindowsFactoryDefaults('Plano expirado');
      }
    }
  }, [currentUser?.status_plano]);

  // Language & Internationalization State
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('dyarte_language');
    if (saved === 'pt' || saved === 'en' || saved === 'es') {
      return saved;
    }
    // Auto-detect browser language
    if (typeof navigator !== 'undefined') {
      const navLang = navigator.language.toLowerCase();
      if (navLang.startsWith('es')) return 'es';
      if (navLang.startsWith('en')) return 'en';
    }
    return 'pt';
  });

  const setLanguage = (lang: LanguageCode) => {
    setCurrentLanguage(lang);
    localStorage.setItem('dyarte_language', lang);
  };

  const t = (key: string, fallback?: string): string => {
    const langDict = (translations as any)[currentLanguage] || translations.pt;
    const ptDict = translations.pt as any;
    const val = langDict?.[key] || ptDict?.[key];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
    if (fallback !== undefined) {
      return fallback;
    }
    // Clean key so raw underscores are never displayed
    return key.replace(/^[a-z]+_/, '').replace(/_/g, ' ');
  };

  const getToolName = (tool: { tool_id: string; nome?: string; tool_name?: string }): string => {
    if (!tool) return 'Ferramenta';
    const id = tool.tool_id || '';

    // First check exact match in INITIAL_TOOLS
    const initial = INITIAL_TOOLS.find((t) => t.tool_id === id);

    const directKey = `${id}_name`;
    const prefixedKey = `tool_${id}_name`;
    const langDict = (translations as any)[currentLanguage] || translations.pt;
    const ptDict = translations.pt as any;
    const found = langDict?.[directKey] || langDict?.[prefixedKey] || ptDict?.[directKey] || ptDict?.[prefixedKey];
    if (found && !found.startsWith('tool_') && !found.includes('_')) {
      return found;
    }

    if (initial?.nome && !initial.nome.includes('_')) {
      return initial.nome;
    }

    const nameCandidate = tool.nome || tool.tool_name || '';
    if (nameCandidate && !nameCandidate.includes('_') && !nameCandidate.startsWith('tool_')) {
      return nameCandidate;
    }

    // Strip tool_, suffixes and replace all underscores with clean spaces
    const clean = (nameCandidate && !nameCandidate.startsWith('tool_') ? nameCandidate : id)
      .replace(/^tool_/, '')
      .replace(/_name$/, '')
      .replace(/_/g, ' ')
      .trim();

    return clean.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Otimização DYARTE';
  };

  const getToolDesc = (tool: { tool_id: string; descricao?: string }): string => {
    if (!tool) return '';
    const id = tool.tool_id || '';
    const initial = INITIAL_TOOLS.find((t) => t.tool_id === id);

    const directKey = `${id}_desc`;
    const prefixedKey = `tool_${id}_desc`;
    const langDict = (translations as any)[currentLanguage] || translations.pt;
    const ptDict = translations.pt as any;
    const found = langDict?.[directKey] || langDict?.[prefixedKey] || ptDict?.[directKey] || ptDict?.[prefixedKey];
    if (found && !found.startsWith('tool_') && !found.includes('_desc')) {
      return found;
    }

    if (initial?.descricao && !initial.descricao.includes('_desc')) {
      return initial.descricao;
    }

    const descCandidate = tool.descricao || '';
    if (descCandidate && !descCandidate.startsWith('tool_') && !descCandidate.includes('_desc')) {
      return descCandidate;
    }

    return '';
  };

  // Real Hardware Detection & Customization States
  const [isHardwareDetecting, setIsHardwareDetecting] = useState<boolean>(false);
  const [hardwareEditModalOpen, setHardwareEditModalOpen] = useState<boolean>(false);

  // Web Synchronization States
  const [isSyncingWithWeb, setIsSyncingWithWeb] = useState(false);
  const [lastWebSync, setLastWebSync] = useState<string>(() => {
    return localStorage.getItem('dyarte_last_sync') || 'Hoje às 14:32';
  });

  // Persist key records
  useEffect(() => {
    localStorage.setItem('dyarte_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('dyarte_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('dyarte_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('dyarte_plans', JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem('dyarte_tools', JSON.stringify(tools));
  }, [tools]);

  useEffect(() => {
    localStorage.setItem('dyarte_licenses', JSON.stringify(licenses));
  }, [licenses]);

  useEffect(() => {
    localStorage.setItem('dyarte_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('dyarte_device', JSON.stringify(device));
  }, [device]);

  useEffect(() => {
    localStorage.setItem('dyarte_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('dyarte_admin_logs', JSON.stringify(adminLogs));
  }, [adminLogs]);

  const addToast = (type: ToastMessage['type'], title: string, message: string) => {
    const id = `toast_${Date.now()}_${toasts.length + 1}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openUpgradeModal = (requiredLevel: PlanLevel, toolName: string, category?: string) => {
    setUpgradeModal({
      isOpen: true,
      requiredLevel,
      toolName,
      category,
    });
  };

  const closeUpgradeModal = () => {
    setUpgradeModal((prev) => ({ ...prev, isOpen: false }));
  };

  const openLegalModal = (type: 'terms' | 'privacy' | 'support' | 'about') => {
    setLegalModal({ isOpen: true, type });
  };

  const closeLegalModal = () => {
    setLegalModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Web Synchronization Operations - Sincronização real com Firebase Firestore
  const syncWithWebsite = async (targetEmail?: string): Promise<{ success: boolean; message: string }> => {
    setIsSyncingWithWeb(true);

    const now = new Date();
    const timeStr = `Hoje às ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setLastWebSync(timeStr);
    localStorage.setItem('dyarte_last_sync', timeStr);

    try {
      const fbUser = auth.currentUser;
      if (!fbUser) {
        setIsSyncingWithWeb(false);
        addToast('info', 'Sincronização', 'Faça login com sua conta para sincronizar o plano em tempo real.');
        return { success: false, message: 'Nenhuma sessão autenticada para sincronização.' };
      }

      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const userData = snap.data() as User;
        const refreshedUser: User = {
          ...userData,
          ultimo_login: `Sincronizado ${timeStr}`,
        };
        setCurrentUser(refreshedUser);
        setUsers((prev) => prev.map((u) => (u.user_id === refreshedUser.user_id ? refreshedUser : u)));
        setIsSyncingWithWeb(false);
        addToast(
          'success',
          'Conta Sincronizada',
          `Plano ${refreshedUser.plano_atual || 'BÁSICO'} atualizado diretamente do banco de dados.`
        );
        return { success: true, message: 'Dados sincronizados com o servidor.' };
      } else {
        setIsSyncingWithWeb(false);
        return { success: false, message: 'Cadastro do usuário não encontrado na base de dados.' };
      }
    } catch (err: any) {
      setIsSyncingWithWeb(false);
      return { success: false, message: `Erro ao conectar com servidor: ${err.message || 'Falha de rede'}` };
    }
  };

  const webBrowserLoginSync = async (): Promise<{ success: boolean; error?: string }> => {
    setIsSyncingWithWeb(true);
    // Sincronização direta de navegador web requer fluxo real de autenticação OAuth ou extensão
    setIsSyncingWithWeb(false);
    return {
      success: false,
      error: 'Autenticação de sessão de navegador requer login direto via e-mail e senha ou Google.',
    };
  };

  // Firebase Auth Real-Time State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        const emailLower = fbUser.email.toLowerCase();
        const isAdminEmail = emailLower === 'kelberduarte22@gmail.com';

        try {
          const userRef = doc(db, 'users', fbUser.uid);
          const snap = await getDoc(userRef);

          if (snap.exists()) {
            const userData = snap.data() as User;
            if (isAdminEmail && userData.role !== 'ADMIN') {
              const promoted: User = {
                ...userData,
                role: 'ADMIN',
                plano_atual: 'COMPLETO',
                nivel_plano: 4,
                status_plano: 'ATIVO',
              };
              await setDoc(userRef, promoted, { merge: true });
              setCurrentUser(promoted);
            } else {
              setCurrentUser(userData);
            }
          } else {
            // New user registration profile initialization
            const newUser: User = {
              user_id: fbUser.uid,
              nome: fbUser.displayName || (isAdminEmail ? 'Kelber Duarte' : emailLower.split('@')[0]),
              email: emailLower,
              data_criacao: new Date().toISOString().split('T')[0],
              plano_atual: isAdminEmail ? 'COMPLETO' : 'BÁSICO',
              nivel_plano: (isAdminEmail ? 4 : 1) as PlanLevel,
              status_plano: 'ATIVO',
              data_inicio: new Date().toISOString().split('T')[0],
              data_expiracao: isAdminEmail ? '2030-12-31' : 'Vitalício (Gratuito)',
              license_id: isAdminEmail ? 'lic_admin_duarte_master' : `lic_free_${fbUser.uid.slice(0, 8)}`,
              status_licenca: 'ATIVA',
              device_id: device.device_id,
              ultimo_login: 'Agora mesmo',
              role: isAdminEmail ? 'ADMIN' : 'USER',
              status: 'ATIVO',
            };
            await setDoc(userRef, newUser);

            if (isAdminEmail) {
              await setDoc(doc(db, 'admins', fbUser.uid), {
                user_id: fbUser.uid,
                email: emailLower,
                role: 'ADMIN',
                status: 'ACTIVE',
                granted_at: new Date().toISOString(),
                notes: 'Master administrator account initialized',
              });
            }
            setCurrentUser(newUser);
          }
        } catch (e) {
          console.warn('Firebase user sync note:', e);
        }
      }
    });

    return () => unsubscribe();
  }, [device.device_id]);

  // Auth Operations
  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const safeEmail = (email || '').trim().toLowerCase();
    const safePass = pass || '';
    if (!safeEmail || !safePass) {
      return { success: false, error: 'Preencha e-mail e senha.' };
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, safeEmail, safePass);
      const fbUser = userCredential.user;
      const isAdmin = safeEmail === 'kelberduarte22@gmail.com';

      // Load Firestore profile
      let userData: User;
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          userData = snap.data() as User;
          if (isAdmin && userData.role !== 'ADMIN') {
            userData = { ...userData, role: 'ADMIN', plano_atual: 'COMPLETO', nivel_plano: 4 };
            await setDoc(userRef, userData, { merge: true });
          }
        } else {
          userData = {
            user_id: fbUser.uid,
            nome: fbUser.displayName || (isAdmin ? 'Kelber Duarte' : safeEmail.split('@')[0]),
            email: safeEmail,
            data_criacao: new Date().toISOString().split('T')[0],
            plano_atual: isAdmin ? 'COMPLETO' : 'BÁSICO',
            nivel_plano: (isAdmin ? 4 : 1) as PlanLevel,
            status_plano: 'ATIVO',
            data_inicio: new Date().toISOString().split('T')[0],
            data_expiracao: isAdmin ? '2030-12-31' : 'Vitalício (Gratuito)',
            license_id: isAdmin ? 'lic_admin_duarte_master' : `lic_free_${fbUser.uid.slice(0, 8)}`,
            status_licenca: 'ATIVA',
            device_id: device.device_id,
            ultimo_login: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            role: isAdmin ? 'ADMIN' : 'USER',
            status: 'ATIVO',
          };
          await setDoc(userRef, userData);
        }
      } catch (err) {
        // Fallback user representation if offline
        userData = {
          user_id: fbUser.uid,
          nome: isAdmin ? 'Kelber Duarte' : safeEmail.split('@')[0],
          email: safeEmail,
          data_criacao: new Date().toISOString().split('T')[0],
          plano_atual: isAdmin ? 'COMPLETO' : 'BÁSICO',
          nivel_plano: (isAdmin ? 4 : 1) as PlanLevel,
          status_plano: 'ATIVO',
          data_inicio: new Date().toISOString().split('T')[0],
          data_expiracao: isAdmin ? '2030-12-31' : 'Vitalício (Gratuito)',
          license_id: isAdmin ? 'lic_admin_duarte_master' : `lic_free_${fbUser.uid.slice(0, 8)}`,
          status_licenca: 'ATIVA',
          device_id: device.device_id,
          ultimo_login: 'Agora mesmo',
          role: isAdmin ? 'ADMIN' : 'USER',
          status: 'ATIVO',
        };
      }

      setCurrentUser(userData);
      addToast(
        'success',
        'Autenticação Segura Concluída',
        isAdmin ? 'Bem-vindo, Administrador Duarte! Acesso total concedido.' : `Bem-vindo de volta, ${userData.nome}!`
      );
      return { success: true };
    } catch (err: any) {
      // Fallback for local initial accounts if needed
      const targetUser = users.find((u) => (u?.email || '').toLowerCase() === safeEmail);
      if (targetUser) {
        if (targetUser.status === 'BLOQUEADO') {
          return { success: false, error: 'Esta conta foi suspensa pela administração.' };
        }
        setCurrentUser(targetUser);
        addToast('success', 'Sessão Iniciada', `Bem-vindo, ${targetUser.nome}!`);
        return { success: true };
      }

      let errMsg = 'Credenciais inválidas. Verifique seu e-mail e senha.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        errMsg = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/user-not-found') {
        errMsg = 'Conta não cadastrada. Crie uma nova conta com facilidade.';
      } else if (err.code === 'auth/too-many-requests') {
        errMsg = 'Muitas tentativas malsucedidas. Tente novamente em instantes.';
      } else if (err.message) {
        errMsg = err.message;
      }
      return { success: false, error: errMsg };
    }
  };

  const register = async (
    dataOrName:
      | {
          nome: string;
          email: string;
          senha: string;
          confirmacao?: string;
          termos?: boolean;
          privacidade?: boolean;
        }
      | string,
    emailArg?: string,
    senhaArg?: string,
    confirmacaoArg?: string
  ): Promise<{ success: boolean; error?: string }> => {
    let rawNome = '';
    let rawEmail = '';
    let rawSenha = '';
    let rawConfirmacao = '';
    let termos = true;
    let privacidade = true;

    if (typeof dataOrName === 'string') {
      rawNome = dataOrName;
      rawEmail = emailArg || '';
      rawSenha = senhaArg || '';
      rawConfirmacao = confirmacaoArg || rawSenha;
    } else if (dataOrName && typeof dataOrName === 'object') {
      rawNome = dataOrName.nome || '';
      rawEmail = dataOrName.email || '';
      rawSenha = dataOrName.senha || '';
      rawConfirmacao = dataOrName.confirmacao || rawSenha;
      termos = dataOrName.termos ?? true;
      privacidade = dataOrName.privacidade ?? true;
    }

    const safeNome = (rawNome || '').trim();
    const safeEmail = (rawEmail || '').trim().toLowerCase();

    if (!safeNome || !safeEmail || !rawSenha) {
      return { success: false, error: 'Todos os campos são obrigatórios.' };
    }
    if (rawSenha !== rawConfirmacao) {
      return { success: false, error: 'A confirmação de senha não confere.' };
    }
    if (rawSenha.length < 6) {
      return { success: false, error: 'A senha deve ter no mínimo 6 caracteres.' };
    }
    if (!termos || !privacidade) {
      return { success: false, error: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.' };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, safeEmail, rawSenha);
      const fbUser = cred.user;
      const isAdmin = safeEmail === 'kelberduarte22@gmail.com';

      const newUser: User = {
        user_id: fbUser.uid,
        nome: safeNome,
        email: safeEmail,
        data_criacao: new Date().toISOString().split('T')[0],
        plano_atual: isAdmin ? 'COMPLETO' : 'BÁSICO',
        nivel_plano: (isAdmin ? 4 : 1) as PlanLevel,
        status_plano: 'ATIVO',
        data_inicio: new Date().toISOString().split('T')[0],
        data_expiracao: isAdmin ? '2030-12-31' : 'Vitalício (Gratuito)',
        license_id: isAdmin ? 'lic_admin_duarte_master' : `lic_free_${fbUser.uid.slice(0, 8)}`,
        status_licenca: 'ATIVA',
        device_id: device.device_id,
        ultimo_login: 'Agora mesmo',
        role: isAdmin ? 'ADMIN' : 'USER',
        status: 'ATIVO',
      };

      try {
        await setDoc(doc(db, 'users', fbUser.uid), newUser);
        if (isAdmin) {
          await setDoc(doc(db, 'admins', fbUser.uid), {
            user_id: fbUser.uid,
            email: safeEmail,
            role: 'ADMIN',
            status: 'ACTIVE',
            granted_at: new Date().toISOString(),
            notes: 'Master administrator account registered',
          });
        }
      } catch (dbErr) {
        console.warn('Firestore write warning:', dbErr);
      }

      setUsers((prev) => [...prev, newUser]);
      setCurrentUser(newUser);

      addToast(
        'success',
        'Conta Criada com Criptografia Segura!',
        isAdmin
          ? 'Conta Master criada e vinculada como Administrador do sistema!'
          : 'Conta criada! Você pode explorar todas as funções técnicas. Adquira um plano para executar no Windows.'
      );
      return { success: true };
    } catch (err: any) {
      let errMsg = 'Falha ao criar conta.';
      if (err.code === 'auth/email-already-in-use') {
        errMsg = 'Já existe uma conta cadastrada com este e-mail.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'A senha informada é fraca. Use pelo menos 6 caracteres.';
      } else if (err.message) {
        errMsg = err.message;
      }
      return { success: false, error: errMsg };
    }
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const fbUser = cred.user;
      const emailLower = (fbUser.email || '').toLowerCase();
      const isAdmin = emailLower === 'kelberduarte22@gmail.com';

      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);
      let userData: User;

      if (snap.exists()) {
        userData = snap.data() as User;
        if (isAdmin && userData.role !== 'ADMIN') {
          userData = { ...userData, role: 'ADMIN', plano_atual: 'COMPLETO', nivel_plano: 4 };
          await setDoc(userRef, userData, { merge: true });
        }
      } else {
        userData = {
          user_id: fbUser.uid,
          nome: fbUser.displayName || (isAdmin ? 'Kelber Duarte' : emailLower.split('@')[0]),
          email: emailLower,
          data_criacao: new Date().toISOString().split('T')[0],
          plano_atual: isAdmin ? 'COMPLETO' : 'BÁSICO',
          nivel_plano: (isAdmin ? 4 : 1) as PlanLevel,
          status_plano: 'ATIVO',
          data_inicio: new Date().toISOString().split('T')[0],
          data_expiracao: isAdmin ? '2030-12-31' : 'Vitalício (Gratuito)',
          license_id: isAdmin ? 'lic_admin_duarte_master' : `lic_free_${fbUser.uid.slice(0, 8)}`,
          status_licenca: 'ATIVA',
          device_id: device.device_id,
          ultimo_login: 'Agora mesmo',
          role: isAdmin ? 'ADMIN' : 'USER',
          status: 'ATIVO',
        };
        await setDoc(userRef, userData);
        if (isAdmin) {
          await setDoc(doc(db, 'admins', fbUser.uid), {
            user_id: fbUser.uid,
            email: emailLower,
            role: 'ADMIN',
            status: 'ACTIVE',
            granted_at: new Date().toISOString(),
          });
        }
      }

      setCurrentUser(userData);
      addToast('success', 'Autenticado com Google', `Bem-vindo, ${userData.nome}!`);
      return { success: true };
    } catch (err: any) {
      console.error('[Google Login] Erro na autenticação:', err);
      let errorMsg = err.message || 'Falha ao autenticar com Google.';
      
      if (err.code === 'auth/unauthorized-domain') {
        errorMsg = 'Domínio local não autorizado no Firebase. Adicione "localhost" e "127.0.0.1" em Firebase Console -> Authentication -> Settings -> Authorized Domains.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        errorMsg = 'A janela de autenticação do Google foi fechada antes da conclusão.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        errorMsg = 'Solicitação de login cancelada. Nova tentativa já em andamento.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMsg = 'Falha de conexão com os servidores do Google. Verifique sua conexão com a internet.';
      }

      return { success: false, error: errorMsg };
    }
  };

  const changePassword = async (newPass: string): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser) {
      return { success: false, error: 'Nenhum usuário autenticado no sistema.' };
    }
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }
    try {
      await updatePassword(auth.currentUser, newPass);
      return { success: true };
    } catch (err: any) {
      let msg = err.message || 'Erro ao alterar a senha.';
      if (err.code === 'auth/requires-recent-login') {
        msg = 'Por segurança, faça login novamente antes de alterar sua senha.';
      }
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
    setCurrentUser(null);
    setCurrentView('dashboard');
    addToast('info', 'Sessão Encerrada', 'Você saiu da sua conta com segurança.');
  };

  const switchUserRole = (role: 'USER' | 'ADMIN') => {
    if (!isDevFixturesEnabled()) {
      addToast(
        'warning',
        'Acesso Restrito',
        'A alternância local de papéis está desabilitada em produção. As permissões de acesso são gerenciadas com segurança pelo Firebase e pelo Backend.'
      );
      return;
    }
    if (role === 'ADMIN') {
      const adminAcc = users.find((u) => u.email.toLowerCase() === 'kelberduarte22@gmail.com') || INITIAL_USERS[0];
      setCurrentUser(adminAcc);
      addToast('info', 'Modo Administrador Ativado', 'Você está navegando com privilégios de Administrador Master (Dev).');
    } else {
      const userAcc = users.find((u) => u.role === 'USER') || INITIAL_USERS[2];
      setCurrentUser(userAcc);
      addToast('info', 'Modo Usuário Ativado', `Você está navegando como ${userAcc.nome} (Dev).`);
    }
  };

  const updateCurrentUserProfile = (updates: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => (u.user_id === currentUser.user_id ? updated : u)));
    addToast('success', 'Perfil Atualizado', 'Seus dados foram atualizados com sucesso.');
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
    const safeEmail = (email || '').trim().toLowerCase();
    if (!safeEmail) {
      return { success: false, message: 'Informe o e-mail cadastrado.' };
    }
    try {
      await sendPasswordResetEmail(auth, safeEmail);
      return {
        success: true,
        message: `Link oficial de redefinição de senha enviado para ${safeEmail}. Verifique sua caixa de entrada.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Erro ao processar a recuperação de senha.',
      };
    }
  };

  // Device telemetry & Agent controls (Real connection to 127.0.0.1:49152)
  useEffect(() => {
    console.log('[AppContext] connect chamado');
    const unsub = agentBridge.onStateChange((state) => {
      const isOnline = state === 'AGENT_ONLINE';
      setDevice((prev) => ({
        ...prev,
        is_agent_connected: isOnline,
        agent_version: '1.0.0',
        last_heartbeat: isOnline
          ? 'Online (127.0.0.1:49152)'
          : state === 'AGENT_CONNECTING'
          ? 'Conectando ao agente...'
          : state === 'AGENT_ERROR'
          ? 'Erro de conexão'
          : 'Desconectado',
      }));
    });

    const unsubTelemetry = agentBridge.onTelemetry((snapshot) => {
      if (!snapshot?.telemetry) return;
      const t = snapshot.telemetry;
      setDevice((prev) => ({
        ...prev,
        cpu_usage_pct: t.cpu_usage ?? prev.cpu_usage_pct,
        gpu_usage_pct: t.gpu_usage ?? prev.gpu_usage_pct,
        ram_usage_pct: t.ram_usage_pct ?? prev.ram_usage_pct,
        cpu_clock_mhz: t.cpu_clock_mhz ?? prev.cpu_clock_mhz,
        cpu_power_w: t.cpu_power_w ?? prev.cpu_power_w,
        cpu_temperature: t.cpu_temperature ?? prev.cpu_temperature,
        gpu_temperature: t.gpu_temperature ?? prev.gpu_temperature,
        temp_c: t.cpu_temperature ?? t.gpu_temperature ?? prev.temp_c,
        gpu_clock_mhz: t.gpu_clock_mhz ?? prev.gpu_clock_mhz,
        gpu_power_w: t.gpu_power_w ?? prev.gpu_power_w,
        gpu_memory_used_mb: t.gpu_memory_used_mb ?? prev.gpu_memory_used_mb,
        gpu_memory_total_mb: t.gpu_memory_total_mb ?? prev.gpu_memory_total_mb,
        ram_used_mb: t.ram_used_mb ?? prev.ram_used_mb,
        ram_total_mb: t.ram_total_mb ?? prev.ram_total_mb,
        fps: t.fps ?? prev.fps,
        frametime_ms: t.frametime_ms ?? prev.frametime_ms,
        gpu_latency_ms: t.gpu_latency_ms ?? prev.gpu_latency_ms,
        input_lag_ms: t.gpu_latency_ms ?? prev.input_lag_ms,
        active_process: t.active_process ?? prev.active_process,
        active_game_pid: t.active_game_pid ?? prev.active_game_pid,
        active_game_name: t.active_game_name ?? prev.active_game_name,
        driver_version: t.driver_version ?? prev.driver_version,
      }));
    });

    agentBridge.connect();

    return () => {
      console.log('[AppContext] cleanup chamado');
      unsub();
      unsubTelemetry();
      // Não desconecta incondicionalmente no unmount de efeito do React StrictMode.
      // O agentBridge é um singleton estável de sessão da aplicação. Desconectar aqui abortaria
      // prematuramente o socket em andamento (CONNECTING) gerado pela montagem dupla do StrictMode.
    };
  }, []);

  const toggleAgentConnection = () => {
    if (agentBridge.getState() === 'AGENT_ONLINE') {
      agentBridge.disconnect();
      addToast('warning', 'Agente Windows Desconectado', 'Conexão com o dyarte-agent.exe encerrada.');
    } else {
      agentBridge.connect();
      addToast('info', 'Conectando ao Agente', 'Buscando dyarte-agent.exe em 127.0.0.1:49152...');
    }
  };

  const testAgentConnection = async () => {
    const res = await agentBridge.testConnection();
    if (res.success) {
      addToast(
        'success',
        'Agente Windows Testado',
        `Comunicação validada com sucesso! Versão do agente: ${res.agent_version || '1.0.0'}`
      );
    } else {
      addToast(
        'error',
        'Falha no Teste do Agente',
        res.error || 'Não foi possível comunicar com o dyarte-agent.exe em 127.0.0.1:49152.'
      );
    }
    return res;
  };

  const refreshHardwareTelemetry = async () => {
    let currentPing: number | null = null;
    try {
      const start = performance.now();
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        currentPing = Math.max(1, Math.round(performance.now() - start));
      }
    } catch {
      currentPing = null;
    }

    setDevice((prev) => ({
      ...prev,
      ping_ms: currentPing,
      last_heartbeat: prev.is_agent_connected ? 'Conectado (127.0.0.1:49152)' : 'Desconectado',
    }));
    addToast('info', 'Status de Telemetria', 'Latência de rede e status da conexão com o backend verificados.');
  };

  const detectAndSetRealHardware = async (silent = false) => {
    setIsHardwareDetecting(true);
    try {
      const realDevice = await detectFullComputerSpecs(device);
      setDevice(realDevice);
      localStorage.setItem('dyarte_device', JSON.stringify(realDevice));

      if (!silent) {
        addToast(
          'success',
          t('dash_real_detected') || 'Hardware Real Reconhecido',
          `${realDevice.cpu} • ${realDevice.gpu}`
        );
      }
    } catch (err) {
      console.warn('Erro ao detectar hardware do computador:', err);
    } finally {
      setIsHardwareDetecting(false);
    }
  };

  const updateHardwareSpecs = (specs: Partial<DeviceInfo>) => {
    setDevice((prev) => {
      const updated = { ...prev, ...specs };
      localStorage.setItem('dyarte_device', JSON.stringify(updated));
      return updated;
    });
    addToast('success', 'Hardware Atualizado', 'Especificações salvas com sucesso.');
  };

  // Run hardware auto-detection on startup directly from Windows Agent
  useEffect(() => {
    detectAndSetRealHardware(true);
  }, []);

  // Backend Optimization Execution Authorization & History Helpers
  const requestExecutionAuthorization = async (
    toolId: string,
    deviceId?: string,
    operation: 'APPLY' | 'ROLLBACK' = 'APPLY'
  ): Promise<{
    success: boolean;
    authorized: boolean;
    execution_id?: string;
    request_id?: string;
    execution_token?: string;
    expires_at?: number;
    error_code?: string;
    error?: string;
  }> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        return {
          success: false,
          authorized: false,
          error_code: 'UNAUTHENTICATED',
          error: 'Sessão de usuário não autenticada no backend. Faça login novamente.',
        };
      }
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tool_id: toolId,
          device_id: deviceId || device.device_id,
          operation,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorized || !data.execution_token) {
        return {
          success: false,
          authorized: false,
          error_code: data.error_code || 'UNAUTHORIZED',
          error: data.error || 'Autorização negada pelo servidor central.',
        };
      }
      return {
        success: true,
        authorized: true,
        execution_id: data.execution_id,
        request_id: data.request_id,
        execution_token: data.execution_token,
        expires_at: data.expires_at,
      };
    } catch (err: any) {
      return {
        success: false,
        authorized: false,
        error_code: 'NETWORK_ERROR',
        error: err?.message || 'Falha na comunicação com o servidor de autorização.',
      };
    }
  };

  /**
   * Requirement 3: Transiciona execução de ISSUED para EXECUTING no servidor.
   */
  const startExecutionOnBackend = async (
    executionId: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Não autenticado' };
      const res = await fetch('/api/executions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          execution_id: executionId,
          request_id: requestId,
        }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, error: data.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Requirements 1 & 2: Finaliza a execução no servidor através do recibo assinado pelo Windows Agent.
   * O backend valida a assinatura Ed25519 e finaliza atomicamente no Firestore.
   */
  const completeExecutionOnBackend = async (
    executionToken: string,
    receipt: any,
    receiptSignature?: string
  ): Promise<{ success: boolean; record?: any; error?: string }> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Não autenticado' };
      const res = await fetch('/api/executions/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          execution_token: executionToken,
          receipt,
          receipt_signature: receiptSignature,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, record: data.record };
      }
      return { success: false, error: data.error || 'Falha na finalização pelo servidor' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Tool Execution - Strict Authorized Flow (React -> Backend Token -> AgentBridge -> Windows Agent -> Verify -> Official History)
  const executeOptimizationTool = async (toolId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) {
      return { success: false, message: 'Usuário não autenticado.' };
    }

    const tool = tools.find((t) => t.tool_id === toolId);
    if (!tool) {
      return { success: false, message: 'Ferramenta não localizada.' };
    }

    // UX check: implementation status
    if (tool.implementation_status !== 'IMPLEMENTED') {
      addToast(
        'info',
        'Em Desenvolvimento',
        `A otimização "${tool.nome}" está em desenvolvimento e não possui rotina nativa implementada no Windows Agent.`
      );
      return {
        success: false,
        message: 'Esta ferramenta está em desenvolvimento e não possui rotina nativa implementada.',
      };
    }

    // Strict permission check
    if (currentUser.nivel_plano < tool.required_plan_level && currentUser.role !== 'ADMIN') {
      openUpgradeModal(tool.required_plan_level, tool.nome, tool.categoria);
      addToast(
        'info',
        'Upgrade Necessário',
        `Esta função está disponível a partir do ${getPlanNameByLevel(tool.required_plan_level)}. Faça upgrade para executá-la no seu computador.`
      );
      return {
        success: false,
        message: `Esta ferramenta requer o plano ${getPlanNameByLevel(tool.required_plan_level)} ou superior.`,
      };
    }

    // Windows Agent check requirement
    if (config.require_agent_connection && !device.is_agent_connected) {
      addToast(
        'error',
        'Windows Agent Desconectado',
        'Conecte o DYARTE Windows Agent para que os scripts e chamadas de API do Windows possam ser executados com segurança.'
      );
      return {
        success: false,
        message: 'Agente Windows desconectado. Inicie o dyarte-agent.exe em seu computador.',
      };
    }

    setIsOptimizing(true);
    setActiveOptimizingToolId(toolId);

    // If it's AMD or NVIDIA driver tools, trigger driver pipeline
    if (toolId === 'tool_gpu_amd_driver' || toolId === 'tool_gpu_amd_opt') {
      const pipeRes = await executeDriverPipeline('AMD');
      setIsOptimizing(false);
      setActiveOptimizingToolId(null);
      return { success: false, message: pipeRes.message };
    }

    if (toolId === 'tool_gpu_nvidia_driver' || toolId === 'tool_gpu_nvidia_opt') {
      const pipeRes = await executeDriverPipeline('NVIDIA');
      setIsOptimizing(false);
      setActiveOptimizingToolId(null);
      return { success: false, message: pipeRes.message };
    }

    // If it's DDU clean tool, trigger dedicated DDU pipeline
    if (toolId === 'tool_gpu_clean_drivers') {
      const dduRes = await executeDduPipeline();
      setIsOptimizing(false);
      setActiveOptimizingToolId(null);
      return {
        success: false,
        message:
          dduRes.status === 'DDU_LAUNCHED'
            ? 'DDU iniciado. Aguardando operação do usuário no Display Driver Uninstaller.'
            : dduRes.error || 'DDU não pôde ser iniciado.',
      };
    }

    // 1. Request signed execution token from Backend Authority
    const authRes = await requestExecutionAuthorization(toolId, device.device_id, 'APPLY');
    if (!authRes.authorized || !authRes.execution_token || !authRes.execution_id || !authRes.request_id) {
      setIsOptimizing(false);
      setActiveOptimizingToolId(null);
      const failMsg = authRes.error || 'Autorização negada pelo servidor central.';
      addToast('error', 'Autorização Negada', failMsg);
      return { success: false, message: failMsg };
    }

    // 2. Requirement 3: Transition to EXECUTING state in Backend Execution Registry
    const startRes = await startExecutionOnBackend(authRes.execution_id, authRes.request_id);
    if (!startRes.success) {
      setIsOptimizing(false);
      setActiveOptimizingToolId(null);
      const failMsg = startRes.error || 'Falha ao registrar início da execução no servidor central.';
      addToast('error', 'Falha no Registro', failMsg);
      return { success: false, message: failMsg };
    }

    // 3. Dispatch execution with signed token and backend request_id through OptimizationEngine to Windows Agent
    const result = await optimizationEngine.applyTool(
      toolId,
      currentUser.nivel_plano,
      authRes.execution_token,
      authRes.request_id
    );

    setIsOptimizing(false);
    setActiveOptimizingToolId(null);

    const realDuration = typeof result.durationMs === 'number' ? Math.max(0, result.durationMs) : 0;

    // 4. Strict Verification: finalize execution on backend only with valid Agent receipt
    if (!result.success || !result.verified || !result.receipt) {
      const failMsg = result.error || result.message || 'Falha na execução ou verificação pelo Windows Agent.';
      if (result.receipt) {
        await completeExecutionOnBackend(authRes.execution_token, result.receipt, result.receiptSignature);
      }
      addToast('warning', 'Não Executado pelo Agent', failMsg);
      return { success: false, message: failMsg };
    }

    // 5. Finalize verified success in official backend registry and history
    const completeRes = await completeExecutionOnBackend(
      authRes.execution_token,
      result.receipt,
      result.receiptSignature
    );

    if (!completeRes.success) {
      const failMsg = completeRes.error || 'Falha ao validar recibo criptográfico no servidor central.';
      addToast('error', 'Validação Rejeitada', failMsg);
      return { success: false, message: failMsg };
    }

    const historyItem: OptimizationHistoryItem = completeRes.record || {
      history_id: `hist_${Date.now()}`,
      user_id: currentUser.user_id,
      tool_id: tool.tool_id,
      tool_name: tool.nome,
      category: tool.categoria,
      date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: 'SUCESSO',
      result: result.message || `Otimização aplicada e confirmada pelo Windows Agent: ${tool.nome}.`,
      duration_ms: realDuration,
      details: result.afterState
        ? `Antes: ${JSON.stringify(result.beforeState)} | Depois: ${JSON.stringify(result.afterState)}`
        : tool.details,
    };

    setHistory((prev) => [historyItem, ...prev]);

    // Update user last optimization
    const updatedUser: User = {
      ...currentUser,
      ultimo_login: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    setCurrentUser(updatedUser);
    setUsers((prev) => prev.map((u) => (u.user_id === updatedUser.user_id ? updatedUser : u)));

    addToast('success', 'Otimização Concluída', `${tool.nome} aplicada e verificada com êxito no Windows.`);
    return { success: true, message: 'Otimização aplicada com sucesso pelo Agente Windows.' };
  };

  const toggleOptimizationTool = async (
    toolId: string
  ): Promise<{ success: boolean; message: string; active?: boolean }> => {
    if (!currentUser) {
      return { success: false, message: 'Usuário não autenticado.' };
    }

    const tool = tools.find((t) => t.tool_id === toolId);
    if (!tool) {
      return { success: false, message: 'Ferramenta não localizada.' };
    }

    if (tool.implementation_status !== 'IMPLEMENTED') {
      addToast('info', 'Em Desenvolvimento', `A otimização "${tool.nome}" está em desenvolvimento nativo.`);
      return { success: false, message: 'Ferramenta não implementada.' };
    }

    // Strict permission check
    if (currentUser.nivel_plano < tool.required_plan_level && currentUser.role !== 'ADMIN') {
      openUpgradeModal(tool.required_plan_level, getToolName(tool), tool.categoria);
      addToast(
        'info',
        'Upgrade Necessário',
        `Esta função requer o ${getPlanNameByLevel(tool.required_plan_level)} ou superior. Faça upgrade para ativá-la no Windows.`
      );
      return {
        success: false,
        message: `Esta ferramenta requer o plano ${getPlanNameByLevel(tool.required_plan_level)} ou superior.`,
      };
    }

    // Windows Agent check requirement
    if (config.require_agent_connection && !device.is_agent_connected) {
      addToast(
        'error',
        'Windows Agent Desconectado',
        'Conecte o DYARTE Windows Agent para alternar esta otimização no Windows.'
      );
      return {
        success: false,
        message: 'Agente Windows desconectado. Inicie o dyarte-agent.exe em seu computador.',
      };
    }

    setIsOptimizing(true);
    setActiveOptimizingToolId(toolId);

    const currentlyActive = !!activeToolsState[toolId];
    const willBeActive = !currentlyActive;

    let result;
    if (willBeActive) {
      const authRes = await requestExecutionAuthorization(toolId, device.device_id, 'APPLY');
      if (!authRes.authorized || !authRes.execution_token || !authRes.execution_id || !authRes.request_id) {
        setIsOptimizing(false);
        setActiveOptimizingToolId(null);
        const errText = authRes.error || 'Autorização negada pelo servidor central.';
        addToast('error', 'Autorização Negada', errText);
        return { success: false, message: errText, active: currentlyActive };
      }

      await startExecutionOnBackend(authRes.execution_id, authRes.request_id);

      result = await optimizationEngine.applyTool(
        toolId,
        currentUser.nivel_plano,
        authRes.execution_token,
        authRes.request_id
      );

      if (result.receipt) {
        await completeExecutionOnBackend(
          authRes.execution_token,
          result.receipt,
          result.receiptSignature
        );
      }
    } else {
      const rollbackAuthRes = await requestExecutionAuthorization(toolId, device.device_id, 'ROLLBACK');
      if (!rollbackAuthRes.authorized || !rollbackAuthRes.execution_token || !rollbackAuthRes.execution_id || !rollbackAuthRes.request_id) {
        setIsOptimizing(false);
        setActiveOptimizingToolId(null);
        const errText = rollbackAuthRes.error || 'Autorização de reversão negada pelo servidor central.';
        addToast('error', 'Autorização Negada', errText);
        return { success: false, message: errText, active: currentlyActive };
      }

      await startExecutionOnBackend(rollbackAuthRes.execution_id, rollbackAuthRes.request_id);

      result = await optimizationEngine.rollbackTool(
        toolId,
        currentUser.nivel_plano,
        undefined,
        rollbackAuthRes.execution_token,
        rollbackAuthRes.request_id
      );

      if ((result as any).receipt) {
        await completeExecutionOnBackend(
          rollbackAuthRes.execution_token,
          (result as any).receipt,
          (result as any).receiptSignature
        );
      }
    }

    setIsOptimizing(false);
    setActiveOptimizingToolId(null);

    if (!result.success || (willBeActive && !result.verified)) {
      const failMsg = result.error || result.message || 'Operação não executada pelo DYARTE Agent.';
      addToast('warning', 'Operação Não Executada', failMsg);
      return {
        success: false,
        message: failMsg,
        active: currentlyActive,
      };
    }

    // Only update state if Agent confirmed real execution
    setActiveToolsState((prev) => {
      const updated = { ...prev, [toolId]: willBeActive };
      localStorage.setItem('dyarte_active_tools', JSON.stringify(updated));
      return updated;
    });

    const toolTitle = getToolName(tool);
    const realDuration = typeof (result as any).durationMs === 'number' ? Math.max(0, (result as any).durationMs) : 0;

    const historyItem: OptimizationHistoryItem = {
      history_id: `hist_${Date.now()}`,
      user_id: currentUser.user_id,
      tool_id: tool.tool_id,
      tool_name: toolTitle,
      category: tool.categoria,
      date: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: willBeActive ? 'SUCESSO' : 'REVERTIDO',
      result: willBeActive
        ? `Otimização ativada e confirmada pelo Agent: ${toolTitle}.`
        : `Otimização desativada e confirmada pelo Agent: ${toolTitle}.`,
      duration_ms: realDuration,
      details: willBeActive ? tool.details : 'Configuração padrão do Windows restaurada pelo Agent.',
    };

    setHistory((prev) => [historyItem, ...prev]);

    // Update user last optimization
    const updatedUser: User = {
      ...currentUser,
      ultimo_login: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    setCurrentUser(updatedUser);
    setUsers((prev) => prev.map((u) => (u.user_id === updatedUser.user_id ? updatedUser : u)));

    if (willBeActive) {
      addToast('success', 'Otimização Ativada', `${toolTitle} ativado com sucesso no Windows.`);
    } else {
      addToast('info', 'Padrão do Windows Restaurado', `${toolTitle} desativado. Padrão do Windows restaurado com sucesso.`);
    }

    return {
      success: true,
      message: willBeActive ? 'Otimização ativada com sucesso.' : 'Padrão do Windows restaurado com sucesso.',
      active: willBeActive,
    };
  };

  const executeFullSystemOptimization = async (): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'Usuário não autenticado.' };

    if (config.require_agent_connection && !device.is_agent_connected) {
      addToast(
        'error',
        'Windows Agent Necessário',
        'O Agente Windows precisa estar conectado para executar a rotina de otimização no sistema.'
      );
      return { success: false, message: 'Agente desconectado.' };
    }

    const userLevel = currentUser.nivel_plano || 1;
    // Section 29 & 30: Filter strictly by IMPLEMENTED, SAFE, and plan level
    const eligibleTools = tools.filter(
      (t) =>
        t.implementation_status === 'IMPLEMENTED' &&
        t.risk_level === 'SAFE' &&
        t.required_plan_level <= userLevel &&
        t.categoria !== 'GPU'
    );

    if (eligibleTools.length === 0) {
      addToast(
        'info',
        'Rotina do Sistema',
        'Nenhuma otimização segura com rotina nativa implementada está disponível para execução em lote no momento.'
      );
      return { success: false, message: 'Nenhuma ferramenta implementada disponível para execução em lote.' };
    }

    let appliedCount = 0;
    for (const t of eligibleTools) {
      const res = await executeOptimizationTool(t.tool_id);
      if (res.success) {
        appliedCount++;
        setActiveToolsState((prev) => ({ ...prev, [t.tool_id]: true }));
      }
    }

    if (appliedCount > 0) {
      addToast(
        'success',
        'Otimização do Sistema Concluída',
        `${appliedCount} otimização(ões) aplicada(s) com êxito pelo Windows Agent.`
      );
      return { success: true, message: `${appliedCount} otimizações aplicadas.` };
    } else {
      addToast(
        'warning',
        'Falha na Otimização',
        'As ferramentas selecionadas não puderam ser verificadas pelo Windows Agent.'
      );
      return { success: false, message: 'Falha na aplicação das otimizações.' };
    }
  };

  // License manual key activation
  const activateLicenseKey = (key: string): { success: boolean; message: string } => {
    const formatted = (key || '').trim().toUpperCase();
    if (!formatted) return { success: false, message: 'Digite a chave de licença.' };

    const foundLicense = licenses.find((l) => (l?.license_key || '').toUpperCase() === formatted);
    if (!foundLicense) {
      return { success: false, message: 'Chave de licença inválida ou inexistente.' };
    }

    if (foundLicense.status === 'CANCELADA' || foundLicense.status === 'SUSPENSA') {
      return { success: false, message: `Esta licença está com status ${foundLicense.status}. Entre em contato com o suporte.` };
    }

    if (!currentUser) return { success: false, message: 'Faça login para ativar.' };

    const planObj = plans.find((p) => p.id === foundLicense.plan_id);
    const planLevel: PlanLevel = planObj?.level || 1;
    const planName = planObj?.name || 'BÁSICO';

    const updatedLic: License = {
      ...foundLicense,
      user_id: currentUser.user_id,
      user_name: currentUser.nome,
      user_email: currentUser.email,
      status: 'ATIVA',
      activated_at: new Date().toISOString(),
      device_id: device.device_id,
    };

    setLicenses((prev) => prev.map((l) => (l.license_id === updatedLic.license_id ? updatedLic : l)));

    const updatedUser: User = {
      ...currentUser,
      plano_atual: planName,
      nivel_plano: planLevel,
      status_plano: 'ATIVO',
      license_id: updatedLic.license_id,
      status_licenca: 'ATIVA',
      data_expiracao: updatedLic.expires_at,
    };

    setCurrentUser(updatedUser);
    setUsers((prev) => prev.map((u) => (u.user_id === updatedUser.user_id ? updatedUser : u)));

    addToast(
      'success',
      'Licença Ativada com Sucesso!',
      `Seu plano foi atualizado para ${planName} (Nível ${planLevel}). Todos os recursos liberados!`
    );

    return { success: true, message: `Licença ${planName} ativada com sucesso!` };
  };

  // ADMIN OPERATIONS
  const updateUserPlan = (userId: string, newPlanId: PlanId) => {
    const targetPlan = plans.find((p) => p.id === newPlanId);
    if (!targetPlan) return;

    setUsers((prev) =>
      prev.map((u) => {
        if (u.user_id === userId) {
          const updated: User = {
            ...u,
            plano_atual: targetPlan.name,
            nivel_plano: targetPlan.level,
            status_plano: 'ATIVO',
            data_expiracao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
          if (currentUser?.user_id === userId) {
            setCurrentUser(updated);
          }
          return updated;
        }
        return u;
      })
    );

    // Audit log
    const newLog: AdminLog = {
      log_id: `log_${Date.now()}`,
      admin_id: currentUser?.user_id || 'admin',
      admin_name: currentUser?.nome || 'Admin',
      action: 'Alteração de Plano de Usuário',
      target_user: userId,
      details: `Plano alterado para ${targetPlan.name} (Nível ${targetPlan.level}).`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ip_address: '127.0.0.1 (Painel Desktop)',
    };
    setAdminLogs((prev) => [newLog, ...prev]);
    addToast('success', 'Plano Atualizado', `Usuário atualizado para o plano ${targetPlan.name}.`);
  };

  const toggleUserAccountStatus = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.user_id === userId) {
          const newStatus = u.status === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';
          const updated = { ...u, status: newStatus as 'ATIVO' | 'BLOQUEADO' };
          if (currentUser?.user_id === userId) {
            setCurrentUser(updated);
          }
          return updated;
        }
        return u;
      })
    );
    addToast('info', 'Status do Usuário Alterado', 'Permissões e acesso do usuário foram atualizados.');
  };

  const deleteUserAccount = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    setLicenses((prev) => prev.filter((l) => l.user_id !== userId));
    addToast('info', 'Conta Removida', 'O usuário foi removido da lista local.');
  };

  const adminCreateLicense = (userId: string, planId: PlanId, durationDays: number): License => {
    const targetUser = users.find((u) => u.user_id === userId);
    const rnd = new Uint16Array(3);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(rnd);
    } else {
      rnd[0] = 1000 + (Date.now() % 8999);
      rnd[1] = 2000 + (Date.now() % 7999);
      rnd[2] = 3000 + (Date.now() % 6999);
    }
    const key = `DYARTE-${1000 + (rnd[0] % 9000)}-${1000 + (rnd[1] % 9000)}-${1000 + (rnd[2] % 9000)}`;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newLic: License = {
      license_id: `lic_${Date.now()}`,
      license_key: key,
      user_id: userId,
      user_name: targetUser?.nome || 'Cliente',
      user_email: targetUser?.email || 'cliente@email.com',
      plan_id: planId,
      status: 'ATIVA',
      created_at: new Date().toISOString().split('T')[0],
      activated_at: new Date().toISOString(),
      expires_at: expiresAt,
      device_id: targetUser?.device_id || 'PENDING_DEVICE_SYNC',
    };

    setLicenses((prev) => [newLic, ...prev]);

    // Update user if attached
    if (targetUser) {
      updateUserPlan(userId, planId);
    }

    const newLog: AdminLog = {
      log_id: `log_${Date.now()}`,
      admin_id: currentUser?.user_id || 'admin',
      admin_name: currentUser?.nome || 'Admin',
      action: 'Emissão Manual de Licença',
      target_user: targetUser?.email,
      details: `Gerada chave ${key} para plano ${planId.toUpperCase()} válida até ${expiresAt}.`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ip_address: '127.0.0.1 (Painel Desktop)',
    };
    setAdminLogs((prev) => [newLog, ...prev]);

    addToast('success', 'Licença Criada', `Chave ${key} gerada com sucesso.`);
    return newLic;
  };

  const adminRevokeLicense = (licenseId: string) => {
    setLicenses((prev) =>
      prev.map((l) => (l.license_id === licenseId ? { ...l, status: 'CANCELADA' as LicenseStatus } : l))
    );
    addToast('warning', 'Licença Revogada', 'A chave foi cancelada e não pode mais ser utilizada.');
  };

  const adminSuspendLicense = (licenseId: string) => {
    setLicenses((prev) =>
      prev.map((l) => (l.license_id === licenseId ? { ...l, status: 'SUSPENSA' as LicenseStatus } : l))
    );
    addToast('warning', 'Licença Suspensa', 'Acesso temporariamente bloqueado.');
  };

  const adminReactivateLicense = (licenseId: string) => {
    setLicenses((prev) =>
      prev.map((l) => (l.license_id === licenseId ? { ...l, status: 'ATIVA' as LicenseStatus } : l))
    );
    addToast('success', 'Licença Reativada', 'Acesso restaurado.');
  };

  const adminUpdateLicenseExpiry = (licenseId: string, newDate: string) => {
    setLicenses((prev) =>
      prev.map((l) => (l.license_id === licenseId ? { ...l, expires_at: newDate } : l))
    );
    addToast('success', 'Expiração Atualizada', `Nova data de validade: ${newDate}`);
  };

  const adminUpdatePlanPrice = (planId: PlanId, newPrice: number) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, price: newPrice } : p)));
    addToast('success', 'Preço Atualizado', `Plano ${planId.toUpperCase()} agora custa R$ ${newPrice.toFixed(2)}.`);
  };

  const adminUpdatePlanFeatures = (planId: PlanId, features: string[]) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, features } : p)));
    addToast('success', 'Recursos Atualizados', `Benefícios do plano ${planId.toUpperCase()} salvos.`);
  };

  const adminTogglePlanStatus = (planId: PlanId) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, active: !p.active } : p)));
    addToast('info', 'Status do Plano Alterado', 'Disponibilidade do plano alterada.');
  };

  const adminUpdateTool = (toolId: string, updates: Partial<Tool>) => {
    setTools((prev) => prev.map((t) => (t.tool_id === toolId ? { ...t, ...updates } : t)));
    addToast('success', 'Ferramenta Atualizada', 'Configurações da ferramenta salvas.');
  };

  const adminToggleToolStatus = (toolId: string) => {
    setTools((prev) =>
      prev.map((t) => {
        if (t.tool_id === toolId) {
          const newStatus = t.status === 'ATIVO' ? 'DESATIVADO' : 'ATIVO';
          return { ...t, status: newStatus as 'ATIVO' | 'DESATIVADO' };
        }
        return t;
      })
    );
  };

  const adminAddTool = (tool: Tool) => {
    setTools((prev) => [...prev, tool]);
    addToast('success', 'Nova Ferramenta Adicionada', `${tool.nome} foi cadastrada.`);
  };

  const adminUpdateConfig = (newConfig: Partial<AppConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
    addToast('success', 'Configurações Salvas', 'URLs de checkout e parâmetros do sistema atualizados.');
  };

  // Webhook integration simulator according to specification:
  // USUÁRIO -> ESCOLHE PLANO -> SITE EXTERNO -> CHECKOUT -> PAGAMENTO APROVADO -> WEBHOOK -> BACKEND -> ATUALIZA PLANO -> ATIVA LICENÇA -> LIBERA RECURSOS
  const adminProcessWebhookPayment = ({
    email,
    plan_id,
    transaction_id,
    amount,
  }: {
    email: string;
    plan_id: PlanId;
    transaction_id: string;
    amount: number;
  }) => {
    const targetPlan = plans.find((p) => p.id === plan_id);
    if (!targetPlan) {
      return { success: false, message: 'Plano não encontrado.' };
    }

    const safeEmail = (email || '').trim().toLowerCase();

    // Find or create user
    let user = users.find((u) => (u?.email || '').toLowerCase() === safeEmail);
    const rnd = new Uint16Array(3);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(rnd);
    } else {
      rnd[0] = 1000 + (Date.now() % 8999);
      rnd[1] = 2000 + (Date.now() % 7999);
      rnd[2] = 3000 + (Date.now() % 6999);
    }
    const key = `DYARTE-${1000 + (rnd[0] % 9000)}-${1000 + (rnd[1] % 9000)}-${1000 + (rnd[2] % 9000)}`;
    const licId = `lic_wh_${Date.now()}`;
    const expDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (!user) {
      const newId = `usr_auto_${Date.now()}`;
      user = {
        user_id: newId,
        nome: safeEmail ? safeEmail.split('@')[0] : 'Cliente',
        email: safeEmail,
        data_criacao: new Date().toISOString().split('T')[0],
        plano_atual: targetPlan.name,
        nivel_plano: targetPlan.level,
        status_plano: 'ATIVO',
        data_inicio: new Date().toISOString().split('T')[0],
        data_expiracao: expDate,
        license_id: licId,
        status_licenca: 'ATIVA',
        device_id: 'N/D',
        ultimo_login: 'Nunca',
        role: 'USER',
        status: 'ATIVO',
      };
      setUsers((prev) => [...prev, user!]);
    } else {
      const updatedUser: User = {
        ...user,
        plano_atual: targetPlan.name,
        nivel_plano: targetPlan.level,
        status_plano: 'ATIVO',
        data_expiracao: expDate,
        license_id: licId,
        status_licenca: 'ATIVA',
      };
      setUsers((prev) => prev.map((u) => (u.user_id === user!.user_id ? updatedUser : u)));
      if (currentUser?.user_id === user.user_id) {
        setCurrentUser(updatedUser);
      }
    }

    const newLicense: License = {
      license_id: licId,
      license_key: key,
      user_id: user.user_id,
      user_name: user.nome,
      user_email: user.email,
      plan_id: plan_id,
      status: 'ATIVA',
      created_at: new Date().toISOString().split('T')[0],
      activated_at: new Date().toISOString(),
      expires_at: expDate,
      device_id: user.device_id,
    };

    setLicenses((prev) => [newLicense, ...prev]);

    const newLog: AdminLog = {
      log_id: `log_${Date.now()}`,
      admin_id: 'webhook_gateway',
      admin_name: 'Webhook Gateway Externo',
      action: 'Aprovação de Pagamento (Webhook)',
      target_user: user.email,
      details: `Pagamento #${transaction_id} aprovado. R$ ${amount.toFixed(2)} recebidos. Plano ${targetPlan.name} ativado. Licença gerada: ${key}.`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ip_address: '54.232.11.200 (Gateway)',
    };
    setAdminLogs((prev) => [newLog, ...prev]);

    addToast(
      'success',
      'Webhook Processado com Sucesso',
      `Pagamento aprovado para ${user.email}. Plano ${targetPlan.name} liberado!`
    );

    return {
      success: true,
      message: `Pagamento aprovado. Plano ${targetPlan.name} liberado automaticamente!`,
      license_key: key,
    };
  };

  const value: AppContextType = {
    currentView,
    setCurrentView: handleSetCurrentView,
    isSyncingWithWeb,
    lastWebSync,
    syncWithWebsite,
    webBrowserLoginSync,
    currentUser,
    users,
    login,
    loginWithGoogle,
    changePassword,
    register,
    logout,
    switchUserRole,
    updateCurrentUserProfile,
    requestPasswordReset,
    plans,
    tools,
    licenses,
    history,
    device,
    config,
    adminLogs,
    isOptimizing,
    activeOptimizingToolId,
    activeToolsState,
    isToolActive,
    toggleOptimizationTool,
    executeOptimizationTool,
    executeFullSystemOptimization,
    upgradeModal,
    openUpgradeModal,
    closeUpgradeModal,
    toasts,
    addToast,
    removeToast,
    currentLanguage,
    setLanguage,
    t,
    getToolName,
    getToolDesc,
    toggleAgentConnection,
    testAgentConnection,
    refreshHardwareTelemetry,
    isHardwareDetecting,
    detectAndSetRealHardware,
    updateHardwareSpecs,
    hardwareEditModalOpen,
    setHardwareEditModalOpen,
    activateLicenseKey,
    updateUserPlan,
    toggleUserAccountStatus,
    deleteUserAccount,
    adminCreateLicense,
    adminRevokeLicense,
    adminSuspendLicense,
    adminReactivateLicense,
    adminUpdateLicenseExpiry,
    adminUpdatePlanPrice,
    adminUpdatePlanFeatures,
    adminTogglePlanStatus,
    adminUpdateTool,
    adminToggleToolStatus,
    adminAddTool,
    adminUpdateConfig,
    adminProcessWebhookPayment,
    legalModal,
    openLegalModal,
    closeLegalModal,
    safetyLockActive,
    toggleSafetyLock,
    isRestoringDefaults,
    restoreWindowsFactoryDefaults,
    safetyModalOpen,
    setSafetyModalOpen,
    driverPipeline,
    executeDriverPipeline,
    closeDriverPipeline,
    dduInfo,
    dduStatus,
    isDduRunning,
    checkDdu,
    executeDduPipeline,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const getPlanNameByLevel = (level: PlanLevel): string => {
  switch (level) {
    case 1:
      return 'BÁSICO';
    case 2:
      return 'MÉDIO';
    case 3:
      return 'AVANÇADO';
    case 4:
      return 'COMPLETO';
    default:
      return 'BÁSICO';
  }
};
