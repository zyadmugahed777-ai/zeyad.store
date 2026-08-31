# Dependency Graph

```
W0 (safety baseline) [DONE: commit 44ddb39]
 └── W1 (data-layer correctness: boolean allowlist, NUMERIC parsing, count-precedence, pool timeouts)
      └── W2 (async contract: await fixes, unhandledRejection, AI permission gates before tool-write awaits)
           ├── W3 (transactions & financial integrity)
           │    ├── W7 (commerce flows: cart/checkout/coupons/delivery/customers)
           │    │    └── W13 (full regression & production verification)
           │    └── W9 (Najm & AI) — also depends on W1
           ├── W4 (auth & sessions)
           ├── W8 (CMS, reports, notifications)
           └── W10 (frontend↔backend contract) — also depends on W1
      W5 (products/images/video) — depends on W1 only (boolean fix for is_primary)
           └── W6 (admin panel remainder) — also depends on W2
W11 (security & performance hardening) — depends on most of the above, broadly parallel once W2/W3 land
W12 (SQLite legacy removal) — depends on W1, W2, W3 proving PostgreSQL exclusivity; must run last before W13
```

## Critical path

W0 → W1 → W2 → W3 → W7 → W13

## Parallelizable after W2

W4, W5, W8 can proceed independently once W2 (async contract) lands. W9 additionally needs W3 (transactions) because draft confirmation and order creation share the same atomicity fix. W6 needs W5 done first (same files). W10 needs W1 (numeric string handling) and W2.

## Hard ordering constraint (do not violate)

Within W2, the Admin-AI permission gates in `services/ai/tools.js` (`CRITICAL-FINDINGS.md` #19) must be fixed to properly await `hasAiPermission` **before** the un-awaited downstream tool-write calls in the same file are fixed. Fixing the writes first, while the gates still resolve truthy on every Promise, opens a live unauthenticated admin-AI write path in the gap between the two fixes.

## Rule

Do not start a wave until all waves it depends on (per the graph above) are complete and verified. Within a wave, independent tasks (see `IMPLEMENTATION-TASKS.md` for per-task dependency notes) may proceed in any order or in parallel.
