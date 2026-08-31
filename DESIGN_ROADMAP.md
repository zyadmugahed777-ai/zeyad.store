# DESIGN ROADMAP — Zeyad For Business

## Purpose

This roadmap converts the approved design audit into a safe, staged delivery plan.

It is deliberately ordered to protect customer trust first, then establish a consistent visual and UX system, then implement commerce functionality, and finally optimize performance and launch quality.

## Non-negotiable delivery rules

- No visual change may be merged without checking the mobile experience first.
- No promotional countdown, stock claim, review count, "360°", video, or discount may be displayed unless it is backed by real data and a working feature.
- No action may look clickable unless it produces the promised result.
- Product media is the primary content of commerce pages. Standard product cards must target approximately 75% image and 25% information.
- Whitespace is retained when it improves hierarchy; dead space is replaced only with content that advances discovery, trust, or purchase.
- Every stage is completed behind a regression checklist before the next stage begins.

---

## Phase 0 — Delivery baseline and change protection

### Goal

Create a safe implementation baseline before changing customer-facing behavior or layout.

### Files affected

- `styles.css`
- `responsive-pro.css`
- All customer-facing `*.html` pages
- New project documentation and QA artifacts only

### Why this is first

The project uses many standalone pages and several visual patterns. Establishing an inventory, route map, component ownership map, and viewport test matrix prevents the team from fixing one page while breaking another.

### Work scope

- Inventory every route, link, CTA, form, product card, image source, and script.
- Define the source of truth for product, price, stock, discount, delivery, warranty, account, and order data.
- Define desktop, tablet, and mobile acceptance viewports.
- Create page-level visual regression references before redesign work begins.
- Freeze unrelated visual changes while critical trust issues are being corrected.

### Potential risks

- Treating the current static copy as production data.
- Changing shared CSS selectors without knowing every page that depends on them.
- Introducing inconsistent behavior while different pages are rebuilt at different speeds.

### Expected result

A controlled delivery process, a complete affected-file map, and a reliable way to validate each subsequent phase.

---

## Phase 0.5 — Visual Design System Completion

### Goal

Complete the visual storefront across every route before implementing commerce behavior, so the customer experiences one coherent, production-quality Zeyad interface rather than a mix of finished and prototype page families.

### Files affected

- `styles.css`
- `responsive-pro.css`
- `index.html`
- `product.html`
- `category.html`
- `furniture.html`
- `bedrooms.html`
- `kitchens.html`
- `appliances.html`
- `majalis.html`
- `solar.html`
- `solar-solutions.html`
- `offers.html`
- `best-sellers.html`
- `new-arrivals.html`
- `collections.html`
- `inspiration.html`
- `room-ideas.html`
- `search.html`
- `wishlist.html`
- `cart.html`
- `checkout.html`
- `confirmation.html`
- `account*.html`
- `support.html`, `contact.html`, `branches.html`, `faq.html`, `warranty.html`, `reservation-policy.html`, `about.html`
- All `majalis-*.html` pages

### Why this is before trust and commerce implementation

The entire storefront must first reach a single, approved production-quality visual standard. Implementing behavior against unfinished or inconsistent page designs would create avoidable rework, leave weak routes behind, and make shared commerce components harder to apply consistently.

### Work scope

- Finish the remaining page mockups and approve every route at mobile, tablet, and desktop widths.
- Standardize all Hero sections: one dominant message, one primary action, clear supporting trust information, and category-specific visual character.
- Standardize product cards to approximately 75% product image and 25% product information, with consistent title, price, discount, warranty, availability, favorite, and primary purchase-action hierarchy.
- Standardize bundle cards so contents, value, savings, delivery/installation, and the next action are immediately clear.
- Standardize promotional banners: clear offer hierarchy, real-information placeholders, controlled emphasis, and no visual pressure tactics.
- Standardize category explorers, chips, filters, collection rails, recommendation sections, empty states, and editorial-to-commerce handoffs.
- Remove inconsistent page layouts, duplicate visual patterns, and isolated component styles.
- Strengthen weak or sparse sections with meaningful commerce content: relevant products, bundles, measurable service value, inspiration, verified trust content, or a clear next step.
- Finalize responsive behavior, spacing, navigation density, touch targets, RTL alignment, sticky actions, and horizontal scrolling across all target breakpoints.
- Complete the visual design system: tokens, typography, elevation, radii, button hierarchy, card families, status badges, loading states, error states, empty states, reduced motion, and focus states.

### Potential risks

- Delaying all behavioral work means temporary prototype claims must be visually marked as non-live or excluded from approval mockups; no unsupported promise may be approved as a production state.
- A visual-only pass can accidentally hide structural route problems; route inventory from Phase 0 remains mandatory during review.
- Expanding sparse pages with decorative material instead of commerce-relevant material would violate the product-first principle.
- Shared CSS work can regress other pages without screenshot-based review at every breakpoint.

### Expected result

A complete, approved visual storefront with one premium Zeyad design language, no weak visual routes, and reusable component specifications ready for safe commerce implementation.

---

## Phase 1 — Trust and promise sanitation

### Goal

Remove or correct every customer-facing claim that cannot currently be fulfilled. The website must never pretend to offer a capability it does not have.

### Files affected

- `offers.html`
- `appliances.html`
- `kitchens.html`
- `solar.html`
- `solar-solutions.html`
- `product.html`
- `search.html`
- `majalis.html`
- `majalis-assistant.html`
- `index.html`
- `styles.css`

### Why this follows visual completion

False urgency, fake gallery controls, non-functional search modes, and unsupported trust claims damage credibility more severely than an imperfect layout. This phase directly protects the brand promise defined in `AGENTS.md`.

### Work scope

- Remove client-resetting countdown timers unless a real campaign has authoritative start and end data.
- Hide or replace non-functional 360°, video, voice search, image search, and similar controls.
- Validate all discount, stock, warranty, delivery, rating, project-count, and review claims against real data.
- Mark estimated prices and consultation calculations clearly, including their assumptions.
- Establish one approved content standard for promotional claims and trust badges.

### Potential risks

- A temporary reduction in visual excitement after unsupported promotion elements are removed.
- Commercial teams may need to provide real campaign and inventory data before claims can return.
- Removing controls without a replacement can create empty areas; replacements must serve discovery or trust.

### Expected result

A trustworthy storefront that makes only promises the business can keep.

---

## Phase 2 — Information architecture and purchase-path repair

### Goal

Make every route, navigation item, product card, and primary CTA lead the customer to a valid next step.

### Files affected

- `index.html`
- `category.html`
- `furniture.html`
- `bedrooms.html`
- `kitchens.html`
- `appliances.html`
- `majalis.html`
- `solar.html`
- `solar-solutions.html`
- `offers.html`
- `best-sellers.html`
- `new-arrivals.html`
- `collections.html`
- `inspiration.html`
- `room-ideas.html`
- `search.html`
- `product.html`
- `cart.html`
- `checkout.html`
- `confirmation.html`
- `wishlist.html`
- `account*.html`
- `support.html`, `contact.html`, `branches.html`, `faq.html`, `warranty.html`, `reservation-policy.html`
- All `majalis-*.html` category and guide pages

### Why this follows trust sanitation

The visual storefront is now approved, so this phase can safely replace every prototype action with a real, intentional route without reopening unfinished layout decisions. The audit identified 390 local placeholder links without valid targets. A premium visual system cannot compensate for a broken path from discovery to product, cart, checkout, support, and post-purchase service.

### Work scope

- Resolve, remove, or intentionally disable every placeholder link and inert CTA.
- Define a canonical route hierarchy: Home → Department → Category → Product → Cart → Checkout → Confirmation.
- Decide whether `solar.html` and `solar-solutions.html` are one route or two explicitly different journeys.
- Make product cards consistently open the relevant product page.
- Standardize header, footer, active navigation state, breadcrumb behavior, and visible WhatsApp/contact access.
- Ensure every editorial page has a relevant next action: browse products, request a measurement, contact support, or book a visit.

### Potential risks

- Correcting routes can expose pages that do not yet have complete content.
- Consolidating solar routes requires a migration decision to avoid duplicate content and lost links.
- Shared navigation changes can affect all pages at once.

### Expected result

A coherent, non-dead-end shopping journey on every route.

---

## Phase 3 — Visual-system validation and responsive refinement

### Goal

Protect the completed visual system after trust and route repairs, resolving only integration defects before catalogue and commerce behavior are introduced.

### Files affected

- `styles.css`
- `responsive-pro.css`
- `index.html`
- `product.html`
- `category.html`
- `furniture.html`
- `bedrooms.html`
- `kitchens.html`
- `appliances.html`
- `majalis.html`
- `solar.html`
- `offers.html`
- `search.html`
- `cart.html`
- `checkout.html`
- `wishlist.html`
- `account*.html`
- All supporting and `majalis-*.html` pages

### Why this follows trust and route repair

Trust and route repairs can affect shared navigation, CTA labels, empty spaces, and page hierarchy. This controlled refinement pass preserves the approved visual standard before the catalogue and commerce layers begin.

### Work scope

- Validate that the Phase 0.5 tokens, components, and approved page mockups remain intact after shared route and CTA repairs.
- Resolve responsive regressions in headers, footers, breadcrumbs, button hierarchy, product-card ratios, banners, and category explorers.
- Verify one primary action remains dominant in each hero and section.
- Verify that changed routes do not introduce dead whitespace, crowded controls, or inconsistent mobile layouts.
- Validate RTL alignment, touch target sizes, sticky controls, horizontal scrolling, keyboard focus, and reduced-motion presentation at every target viewport.

### Potential risks

- Late navigation changes can force small layout changes; these must remain within the approved visual system.
- Over-standardization may erase useful category personality; category-specific showrooms must retain their distinct character.
- Shared CSS changes can cause regressions without screenshot-based review.

### Expected result

A verified continuation of the Phase 0.5 visual standard after trust and navigation integration, ready for real catalogue data and customer interactions.

---

## Phase 4 — Product media, catalogue integrity, and merchandising content

### Goal

Replace repeated and synthetic-looking product presentation with a credible catalogue that helps customers evaluate real products.

### Files affected

- `assets/`
- `index.html`
- `product.html`
- `category.html`
- `furniture.html`
- `bedrooms.html`
- `kitchens.html`
- `appliances.html`
- `majalis.html`
- `solar.html`
- `solar-solutions.html`
- `offers.html`
- `best-sellers.html`
- `new-arrivals.html`
- `collections.html`
- `wishlist.html`
- `cart.html`
- `search.html`
- `styles.css`

### Why this follows a stable visual and route system

The product is the hero. Current reuse of a small image set, color filters, and simulated gallery states weakens authenticity precisely at the moment a customer needs confidence to buy.

### Work scope

- Create a product-media standard: hero image, multiple real angles, material/detail image, contextual image, optional real short video, alt text, and image loading behavior.
- Replace product-image reuse where the image does not match the named product.
- Define mandatory product data: SKU, brand, origin, dimensions, warranty, price, discount, saving, availability, delivery, payment, and package contents.
- Build honest merchandising structures for best sellers, new arrivals, bundles, frequently bought together, related products, and room solutions.
- Use customer projects and inspiration imagery only when they are real, attributable, and shoppable where appropriate.

### Potential risks

- This phase depends on asset production, product information, and merchandising ownership outside the front-end team.
- Incomplete product data must not be disguised with placeholders in production.
- Higher-quality media increases page weight if not optimized in Phase 7.

### Expected result

A catalogue that looks credible, supports comparison, and makes products—not decorative UI—the centre of every commercial page.

---

## Phase 5 — Commerce foundation and discovery functionality

### Goal

Turn the catalogue into a working shopping system with real state, discovery, filtering, and product actions.

### Files affected

- `index.html`
- `search.html`
- `category.html`
- `product.html`
- `wishlist.html`
- `cart.html`
- `best-sellers.html`
- `new-arrivals.html`
- `offers.html`
- `furniture.html`
- `bedrooms.html`
- `kitchens.html`
- `appliances.html`
- `majalis.html`
- `solar.html`
- `solar-solutions.html`
- Shared styles and the future application/data layer

### Why this follows catalogue integrity work

Visual polish only becomes commercially valuable when the customer can search, compare, add items, save them, and retain that state across the journey.

### Work scope

- Implement a real product catalogue data model and a single product-card data source.
- Implement product detail routing, add-to-cart, quantity changes, wishlist persistence, and cart count synchronization.
- Implement category filters, sort order, pagination or infinite loading, active filter visibility, and reset behavior.
- Implement intent-aware search suggestions and results before considering voice or image search.
- Support Yemeni Riyal and Saudi Riyal with an explicit, admin-controlled conversion policy.
- Make solar and majalis calculators produce clearly marked estimates and usable consultation leads.

### Potential risks

- Data-model decisions made too late can require reworking all templates.
- Currency conversion, stock, and promotion logic require an accountable business owner.
- Search relevance can disappoint users if product data is incomplete.

### Expected result

A functional discovery and shopping experience that turns browsing into a valid cart.

---

## Phase 6 — Checkout, reservations, account, and service operations

### Goal

Make the completion and post-purchase journey reliable, transparent, and supportable.

### Files affected

- `cart.html`
- `checkout.html`
- `confirmation.html`
- `account.html`
- `account-profile.html`
- `account-reservations.html`
- `account-reservation-detail.html`
- `account-support.html`
- `contact.html`
- `support.html`
- `branches.html`
- `warranty.html`
- `reservation-policy.html`
- `faq.html`
- `majalis-assistant.html`
- `product.html`

### Why this follows working catalogue and cart foundations

Payment, reservation, delivery, warranty, and support are the moments when the brand either earns lasting confidence or loses it permanently. They must run on real data after commerce state exists.

### Work scope

- Validate checkout inputs and prevent order confirmation until requirements are met.
- Create a real order ID and persist order, customer, address, payment, and delivery preferences.
- Implement transparent delivery rules, governorate coverage, free-shipping eligibility, and installation conditions.
- Generate a concise WhatsApp handoff only after saving the order, as defined by product DNA.
- Implement reservation and measurement request workflows with status tracking.
- Implement account data, saved addresses, order/reservation history, warranty access, and support tickets.
- Make confirmation screens reflect real order status and next steps.

### Potential risks

- This phase touches customer data, privacy, payment, operational processes, and support ownership.
- WhatsApp must complement the website, not replace order records.
- Delivery and warranty claims must be aligned with actual branch and service capacity.

### Expected result

A customer can complete a safe order, understand what happens next, and receive reliable support after purchase.

---

## Phase 7 — Accessibility, quality assurance, and release readiness

### Goal

Prove that the complete experience is accessible, consistent, and resilient before launch.

### Files affected

- All customer-facing `*.html` pages
- `styles.css`
- `responsive-pro.css`
- Shared application, data, form, and navigation layers

### Why this follows complete customer-facing functionality

The project has a strong stated accessibility commitment. It must be verified after real functionality exists, not assumed from the presence of semantic markup alone.

### Work scope

- Test every primary journey on mobile, tablet, and desktop.
- Test keyboard navigation, visible focus, form errors, screen-reader names, RTL reading order, and reduced-motion behavior.
- Test empty, loading, error, out-of-stock, limited-stock, and network-recovery states.
- Test prices, discounts, currency conversion, tax, shipping, reservation, and order calculations.
- Run link validation to ensure no placeholder or dead route remains.
- Require visual regression approval for shared component changes.

### Potential risks

- Late QA can reveal shared defects across many pages.
- Accessibility fixes may require component-level changes rather than local patches.
- Operational edge cases may require product-policy decisions.

### Expected result

A verified store experience that is understandable, accessible, and consistent under normal and failure conditions.

---

## Phase 8 — Performance, SEO, monitoring, and controlled launch

### Goal

Protect the premium experience under real network conditions and make it measurable after launch.

### Files affected

- `assets/`
- `styles.css`
- `responsive-pro.css`
- All image-heavy category, product, offer, inspiration, and landing pages
- Page metadata across all `*.html` pages
- Build, analytics, monitoring, and deployment configuration

### Why this is last

Performance work is most effective when the final media, components, data flows, and routes are known. It should polish a complete experience, not optimize temporary prototypes.

### Work scope

- Optimize and responsively serve product and hero media with stable dimensions and progressive loading.
- Remove unused CSS and duplicated patterns after component consolidation.
- Add title, description, canonical, Open Graph, and structured product metadata.
- Measure Core Web Vitals on real mobile networks.
- Monitor search failures, cart abandonment, checkout errors, broken links, delivery-selection failures, and support handoffs.
- Release progressively with rollback criteria and a post-launch review window.

### Potential risks

- Compressing assets too aggressively can reduce product-image credibility.
- SEO migration mistakes can create duplicate or missing pages, particularly around solar routes.
- Analytics must respect privacy and customer-data policies.

### Expected result

A fast, indexable, observable storefront that preserves premium quality while improving conversion and operational visibility.

---

## Stage gates

The next phase may start only after the prior gate is accepted:

1. **Phase 0 accepted:** route and component inventory exists; regression process is agreed.
2. **Phase 0.5 accepted:** every storefront route has approved desktop, tablet, and mobile designs; shared visual components are documented and the full storefront passes visual review.
3. **Phase 1 accepted:** no unsupported promise, fake timer, or simulated product capability is visible.
4. **Phase 2 accepted:** no dead-end core route or placeholder CTA remains in the purchase path.
5. **Phase 3 accepted:** shared visual components remain consistent after route and UX-path integration.
6. **Phase 4 accepted:** every published product has credible matching data and media.
7. **Phase 5 accepted:** product discovery, cart, wishlist, pricing, and currency state work end-to-end.
8. **Phase 6 accepted:** checkout, confirmation, reservation, support, and WhatsApp handoff are backed by saved data.
9. **Phase 7 accepted:** accessibility, responsive, calculation, link, and failure-state tests pass.
10. **Phase 8 accepted:** performance and monitoring targets are met in production-like conditions.

## Success definition

The roadmap is complete when a mobile customer can discover a real product, trust its imagery and information, understand price and delivery, add it to a persistent cart, place a valid order, receive a real order reference, contact support easily, and return to manage the order without encountering a misleading claim, broken action, or inconsistent UI.
