/**
 * DYARTE OPTIMIZER — SOFTWARE INVENTORY & AI INTELLIGENCE SCHEMAS (Sections 30-48)
 * Real software inventory contracts and AI analysis interfaces.
 */

export type SoftwareSource =
  | 'REGISTRY'
  | 'PROCESS'
  | 'SERVICE'
  | 'PACKAGE'
  | 'WINGET'
  | 'START_MENU'
  | 'FILE_SYSTEM';

export type SignatureStatus = 'VALID' | 'INVALID' | 'UNSIGNED' | 'UNKNOWN' | 'N/D';

export interface SoftwareInventoryItem {
  id: string;
  name: string;
  publisher: string;
  version: string;
  install_path: string | null;
  executable: string | null;
  source: SoftwareSource;
  install_date: string | null;
  running: boolean;
  process_name: string | null;
  signed: boolean | null;
  signature_status: SignatureStatus;
  product_code?: string;
}

export type SoftwareCategory =
  | 'GAME'
  | 'GAME_LAUNCHER'
  | 'GPU_DRIVER'
  | 'AUDIO'
  | 'NETWORK'
  | 'SECURITY'
  | 'OVERLAY'
  | 'BACKGROUND_SERVICE'
  | 'DEVELOPER_TOOL'
  | 'PRODUCTIVITY'
  | 'SYSTEM'
  | 'UNKNOWN';

export type OptimizationRelevance = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type SoftwareRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SoftwareAiClassification {
  software_id: string;
  software_name: string;
  category: SoftwareCategory;
  optimization_relevance: OptimizationRelevance;
  confidence: number;
}

export interface SoftwareAiRecommendation {
  software_id: string;
  software: string;
  category: SoftwareCategory;
  optimization_relevance: OptimizationRelevance;
  recommendation: string;
  risk: SoftwareRiskLevel;
  confidence: number;
  reason: string;
}

export interface SoftwareAnalysisResult {
  request_id: string;
  inventory_version: string;
  provider: string;
  model: string;
  latency_ms: number;
  success: boolean;
  items_analyzed: number;
  classifications: SoftwareAiClassification[];
  recommendations: SoftwareAiRecommendation[];
  error?: string;
}

export interface AiClassificationRequest {
  items: Array<{
    id: string;
    name: string;
    publisher: string;
    version: string;
    executable?: string | null;
    source: string;
    running?: boolean;
    process_name?: string | null;
  }>;
}
