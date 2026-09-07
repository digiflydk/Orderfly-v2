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

Advanced tiered quantity pricing, fixed-price mix-and-match bundles and configurable stacking are not introduced by this change. Existing allowStacking metadata does not establish generalized stacking support.
