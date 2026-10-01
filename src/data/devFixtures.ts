import { User, License, AdminLog } from '../types';

/**
 * Fixtures de Desenvolvimento para testes isolados de UI em ambiente local.
 * REGRA ABSOLUTA: Nunca carregar fixtures em ambiente de PRODUÇÃO (NODE_ENV=production ou build de produção).
 */

export const DEV_USERS: User[] = [
  {
    user_id: 'usr_duarte_dev',
    nome: 'Administrador Master',
    email: 'admin@dyarte.com',
    data_criacao: '2026-08-15',
    plano_atual: 'COMPLETO',
    nivel_plano: 4,
    status_plano: 'ATIVO',
    data_inicio: '2026-09-01',
    data_expiracao: '2030-12-31',
    license_id: 'lic_duarte_dev',
    status_licenca: 'ATIVA',
    device_id: 'DEV-DEVICE-01',
    ultimo_login: 'Hoje',
    role: 'ADMIN',
    status: 'ATIVO',
  },
  {
    user_id: 'usr_dev_client',
    nome: 'Cliente Teste',
    email: 'cliente.teste@dyarte.com',
    data_criacao: '2026-09-02',
    plano_atual: 'BÁSICO',
    nivel_plano: 1,
    status_plano: 'ATIVO',
    data_inicio: '2026-09-02',
    data_expiracao: '2026-10-02',
    license_id: 'lic_dev_client',
    status_licenca: 'ATIVA',
    device_id: 'DEV-DEVICE-02',
    ultimo_login: 'Ontem',
    role: 'USER',
    status: 'ATIVO',
  },
];

export const DEV_LICENSES: License[] = [
  {
    license_id: 'lic_duarte_dev',
    license_key: 'DYARTE-8821-9944-X72A',
    user_id: 'usr_duarte_dev',
    user_name: 'Administrador Master',
    user_email: 'admin@dyarte.com',
    plan_id: 'completo',
    status: 'ATIVA',
    created_at: '2026-09-01',
    activated_at: '2026-09-01 14:00:00',
    expires_at: '2030-12-31',
    device_id: 'DEV-DEVICE-01',
  },
];

export const DEV_ADMIN_LOGS: AdminLog[] = [];

export function isDevFixturesEnabled(): boolean {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | boolean> })?.env;
    if (metaEnv) {
      if (metaEnv.PROD) return false;
      return Boolean(metaEnv.DEV && metaEnv.VITE_DEV_FIXTURES === 'true');
    }
  } catch {
    // ignore
  }
  return false;
}
