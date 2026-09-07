# Automatic restaurant discounts

Issue #46 extends the existing `standard_discounts` module, rather than adding another campaign collection. `/superadmin/discounts` continues to manage codes and newsletter incentives and now links directly to `/superadmin/standard-discounts`.

Existing capabilities: one or multiple products, categories, entire-cart discounts, percentage or fixed DKK reduction, free delivery with a minimum order, brand/location scope, pickup/delivery, activation, dates, weekdays and time slots. Bundled menus already exist separately under Combos. These are not newly built capabilities.

New method: `buy_x_pay_y`, supported for product/category scopes. X and Y are integer quantities, 2 <= X <= 1000 and 1 <= Y < X. “3 for 2” means one free item per complete group of three eligible units, repeatable. Mixed products within the selection count together. The cheapest eligible units are free. Extra toppings, combos and items already discounted are excluded. Best automatic cart offer competes with the voucher/newsletter offer; discounts are not added together. This is a quantity offer, not “three items for a fixed bundle price”.

`automatic-discounts.ts` provides the same calculation to cart context and server checkout. Calculations use cents and bound savings to the eligible subtotal. Checkout resolves product/category scope from native catalog records, excludes already discounted items/combos, checks integer quantities, and rejects underpriced quantity-offer baskets. This does not replace the application's entire existing catalog/topping price validation pipeline.

The editor and server now share their validation schema. Writes verify brand/location ownership; category ownership is derived from locationIds because categories do not store brandId. Related editor/list catalog props are serialized before the server/client boundary. Product cards show a quantity-offer badge. The Offers section preserves native product IDs/categories and delegates item pricing to ProductCard, avoiding a second conflicting price calculation.

## Verification

Local `npm run typecheck`; `node --test tests/unit/automatic-discounts.cjs tests/unit/storefront-performance.cjs tests/unit/promotion-review.cjs`. Unit tests use actual schema/action code with mocked database I/O. They are not evidence of live payment or database success. No full Playwright or GitHub Actions run requested.

## Work Release / Work QA

Release merges and deploys the reviewed commit. QA records the active release SHA and performs controlled reversible campaign writes, without modifying unrelated campaigns:

1. Open Discounts > Automatic discounts. For CPH PIZZA / M3 Pizza Hellerup, create and reopen product and category offers with percentage and fixed DKK discounts, with empty optional fields.
2. Create 3-for-2 for selected products/category. Verify the X/Y values and location survive save/reopen. Missing selection, fractional quantities and Y >= X must show validation errors.
3. Check menu badge and Offers category. In the basket, 2 units have no quantity discount, 3 get the cheapest free, 4 still get one free, 6 get two free. Mix prices and add toppings: toppings stay fully charged. Removing items recalculates savings.
4. Verify wrong location, delivery method, inactive and expired campaigns do not apply. Check discounted items/combos are excluded; code/newsletter and automatic cart offers compete without double discounts.
5. In the approved Stripe test flow compare basket, Stripe total, receipt and admin order discount. Cancel one checkout and verify the existing reservation behavior. Record any discrepancy before calling the feature Done.

## Bundle prices and quantity tiers

The PO extended #46/#47 to include `bundle_price` and `quantity_tiers`. Both reuse product/category scope and the same cart/server calculation, validation, eligibility and best-offer policy.

`bundle_price`: buyQuantity specifies bundle size; bundlePrice is the total DKK price excluding toppings. Complete bundles repeat. Most expensive eligible units are bundled first; leftovers stay at normal price. Each bundle is capped at its normal total, so offers never surcharge cheap selections. Example: four pizzas priced 120, 100, 90 and 50 with 3-for-200 yield 110 DKK savings and a 250 DKK food total.

`quantity_tiers`: editable rows specify minQuantity, percentage or fixed_amount reduction per item, and value. The highest reached threshold applies to all eligible units, not only units above the threshold. Input order does not matter. Thresholds must be unique positive integers (2–1000); at most 20 rows. Percentage cannot exceed 100; each unit's reduction is capped at its base price. Example: 10% from 3 units, 20% from 6 units. Toppings remain full price. A fixed-amount tier is a reduction per item, not a fixed unit price.

QA additionally verifies: 3-for-200 at 2/3/4/6/7 units; mixed prices and cheaper-than-bundle selections; tier boundaries at 2/3/5/6; removing units crosses thresholds correctly; save/reopen preserves all tier rows and bundle price. Compare cart, Stripe, receipt and admin order. Both new methods must exclude wrong locations, expired/inactive offers, toppings and locked items. Invalid duplicate/fractional thresholds, empty tiers and invalid bundle prices must be visibly rejected. The targeted local suite now has 20 tests; live verification remains a separate QA gate.

Configurable stacking is not introduced. Existing allowStacking metadata does not establish generalized stacking support.

## P1 checkout price guard

Review found that the guard was conditional on cart-discount eligibility, allowing a low submitted unit price to bypass rejection. Checkout now resolves all native catalog lines first and unconditionally validates every unit/line price before deciding eligibility or performing customer/order writes. Product/category reductions come from active scoped campaigns; upsell reductions additionally require an active scoped offer and a trigger supplied by other native cart products. Combo lines are checked against their configured pickup/delivery price before exclusion from discounts. Quantity/cart discounts are applied later and cannot justify a lower submitted item price. Line totals must cover the submitted unit price times quantity. This is a base-price floor check, not a replacement of the separate topping/selection pricing model.

Per PO request, only `node --test tests/unit/checkout-price-validation.cjs` was run for this follow-up: four focused regressions cover tampered unit/line prices, valid standard and upsell prices, scope/expiry rejection and actual checkout-action ordering with mocked I/O. The valid action test deliberately stops after pricing and before side effects. No Actions, full suite or live payment was initiated. Work Release should use the updated PR head, then pass the deployed release to Work QA.

## #62: ordinary checkout after a reserved first-order offer

The user's requirement is that a checkout without a first-order offer must remain payable even when an older first-order offer is reserved. Previously the customer-wide `firstTimeHeld` flag rejected every new payment, including a full-price cart with `appliedDiscountId: null`.

The first-order guard now runs only when the new checkout actually claims a first-order discount. A new first-order claim is still rejected if another first-order claim is held, any prior order is held, or a paid order exists. Global/personal limits, tenant/customer scope and idempotent reservation/settlement remain enforced. Starting or settling an ordinary payment preserves another order's first-order hold; only settlement/release of its owning order clears that flag.

Eligibility for an already-held first-order offer remains established when it was reserved. An ordinary purchase started afterward may complete before that previously reserved offer. It does not acquire an additional first-order entitlement. This explicitly replaces the earlier symmetric exclusion between ordinary and first-order sessions and avoids blocking full-price purchases. No old Stripe session is expired merely because someone supplies the same email, and no production counters are reset by this change.
