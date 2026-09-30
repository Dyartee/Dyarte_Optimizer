/**
 * DYARTE OPTIMIZER - Local Agent Bridge
 * Conexão segura via WebSocket local (127.0.0.1:49152) com o dyarte-agent.exe
 */

import {
  AgentConnectionState,
  SystemTelemetry,
  TelemetrySnapshot,
  OptimizationToolState,
} from './telemetryTypes';
import { HardwareInventory } from '../types';

let globalRequestSeq = 0;
function generateRequestId(prefix: string): string {
  globalRequestSeq = (globalRequestSeq + 1) % 1000000;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${globalRequestSeq}`;
}

export interface AgentOptimizationResponse {
  success: boolean;
  state: OptimizationToolState;
  verified?: boolean;
  before_state?: any;
  after_state?: any;
  rollback_available?: boolean;
  duration_ms?: number;
  message?: string;
  error?: string;
  error_code?: string;
  optimization_id?: string;
  request_id?: string;
  receipt?: any;
  receipt_signature?: string;
}

export interface AgentStatusResponse {
  success: boolean;
  status: 'ONLINE' | 'OFFLINE';
  os?: string;
  is_windows?: boolean;
  power_scheme?: {
    guid: string;
    name: string;
  };
  device_id?: string;
  agent_public_key?: string;
  cpu?: string;
  gpu?: string;
  ram?: string;
  storage?: string;
  motherboard?: string;
  bios_version?: string;
  secure_boot?: boolean | null;
  error?: string;
}

export type AgentMessageListener = (snapshot: TelemetrySnapshot) => void;
export type AgentStateListener = (state: AgentConnectionState) => void;

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: any;
  command?: string;
}

class AgentBridgeService {
  private socket: WebSocket | null = null;
  private connectionState: AgentConnectionState = 'AGENT_OFFLINE';
  private telemetryListeners: Set<AgentMessageListener> = new Set();
  private stateListeners: Set<AgentStateListener> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private currentSnapshot: TelemetrySnapshot | null = null;
  private lastPingTimestamp: number = 0;
  private lastLatencyMs: number = 0;

  private pendingRequests: Map<string, PendingRequest> = new Map();

  private readonly AGENT_PORT = 49152;
  private readonly AGENT_HOST = '127.0.0.1'; // Conexão estrita em loopback local
  private readonly PROTOCOL_VERSION = 1;

  public getState(): AgentConnectionState {
    return this.connectionState;
  }

  public getLatency(): number {
    return this.lastLatencyMs;
  }

  public getLatestTelemetry(): SystemTelemetry | null {
    return this.currentSnapshot ? this.currentSnapshot.telemetry : null;
  }

  public onTelemetry(listener: AgentMessageListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.currentSnapshot) {
      listener(this.currentSnapshot);
    }
    return () => this.telemetryListeners.delete(listener);
  }

  public onStateChange(listener: AgentStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.connectionState);
    return () => this.stateListeners.delete(listener);
  }

  private setState(newState: AgentConnectionState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.stateListeners.forEach((listener) => {
        try {
          listener(newState);
        } catch (err) {
          console.error('Erro no listener de estado do agente:', err);
        }
      });
    }
  }

  /**
   * 1. Conectar ao dyarte-agent.exe em 127.0.0.1:49152
   */
  public connect() {
    console.log('[AgentBridge] connect chamado');
    if (typeof window === 'undefined') return;

    // Evita abrir múltiplos sockets simultâneos
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      console.log('[AgentBridge] Socket já ativo ou conectando (readyState:', this.socket.readyState, ')');
      return;
    }

    this.setState('AGENT_CONNECTING');

    try {
      const wsUrl = `ws://${this.AGENT_HOST}:${this.AGENT_PORT}`;
      console.log('[AgentBridge] WebSocket CONNECTING para', wsUrl);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[AgentBridge] WebSocket OPEN');
        // Envia handshake inicial. Estado transita para ONLINE apenas após HANDSHAKE_ACK
        this.sendHandshake();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch {
          // Payload inválido descartado com segurança
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[AgentBridge] WebSocket ERROR:', err);
        this.setState('AGENT_ERROR');
      };

      this.socket.onclose = (event) => {
        console.log('[AgentBridge] WebSocket CLOSED (code:', event.code, 'reason:', event.reason, ')');
        this.setState('AGENT_OFFLINE');
        this.stopHeartbeat();
        this.clearPendingRequests('Conexão encerrada pelo agente.');
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[AgentBridge] Falha ao criar WebSocket:', err);
      this.setState('AGENT_ERROR');
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    console.log('[AgentBridge] disconnect chamado');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.clearPendingRequests('Desconexão solicitada pelo usuário.');

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.setState('AGENT_OFFLINE');
  }

  /**
   * 2. Realizar Handshake
   */
  private sendHandshake() {
    console.log('[AgentBridge] HANDSHAKE enviado');
    this.sendMessage({
      protocol_version: this.PROTOCOL_VERSION,
      type: 'HANDSHAKE',
      client: 'DYARTE_OPTIMIZER',
    });
  }

  /**
   * 4. Enviar PING
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.lastPingTimestamp = Date.now();
        this.sendMessage({
          protocol_version: this.PROTOCOL_VERSION,
          type: 'PING',
          timestamp: this.lastPingTimestamp,
        });
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 4000);
  }

  private sendMessage(payload: Record<string, any>) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * 6. Executar TEST_CONNECTION
   */
  public async testConnection(customRequestId?: string, timeoutMs: number = 5000): Promise<{
    success: boolean;
    agent_version?: string;
    request_id?: string;
    error?: string;
  }> {
    if (this.connectionState !== 'AGENT_ONLINE' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: 'Agente offline. Inicie o dyarte-agent.exe em 127.0.0.1:49152 para conectar.',
      };
    }

    const requestId = customRequestId || generateRequestId('req');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          error: 'Tempo limite esgotado aguardando TEST_CONNECTION_RESULT do agente.',
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (resp.type === 'TEST_CONNECTION_RESULT') {
            resolve({
              success: Boolean(resp.success),
              agent_version: resp.agent_version || '1.0.0',
              request_id: resp.request_id,
            });
          } else {
            resolve({
              success: false,
              error: resp.error || 'Resposta inesperada do agente.',
            });
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          resolve({ success: false, error: err.message });
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'TEST_CONNECTION',
      });
    });
  }

  /**
   * Consulta status e dados básicos do Windows Agent
   */
  public async getStatus(timeoutMs: number = 5000): Promise<AgentStatusResponse> {
    if (this.connectionState !== 'AGENT_ONLINE' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        status: 'OFFLINE',
        error: 'Agente offline. Inicie o dyarte-agent.exe em 127.0.0.1:49152 para conectar.',
      };
    }

    const requestId = generateRequestId('status');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          status: 'OFFLINE',
          error: 'Tempo limite esgotado aguardando STATUS_RESULT do agente.',
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (resp.type === 'STATUS_RESULT') {
            resolve({
              success: true,
              status: 'ONLINE',
              os: resp.os,
              is_windows: resp.is_windows,
              power_scheme: resp.power_scheme,
              device_id: resp.device_id,
              cpu: resp.cpu,
              gpu: resp.gpu,
              ram: resp.ram,
              storage: resp.storage,
              motherboard: resp.motherboard,
              bios_version: resp.bios_version,
              secure_boot: resp.secure_boot,
            });
          } else {
            resolve({
              success: false,
              status: 'OFFLINE',
              error: resp.error || 'Resposta inesperada do agente.',
            });
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          resolve({ success: false, status: 'OFFLINE', error: err.message });
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'GET_STATUS',
      });
    });
  }

  /**
   * Consulta o inventário completo e real de hardware detectado pelo Windows Agent nativo.
   * WMI / Win32 / CIM / SetupAPI / DXGI / Registry / PowerCfg
   */
  public async getHardwareInventory(timeoutMs = 8000): Promise<{
    success: boolean;
    inventory?: HardwareInventory;
    error?: string;
  }> {
    if (this.connectionState !== 'AGENT_ONLINE' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: 'Agente offline. Conecte o dyarte-agent.exe no Windows (127.0.0.1:49152).',
      };
    }

    const requestId = generateRequestId('hwinv');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          error: 'Tempo limite esgotado aguardando HARDWARE_INVENTORY_RESULT do agente.',
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (resp.type === 'HARDWARE_INVENTORY_RESULT') {
            resolve({
              success: true,
              inventory: resp.inventory,
            });
          } else {
            resolve({
              success: false,
              error: resp.error || 'Resposta inesperada do agente.',
            });
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          resolve({ success: false, error: err.message });
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'GET_HARDWARE_INVENTORY',
      });
    });
  }

  /**
   * Solicita snapshot de telemetria em tempo real ao Windows Agent
   */
  public async requestTelemetry(timeoutMs = 4000): Promise<TelemetrySnapshot | null> {
    if (this.connectionState !== 'AGENT_ONLINE' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return null;
    }

    const requestId = generateRequestId('tel');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(this.currentSnapshot);
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timer);
          resolve(this.currentSnapshot);
        },
        reject: () => {
          clearTimeout(timer);
          resolve(null);
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'GET_TELEMETRY',
      });
    });
  }

  /**
   * Processamento das mensagens recebidas do Agente Windows
   */
  private handleIncomingMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return;

    // 3. Receber HANDSHAKE_ACK
    if (msg.type === 'HANDSHAKE_ACK') {
      console.log('[AgentBridge] HANDSHAKE_ACK recebido:', msg);
      if (msg.status === 'ONLINE') {
        this.setState('AGENT_ONLINE');
        this.startHeartbeat();
      }
      return;
    }

    // 5. Receber PONG
    if (msg.type === 'PONG') {
      if (this.lastPingTimestamp > 0) {
        this.lastLatencyMs = Math.max(1, Date.now() - this.lastPingTimestamp);
      }
      return;
    }

    // Telemetria enviada pelo agente
    if (msg.type === 'TELEMETRY_SNAPSHOT') {
      const cpuUsage = typeof msg.data?.cpu?.usage === 'number'
        ? msg.data.cpu.usage
        : (typeof msg.cpu_usage === 'number' ? msg.cpu_usage : null);
      const cpuTemp = typeof msg.data?.cpu?.temperature === 'number'
        ? msg.data.cpu.temperature
        : (typeof msg.cpu_temp === 'number' ? msg.cpu_temp : null);
      const cpuClock = typeof msg.data?.cpu?.clock_mhz === 'number'
        ? msg.data.cpu.clock_mhz
        : (typeof msg.cpu_clock_mhz === 'number' ? msg.cpu_clock_mhz : null);

      const gpuUsage = typeof msg.data?.gpu?.usage === 'number'
        ? msg.data.gpu.usage
        : (typeof msg.gpu_usage === 'number' ? msg.gpu_usage : null);
      const gpuTemp = typeof msg.data?.gpu?.temperature === 'number'
        ? msg.data.gpu.temperature
        : (typeof msg.gpu_temp === 'number' ? msg.gpu_temp : null);
      const gpuClock = typeof msg.data?.gpu?.clock_mhz === 'number'
        ? msg.data.gpu.clock_mhz
        : (typeof msg.gpu_clock_mhz === 'number' ? msg.gpu_clock_mhz : null);

      const ramUsage = typeof msg.data?.memory?.usage === 'number'
        ? msg.data.memory.usage
        : (typeof msg.ram_usage === 'number' ? msg.ram_usage : null);
      const ramUsedMb = typeof msg.data?.memory?.used_mb === 'number'
        ? msg.data.memory.used_mb
        : (typeof msg.data?.memory?.used_mb === 'number' ? msg.data.memory.used_mb : null);
      const ramTotalMb = typeof msg.data?.memory?.total_mb === 'number'
        ? msg.data.memory.total_mb
        : (typeof msg.data?.memory?.total_mb === 'number' ? msg.data.memory.total_mb : null);

      const snapshot: TelemetrySnapshot = {
        version: msg.version || this.PROTOCOL_VERSION,
        timestamp: msg.timestamp || Date.now(),
        agent_version: msg.agent_version || '1.0.0',
        telemetry: {
          timestamp: msg.timestamp || Date.now(),
          cpu_usage: cpuUsage,
          cpu_temperature: cpuTemp,
          cpu_clock_mhz: cpuClock,
          cpu_power_w: typeof msg.data?.cpu?.power_w === 'number' ? msg.data.cpu.power_w : null,

          gpu_usage: gpuUsage,
          gpu_temperature: gpuTemp,
          gpu_clock_mhz: gpuClock,
          gpu_memory_used_mb: typeof msg.data?.gpu?.memory_used_mb === 'number' ? msg.data.gpu.memory_used_mb : null,
          gpu_memory_total_mb: typeof msg.data?.gpu?.memory_total_mb === 'number' ? msg.data.gpu.memory_total_mb : null,
          gpu_power_w: typeof msg.data?.gpu?.power_w === 'number' ? msg.data.gpu.power_w : null,
          gpu_vendor: msg.data?.gpu?.vendor || 'UNKNOWN',
          gpu_model: msg.data?.gpu?.model || null,
          driver_version: msg.data?.gpu?.driver_version || null,
          rebar_enabled: typeof msg.data?.gpu?.rebar_enabled === 'boolean' ? msg.data.gpu.rebar_enabled : null,

          ram_usage_pct: ramUsage,
          ram_used_mb: ramUsedMb,
          ram_total_mb: ramTotalMb,

          active_process: msg.data?.game?.process || null,
          active_game_pid: typeof msg.data?.game?.pid === 'number' ? msg.data.game.pid : null,
          active_game_name: msg.data?.game?.name || null,
          fps: typeof msg.data?.game?.fps === 'number' ? msg.data.game.fps : null,
          frametime_ms: typeof msg.data?.game?.frametime_ms === 'number' ? msg.data.game.frametime_ms : null,
          gpu_latency_ms: typeof msg.data?.game?.gpu_latency_ms === 'number' ? msg.data.game.gpu_latency_ms : null,
          presentmon_available: Boolean(msg.data?.game?.presentmon_available),
        },
      };

      this.currentSnapshot = snapshot;
      this.telemetryListeners.forEach((listener) => listener(snapshot));
    }

    // Request ID correlation (e.g. TEST_CONNECTION_RESULT, GET_STATUS, GET_TELEMETRY)
    if (msg.request_id && this.pendingRequests.has(msg.request_id)) {
      const pending = this.pendingRequests.get(msg.request_id);
      this.pendingRequests.delete(msg.request_id);
      if (pending) {
        pending.resolve(msg);
      }
      return;
    }
  }

  private clearPendingRequests(reason: string) {
    this.pendingRequests.forEach((req) => {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    });
    this.pendingRequests.clear();
  }

  /**
   * Solicita aplicação de otimização por ID
   * Requirement 2: AgentBridge envia EXATAMENTE o request_id emitido pelo backend.
   */
  public async applyOptimization(
    toolId: string,
    executionToken: string,
    backendRequestId: string
  ): Promise<AgentOptimizationResponse> {
    return this.requestApplyOptimization(toolId, executionToken, backendRequestId);
  }

  public async requestApplyOptimization(
    toolId: string,
    executionToken: string,
    backendRequestId: string,
    timeoutMs = 10000
  ): Promise<AgentOptimizationResponse> {
    if (this.connectionState !== 'AGENT_ONLINE') {
      return {
        success: false,
        state: 'FALHA',
        verified: false,
        error_code: 'AGENT_OFFLINE',
        error: 'DYARTE Agent não conectado no Windows (127.0.0.1:49152).',
      };
    }

    if (!executionToken) {
      return {
        success: false,
        state: 'FALHA',
        verified: false,
        error_code: 'INVALID_TOKEN',
        error: 'Token de autorização assinado ausente. Solicite autorização ao backend antes de executar.',
      };
    }

    if (!backendRequestId || typeof backendRequestId !== 'string' || backendRequestId.trim() === '') {
      return {
        success: false,
        state: 'FALHA',
        verified: false,
        error_code: 'REQUEST_ID_MISSING',
        error: 'request_id emitido pelo backend é obrigatório. Nunca gerar request_id no AgentBridge.',
      };
    }

    const requestId = backendRequestId.trim();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          state: 'FALHA',
          verified: false,
          error_code: 'APPLY_FAILED',
          error: 'Tempo limite esgotado aguardando resposta do DYARTE Agent.',
          request_id: requestId,
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (resp.type === 'OPTIMIZATION_RESULT') {
            resolve({
              success: Boolean(resp.success),
              state: resp.state || (resp.success ? 'APLICADO' : 'FALHA'),
              verified: Boolean(resp.verified),
              before_state: resp.before_state,
              after_state: resp.after_state,
              rollback_available: Boolean(resp.rollback_available),
              duration_ms: typeof resp.duration_ms === 'number' ? Math.max(0, resp.duration_ms) : 0,
              message: resp.message,
              error: resp.error || (!resp.success ? resp.message : undefined),
              error_code: resp.error_code,
              optimization_id: resp.optimization_id,
              request_id: resp.request_id || requestId,
              receipt: resp.receipt,
              receipt_signature: resp.receipt_signature,
            });
          } else if (resp.type === 'ERROR') {
            resolve({
              success: false,
              state: 'FALHA',
              verified: false,
              error: resp.error || 'Erro reportado pelo Agent.',
              error_code: resp.error_code || 'APPLY_FAILED',
              request_id: resp.request_id || requestId,
            });
          } else {
            resolve({
              success: false,
              state: 'FALHA',
              verified: false,
              error: 'Resposta inesperada do Agent.',
              error_code: 'PROTOCOL_MISMATCH',
              request_id: resp.request_id || requestId,
            });
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          resolve({ success: false, state: 'FALHA', verified: false, error: err.message, request_id: requestId });
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'APPLY_OPTIMIZATION',
        tool_id: toolId,
        execution_token: executionToken,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Solicita rollback específico com token de autorização e request_id emitido pelo backend
   * Requirement 2: O backend deve gerar o request_id. Nunca gerar request_id da execução no AgentBridge.
   */
  public async rollbackOptimization(
    toolId: string,
    executionToken: string,
    backendRequestId: string
  ): Promise<AgentOptimizationResponse> {
    return this.requestRollbackOptimization(toolId, executionToken, backendRequestId);
  }

  public async requestRollbackOptimization(
    toolId: string,
    executionToken: string,
    backendRequestId: string,
    timeoutMs = 8000
  ): Promise<AgentOptimizationResponse> {
    if (this.connectionState !== 'AGENT_ONLINE') {
      return { success: false, state: 'FALHA', verified: false, error: 'DYARTE Agent offline.', error_code: 'AGENT_OFFLINE' };
    }

    if (!executionToken) {
      return {
        success: false,
        state: 'FALHA',
        verified: false,
        error: 'Token de autorização assinado ausente para rollback.',
        error_code: 'INVALID_TOKEN',
      };
    }

    if (!backendRequestId || typeof backendRequestId !== 'string' || backendRequestId.trim() === '') {
      return {
        success: false,
        state: 'FALHA',
        verified: false,
        error: 'request_id emitido pelo backend é obrigatório para rollback. Nunca gerar request_id no AgentBridge.',
        error_code: 'REQUEST_ID_MISSING',
      };
    }

    const requestId = backendRequestId.trim();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          state: 'FALHA',
          verified: false,
          error: 'Tempo limite esgotado aguardando reversão do DYARTE Agent.',
          error_code: 'ROLLBACK_FAILED',
          request_id: requestId,
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (resp.type === 'OPTIMIZATION_RESULT') {
            resolve({
              success: Boolean(resp.success),
              state: resp.state || (resp.success ? 'REVERTIDO' : 'FALHA'),
              verified: Boolean(resp.verified),
              before_state: resp.before_state,
              after_state: resp.after_state,
              rollback_available: false,
              duration_ms: typeof resp.duration_ms === 'number' ? Math.max(0, resp.duration_ms) : 0,
              message: resp.message,
              error: resp.error || (!resp.success ? resp.message : undefined),
              error_code: resp.error_code,
              optimization_id: resp.optimization_id,
              request_id: resp.request_id || requestId,
              receipt: resp.receipt,
              receipt_signature: resp.receipt_signature,
            });
          } else if (resp.type === 'ERROR') {
            resolve({
              success: false,
              state: 'FALHA',
              verified: false,
              error: resp.error || 'Erro reportado pelo Agent.',
              error_code: resp.error_code || 'ROLLBACK_FAILED',
              request_id: resp.request_id || requestId,
            });
          } else {
            resolve({
              success: false,
              state: 'FALHA',
              verified: false,
              error: 'Resposta inesperada do Agent.',
              error_code: 'PROTOCOL_MISMATCH',
              request_id: resp.request_id || requestId,
            });
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          resolve({ success: false, state: 'FALHA', verified: false, error: err.message, request_id: requestId });
        },
        timer,
      });

      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'ROLLBACK_OPTIMIZATION',
        tool_id: toolId,
        execution_token: executionToken,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Execução de driver de GPU:
   * Interface unificada que integra o Windows Agent com a camada IPC nativa do Electron.
   */
  public async executeDriver(
    vendor: 'AMD' | 'NVIDIA',
    installerPath?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    console.log(`[AgentBridge] executeDriver solicitado para: ${vendor}`);

    // Se estiver no aplicativo Electron Windows, utiliza o DriverService IPC
    if (typeof window !== 'undefined' && window.dyarte?.drivers) {
      const result = await window.dyarte.drivers.executeDriverInstaller(vendor);
      return {
        success: result.success,
        message: result.message,
        error: result.error,
      };
    }

    // Se o Agent estiver online via WebSocket e conectado
    if (this.connectionState === 'AGENT_ONLINE') {
      const requestId = generateRequestId('drv');
      this.sendMessage({
        protocol_version: this.PROTOCOL_VERSION,
        request_id: requestId,
        type: 'EXECUTE_DRIVER_PACKAGE',
        vendor,
        installer_path: installerPath || null,
        timestamp: Date.now(),
      });
      return {
        success: true,
        message: `Comando de execução do driver ${vendor} transmitido ao Windows Agent.`,
      };
    }

    return {
      success: false,
      error: 'Instalação nativa de drivers requer o aplicativo desktop DYARTE OPTIMIZER para Windows com privilégios de Administrador.',
    };
  }
}

export const agentBridge = new AgentBridgeService();
