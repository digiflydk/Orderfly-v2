# Mobile cart dock

The Esmeralda V2 menu keeps **Se kurv** at the bottom of the mobile viewport whenever the cart has items. The button continues to open the existing cart sheet. Desktop uses its existing cart sidebar and header control; V1 retains its previous floating control.

## Layout

- `MobileFloatingCart` places the V2 button in a `data-v2-cart-dock` container with `position: fixed`, `bottom: 0`, full viewport width and the existing layer below modal dialogs.
- The dock paints an opaque brand background through the bottom edge. It has 12px top/side padding and `max(12px, env(safe-area-inset-bottom, 0px))` bottom padding. The 54px gold button sits inside that surface.
- `data-v2-cart-clearance` reserves the dock's full height in the menu, including the safe area, so the final product can be scrolled above it.
- Cart overlays, checkout validation, menu upgrade priority and persistence are unchanged.

## Price shown in the bar

The bar shows the same preliminary amount as the cart sheet, excluding the bag fee. When the route uses managed delivery (`useManagedDeliveryPrice()` and delivery is selected), the delivery price is only known at checkout. The bar then excludes the location's legacy `deliveryFee`, exactly as the cart sheet shows **Afventer leveringspris** and checkout subtracts that fee before adding the quote. Legacy delivery keeps its configured fee in the bar; pickup never includes a delivery fee.

Before 2026-11-01 the bar showed `checkoutTotal - bagFee` regardless of managed delivery. On Esmeralda Pizza Amager a 95 kr. menu therefore appeared as 144 kr. in the bar (95 + the 49 kr. legacy fee), while the cart showed 95 kr. and a pending delivery price.

Previously, two cart-button CSS blocks conflicted. The later rule lifted the button above the viewport by the device safe area while its background shadow covered only 10px. Menu content could therefore appear below the button on devices with a larger bottom safe area. Safe-area padding now belongs to a dock that reaches the bottom, instead of being used to lift the entire control.

## Verification

```sh
npm run typecheck
CART_CHROMIUM_PATH=/tmp/menu-chromium node --test tests/unit/menu-refresh-browser.cjs
node --test tests/unit/delivery-cart-price.cjs tests/unit/mobile-cart-bar-price.cjs
```

The browser fixture uses the production menu, cart components and styles with a synthetic local catalog. Regression checks cover 320px, 390px and 768px widths, top/middle/end scroll positions, 900px/670px viewport resizing, and native Chromium CSS safe-area overrides of 0px and 34px. Assertions check the dock's exact bottom/side coordinates, button inset, opaque bottom hit area, matching content clearance, last-product visibility and desktop hiding. Existing V1 and V2 cart interactions remain in the same suite.

These checks do not create production orders or payments. Native iOS browser toolbar behavior and physical Home Screen use still require device verification; Chromium safe-area emulation is not a claim of a physical iPhone test.
