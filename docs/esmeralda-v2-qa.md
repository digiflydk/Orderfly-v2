# Esmeralda V2 regression evidence (#780)

Local browser checks use production React components and synthetic catalog fixtures.
The fixture products/prices are confined to test code and are never written to a
merchant catalog. These checks do not create orders or contact payment services.

## Product customization and V1 preservation

Run:

```sh
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/tilvalg-storefront-browser.cjs
```

The existing nine V1 cases remain enabled. Three V2 cases render the real
`ProductDialog` under `StorefrontV2Provider` at 320×568, 390×850 and 1280×850.
They verify required and conditionally required choices block submission,
maximum quantities remain enforced, single-choice drinks cannot conflict,
removals and quantities survive reopening/editing, and the purchase action is
rectangular and remains reachable after scrolling. Dialog horizontal overflow
is checked as well. The thirteenth case confirms menu upgrades cannot silently discard chosen modifiers
or bypass required choices, while an unmodified optional product remains eligible.
Computed dark/gold styles are checked under the actual production wrapper.
All 13 cases passed on 2026-10-30 (Copenhagen).

## Cart continuity

```sh
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/cart-browser.cjs
```

All 19 existing production CartProvider browser regressions passed on
2026-10-30 (Copenhagen). Coverage includes refresh/checkout restoration,
customizations and combos, payment-cancel restoration, tenant changes,
current catalog repricing, and matching checkout completion isolation.

## Remaining acceptance boundaries

The shared admin access/filter suite passed 72/72 locally on 2026-10-30 after
updating the brand-layout harness for the V2 stylesheet, request headers and
presentation provider. Its explicit dependency allowlist still rejects unexpected
data dependencies, and the original scoped brand-read/client-props assertions
remain unchanged. It also asserts V2 is disabled for the unrelated fixture brand.
Typecheck passed after this harness correction. New-head CI is still required.

The personal discount card service/browser suite passed 121/121 locally on
2026-10-30 after the checkout-return harness loaded the actual V2 host helper
through an explicit dependency allowlist. Existing same-brand return, expiry
and redirect-rejection assertions remain unchanged; a new case verifies the V2
alias retains Esmeralda checkout identity and rejects foreign/alias tenant paths.
Typecheck passed. Current-head CI and live acceptance remain required.

These local results do not establish deployment success, real menu completeness,
production domain routing, visual approval of every page, or end-to-end payment
integration success. Those require repository gates, independent review and
post-deployment read-only live verification. Production orders/payments must
not be created by unattended QA. The product-dialog harness captures the cart
handoff through a test adapter; cart continuity is exercised separately with the
real CartProvider.

## Visual correction follow-up (#780, 2026-10-30)

Independent QA exercised the updated production components against loopback-only
fixtures. No production orders, payment sessions or catalog mutations were made.

- `menu-refresh-browser.cjs`: 11 cases pass, including unchanged V1 coverage at
  320/390/768/1280/1600 px and V2 menu/cart checks at 320/390/1280 px. V2 cases
  check compact first-product visibility, rectangular actions, document/panel
  overflow, full-height mobile cart, viewport-pinned checkout action, quantity
  changes and cart refresh continuity. Restaurant details, delivery-price notice
  and search/reset remain available in the compact layout.
- `checkout-browser.cjs` plus `tilvalg-storefront-browser.cjs`: 88 cases pass.
  Coverage includes V1 and V2 modifier validation, saved selections, combo draft
  preservation, allergen disclosure, small-view scrolling, hosted payment
  handoff, invalid contact rejection, disabled payment configuration and existing
  checkout recovery/discount/delivery safeguards.
- `cart-browser.cjs`: 19 persistence, repricing, edit and tenant isolation cases
  pass.
- `storefront-v2-payment.cjs`, `esmeralda-v2-host.cjs` and
  `marketing-layout-boundary.cjs`: 7 boundary cases pass.
- Integrated TypeScript checking passes with `npm run typecheck`.

The visual review found a legacy `max-height:85dvh !important` overriding the
new full-height cart. The V2 override was corrected and an explicit mobile
viewport-height assertion now prevents that regression.

Screenshot evidence uses actual React components and production CSS but synthetic
catalog data and imagery. It establishes layout and interaction geometry, not
production food images or brand-logo accuracy. Visual acceptance is a separate
review against the approved mockups, not a consequence of these functional test
results. Final hosted-route verification with the real catalog, CI on the release
commit and the separately blocked menu-catalog mapping remain separate gates.
