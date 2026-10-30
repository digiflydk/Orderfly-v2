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

These local results do not establish deployment success, real menu completeness,
production domain routing, visual approval of every page, or end-to-end payment
integration success. Those require repository gates, independent review and
post-deployment read-only live verification. Production orders/payments must
not be created by unattended QA. The product-dialog harness captures the cart
handoff through a test adapter; cart continuity is exercised separately with the
real CartProvider.
