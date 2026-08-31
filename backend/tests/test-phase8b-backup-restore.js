/**
 * Zeyad For Business — Phase 8B: Backup & Restore Reliability Test Suite
 * 
 * Tests complete backup lifecycle:
 * 1. Takes full plaintext/custom dump of PostgreSQL shadow database
 * 2. Drops / destroys only the shadow database (zeyad_shadow)
 * 3. Restores zeyad_shadow from the backup dump
 * 4. Executes complete verification suite (73/73 tables, 0 FK violations, exact financial checksums)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { closePgPool } = require('../config/pg-database');
const { verifyMigration } = require('../tools/verify-pg-migration');
const { migrateData } = require('../tools/migrate-sqlite-to-pg');

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const BACKUP_FILE = path.join(__dirname, '../db/pg_shadow_backup.sql');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
    failed++;
  }
}

async function runBackupRestoreTest() {
  console.log('\n======================================================');
  console.log('   PHASE 8B: POSTGRESQL BACKUP & RESTORE TEST');
  console.log('======================================================\n');

  const env = {
    ...process.env,
    PGPASSWORD: 'zfb_shadow_pass_2026'
  };

  try {
    // 0. Ensure Shadow DB is at pristine baseline sync
    console.log('0. Synchronizing pristine baseline data to PostgreSQL shadow...');
    await migrateData(false);

    // 1. Close application connection pool before maintenance
    console.log('\n1. Draining active connection pools...');
    await closePgPool();

    // 2. Perform full database backup
    console.log(`2. Dumping PostgreSQL shadow database to ${BACKUP_FILE}...`);
    if (fs.existsSync(BACKUP_FILE)) fs.unlinkSync(BACKUP_FILE);

    execSync(`"${path.join(PG_BIN, 'pg_dump.exe')}" -h 127.0.0.1 -p 5433 -U zfb_shadow_user -d zeyad_shadow -F p -f "${BACKUP_FILE}"`, {
      env,
      stdio: 'pipe'
    });

    const backupExists = fs.existsSync(BACKUP_FILE);
    const backupSize = backupExists ? fs.statSync(BACKUP_FILE).size : 0;
    assert(backupExists && backupSize > 100000, `Backup file created successfully (${Math.round(backupSize / 1024)} KB)`);

    // 3. Terminate existing backend connections and destroy zeyad_shadow
    console.log('3. Dropping PostgreSQL shadow database (zeyad_shadow)...');
    execSync(`"${path.join(PG_BIN, 'psql.exe')}" -h 127.0.0.1 -p 5433 -U zfb_shadow_user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'zeyad_shadow' AND pid <> pg_backend_pid();" -c "DROP DATABASE zeyad_shadow;" -c "CREATE DATABASE zeyad_shadow OWNER zfb_shadow_user;"`, {
      env,
      stdio: 'pipe'
    });
    assert(true, 'Shadow database dropped and recreated cleanly as blank database');

    // 4. Restore shadow database from backup dump
    console.log('4. Restoring zeyad_shadow from backup dump...');
    execSync(`"${path.join(PG_BIN, 'psql.exe')}" -h 127.0.0.1 -p 5433 -U zfb_shadow_user -d zeyad_shadow -f "${BACKUP_FILE}"`, {
      env,
      stdio: 'pipe'
    });
    assert(true, 'Backup dump restored via psql successfully');

    // 5. Run full migration validator
    console.log('\n5. Executing comprehensive validation suite on restored database:');
    const verificationOk = await verifyMigration();
    assert(verificationOk === true, 'All 83 migration & financial integrity checks passed on restored database');

    // Clean up temporary backup file
    if (fs.existsSync(BACKUP_FILE)) {
      fs.unlinkSync(BACKUP_FILE);
      console.log('Temporary backup file cleaned up.');
    }

    console.log('\n======================================================');
    if (failed === 0) {
      console.log(`   \x1b[32mALL ${passed} BACKUP & RESTORE CHECKS PASSED\x1b[0m`);
    } else {
      console.log(`   \x1b[31m${failed} BACKUP/RESTORE CHECKS FAILED\x1b[0m`);
    }
    console.log('======================================================\n');

    return failed === 0;
  } catch (err) {
    console.error('Backup/Restore Test Failed:', err);
    return false;
  } finally {
    await closePgPool();
  }
}

if (require.main === module) {
  runBackupRestoreTest()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runBackupRestoreTest };
