/**
 * DYARTE OPTIMIZER - Optimization Engine Contract & Registry
 *
 * Arquitetura de execução real de otimizações do Windows.
 * REGRA ABSOLUTA:
 * - Zero dados fictícios ou simulações
 * - Nenhuma operação marcada como APLICADO sem confirmação e verificação do Windows Agent
 * - Histórico de auditoria com snapshots de estado antes e depois
 * - Suporte a rollback verificado
 */

import { PlanLevel, ToolRiskLevel } from '../types';
import { CANONICAL_TOOLS } from '../data/canonicalCatalog';
import { agentBridge, AgentOptimizationResponse } from './agentBridge';
import { OptimizationToolState } from './telemetryTypes';

export interface OptimizationExecutionResult {
  success: boolean;
  verified: boolean;
  state: OptimizationToolState;
  beforeState: any;
  afterState: any;
  rollbackAvailable: boolean;
  durationMs: number;
  message: string;
  error?: string;
  error_code?: string;
  optimizationId?: string;
  receipt?: any;
  receiptSignature?: string;
}

export interface OptimizationRollbackResult {
  success: boolean;
  verified: boolean;
  state: OptimizationToolState;
  restoredState: any;
  message: string;
  error?: string;
  error_code?: string;
  optimizationId?: string;
  receipt?: any;
  receiptSignature?: string;
}

export interface IOptimizationHandler {
  id: string;
  name: string;
  requiredPlanLevel: PlanLevel;
  isReversible: boolean;
  riskLevel: ToolRiskLevel;

  checkCompatibility(): Promise<{ compatible: boolean; reason?: string }>;
  inspectCurrentState(): Promise<any>;
  apply(executionToken?: string, backendRequestId?: string): Promise<OptimizationExecutionResult>;
  rollback(beforeState?: any, executionToken?: string, backendRequestId?: string): Promise<OptimizationRollbackResult>;
  verify(): Promise<boolean>;
}

/**
 * Handler Real de Referência: Plano de Energia Otimizado DYARTE (tool_perf_power_plan)
 * Interage diretamente com o Windows via PowerCfg através do dyarte-agent.exe
 */
export class PowerPlanOptimizationHandler implements IOptimizationHandler {
  public readonly id = 'tool_perf_power_plan';
  public readonly name = 'Plano de Energia Otimizado DYARTE';
  public readonly requiredPlanLevel: PlanLevel = 2; // Plano MÉDIO conforme especificação
  public readonly isReversible = true;
  public readonly riskLevel: ToolRiskLevel = 'SAFE';

  public async checkCompatibility(): Promise<{ compatible: boolean; reason?: string }> {
    if (agentBridge.getState() !== 'AGENT_ONLINE') {
      return {
        compatible: false,
        reason: 'Windows Agent offline. Inicie o dyarte-agent.exe em 127.0.0.1:49152 para verificar compatibilidade.',
      };
    }

    try {
      const status = await agentBridge.getStatus(3000);
      if (!status.is_windows) {
        return {
          compatible: false,
          reason: 'Esta otimização requer o sistema operacional Windows 10 ou 11.',
        };
      }
      return { compatible: true };
    } catch {
      return {
        compatible: false,
        reason: 'Não foi possível consultar as informações do sistema através do Agent.',
      };
    }
  }

  public async inspectCurrentState(): Promise<any> {
    if (agentBridge.getState() !== 'AGENT_ONLINE') {
      return { error: 'Agent offline' };
    }
    const status = await agentBridge.getStatus(3000);
    return status.power_scheme || { error: 'Estado de energia não informado' };
  }

  public async apply(executionToken?: string, backendRequestId?: string): Promise<OptimizationExecutionResult> {
    if (!executionToken) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        beforeState: null,
        afterState: null,
        rollbackAvailable: false,
        durationMs: 0,
        message: 'Token de execução obrigatório ausente. A otimização deve ser autorizada pelo backend.',
        error: 'INVALID_TOKEN',
      };
    }

    if (!backendRequestId) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        beforeState: null,
        afterState: null,
        rollbackAvailable: false,
        durationMs: 0,
        message: 'request_id do backend obrigatório ausente. A otimização deve possuir identificador único do backend.',
        error: 'REQUEST_ID_MISSING',
      };
    }

    const compat = await this.checkCompatibility();
    if (!compat.compatible) {
      return {
        success: false,
        verified: false,
        state: 'INCOMPATIVEL',
        beforeState: null,
        afterState: null,
        rollbackAvailable: false,
        durationMs: 0,
        message: compat.reason || 'Ambiente incompatível.',
        error: compat.reason,
      };
    }

    const resp: AgentOptimizationResponse = await agentBridge.requestApplyOptimization(this.id, executionToken, backendRequestId, 10000);

    return {
      success: resp.success,
      verified: Boolean(resp.verified),
      state: resp.state || (resp.success ? 'APLICADO' : 'FALHA'),
      beforeState: resp.before_state || null,
      afterState: resp.after_state || null,
      rollbackAvailable: Boolean(resp.rollback_available),
      durationMs: typeof resp.duration_ms === 'number' ? Math.max(0, resp.duration_ms) : 0,
      message: resp.message || (resp.success ? 'Plano de energia aplicado e verificado.' : 'Falha na aplicação.'),
      error: resp.error,
      error_code: resp.error_code,
      optimizationId: resp.optimization_id,
      receipt: resp.receipt,
      receiptSignature: resp.receipt_signature,
    };
  }

  public async rollback(beforeState?: any, executionToken?: string, backendRequestId?: string): Promise<OptimizationRollbackResult> {
    if (agentBridge.getState() !== 'AGENT_ONLINE') {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        restoredState: null,
        message: 'Reversão falhou: Windows Agent offline.',
        error: 'Agent offline',
        error_code: 'AGENT_OFFLINE',
      };
    }

    if (!executionToken) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        restoredState: null,
        message: 'Token de autorização assinado ausente para rollback.',
        error: 'INVALID_TOKEN',
        error_code: 'INVALID_TOKEN',
      };
    }

    if (!backendRequestId) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        restoredState: null,
        message: 'request_id do backend obrigatório ausente para rollback.',
        error: 'REQUEST_ID_MISSING',
        error_code: 'REQUEST_ID_MISSING',
      };
    }

    const resp: AgentOptimizationResponse = await agentBridge.requestRollbackOptimization(this.id, executionToken, backendRequestId, 10000);

    return {
      success: resp.success,
      verified: Boolean(resp.verified),
      state: resp.state || (resp.success ? 'REVERTIDO' : 'FALHA'),
      restoredState: resp.after_state || beforeState || null,
      message: resp.message || (resp.success ? 'Plano de energia restaurado com sucesso.' : 'Falha ao reverter.'),
      error: resp.error,
      error_code: resp.error_code,
      optimizationId: resp.optimization_id,
      receipt: resp.receipt,
      receiptSignature: resp.receipt_signature,
    };
  }

  public async verify(): Promise<boolean> {
    if (agentBridge.getState() !== 'AGENT_ONLINE') return false;
    const status = await agentBridge.getStatus(3000);
    const highPerfGuid = '8c5e7fda-e8bf-4a96-9a14-5e7d687951d1';
    return Boolean(status.power_scheme?.guid && status.power_scheme.guid.toLowerCase() === highPerfGuid.toLowerCase());
  }
}

/**
 * Generic Handler para ferramentas do catálogo ainda em desenvolvimento de baixo nível.
 * NUNCA simula execução nem gera falso sucesso.
 */
export class GenericAgentOptimizationHandler implements IOptimizationHandler {
  public readonly id: string;
  public readonly name: string;
  public readonly requiredPlanLevel: PlanLevel;
  public readonly isReversible: boolean;
  public readonly riskLevel: ToolRiskLevel;

  constructor(
    id: string,
    name: string,
    requiredPlanLevel: PlanLevel,
    isReversible: boolean,
    riskLevel: ToolRiskLevel = 'SAFE'
  ) {
    this.id = id;
    this.name = name;
    this.requiredPlanLevel = requiredPlanLevel;
    this.isReversible = isReversible;
    this.riskLevel = riskLevel;
  }

  public async checkCompatibility(): Promise<{ compatible: boolean; reason?: string }> {
    if (agentBridge.getState() !== 'AGENT_ONLINE') {
      return {
        compatible: false,
        reason: 'DYARTE Agent não conectado. Inicie o dyarte-agent.exe no Windows.',
      };
    }
    return { compatible: true };
  }

  public async inspectCurrentState(): Promise<any> {
    return { status: 'DISPONIVEL', tool_id: this.id };
  }

  public async apply(_executionToken?: string, _backendRequestId?: string): Promise<OptimizationExecutionResult> {
    // Section 15: GenericAgentOptimizationHandler não deve enviar comandos para ferramentas NOT_IMPLEMENTED.
    // Retorna diretamente sem comunicar ao Agent.
    return {
      success: false,
      verified: false,
      state: 'DISPONIVEL',
      beforeState: null,
      afterState: null,
      rollbackAvailable: false,
      durationMs: 0,
      message: 'Esta ferramenta está em desenvolvimento e não possui rotina nativa implementada no Windows Agent.',
      error: 'TOOL_NOT_IMPLEMENTED',
      error_code: 'TOOL_NOT_IMPLEMENTED',
    };
  }

  public async rollback(_beforeState?: any, _executionToken?: string, _backendRequestId?: string): Promise<OptimizationRollbackResult> {
    return {
      success: false,
      verified: false,
      state: 'DISPONIVEL',
      restoredState: null,
      message: 'Esta ferramenta está em desenvolvimento e não possui rotina nativa de reversão implementada.',
      error: 'TOOL_NOT_IMPLEMENTED',
      error_code: 'TOOL_NOT_IMPLEMENTED',
    };
  }

  public async verify(): Promise<boolean> {
    return false;
  }
}

/**
 * Engine Central de Otimizações
 */
export class OptimizationEngine {
  private static instance: OptimizationEngine;
  private handlers: Map<string, IOptimizationHandler> = new Map();

  private constructor() {
    this.registerDefaultHandlers();
  }

  public static getInstance(): OptimizationEngine {
    if (!OptimizationEngine.instance) {
      OptimizationEngine.instance = new OptimizationEngine();
    }
    return OptimizationEngine.instance;
  }

  private registerDefaultHandlers() {
    // 1. Registrar o handler real de referência
    this.registerHandler(new PowerPlanOptimizationHandler());

    // 2. Registrar handlers canônicos para todas as demais ferramentas do catálogo oficial
    for (const tool of CANONICAL_TOOLS) {
      if (tool.tool_id === 'tool_perf_power_plan') continue; // Já registrado
      this.registerHandler(
        new GenericAgentOptimizationHandler(
          tool.tool_id,
          tool.nome,
          tool.required_plan_level,
          Boolean(tool.is_reversible),
          tool.risk_level || 'SAFE'
        )
      );
    }
  }

  public registerHandler(handler: IOptimizationHandler) {
    this.handlers.set(handler.id, handler);
  }

  public getHandler(toolId: string): IOptimizationHandler | undefined {
    return this.handlers.get(toolId);
  }

  public getAllHandlers(): IOptimizationHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Executa a aplicação de uma otimização com verificação estrita de plano e auditoria
   */
  public async applyTool(
    toolId: string,
    userPlanLevel: PlanLevel = 1,
    executionToken?: string,
    backendRequestId?: string
  ): Promise<OptimizationExecutionResult> {
    const handler = this.getHandler(toolId);
    if (!handler) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        beforeState: null,
        afterState: null,
        rollbackAvailable: false,
        durationMs: 0,
        message: `Ferramenta '${toolId}' não registrada no OptimizationEngine.`,
        error: 'FERRAMENTA_NAO_ENCONTRADA',
      };
    }

    // Validação estrita de nível de plano (1 = Básico, 2 = Médio, 3 = Avançado, 4 = Completo)
    if (userPlanLevel < handler.requiredPlanLevel) {
      return {
        success: false,
        verified: false,
        state: 'DISPONIVEL',
        beforeState: null,
        afterState: null,
        rollbackAvailable: false,
        durationMs: 0,
        message: `Esta otimização requer o Plano Nível ${handler.requiredPlanLevel} ou superior. Seu plano atual é Nível ${userPlanLevel}.`,
        error: 'PLANO_INSUFICIENTE',
      };
    }

    return await handler.apply(executionToken, backendRequestId);
  }

  /**
   * Compatibilidade com chamadas legado
   */
  public async executeTool(
    toolId: string,
    userPlanLevel: PlanLevel = 1,
    executionToken?: string,
    backendRequestId?: string
  ): Promise<OptimizationExecutionResult> {
    return this.applyTool(toolId, userPlanLevel, executionToken, backendRequestId);
  }

  /**
   * Executa rollback com auditoria
   */
  public async rollbackTool(
    toolId: string,
    userPlanLevel: PlanLevel = 1,
    beforeState?: any,
    executionToken?: string,
    backendRequestId?: string
  ): Promise<OptimizationRollbackResult> {
    const handler = this.getHandler(toolId);
    if (!handler) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        restoredState: null,
        message: `Ferramenta '${toolId}' não registrada.`,
        error: 'FERRAMENTA_NAO_ENCONTRADA',
        error_code: 'TOOL_NOT_FOUND',
      };
    }

    if (userPlanLevel < handler.requiredPlanLevel) {
      return {
        success: false,
        verified: false,
        state: 'FALHA',
        restoredState: null,
        message: 'Permissão de plano insuficiente para reversão.',
        error: 'PLANO_INSUFICIENTE',
        error_code: 'PLAN_INSUFFICIENT',
      };
    }

    return await handler.rollback(beforeState, executionToken, backendRequestId);
  }
}

export const optimizationEngine = OptimizationEngine.getInstance();
