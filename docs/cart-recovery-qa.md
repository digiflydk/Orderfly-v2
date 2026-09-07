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

### PR #59 review follow-up: fulfillment and bag changes

[Review finding](https://github.com/digiflydk/Orderfly-v2/pull/59#discussion_r3949285740): switching pickup/delivery or changing the bag choice kept the previous checkout reference. Both handlers now clear that reference before persisting, so repricing cannot restore it and an old payment confirmation in another tab cannot erase the edited basket. Selecting the same value does not invalidate an unchanged basket.

One focused regression, with four cases (pickup to delivery, delivery to pickup, remove bag, add bag), reproduced cart deletion on `e6782cd` and passes after the fix. It uses two tabs sharing browser storage, checks that the changed basket and choices survive the old confirmation and reload, and confirms that a new matching paid checkout still clears its own basket. Typecheck also passed. No other tests, Actions or production operations were run for this follow-up.

```sh
node --test --test-name-pattern='changed fulfillment or bag choice' tests/unit/cart-browser.cjs
```

Use `CART_CHROMIUM_PATH` if Chromium is installed separately. Add the same two-tab scenario to the targeted live QA after deployment.

## Work Release / Work QA handoff

1. Review this PR and its exact commit, then obtain PO acceptance, merge and deploy through Work Release. Record the active production SHA. Issues remain open until live verification and cleanup are documented.
2. Reproduce #56 with 2 Italiana at 75 kr. pickup: subtotal 150, total 154 including the bag if production configuration is unchanged. Refresh menu and direct checkout. Repeat with delivery, topping and combo choices.
3. Open the approved Stripe test flow, cancel without paying, refresh the cancellation page, return to checkout, change quantity/remove an item and create a fresh test session. Compare cart/checkout/Stripe amounts and confirm the earlier reservation releases once.
4. Repeat with applicable automatic discounts and a discount code; re-enter the code after return. Verify active rules, expiration, current catalog prices and restaurant isolation. Use the existing approved test payment procedure to verify a paid receipt clears its corresponding basket.
5. Create and edit a controlled test combo with no image; reopen it and verify placeholder rendering. Check that a malformed image URL remains rejected. Remove the test record after verification.

The remaining untested promotion/customer matrix and QA cleanup listed in #56 are separate Work QA items. This change does not declare #47/#51 fully verified. It does not delete QA orders, alter the user's paid ORD-495194 or introduce a general deletion module.

## #62: menu return and selected toppings after cancellation

Checkout now exposes Back to Menu above the nonempty form, retaining the brand, location and fulfillment query. It is disabled while payment is in flight, uncertain or ready for handoff. Navigation uses the existing CartProvider and does not clear the basket. Stripe cancellation retains the existing capability check and provider-confirmed expiration before releasing a reservation; no cancel endpoint or paid-cart clearing rule is relaxed.

The product dialog hides topping groups unavailable at the current location and groups with no active options. Cart restoration previously treated those same referenced groups as invalid and removed the entire product. Restoration now validates the same offered groups as the dialog. Selected unavailable toppings still reject the affected line, and min/max limits on offered groups remain enforced.

New selections persist optional stable topping IDs alongside the legacy names. This distinguishes identically named toppings in different groups and restores current names/prices after a rename. IDs must be unique and match the names-array length. Restored IDs are scoped to the product's offered location groups. Old snapshots remain compatible when names resolve unambiguously; ambiguous legacy choices still require reselection rather than guessing. Cart row matching also uses IDs when available. No personal details or prices were added to browser storage.

Persistence across a closed tab and a new tab in the same browser is intentional: one restaurant's basket is retained for up to 24 hours since the last save. Completing a matching server-confirmed paid checkout clears it; cancellation does not. Other restaurants, expired snapshots and invalid catalog selections retain the established boundaries. The screenshot's exact removed line was not available; the two invalid-removal cases above were reproduced against production code with synthetic fixtures and fixed.
