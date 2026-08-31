# Backend Integration Guide (Zeyad For Business)

This document provides a comprehensive guide for developers integrating the Zeyad For Business frontend with a production backend (e.g., Laravel, Node.js, Django, ASP.NET).

## 1. Product IDs & Data Models
Every product card in the HTML is injected with data attributes to make it easy for frontend scripts to pass data to the backend.
- `data-product-id`: Unique stable identifier (e.g., `appl-0001`, `fur-0005`).
- `data-category`: The broad category prefix (`appl`, `fur`, `kit`, `bed`, `maj`, `sol`).
- `data-price`: Numeric price value (e.g., `3790`).
- `data-stock`: Stock status (e.g., `in-stock`).

**Product Model:**
```json
{
  "id": "string",
  "category": "string",
  "name": "string",
  "price": "number",
  "oldPrice": "number|null",
  "stockStatus": "string",
  "attributes": ["color", "warranty", "brand"],
  "images": ["url1", "url2"]
}
```

## 2. Order Object & Checkout Flow
The checkout page (`checkout.html`) is completely decoupled from any specific payment gateway. When the user confirms the order, an `Order Object` is generated.

**Order Object Schema:**
```json
{
  "orderId": "ZFB-2026-XXXX",
  "createdAt": "ISO-8601 String",
  "status": "pending",
  "customer": {
    "firstName": "string",
    "lastName": "string",
    "phone": "string",
    "email": "string|optional"
  },
  "shipping": {
    "city": "string",
    "district": "string",
    "addressDetail": "string",
    "method": "string"
  },
  "notes": "string",
  "payment": {
    "method": "enum(kuraimi, jeeb, jawali, floosak, one-cash, bank-transfer, money-transfer, cod, gold, direct-transfer)",
    "deliveryFee": "number",
    "subtotal": "number",
    "discount": "number",
    "total": "number"
  },
  "items": [
    {
      "id": "fur-0001",
      "name": "string",
      "quantity": "number",
      "price": "number"
    }
  ]
}
```
**Integration Step:** Replace the `console.log` in `checkout.html` with an API call (e.g., `fetch('/api/orders', { method: 'POST', body: JSON.stringify(orderObj) })`).

## 3. Forms & Endpoints
All forms have been standardized with `method="POST"` and `action="/api/submit-form"` (placeholder). Every input field now has a `name` attribute matching its `id`.

### Expected API Endpoints:
1. `POST /api/orders` - To submit the checkout Order Object.
2. `POST /api/contact` - For the contact form (`contact.html`).
3. `POST /api/consultation` - For design/solar consultations.
4. `POST /api/newsletter` - For email subscriptions.
5. `GET /api/products?category=...` - For fetching products dynamically on catalog pages.

## 4. UI States & Validation
- **Validation:** Forms utilize HTML5 validation (`required`, `type="tel"`, `type="email"`).
- **Submission State:** Add a CSS class `.is-loading` to buttons when awaiting backend response.
- **Success/Error:** Redirect to `confirmation.html` or display inline error messages below fields.

## 5. Event Tracking (Optional but recommended)
You can hook into the following user actions for analytics:
- `addToCart(btn, event)` - Fired when a user adds an item to cart.
- `Wishlist Toggle` - Fired on clicking the heart icon.
- `Category Filter Click` - Fired when clicking category chips in catalog pages.

## 6. „·«ÕŸ«  „⁄„«—Ì… ··„ÿÊ—Ì‰ (Architectural Notes)
- **—Ê«»ÿ «·Ê«ÃÂ…:**  „  ‰ŸÌ› «·Ê«ÃÂ… »«·ﬂ«„· „‰ Ã„Ì⁄ —Ê«»ÿ javascript:void(0) Ê href="#" «·›«—€… ·÷„«‰ «· Ê«›ﬁ (Accessibility) Ê Ã‰» √Ì √Œÿ«¡ ›Ì —Õ·… «·„” Œœ„. «·√“—«— «· Ì ·«  ‰ﬁ·ﬂ ·’›Õ… ÃœÌœ…  ” Œœ„ ≈„« “—« ÕﬁÌﬁÌ« √Ê —«»ÿ« ÌÊÃÂ ··ﬁ„… #top.
- ** ﬂ«„· «·Ê«ÃÂ… (Layout Integrity):** ·«  ﬁ„ »≈÷«›… ›∆«  CSS „÷„‰… (Inline Styles) ··„‰ Ã« . «” Œœ„ data-* attributes ·‰ﬁ· «·Õ«·« ° Ê« —ﬂ «·Ê«ÃÂ…   Ê·Ï ≈ŸÂ«—Â« «” ‰«œ« ≈·Ï styles.css.
