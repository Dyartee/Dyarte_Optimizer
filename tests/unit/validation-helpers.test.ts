/**
 * DYARTE OPTIMIZER — UNIT TEST SUITE (Section 28)
 *
 * Validates isolated helper functions, plans, catalog mappings, and schema parsers.
 */

import { CANONICAL_TOOLS, CANONICAL_TOOLS_MAP } from '../../src/data/canonicalCatalog';
import { serializeCanonicalReceipt } from '../../src/security/serverTokens';

let passed = 0;
let failed = 0;

function logPass(title: string, msg: string) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${title}: ${msg}`);
  passed++;
}

function logFail(title: string, msg: string) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${title}: ${msg}`);
  failed++;
}

function assert(condition: boolean, title: string, msg: string) {
  if (condition) logPass(title, msg);
  else logFail(title, msg);
}

function runUnitTests() {
  console.log('================================================================');
  console.log('DYARTE OPTIMIZER — UNIT TESTS (SEC 28)');
  console.log('================================================================\n');

  // Test 1: Plan Levels 1-4 strictly
  const allLevels = CANONICAL_TOOLS.map((t) => t.required_plan_level);
  const invalidLevels = allLevels.filter((lvl) => lvl < 1 || lvl > 4);
  assert(
    invalidLevels.length === 0,
    'Unit 1 (Strict Plan Levels)',
    'Todas as ferramentas canônicas utilizam níveis de plano válidos entre 1 e 4 (sem nível 0).'
  );

  // Test 2: Canonical Catalog Map consistency
  assert(
    Boolean(CANONICAL_TOOLS_MAP['tool_perf_power_plan']),
    'Unit 2 (Canonical Catalog Map)',
    'tool_perf_power_plan está registrada no mapa canônico oficial.'
  );

  // Test 3: Canonical Receipt Serializer determinism
  const receiptA = {
    protocol_version: 1,
    execution_id: 'exec_unit_1',
    request_id: 'req_unit_1',
    operation: 'APPLY' as const,
    tool_id: 'tool_perf_power_plan',
    user_id: 'usr_unit_1',
    device_id: 'WIN-UNIT-01',
    agent_version: '1.1.0',
    timestamp: 1700000000,
    duration_ms: 100,
    before_state: { z: 1, a: 2 },
    after_state: { b: 3, a: 4 },
    verified: true,
    status: 'APLICADO' as const,
    rollback_available: true,
    receipt_nonce: 'nonce_unit_1',
  };
  const jsonA = serializeCanonicalReceipt(receiptA);
  const jsonB = serializeCanonicalReceipt({ ...receiptA, before_state: { a: 2, z: 1 } });
  assert(
    jsonA === jsonB,
    'Unit 3 (Deterministic Receipt Serialization)',
    'A serialização canônica de recibos é determinística independente da ordem de chaves nos estados.'
  );

  console.log('\n================================================================');
  console.log(`TESTES UNITÁRIOS: ${passed} Aprovados, ${failed} Falhas.`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runUnitTests();
