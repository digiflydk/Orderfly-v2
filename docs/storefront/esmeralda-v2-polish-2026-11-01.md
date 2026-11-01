# Esmeralda V2 polish (2026-11-01)

PO feedback on the live Esmeralda V2 storefront. Presentation only. Prices, consent, validation and payment payloads are unchanged.

| # | Request | Change |
|---|---|---|
| 1 | "Jeg tager med" highlighted by default | `OrderModal` takes `preferredMode`. The Esmeralda sheet (`DeliveryMethodModal`) passes `pickup`. When that mode is available, its button gets a gold ring (`data-preferred`) and receives focus when the sheet opens. A disabled mode is never highlighted. The m3pizza landing does not pass the prop and is unchanged. |
| 2 | Logo without background, 10% larger | Logo slots grow by 10%: V2 menu header 152×40 → 168×44, V2 checkout 144×40 → 168×44 (also covers the cart), Esmeralda landing header 164×36 → 180×40. The white background is part of the brand's JPG (`brand.logoUrl`). Removing it requires a transparent logo file with light text, uploaded in the brand settings. No code change is needed when the file is replaced. |
| 3 | Logo instead of the "ESMERALDA" text in the cart | `MobileFloatingCart` shows `brand.logoUrl` centred in `.v2-cart-brandbar`, using the brand name as alt text. If no logo is set, it falls back to the brand name. |
| 4 | Checkout logo centred, no location name | In V2 checkout, `MenuHeader` centres the logo and omits the location name. V1 checkout keeps the logo left and the name right. |
| 5 | One checkbox for terms and newsletter | **Not implemented.** The Club specification (`docs/stempelkort/`) requires two separate, unticked checkboxes for newsletter consent and Club terms. This awaits a PO decision. |
| 6 | "Ændre tidspunkt" | Button text in checkout and the time selector. |
| 7 | Space between "I alt" and the CTA | The V2 mobile checkout reserved a fixed 230px below the summary. It now measures the fixed CTA bar with a `ResizeObserver` and reserves `--checkout-bar-height + 16px`. The fallback before measurement is 140px plus the safe area. |

## Verification

```sh
npm run typecheck
CART_CHROMIUM_PATH=/opt/pw-browsers/chromium node --test tests/unit/delivery-method-labels-browser.cjs tests/unit/checkout-browser.cjs tests/unit/menu-refresh-browser.cjs tests/unit/commerce-p2-browser.cjs
node --test tests/unit/mobile-cart-bar-price.cjs tests/unit/delivery-cart-price.cjs
```

New regressions:

- The sheet marks and focuses pickup, and a disabled pickup is never highlighted.
- The V2 mobile checkout padding follows the measured CTA height, and "I alt" sits just above the CTA.

Both fail on the previous `main`. `tests/unit/location-header-browser.cjs` already fails on `main` (a `server-only` import in its fixture). It is not run in CI and is not affected by this change.
