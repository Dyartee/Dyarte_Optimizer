/**
 * DYARTE OPTIMIZER — AI SOFTWARE INTELLIGENCE PROVIDER (Requirements 31, 33-40, 47, 48)
 *
 * Strict Design Principles:
 * - Windows Agent is the authoritative source for installed software.
 * - AI only classifies and recommends (advisory only).
 * - PROHIBITED: LLM -> PowerShell / Registry / CMD / execute / delete / disable.
 * - API keys are strictly server-side (never in React).
 * - Graceful degradation: if AI is offline, real inventory is unaffected.
 */

import {
  SoftwareInventoryItem,
  SoftwareCategory,
  OptimizationRelevance,
  SoftwareRiskLevel,
  SoftwareAiClassification,
  SoftwareAiRecommendation,
  SoftwareAnalysisResult,
} from '../types/software';
import { SoftwareInventoryService } from './softwareInventoryService';
import { auth } from '../lib/firebase';

export interface IAiProvider {
  readonly providerName: string;
  readonly modelName: string;

  classifySoftware(items: SoftwareInventoryItem[]): Promise<SoftwareAiClassification[]>;
  analyzeSoftwareInventory(items: SoftwareInventoryItem[]): Promise<SoftwareAnalysisResult>;
  generateRecommendations(items: SoftwareInventoryItem[]): Promise<SoftwareAiRecommendation[]>;
}

/**
 * Validates whether an AI recommendation satisfies the strict safety constraints (Requirement 34 & 35)
 */
export function validateRecommendationSafety(rec: SoftwareAiRecommendation): boolean {
  const forbiddenTweaks = [
    'powershell',
    'reg add',
    'reg delete',
    'remove-item',
    'stop-service',
    'taskkill',
    'ganhar 20 fps',
    'ganhar 50 fps',
    'dobrar fps',
  ];

  const text = `${rec.recommendation} ${rec.reason}`.toLowerCase();
  for (const forbidden of forbiddenTweaks) {
    if (text.includes(forbidden)) {
      return false;
    }
  }

  return true;
}

/**
 * Client-Side AI Provider that securely talks to the Backend AI endpoint
 */
export class ClientBackendAiProvider implements IAiProvider {
  public readonly providerName = 'DYARTE_INTELLIGENCE_API';
  public readonly modelName = 'gemini-2.5-flash';

  public async classifySoftware(items: SoftwareInventoryItem[]): Promise<SoftwareAiClassification[]> {
    const analysis = await this.analyzeSoftwareInventory(items);
    return analysis.classifications;
  }

  public async generateRecommendations(items: SoftwareInventoryItem[]): Promise<SoftwareAiRecommendation[]> {
    const analysis = await this.analyzeSoftwareInventory(items);
    return analysis.recommendations;
  }

  public async analyzeSoftwareInventory(items: SoftwareInventoryItem[]): Promise<SoftwareAnalysisResult> {
    const startTime = Date.now();
    const sanitized = SoftwareInventoryService.sanitizeForAi(items);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        try {
          const idToken = await auth.currentUser.getIdToken();
          if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
          }
        } catch (tokenErr) {
          console.warn('[AI Provider] Could not get user ID token:', tokenErr);
        }
      }

      const response = await fetch('/api/software/classify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: sanitized }),
      });

      if (!response.ok) {
        throw new Error(`Servidor retornou status ${response.status}`);
      }

      const result: SoftwareAnalysisResult = await response.json();

      // Filter and validate recommendations
      const safeRecommendations = (result.recommendations || []).filter(validateRecommendationSafety);

      return {
        ...result,
        recommendations: safeRecommendations,
        latency_ms: Date.now() - startTime,
      };
    } catch (err: any) {
      console.warn('[AI Software Analysis Offline/Fallback]:', err?.message || err);
      return {
        request_id: `fallback_${Date.now()}`,
        inventory_version: '1.0.0',
        provider: this.providerName,
        model: this.modelName,
        latency_ms: Date.now() - startTime,
        success: false,
        items_analyzed: 0,
        classifications: [],
        recommendations: [],
        error: 'Análise inteligente indisponível.',
      };
    }
  }
}

/**
 * Deterministic Mock AI Provider for Unit and Failure Testing (Requirement 47)
 */
export class MockAiProvider implements IAiProvider {
  public readonly providerName = 'MOCK_TEST_PROVIDER';
  public readonly modelName = 'test-classifier-v1';

  private failWithTimeout = false;
  private failWithInvalidJson = false;
  private failWithRateLimit = false;

  constructor(options?: { timeout?: boolean; invalidJson?: boolean; rateLimit?: boolean }) {
    if (options?.timeout) this.failWithTimeout = true;
    if (options?.invalidJson) this.failWithInvalidJson = true;
    if (options?.rateLimit) this.failWithRateLimit = true;
  }

  public async classifySoftware(items: SoftwareInventoryItem[]): Promise<SoftwareAiClassification[]> {
    const res = await this.analyzeSoftwareInventory(items);
    return res.classifications;
  }

  public async generateRecommendations(items: SoftwareInventoryItem[]): Promise<SoftwareAiRecommendation[]> {
    const res = await this.analyzeSoftwareInventory(items);
    return res.recommendations;
  }

  public async analyzeSoftwareInventory(items: SoftwareInventoryItem[]): Promise<SoftwareAnalysisResult> {
    if (this.failWithTimeout) {
      throw new Error('AI_TIMEOUT: Tempo limite esgotado.');
    }
    if (this.failWithRateLimit) {
      throw new Error('AI_RATE_LIMIT: Limite de requisições excedido.');
    }
    if (this.failWithInvalidJson) {
      throw new Error('AI_INVALID_JSON: Resposta não corresponde ao schema JSON.');
    }

    const classifications: SoftwareAiClassification[] = [];
    const recommendations: SoftwareAiRecommendation[] = [];

    for (const item of items) {
      const name = item.name.toLowerCase();
      let category: SoftwareCategory = 'PRODUCTIVITY';
      let relevance: OptimizationRelevance = 'LOW';
      let risk: SoftwareRiskLevel = 'LOW';
      let recText = 'Nenhuma ação de otimização necessária.';

      if (name.includes('discord') || name.includes('geforce') || name.includes('afterburner')) {
        category = 'OVERLAY';
        relevance = 'MEDIUM';
        recText = 'Pode possuir recursos em segundo plano relevantes durante jogos.';
      } else if (name.includes('steam') || name.includes('epic') || name.includes('riot')) {
        category = 'GAME_LAUNCHER';
        relevance = 'HIGH';
        recText = 'Gerenciador de jogos. Mantenha ativo somente quando estiver jogando.';
      } else if (name.includes('antivirus') || name.includes('defender') || name.includes('battleye') || name.includes('vanguard')) {
        category = 'SECURITY';
        relevance = 'HIGH';
        risk = 'HIGH';
        recText = 'Componente crítico de segurança/anti-cheat. NUNCA deve ser desativado.';
      }

      classifications.push({
        software_id: item.id,
        software_name: item.name,
        category,
        optimization_relevance: relevance,
        confidence: 0.92,
      });

      recommendations.push({
        software_id: item.id,
        software: item.name,
        category,
        optimization_relevance: relevance,
        recommendation: recText,
        risk,
        confidence: 0.92,
        reason: 'Classificação heurística e de inteligência de sistema.',
      });
    }

    return {
      request_id: `req_mock_${Date.now()}`,
      inventory_version: '1.0.0',
      provider: this.providerName,
      model: this.modelName,
      latency_ms: 25,
      success: true,
      items_analyzed: items.length,
      classifications,
      recommendations,
    };
  }
}
