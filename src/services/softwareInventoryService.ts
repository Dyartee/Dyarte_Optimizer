/**
 * DYARTE OPTIMIZER — SOFTWARE INVENTORY SERVICE (Requirements 30-32, 41-45)
 * Real software discovery, deduplication, and protection boundaries.
 * Zero-simulation: Queries actual agent reports and Windows queries.
 */

import {
  SoftwareInventoryItem,
  SoftwareSource,
  SignatureStatus,
} from '../types/software';

// Known critical gaming and anti-cheat components that MUST NOT be disabled automatically
const PROTECTED_GAMING_COMPONENTS = [
  'fivem',
  'rockstar',
  'battleye',
  'easyanticheat',
  'eac',
  'vanguard',
  'faceit',
  'steam',
  'epic games',
  'riot client',
  'valve',
  'directx',
  'vcredist',
  'visual c++',
  'windows defender',
  'microsoft security',
];

export class SoftwareInventoryService {
  /**
   * Normalizes strings for robust comparison and deduplication
   */
  private static normalizeKey(str: string): string {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Deduplicates software items by publisher, name, version, and install path (Requirement 42)
   */
  public static deduplicateSoftware(items: SoftwareInventoryItem[]): SoftwareInventoryItem[] {
    const seen = new Map<string, SoftwareInventoryItem>();

    for (const item of items) {
      const normName = this.normalizeKey(item.name);
      if (!normName) continue;

      const normPub = this.normalizeKey(item.publisher);
      const normVer = this.normalizeKey(item.version);
      const normPath = this.normalizeKey(item.install_path || item.executable || '');

      // Key combining publisher + name + version or product_code
      const key = item.product_code
        ? `code_${item.product_code.toLowerCase()}`
        : `${normPub}_${normName}_${normVer || normPath}`;

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, item);
      } else {
        // Merge enriched data from complementary sources (e.g. running status from process)
        if (item.running) existing.running = true;
        if (!existing.executable && item.executable) existing.executable = item.executable;
        if (!existing.install_path && item.install_path) existing.install_path = item.install_path;
        if (existing.signature_status === 'UNKNOWN' && item.signature_status !== 'UNKNOWN') {
          existing.signature_status = item.signature_status;
          existing.signed = item.signed;
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Sanitizes inventory metadata before sending to AI API (Requirement 36)
   * GUARANTEE: Never transmits passwords, tokens, device private keys, or PII.
   */
  public static sanitizeForAi(items: SoftwareInventoryItem[]): Array<{
    id: string;
    name: string;
    publisher: string;
    version: string;
    source: string;
    running: boolean;
    process_name: string | null;
  }> {
    return items.map((item) => ({
      id: item.id,
      name: item.name.slice(0, 120),
      publisher: (item.publisher || 'N/D').slice(0, 100),
      version: (item.version || 'N/D').slice(0, 50),
      source: item.source,
      running: Boolean(item.running),
      process_name: item.process_name ? item.process_name.slice(0, 80) : null,
    }));
  }

  /**
   * Identifies if a software belongs to protected security / anti-cheat categories (Requirements 44 & 45)
   */
  public static isProtectedSecurityOrAntiCheat(item: SoftwareInventoryItem): boolean {
    const text = `${item.name} ${item.publisher} ${item.process_name || ''}`.toLowerCase();
    return PROTECTED_GAMING_COMPONENTS.some((protectedKeyword) =>
      text.includes(protectedKeyword)
    );
  }

  /**
   * Filters running software processes
   */
  public static detectRunningSoftware(items: SoftwareInventoryItem[]): SoftwareInventoryItem[] {
    return items.filter((item) => item.running);
  }

  /**
   * Identifies game launchers
   */
  public static detectGameLaunchers(items: SoftwareInventoryItem[]): SoftwareInventoryItem[] {
    const launcherKeywords = ['steam', 'epic games', 'ubisoft connect', 'ea desktop', 'origin', 'battle.net', 'gog galaxy', 'riot client'];
    return items.filter((item) => {
      const text = `${item.name} ${item.publisher}`.toLowerCase();
      return launcherKeywords.some((k) => text.includes(k));
    });
  }

  /**
   * Identifies gaming overlays
   */
  public static detectOverlays(items: SoftwareInventoryItem[]): SoftwareInventoryItem[] {
    const overlayKeywords = ['discord', 'geforce experience', 'rtss', 'rivatuner', 'afterburner', 'medal', 'overwolf', 'obs', 'fraps'];
    return items.filter((item) => {
      const text = `${item.name} ${item.publisher} ${item.process_name || ''}`.toLowerCase();
      return overlayKeywords.some((k) => text.includes(k));
    });
  }
}
