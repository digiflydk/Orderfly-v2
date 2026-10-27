# Linked option pricing

A topping linked by `productId` uses the current native product price in the order's fulfillment channel: pickup uses `price`; delivery uses `priceDelivery` with the same fallback to `price` as standalone ordering. The shared resolver ignores stored product-specific price overrides for linked options, including zero. This applies to storefront display, restored carts and authoritative checkout. Missing, inactive, foreign-brand, unavailable-location and nested linked products remain unavailable.

Product saves reject price overrides for linked options through `validateToppingOverrides`. Availability, default selection and default quantity remain configurable within existing bounds. Explicit configured defaults are unchanged. Existing stale price overrides are ignored at runtime; this change does not rewrite production data.

Independent options without `productId` retain product-specific prices, including zero for included choices. No product-name matching or global defaults are introduced.

Validation: `node --test tests/unit/topping-options.cjs tests/unit/tilvalg-catalog-719.cjs` passes 26 tests, covering stale zero/nonzero overrides, pickup/delivery totals, checkout underpayment rejection, linked availability, standalone zero-price inheritance and atomic product-save rejection. `npm run typecheck` passes. No GitHub Actions or production mutations are used.
