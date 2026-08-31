# Phase 0 Lightweight Baseline

Status: complete enough to begin Phase 0.5 visual work.

Purpose: identify risks that could break visual development without fixing or implementing them during Phase 0.

## Quick Findings

- Customer-facing HTML pages: 47.
- Placeholder local links using `href="#"`: 370 matches.
- Countdown/timer-related matches: 170 matches.
- Future or unsupported media/search capability matches: 34 matches.
- Shared visual styles are mainly in `styles.css`.
- `responsive-pro.css` is linked only by part of the storefront, so visual changes must be checked on pages with and without it.

## Risk Labels For Phase 0.5

- `placeholder`: clickable-looking item that currently does not complete a real action.
- `future implementation`: feature promised visually but not implemented yet, such as voice search, image search, 360 view, or video.
- `unverified claim`: countdown, stock, rating, discount, project count, or delivery claim that needs real data later.
- `shared visual dependency`: component or selector used across several routes.

## Do Not Fix In Phase 0

- Do not implement cart, wishlist, filters, checkout, search, account, or order logic.
- Do not repair placeholder links unless the visual task requires a harmless approved route.
- Do not remove countdowns or unsupported features yet; mark them during visual work.
- Do not redesign product data or media assets in this phase.

## Phase 0.5 Guardrails

- Keep visual work mobile-first.
- Preserve whitespace that improves hierarchy.
- Make product media the dominant part of product cards.
- Avoid approving unsupported promises as production-ready states.
- Keep weak routes visually aligned with the storefront, even if their behavior remains placeholder.
- When a control remains non-functional, ensure it is treated as a visual placeholder or future implementation.

## Phase 0 Gate

Phase 0 is accepted for lightweight delivery when Phase 0.5 can start with known risks recorded and no expectation that placeholder commerce behavior has been implemented.
