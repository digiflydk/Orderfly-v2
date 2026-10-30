# Cart and contextual recommendations

## Customer behavior

- On mobile, editing a basket line returns to the basket after saving or cancelling. The customer does not need to find and reopen the basket to review the result.
- Quantity, remove and close controls preserve 44px touch targets. The checkout area stays outside the scrolling basket and respects the device bottom safe area.
- Configured recommendations remain inline, with at most three distinct products and compact 64px images. They do not block checkout or introduce another mandatory step.
- Offer products are taken from the current native catalog, in configured offer order. Missing, inactive, duplicate, standalone already-added and combo-included products are removed from the visible recommendations. Server matching additionally owns brand/location/channel eligibility.
- Dismissing a recommendation synchronizes responsive basket views and survives basket close/reopen for the browser session.
- Quick add and configured products both preserve the offer ID in the basket. Checkout continues to validate the offer and price on the server. Required product options still must be selected; a recommendation never bypasses them.

## Measurement

An actually visible recommendation emits `upsell_offer_shown`. Its stable interaction ID is passed to acceptance and dismissal events. Acceptance fires only following a successful cart save. Responsive views are observed separately and hidden offers do not count as visible impressions. These interaction events are not paid conversions or proof of sales uplift.

## Validation

`tests/unit/relevant-upsell-products.cjs` verifies native catalog authority, configured order, duplicate/availability filtering, cart/combo exclusions and the three-offer display cap. Commerce browser coverage verifies quick add, required options, cart editing, rejection and checkout non-blocking behavior. Typecheck, independent review, production build and read-only post-deploy acceptance remain release gates. GitHub Actions are not used under the PM's explicit instruction.

### Combo upgrades and product modifiers (#780)

Combo selections now optionally carry `products[].modifiers`, a bounded list of
stable option IDs and quantities. Existing modifier-free combo snapshots remain
valid. Upgrading a configured product transfers its additions, removals and
quantities; the builder exposes each selected product's option groups, including
required and conditional groups. Editing a combo retains these choices. Failed
option loading blocks saving and offers a retry.

Only choices are persisted or submitted. Restore and checkout resolve each
component product within the combo's allowed group, brand and location, then
apply the shared product override, linked-product, availability, quantity,
conditional and required-group rules. Checkout loads component option catalogs
and linked products, rejects changed combo base prices and option totals, and
never accepts client modifier prices. For compatibility with existing cart,
receipt and total calculations, resolved modifiers are projected into the cart
line's `toppings` with the component product name. This projection is omitted
from saved/request choices and rebuilt authoritatively; it is never charged twice.

Validation: `npm run typecheck`; `node --test tests/unit/combo-modifiers.cjs
 tests/unit/cart-restore.cjs tests/unit/checkout-price-validation.cjs
 tests/unit/tilvalg-cart-choices.cjs`; isolated production-component Playwright
coverage in `tests/unit/combo-modifiers-browser.cjs` covers 390/1280px preservation,
required validation, totals, reopening/editing and failed option loading. Tests
use synthetic data and do not create production orders.

Compatibility contract: an absent component `modifiers` field retains the V1
plain-combo behavior: product defaults and required customization groups do not
apply and no extras are charged. V2 explicitly includes an array, even when empty,
for every component; that opt-in is preserved by restore, storage and checkout
and applies all product-option rules. Any supplied modifier must pass those
rules. Omitting the field can only order the existing plain legacy combo without
extras; it cannot retain unvalidated options. V1 does not show product option
configuration or apply paid defaults, unless editing an already configured combo.
Regression tests cover required groups and paid defaults in the legacy path and
empty explicit configurations remaining strict after serialization.
