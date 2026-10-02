export type UserRole = 'USER' | 'ADMIN';

export type PlanLevel = 1 | 2 | 3 | 4;

export type PlanId = 'basico' | 'medio' | 'avancado' | 'completo';

export type LicenseStatus = 'ATIVA' | 'PENDENTE' | 'EXPIRADA' | 'SUSPENSA' | 'CANCELADA' | 'INATIVA';

export type ToolCategory = 'SISTEMA' | 'DESEMPENHO' | 'GAMING' | 'GPU';

export type ToolRiskLevel = 'SAFE' | 'ADVANCED' | 'EXPERIMENTAL';

export type AgentConnectionState =
  | 'AGENT_OFFLINE'
  | 'AGENT_CONNECTING'
  | 'AGENT_ONLINE'
  | 'AGENT_ERROR';

export type OptimizationToolState =
  | 'DISPONIVEL'
  | 'INCOMPATIVEL'
  | 'JA_APLICADO'
  | 'APLICANDO'
  | 'APLICADO'
  | 'FALHA'
  | 'REVERTENDO'
  | 'REVERTIDO';

export interface Plan {
  id: PlanId;
  name: string;
  level: 1 | 2 | 3 | 4;
  price: number;
  period: string;
  description: string;
  features: string[];
  badge?: string;
  badgeType?: 'popular' | 'max';
  active: boolean;
  checkoutUrlKey: 'basic_checkout_url' | 'medium_checkout_url' | 'advanced_checkout_url' | 'complete_checkout_url';
}

export interface User {
  user_id: string;
  nome: string;
  email: string;
  data_criacao: string;
  plano_atual: string;
  nivel_plano: PlanLevel;
  status_plano: 'ATIVO' | 'EXPIRADO' | 'PENDENTE';
  data_inicio: string;
  data_expiracao: string;
  license_id: string;
  status_licenca: LicenseStatus;
  device_id: string;
  ultimo_login: string;
  role: UserRole;
  status: 'ATIVO' | 'BLOQUEADO';
  avatar_seed?: string;
}

export interface License {
  license_id: string;
  license_key: string;
  user_id: string;
  user_name: string;
  user_email: string;
  plan_id: PlanId;
  status: LicenseStatus;
  created_at: string;
  activated_at: string;
  expires_at: string;
  device_id: string;
}

export type ToolImplementationStatus = 'IMPLEMENTED' | 'NOT_IMPLEMENTED';

export interface AgentCapabilities {
  telemetry: boolean;
  power_plan: boolean;
  rollback: boolean;
  memory_optimization?: boolean;
  startup_optimization?: boolean;
  registry_tweaks?: boolean;
  gpu_optimization?: boolean;
  driver_management?: boolean;
}

export interface Tool {
  tool_id: string;
  nome: string;
  descricao: string;
  categoria: ToolCategory;
  required_plan_level: PlanLevel;
  status: 'ATIVO' | 'DESATIVADO';
  icon: string;
  impact: 'Médio' | 'Alto' | 'Máximo';
  details: string;
  risk_level: ToolRiskLevel;
  is_reversible: boolean;
  implementation_status: ToolImplementationStatus;
  powershellSnippet?: string;
}

export interface OptimizationHistoryItem {
  history_id: string;
  user_id: string;
  device_id?: string;
  tool_id: string;
  tool_name: string;
  category: ToolCategory;
  date: string;
  status: 'SUCESSO' | 'PENDENTE' | 'FALHA' | 'REVERTIDO';
  result: string;
  duration_ms: number;
  details?: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  agent_version?: string;
  error?: string;
  rollback_available?: boolean;
  verified?: boolean;
}

export interface DeviceInfo {
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  motherboard: string;
  motherboard_chipset?: string;
  bios_version?: string;
  resizable_bar?: boolean | null;
  secure_boot?: boolean | null;
  xmp_profile?: string | null;
  input_lag_ms?: number | null;
  ram_frequency?: string | null;
  gpu_clock_mhz?: number | null;
  cpu_clock_mhz?: number | null;
  cpu_power_w?: number | null;
  cpu_temperature?: number | null;
  gpu_temperature?: number | null;
  gpu_power_w?: number | null;
  gpu_memory_used_mb?: number | null;
  gpu_memory_total_mb?: number | null;
  ram_used_mb?: number | null;
  ram_total_mb?: number | null;
  fps?: number | null;
  frametime_ms?: number | null;
  gpu_latency_ms?: number | null;
  active_process?: string | null;
  active_game_pid?: number | null;
  active_game_name?: string | null;
  driver_version?: string | null;
  windows_license?: string | null;
  windows: string;
  windows_version: string;
  build: string;
  device_id: string;
  is_agent_connected: boolean;
  agent_status?: AgentConnectionState;
  agent_version: string;
  last_heartbeat: string;
  cpu_usage_pct: number | null;
  gpu_usage_pct: number | null;
  ram_usage_pct: number | null;
  temp_c: number | null;
  ping_ms: number | null;
}

export interface AppConfig {
  basic_checkout_url: string;
  medium_checkout_url: string;
  advanced_checkout_url: string;
  complete_checkout_url: string;
  support_email: string;
  discord_url: string;
  agent_download_url: string;
  app_version: string;
  require_agent_connection: boolean;
  amd_driver_drive_url?: string;
  nvidia_driver_drive_url?: string;
  safety_lock_enabled?: boolean;
}

export interface AdminLog {
  log_id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_user?: string;
  details: string;
  timestamp: string;
  ip_address: string;
}

export type GpuVendor = 'AMD' | 'NVIDIA' | 'UNKNOWN';

export interface DriverInstallerInfo {
  found: boolean;
  fileName?: string;
  fullPath?: string;
  vendorDir?: string;
  sizeMb?: number;
  error?: string;
}

export interface DriverExecutionResult {
  success: boolean;
  status?: 'INSTALLER_LAUNCHED' | 'INSTALLATION_FAILED';
  phase?: 'executing' | 'failed' | 'completed';
  fileName?: string;
  fullPath?: string;
  sizeMb?: number;
  detectedVendor?: GpuVendor;
  message?: string;
  error?: string;
  gpuDetails?: string;
  vendorDir?: string;
}

export type DriverPipelineStatusCode = 'PENDING' | 'EXECUTING' | 'PENDING_EXTERNAL_OPERATION' | 'PENDING_REBOOT' | 'REBOOT_REQUIRED' | 'FAILED' | 'SUCCESS';
export type DriverPipelineEventCode =
  | 'INSTALLER_LAUNCHED'
  | 'INSTALLER_NOT_FOUND'
  | 'GPU_UNKNOWN'
  | 'GPU_INCOMPATIBLE'
  | 'DESKTOP_REQUIRED'
  | 'EXECUTION_FAILED'
  | 'START_REGISTRATION_FAILED'
  | 'PENDING_EXTERNAL_OPERATION'
  | 'REBOOT_REQUIRED'
  | 'INSTALLATION_CONFIRMED'
  | 'UNAUTHORIZED_MUTATION';

export interface DriverPipelineResult {
  status: DriverPipelineStatusCode;
  code: DriverPipelineEventCode;
  success: boolean;
  message: string;
}

export type DduStatus = 'DDU_NOT_FOUND' | 'DDU_FOUND' | 'DDU_LAUNCHED' | 'DDU_FAILED' | 'PENDING_REBOOT' | 'REBOOT_REQUIRED' | 'COMPLETED';

export interface DduPathResult {
  found: boolean;
  fullPath: string | null;
  fileName: string;
  dirPath?: string;
  sizeMb?: number;
  error?: string;
}

export interface DduExecutionResult {
  status: DduStatus;
  success: boolean;
  message: string;
  fullPath?: string | null;
  fileName?: string;
  error?: string;
}

export interface RebootAwareExecutionState {
  execution_id: string;
  request_id: string;
  operation: 'APPLY' | 'ROLLBACK';
  tool_id: string;
  state: 'EXECUTING' | 'PENDING_REBOOT' | 'REBOOT_REQUIRED' | 'COMPLETED' | 'FAILED';
  pending_action: string;
  expected_verification: string;
  created_at: number;
}

export interface GpuDetectionResult {
  vendor: GpuVendor;
  gpuNames: string[];
  rawOutput: string;
}

export interface DriverStatusResult {
  driversPath: string;
  gpu: {
    vendor: GpuVendor;
    names: string[];
    raw: string;
  };
  installers: {
    amd: DriverInstallerInfo;
    nvidia: DriverInstallerInfo;
  };
}

export interface DyarteElectronAPI {
  isElectron: boolean;
  platform: string;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  drivers: {
    getDriversPath: () => Promise<string>;
    detectGpuVendor: () => Promise<GpuDetectionResult>;
    findDriverInstaller: (vendor: 'AMD' | 'NVIDIA') => Promise<DriverInstallerInfo>;
    executeDriverInstaller: (vendor: 'AMD' | 'NVIDIA', executionToken?: string) => Promise<DriverExecutionResult>;
    getDriverStatus: () => Promise<DriverStatusResult>;
  };
  ddu: {
    getDduPath: () => Promise<DduPathResult>;
    executeDdu: (executionToken?: string) => Promise<DduExecutionResult>;
  };
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    dyarte?: DyarteElectronAPI;
  }
}

// ---------------------------------------------------------------------------
// Hardware Inventory Unified Canonical Schema (matches Agent JSON exactly)
// ---------------------------------------------------------------------------

export interface HardwareCpuInfo {
  manufacturer: string;
  model: string;
  commercial_name: string;
  physical_cores: number;
  logical_processors: number;
  threads: number;
  architecture: string;
  current_frequency_mhz: number | null;
  max_frequency_mhz: number | null;
}

export interface HardwareGpuItem {
  manufacturer: string;
  model: string;
  full_name: string;
  vram_bytes: number | null;
  vram_mb: number | null;
  driver_version: string;
  pci_device_id: string;
  temperature_c: number | null;
  usage_percent: number | null;
  is_primary: boolean;
}

export interface HardwareRamModule {
  slot?: string;
  capacity_bytes?: number;
  capacity_mb?: number;
  manufacturer?: string;
  part_number?: string;
  speed_mhz?: number | null;
  type?: string;
}

export interface HardwareRamInfo {
  total_bytes: number;
  total_mb: number;
  used_bytes: number;
  used_mb: number;
  available_bytes: number;
  available_mb: number;
  usage_percent: number;
  modules: HardwareRamModule[];
}

export interface HardwarePhysicalDisk {
  device_id: string;
  model: string;
  manufacturer: string;
  size_bytes: number;
  size_gb: number;
  media_type: string;
  interface_type: string;
  serial_number: string;
  status: string;
  is_system: boolean;
}

export interface HardwareVolume {
  drive: string;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
  total_gb: number;
  free_gb: number;
  used_gb: number;
  is_system: boolean;
}

export interface HardwareStorageInfo {
  disks: HardwarePhysicalDisk[];
  volumes: HardwareVolume[];
}

export interface HardwareMotherboardInfo {
  manufacturer: string;
  model: string;
  product_name: string;
  version: string;
  chipset: string;
}

export interface HardwareBiosInfo {
  vendor: string;
  version: string;
  release_date: string;
  mode: 'UEFI' | 'Legacy' | 'UNKNOWN';
}

export interface HardwareWindowsInfo {
  product_name: string;
  version: string;
  build: string;
  edition: string;
  architecture: string;
}

export interface HardwareSecurityInfo {
  secure_boot: boolean | null;
  tpm_present: boolean | null;
  tpm_ready: boolean | null;
  tpm_version: string | null;
  hags: 'ENABLED' | 'DISABLED' | 'N/D' | null;
  game_mode: 'ENABLED' | 'DISABLED' | 'N/D' | null;
}

export interface HardwareGamingFeaturesInfo {
  resizable_bar: 'SUPPORTED' | 'ENABLED' | 'DISABLED' | 'N/D' | null;
  xmp_expo: 'ENABLED' | 'DISABLED' | 'N/D' | null;
}

export interface HardwarePowerPlanInfo {
  guid: string;
  name: string;
  state: 'ACTIVE' | 'UNKNOWN';
}

export interface HardwareTelemetryUsage {
  cpu_percent: number | null;
  ram_percent: number | null;
  gpu_percent: number | null;
}

export interface HardwareTemperatures {
  cpu_c: number | null;
  gpu_c: number | null;
}

export interface HardwareActiveGame {
  pid: number;
  name: string;
  title: string;
  path: string;
  is_foreground: boolean;
  memory_mb: number;
}

export interface HardwareInventory {
  device_id: string;
  agent_version: string;
  timestamp: number;
  cpu: HardwareCpuInfo;
  gpus: HardwareGpuItem[];
  gpu: HardwareGpuItem;
  memory: HardwareRamInfo;
  ram: HardwareRamInfo;
  storage: HardwareStorageInfo;
  motherboard: HardwareMotherboardInfo;
  bios: HardwareBiosInfo;
  windows: HardwareWindowsInfo;
  security: HardwareSecurityInfo;
  gaming: HardwareGamingFeaturesInfo;
  gaming_features: HardwareGamingFeaturesInfo;
  power_plan: HardwarePowerPlanInfo;
  telemetry: HardwareTelemetryUsage;
  temperatures: HardwareTemperatures;
  usage: HardwareTelemetryUsage;
  active_game: HardwareActiveGame | null;
}


