# Najm AI Sales Assistant Audit

Najm must be diagnosed by following the actual path, not by guessing: UI → API → Session/Identity → Customer Assistant → Agent → Provider → Model → Tools → Repository → PostgreSQL → Response.

## Identity / isolation (highest severity)

- **Account-takeover-grade flaw**: `routes/api/customer-ai.js:20` accepts `req.body.userId` as an identity fallback on an endpoint with **no `requireAuth`**. An unauthenticated request `{"message":"...","userId":42}` can read/modify/order from customer 42's cart. Sibling endpoints correctly read identity from session only — this is an oversight in one route, not a design choice.
- **Order-tracking IDOR**: `customer-tools.js:729-736` applies the phone-ownership check only `if (phone)` is present; two callers omit the phone argument entirely. Order IDs are sequential, so an attacker can enumerate order status/total/items/city for any order.
- **Order drafts have no enforced TTL, ownership, or idempotency** despite being written into the schema: `najm-order-drafts-repo.js:45-47` selects a draft by `draft_token` alone — no `expires_at > NOW()` check, no `session_id` check. The token is only 32-bit and there's no rate limiting, so it's brute-forceable. `confirm_order` reuses the frozen draft price with no live re-price and no row lock. `createCustomerOrder` resolves the customer by **phone number**, so a fraudulent COD order can be attached to a real customer's account by anyone who knows their phone number.

## Admin-AI permission gates

`services/ai/tools.js` has 14 sites doing `if (!hasAiPermission(k))` where `hasAiPermission` is `async` — `!Promise` is always `false`, so every permission check currently grants access. This is presently masked only because the downstream writes those tools would perform are *also* un-awaited and fail closed. **Hard ordering constraint**: fix the permission gates (make them actually await) before fixing the un-awaited downstream writes in the same async-contract pass, or a live unauthenticated admin-AI write path opens up in between.

## Grounding / retrieval quality

`hybrid-search.js:337-341` fabricates store facts when real data is null: injects `rating || 4.5`, `reviews_count || 18`, `warranty || 'ضمان معتمد سنتين'`, `delivery_time || '2-5 أيام عمل'` into the data handed to the model as ground truth. A product with a NULL warranty gets quoted by Najm as having a certified two-year warranty — the model is behaving correctly given what it was told; the retrieval layer is lying to it. Compounding issue at `:257-274`: a failed category filter silently falls back to returning the top-100 best-sellers as if they matched the query.

## Provider layer

- Gemini adapter puts the API key in the URL query string (`providers.js:304`) — leaks into server access logs.
- `createProvider` falls through to Bedrock for any unrecognised provider string (`providers.js:486-502`); Bedrock and Gemini adapters return no tool calls at all, so a typo in the admin provider dropdown silently downgrades Najm to an ungrounded text generator with no warning.

## Not broken (ruled out)

- No exploitable SQL injection in any Najm tool — dynamic `ORDER BY`/`IN` clauses use strict allow-lists and bound placeholders.
- No tool accepts a price argument — Najm cannot manipulate prices, only read them.

## Fix order (Wave 9, depends on Waves 1-3)

1. One-line identity fix on `customer-ai.js` (require session auth, drop the `userId` body fallback).
2. Draft TTL + session ownership + idempotency key on confirm.
3. Track-order IDOR — enforce the phone check unconditionally in all callers.
4. Admin-AI permission gates made properly async-aware — **before** touching the downstream write awaits.
5. `CAST(id AS TEXT)` / numeric-string fixes flowing from Wave 1.
6. Per-tool try/catch so a single tool failure doesn't take down the whole assistant turn.
7. Remove fabricated grounding defaults in `hybrid-search.js`; surface real nulls instead (product still sells, just without inventing facts).
8. Provider validation (reject unknown provider strings instead of falling through to Bedrock) + move Gemini key out of the URL.
9. Rate limiting on the unauthenticated customer-chat endpoint.

Must preserve throughout: real product data/prices/availability, customer isolation, admin/customer AI isolation, tool security, no secret leakage, the sales-assistant persona, natural Yemeni Arabic where appropriate, concise non-annoying answers, and Najm's current placement/role in the site — no UI redesign.
