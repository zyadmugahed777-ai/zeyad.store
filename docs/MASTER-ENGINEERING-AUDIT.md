# ZeyadStore — Master Engineering Audit

## Context

ZeyadStore (زياد للتجارة) is a Yemeni e-commerce platform (Node/Express + EJS admin + static HTML storefront) migrated from SQLite to PostgreSQL. The owner reported the site unstable after migration: admin product media broken (no multi-select images, no primary image, video uploads crash the panel), Najm AI sales assistant unreliable.

This is a code-driven audit (most docs named in the original brief didn't exist yet — see `HANDOFF.md` for what did). Decisions taken with the user:

- The site is local/staging only, not public. Security fixes are sequenced in dependency order, not as emergency hotfixes.
- Shim strategy: **harden now, migrate to native PostgreSQL later** (see Wave 12 in `MASTER-IMPLEMENTATION-PLAN.md`).

## Where the real work lives

The audited/implemented tree is `D:/played/Zeyad For Business` (main directory, not a `.claude/worktrees/*` checkout) — that's where `ai/`, `backend/repositories/postgres/`, and the `pg` dependency exist. A Wave 0 safety checkpoint commit (`44ddb39`) captured the previously-uncommitted state on branch `main` before implementation began.

## Central finding

See `CRITICAL-FINDINGS.md` for the full list. In one sentence: PostgreSQL repositories are still SQLite-dialect code running through a regex translation shim (`postgres-base-repository.js`) that never adapted the sync→async contract or PG's boolean/numeric type semantics — that single gap is the root cause of most reported instability (checkout, cart, admin panel, RBAC, and Najm's permission gates all break the same way: a Promise treated as a value).

## Deliverables produced by this audit

`CRITICAL-FINDINGS.md` · `MASTER-ENGINEERING-AUDIT.md` (this file) · `BACKEND-AUDIT.md` · `ADMIN-AUDIT.md` · `MEDIA-AUDIT.md` · `NAJM-AUDIT.md` · `SQLITE-LEGACY-AUDIT.md` · `MASTER-IMPLEMENTATION-PLAN.md` · `IMPLEMENTATION-TASKS.md` · `DEPENDENCY-GRAPH.md`

## Constraints carried into every task

- No redesign. Preserve current UI/UX, layout, visual identity. Frontend edits only where a bug blocks existing functionality, minimally (e.g. `form.ejs` gets a syntax fix + scope hoist, not markup/styling changes).
- Human-approval gates: schema changes, data migrations, credential changes, flipping `DATABASE_TYPE`, destructive operations, financial-rule changes.
- Financial changes require isolated proof and Δ = 0.0000 reconciliation against `backend/tests/golden-master-baseline.json`.

## Verification

`backend/tests/` holds ~67 test files (E2E batches, checkout/coupon/delivery, Najm, admin route render, golden-master capture) — reuse as the regression asset. Per-wave gates: unit → integration → API contract → database state → E2E → security → regression → performance. Two findings need to be verified by driving the running app, not just reading code: the `form.ejs` script-death (check browser console for `SyntaxError`) and the video-upload `ECONNRESET`.
