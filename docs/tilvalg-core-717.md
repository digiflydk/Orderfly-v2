# Tilvalg policy and checkout contract (#717)

This additive model retains existing Firestore collection and field names. No migration or production write is required. Old groups default to addition/multiple, old options default to a maximum quantity of one, and old saved selections default to quantity one. The public product projection carries `toppingOverrides`, `isActive` and `locationIds` so a reused native product can be checked client-side as well as server-side.

## Model

- Groups: optional `kind` addition/removal, `displayName`, `selectionMode` single/multiple, and `sortOrder`. Product `toppingGroupIds` remains the per-product ordered list.
- Options: optional `maxQuantity` (1–50), `productId` pointing to a native product.
- Product `toppingOverrides` maps an option ID to optional `price`, `isDefault`, `defaultQuantity`, and `isAvailable`. Missing price inherits; zero is explicitly free.
- Cart option `quantity` and `unitPrice` are additive. Its existing `price` remains the extended amount for one parent item, so existing totals, discounts and receipts keep their price convention.
- Checkout and saved cart use parallel `toppingIds`, `toppingQuantities` and labels. Explicit quantities require stable IDs and matching lengths; omission remains the legacy one-unit case. The storefront slice owns saved-cart schema and serialization.

## Shared policy

`src/lib/topping-options.ts` provides `resolveToppingOptions`, `cartTopping`, `toppingLabel`, `toppingSelectionError` and `reconcileToppingQuantities`. The display helper and authoritative restore/checkout use the same rules. Minimum/maximum sum quantities, while `selectionMode=single` limits distinct choices independently. Total option units are bounded by the existing cap of 50.

Removal groups are explicit ingredient-removal choices, displayed and persisted as `Uden <name>`. They cannot charge, preselect an ingredient removal, or allow a quantity above one. Per-product availability can limit which ingredients a shared removal group offers. Positive options with multiple units are persisted as `<quantity> × <name>` for existing order/receipt readers. Browser-supplied labels are replaced with the current authoritative labels at checkout.

Linked products require current native identity, active status, matching brand and location, a valid current pickup/delivery price, no synthetic/test marker, and no nested groups or self-link. Missing or invalid sources make the option unavailable. Checkout's catalog loader must fetch the linked products before calling validation; catalog slice #719 owns this integration.

Defaults are applied only when a group first becomes visible. Explicit deselection in an already visible group remains empty. A root default can activate one-level dependent defaults in the same reconciliation. Hidden dependent selections are removed and cannot be submitted to checkout.

## Verification

`node --test tests/unit/topping-options.cjs tests/unit/topping-conditions.cjs tests/unit/topping-condition-validation.cjs tests/unit/cart-restore.cjs` checks new quantity and removal labels, zero/inherited prices, product defaults, bounds, malformed counts, stale choices, single/multiple rules, conditional defaults, legacy restoration and linked product scope. Browser UI, persisted print transport and production live acceptance are separate slices, not implied by these unit tests. No GitHub Actions are used.
