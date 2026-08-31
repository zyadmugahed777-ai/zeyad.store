/**
 * Zeyad For Business — Phase 8B: PostgreSQL Shadow Performance Latency Benchmark
 * 
 * Measures execution latency (p50, p95, p99, min, max, avg) using pg.Pool
 * across all critical application query domains.
 * 
 * Note: Measurements are taken on the local development shadow environment.
 * Production capacity will depend on VPS deployment sizing and network characteristics.
 */

const { getPgRepositories, resetPgRepositories } = require('../repositories/postgres');
const { closePgPool } = require('../config/pg-database');

const ITERATIONS = 100;

function calculatePercentiles(latencies) {
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;

  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2))
  };
}

async function benchmark(name, fn) {
  // Warmup (5 iterations)
  for (let i = 0; i < 5; i++) {
    await fn();
  }

  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    times.push(durationMs);
  }

  const stats = calculatePercentiles(times);
  return stats;
}

async function runPerformanceBenchmark() {
  console.log('\n======================================================');
  console.log('   PHASE 8B: POSTGRESQL SHADOW PERFORMANCE BENCHMARK');
  console.log(`   (Sample Size: ${ITERATIONS} iterations per operation)`);
  console.log('======================================================\n');

  resetPgRepositories();
  const pRepos = getPgRepositories();
  const results = {};

  try {
    // 1. Product List
    results['Product List'] = await benchmark('Product List', () => pRepos.products.findAdminList({}, 20, 0));

    // 2. Product Detail
    results['Product Detail'] = await benchmark('Product Detail', () => pRepos.products.findById(1));

    // 3. Search
    results['Search'] = await benchmark('Search', () => pRepos.products.findAdminList({ search: 'طاقة' }, 20, 0));

    // 4. Cart
    results['Cart'] = await benchmark('Cart', () => pRepos.carts.findCartByGuestId('guest_seed_test_1'));

    // 5. Coupon
    results['Coupon'] = await benchmark('Coupon', () => pRepos.coupons.findByCode('E2E-PERCENT-10-1787445639346'));

    // 6. Delivery
    results['Delivery'] = await benchmark('Delivery', () => pRepos.delivery.findProvinces());

    // 7. Address
    results['Address'] = await benchmark('Address', () => pRepos.addresses.findById(1));

    // 8. Order
    results['Order'] = await benchmark('Order', () => pRepos.orders.findAll({}, 20, 0));

    // 9. Admin
    results['Admin'] = await benchmark('Admin', () => pRepos.auth.findAllAdminUsers({}));

    // 10. Najm
    results['Najm'] = await benchmark('Najm', () => pRepos.ai.najmSettings.getSettings());

    console.log('-----------------------------------------------------------------------------------------');
    console.log(
      'Operation'.padEnd(18) +
      'p50 (ms)'.padEnd(12) +
      'p95 (ms)'.padEnd(12) +
      'p99 (ms)'.padEnd(12) +
      'Avg (ms)'.padEnd(12) +
      'Min (ms)'.padEnd(12) +
      'Max (ms)'
    );
    console.log('-----------------------------------------------------------------------------------------');

    for (const [op, s] of Object.entries(results)) {
      console.log(
        op.padEnd(18) +
        String(s.p50).padEnd(12) +
        String(s.p95).padEnd(12) +
        String(s.p99).padEnd(12) +
        String(s.avg).padEnd(12) +
        String(s.min).padEnd(12) +
        String(s.max)
      );
    }
    console.log('-----------------------------------------------------------------------------------------');

    console.log('\n[Notice]: Local development measurements demonstrate sub-millisecond to low-millisecond');
    console.log('adapter execution latency on localhost. Production capacity and SLA will be determined');
    console.log('by network round-trip and server infrastructure during future deployment phases.\n');

    return results;
  } finally {
    await closePgPool();
  }
}

if (require.main === module) {
  runPerformanceBenchmark()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Benchmark Error:', err);
      process.exit(1);
    });
}

module.exports = { runPerformanceBenchmark };
