# Esmeralda V2 desktop polish (2026-11-03)

PO feedback on the desktop storefront.

| # | Request | Change |
|---|---|---|
| 1 | Page width 1300px | The V2 `.storefront-frame` (menu, banner, header) and the checkout page container (`[data-checkout-page]`) are capped at 1300px. Before, the menu was 1540px and checkout 1140px. |
| 2 | Brand favicon | New optional brand field `faviconUrl`, set in superadmin under "Favicon URL". When set, it is the storefront `icon`/`shortcut` in `storefrontInstallMetadata`. Apple and home-screen icons stay generated from the logo. |
| 3 | Browser-tab title | New optional brand field `browserTitle` (max 70 characters), set in superadmin under "Titel i browserfanen". It is the storefront `<title>`; the brand name remains the fallback. `applicationName` and the Apple web-app title keep the brand name. |
| 4 | Search as wide as the cart | From 1024px, `[data-v2-menu-navigation]` uses the menu grid's columns (`minmax(0, 1fr) 340px`, 32px gap). The search field therefore lines up with the cart column and has the same width. |
| 5 | Club signup missing on desktop checkout | No code change. The Club card renders at 390px and 1280px in a fresh session, both live and in tests. It is hidden only when the server suppresses it: a valid Club session with a personal discount card in that browser, or an e-mail that already has a personal Club offer. |
| 6 | Pay button always visible | The desktop summary column (`[data-checkout-summary-column]`) is sticky. Its max-height fits the space actually left in the viewport, and it is re-measured on scroll and resize. Before, it had a fixed `100vh − 3rem` height that started about 210px down the page, which pushed the pay button below the fold. Only the order lines scroll; terms and "Gå til betaling" stay in view. |

`faviconUrl` and `browserTitle` are added to the public brand projection (`publicBrandRecord`). No migration is needed: empty fields keep today's behaviour.

## Verification
```sh
npm run typecheck
node --test tests/unit/storefront-home-screen.cjs
CART_CHROMIUM_PATH=/opt/pw-browsers/chromium node --test tests/unit/menu-refresh-browser.cjs tests/unit/checkout-browser.cjs
```

New tests:
- The favicon and tab title override the tab only.
- At 1280 and 1600px, the search field matches the cart column's x position and width, and the banner frame is at most 1300px.
- With 1 and with 14 order lines, the checkbox and pay button stay inside a 1280×900 viewport at every scroll position, and only a long order list scrolls.

The checkout tests fail on the previous `main`.

## Club login state (follow-up to item 5)
The PO's desktop browser had an active Club session with a personal discount card. The checkout then correctly hid "Bliv medlem", but the storefront still said "Log ind", which was confusing.

`getClubSessionStatusAction` (in `src/app/club-session-actions.ts`) is a read-only server action. It validates the host-only `__Host-orderfly-loyalty` cookie with `readSession` and returns only `{ signedIn }`. The `useClubSignedIn` hook calls it on mount and again when the tab regains focus. With a valid session:
- the V2 header shows **Min Club**, linking to `/club` instead of `/club/login`,
- the checkout replaces "Har du et personligt rabatkort? Log ind i Club …" with "Du er logget ind i {Club}. Har du et personligt rabatkort, så brug kortets e-mail i kassen."

No member data reaches the storefront. Logout stays in the Club portal.

The browser fixtures mock `@/app/club-session-actions` through `window.fixtureClubSignedIn`. `menu-refresh-browser` and `checkout-browser` cover the signed-in header and checkout text.
