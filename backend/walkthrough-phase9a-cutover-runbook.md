# Zeyad For Business — Production Cutover Runbook (Phase 9A)

**Document Version:** 1.0.0  
**Target Cutover:** SQLite (`zeyad.db`) ➔ PostgreSQL (`zeyad_shadow` / `zeyad_prod`)  
**Status:** READY FOR OPERATIONAL EXECUTION  
**Notice:** All commands that effectuate live production cutover are strictly marked:  
`⚠️ NOT EXECUTED — REQUIRES EXPLICIT APPROVAL`

---

## 1. Cutover Prerequisites & Freeze Window

### 1.1 Maintenance & Freeze Checklist
- [x] Phase 8B Behavioral & Financial Parity PASS.
- [x] Phase 8C Dynamic Adapter Switch PASS.
- [x] Phase 8D Dry-Run & Concurrency Audit PASS.
- [x] Phase 9A-1 Final Pre-Cutover Audit PASS (46/46 checks + 120/120 Golden Master).
- [ ] Explicit Stakeholder & Leadership Sign-Off Received.

---

## 2. Pre-Cutover Execution Sequence

### Step 2.1: Final Atomic SQLite Freeze & Backup
```bash
# 1. Flush SQLite WAL journal and create immutable timestamped backup
node -e "
const { getDb } = require('./backend/config/database');
const db = getDb();
db.pragma('wal_checkpoint(TRUNCATE)');
db.backup('./backend/db/backups/zeyad_precutover_lock.db').then(() => {
  console.log('Pre-cutover lock backup created successfully.');
});
"
```

### Step 2.2: Final Pre-Cutover PostgreSQL Synchronization
```bash
# Run final migration synchronizer to guarantee 0 data lag
node backend/tools/migrate-sqlite-to-pg.js
```

### Step 2.3: Verification of Synchronization Checksums
```bash
# Run Golden Master verification against SQLite canonical baseline
node backend/tests/test-golden-master-capture.js --verify
```

---

## 3. Production Cutover Execution (Future Step)

> [!WARNING]
> The following commands represent the exact operational cutover procedure. They have **NOT BEEN EXECUTED** in Phase 9A-1 and require explicit authorization.

```bash
# ⚠️ NOT EXECUTED — REQUIRES EXPLICIT APPROVAL
# Step 3.1: Switch Production Environment Variable to PostgreSQL
# In .env / ecosystem.config.js / server environment:
# DATABASE_TYPE=postgres
# PG_PORT=5433
# PG_DATABASE=zeyad_shadow
# PG_USER=zfb_shadow_user
# PG_PASSWORD=••••••••

# ⚠️ NOT EXECUTED — REQUIRES EXPLICIT APPROVAL
# Step 3.2: Graceful Server Process Restart
# pm2 reload zeyad-backend --update-env
# OR
# node backend/server.js
```

---

## 4. Post-Cutover Health Checks & Verification

### 4.1 Repository & Database Health Check
```bash
node -e "
const { getRepositories, getActiveAdapterType } = require('./backend/repositories');
console.log('Active Adapter:', getActiveAdapterType());
getRepositories().products.findById(1).then(p => {
  console.log('Sample Product:', p ? p.title : 'NOT FOUND');
  process.exit(p ? 0 : 1);
});
"
```

### 4.2 Financial Integrity Verification
```bash
node backend/tests/test-phase8d-schema-and-financial-audit.js
```

### 4.3 API Compatibility Smoke Tests
```bash
node backend/tests/test-phase8d-performance-security-api.js
```

---

## 5. Rollback Triggers & Emergency Procedure

### 5.1 Rollback Triggers (Any of the following = IMMEDIATE ROLLBACK):
1. Financial variance `SUM(orders.total)` or `SUM(payments.amount)` > 0.00 SAR.
2. Unhandled PostgreSQL connection dropouts / pool exhaustion.
3. Order creation or Checkout failure rate > 0.00%.
4. API response latency p95 > 100ms.
5. Foreign Key violation or duplicate ID conflict.

### 5.2 Emergency Rollback Execution Procedure
```bash
# STEP 1: Revert Environment Variable
# In .env / environment:
# DATABASE_TYPE=sqlite

# STEP 2: Instant Adapter Reset / Server Restart
# pm2 reload zeyad-backend --update-env
# (The system immediately reverts to backend/db/zeyad.db with 0 data loss)

# STEP 3: Verify SQLite Integrity Post-Rollback
node -e "
const { getDb } = require('./backend/config/database');
const db = getDb();
console.log('SQLite Integrity:', db.pragma('integrity_check'));
console.log('SQLite FK Check:', db.pragma('foreign_key_check'));
"
```

### 5.3 Handling PostgreSQL Writes During Rollback Window
If orders were accepted on PostgreSQL before an emergency rollback:
1. Export delta orders from PostgreSQL:
   ```sql
   SELECT * FROM orders WHERE created_at >= '<cutover_timestamp>';
   ```
2. Replay delta records into SQLite using transaction replay script.
3. Verify customer and order checksums match.
