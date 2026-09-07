# Cart recovery and optional combo images

QA sources: [#47](https://github.com/digiflydk/Orderfly-v2/pull/47#issuecomment-5568712753), [#51](https://github.com/digiflydk/Orderfly-v2/pull/51#issuecomment-5568722352). Implementation tracks [#56](https://github.com/digiflydk/Orderfly-v2/issues/56) and [#58](https://github.com/digiflydk/Orderfly-v2/issues/58).

## Causes and changes

- CartProvider stored items only in React state. Reloading or leaving for Stripe discarded them. A versioned `orderfly.cart.v1` localStorage snapshot now preserves one restaurant's product IDs, quantities, topping names, combo selections, fulfillment type and bag choice for 24 hours.
- The snapshot contains no prices, customer details, consent, coupon objects, Stripe credentials or discount reservations. A checkout order reference associates cart completion with the correct purchase. Editing the basket invalidates that reference.
- `restoreCartAction` verifies native brand/location ownership and rebuilds items from current catalog records. Current standard offers and eligible upsells use the same price floors as checkout validation. Removed/inactive items, unavailable toppings and invalid/expired combos are removed with a notice. Input bounds and duplicate-row checks apply before catalog access. Saved values never bypass checkout's server price validation.
- An explicit delivery URL takes precedence, including legacy `takeaway` as pickup. Changing restaurant clears the previous basket. A failed catalog request leaves the saved snapshot intact and offers retry; initial empty state cannot overwrite it. Browser storage failures are handled with a visible warning.
- Direct checkout now receives both brand and location and waits for cart hydration. Totals derive synchronously from cart state, removing a stale-total render after quantity/removal changes.
- Before navigating to Stripe, checkout flushes the snapshot with the new order ID. Cancel continues to expire the session before releasing its reservation. A subsequent checkout creates a fresh order/session/reservation. A server-verified `Paid` confirmation clears only the matching brand/location/order basket. Pending receipts, other orders and old receipts after basket edits cannot clear a newer basket.
- Restoring checkout recalculates availability and automatic discounts. Customers re-enter their details, discount code and newsletter choice as needed. Stored times, personal details and consent are deliberately not replayed. Abandonment beyond the 24-hour window or browser-cleared/blocked storage cannot guarantee recovery.
- Combo creation/editing uses a shared optional-image schema on client and server. Missing, null, blank and whitespace-only images are accepted; malformed nonempty URLs still fail. Undefined optional fields are omitted at the Firestore write boundary, so pickup-only combos without an image save correctly. Existing image placeholders remain in use.

## Focused local verification

Run from the repository root:

```sh
npm run typecheck
node --test tests/unit/cart-restore.cjs tests/unit/cart-cancel.cjs tests/unit/combo-image.cjs tests/unit/checkout-price-validation.cjs tests/unit/checkout-session-persistence.cjs
node --test tests/unit/cart-browser.cjs
```

The browser check uses only six local Chromium scenarios against the production CartProvider. It serves a small fixture with mocked catalog transport and payment navigation, without a Next build or full Playwright suite. Set `CART_CHROMIUM_PATH` when using a separately installed Chromium. The cancel test executes the actual cancellation and reservation code with in-memory Firestore and Stripe fixtures. No live payments, database writes, customer messages or GitHub Actions are involved. These checks are not a substitute for post-deployment QA.

2026-09-07 local result on the branch based on `062d03bfaa9b52defe5a02c5738a8a60bf3d2c47`: typecheck passed; all 34 focused checks passed, including the six Chromium scenarios. The cancel/removal scenario initially detected an old total after an item was removed; synchronous derivation fixed it without changing its expected amount.

## Work Release / Work QA handoff

1. Review this PR and its exact commit, then obtain PO acceptance, merge and deploy through Work Release. Record the active production SHA. Issues remain open until live verification and cleanup are documented.
2. Reproduce #56 with 2 Italiana at 75 kr. pickup: subtotal 150, total 154 including the bag if production configuration is unchanged. Refresh menu and direct checkout. Repeat with delivery, topping and combo choices.
3. Open the approved Stripe test flow, cancel without paying, refresh the cancellation page, return to checkout, change quantity/remove an item and create a fresh test session. Compare cart/checkout/Stripe amounts and confirm the earlier reservation releases once.
4. Repeat with applicable automatic discounts and a discount code; re-enter the code after return. Verify active rules, expiration, current catalog prices and restaurant isolation. Use the existing approved test payment procedure to verify a paid receipt clears its corresponding basket.
5. Create and edit a controlled test combo with no image; reopen it and verify placeholder rendering. Check that a malformed image URL remains rejected. Remove the test record after verification.

The remaining untested promotion/customer matrix and QA cleanup listed in #56 are separate Work QA items. This change does not declare #47/#51 fully verified. It does not delete QA orders, alter the user's paid ORD-495194 or introduce a general deletion module.
