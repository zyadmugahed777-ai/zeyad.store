/**
 * Zeyad For Business — Phase 8D Master Runner
 * Production Cutover Readiness & Dry-Run Audit Master Test Suite
 */

const { runConfigAndFactoryAudit } = require('./test-phase8d-config-and-factory-audit');
const { runSchemaAndFinancialAudit } = require('./test-phase8d-schema-and-financial-audit');
const { runMigrationRepeatabilitySuite } = require('./test-phase8d-migration-repeatability');
const { runResilienceAndConcurrencySuite } = require('./test-phase8d-resilience-concurrency-failure');
const { runPerformanceSecurityApiSuite } = require('./test-phase8d-performance-security-api');

async function runPhase8dMasterSuite() {
  console.log('\n################################################################');
  console.log('   ZEYAD FOR BUSINESS — PHASE 8D MASTER AUDIT SUITE');
  console.log('   PRODUCTION CUTOVER READINESS & DRY-RUN AUDIT');
  console.log('################################################################\n');

  const startTime = Date.now();
  const results = {};

  try {
    console.log('>>> [1/5] Running Configuration, Architecture & Factory Audit...');
    results.configAndFactory = await runConfigAndFactoryAudit();

    console.log('\n>>> [2/5] Running PostgreSQL Schema Readiness & P0 Financial Safety Audit...');
    results.schemaAndFinancial = await runSchemaAndFinancialAudit();

    console.log('\n>>> [3/5] Running Migration Dry Run, Repeatability (3x) & Backup Drill...');
    results.migrationRepeatability = await runMigrationRepeatabilitySuite();

    console.log('\n>>> [4/5] Running Rollback Readiness, Failure Injection & Concurrency Simulation...');
    results.resilienceConcurrency = await runResilienceAndConcurrencySuite();

    console.log('\n>>> [5/5] Running Performance SLA, Security & API Compatibility Audit...');
    results.performanceSecurityApi = await runPerformanceSecurityApiSuite();

    const allPassed = Object.values(results).every(r => r === true);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n################################################################');
    console.log('   PHASE 8D MASTER AUDIT SUMMARY');
    console.log('################################################################');
    console.log(`- 1. Configuration & Factory Audit:       ${results.configAndFactory ? '✔ PASS' : '✖ FAIL'}`);
    console.log(`- 2. Schema & P0 Financial Safety Audit:   ${results.schemaAndFinancial ? '✔ PASS' : '✖ FAIL'}`);
    console.log(`- 3. Migration & Repeatability (3x):       ${results.migrationRepeatability ? '✔ PASS' : '✖ FAIL'}`);
    console.log(`- 4. Resilience & Concurrency Simulation:  ${results.resilienceConcurrency ? '✔ PASS' : '✖ FAIL'}`);
    console.log(`- 5. Performance, Security & API Parity:   ${results.performanceSecurityApi ? '✔ PASS' : '✖ FAIL'}`);
    console.log(`- Total Execution Time:                    ${durationSec}s`);
    console.log('----------------------------------------------------------------');
    
    if (allPassed) {
      console.log('   \x1b[32mVERDICT: 🟢 ALL PHASE 8D WORKSTREAMS PASSED (100%)\x1b[0m');
    } else {
      console.log('   \x1b[31mVERDICT: 🔴 PHASE 8D AUDIT FAILED\x1b[0m');
    }
    console.log('################################################################\n');

    return allPassed;
  } catch (err) {
    console.error('Fatal Master Suite Error:', err);
    return false;
  }
}

if (require.main === module) {
  runPhase8dMasterSuite()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runPhase8dMasterSuite };
