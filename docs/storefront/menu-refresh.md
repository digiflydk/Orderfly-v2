# Esmeralda menu refresh (#756)

## Scope and reference

Menu-first update requested 2026-10-29. The existing black/white/gold brand palette, catalog, discounts, pricing authority, cart persistence, fulfillment, consent and checkout are retained. No production records or address settings change. Borgergade remains owned by the delivery sandbox setup (#657).

The actual `www.esmeraldapizza.dk` hero was measured in the browser: `max-width:1540px`, 52px side gutters on desktop (1244px content at1363px viewport/1348px document width). The ordering toolbar, hero and menu now share that outer frame. Tablet gutters are24px and mobile16px. The supplied Otto screenshot informs the fulfillment/time/cart row above a rounded location hero, without introducing an unsupported dine-in mode or language selector.

## Implementation

- `src/styles/commerce-ui.css`: self-hosted Inter variable weight100–900 using private CSS family `Esmeralda Inter` so generic brands which reference `Inter` do not accidentally change fonts. Exact Esmeralda commerce scope includes body-mounted dialog/cart portals. Existing Club-specific typography remains governed by its own stylesheet. Public font and OFL1.1 license are under `public/fonts/inter`; source is `@fontsource-variable/inter@5.3.0`. No remote font request or dependency added.
- `src/lib/brand-subdomain.ts`: exact font-file passthrough only. Other `/fonts/...` paths still receive brand isolation. This is necessary because an unlisted public asset path would be rewritten beneath the merchant slug.
- `MenuHeader`: the refresh applies only to the actual location menu route, not reviews or checkout. Route-owned brand/location remains authoritative. Fulfillment and top-cart slots are filled by React portals from inside the existing `MenuClient` catalog provider. This preserves the original editor, inline offers and cart state. Slot dimensions reserve space before hydration.
- The header measures its sticky height with ResizeObserver into the existing brand frame; cleanup removes the variable. On screens below640px, the toolbar scrolls normally and only the categories/search remain sticky. This preserves screen space on small phones. Category anchors include the navigation offset, including offer shortcuts.
- `CategoryNav`: explicit earlier/more buttons, horizontally scrollable categories, correct focus behavior, search/reset and reduced-motion-aware scrolling. Auto-centering changes only the category rail, never document scroll. Category clicks measure actual sticky-header and rail sizes. Product headings useH3 beneath categoryH2.
- Delivery fees/minimum labels appear in the Esmeralda hero only after the active cart matches the route and delivery is selected. Managed pricing continues to show a pending quote, never the stale configured price. Pickup and server-first uninitialized state do not advertise a delivery fee.

## Verification

Release follow-up: the first live deployment returned404 for Inter because the standalone package traced only the existing Orderfly TTF files. `next.config.js` now explicitly includes `public/fonts/inter/*` (font and license). Verify a clean production build contains the font in `.next/standalone/public/fonts/inter/`, then serve that output and compare the HTTP font body with the source **without manually copying public assets**. Repeat the HTTP/hash check against the deployed merchant hostname before acceptance. Manual public copying in a local harness is insufficient evidence for App Hosting packaging. Rollback contingency PR is tracked in #756.

Run internally from repository root:

```
npm run typecheck
npm run build
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/menu-refresh-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/location-header-browser.cjs tests/unit/tilvalg-storefront-browser.cjs
node --test tests/unit/brand-subdomains-12.cjs
```

The new suite runs real menu/cart/header/category/editor components and a real browser against loopback catalog fixtures. It checks320/390/768/1280/1600px, actual loaded font, equal hero/menu widths, no document overflow, top-cart quantity and editing, category destination visibility, empty search/reset, delivery minimum rejection, pickup/time selection and checkout navigation. It also checks pickup-only and other-brand boundaries. Existing tests retain SSR/hydration route identity and modifier selection/rejection coverage. Fixture images are deliberately synthetic; screenshots are layout evidence, not live production acceptance.

An independent Codex review must approve the final commit, then the coordinator checks current main, native PR gates/holds and own tests before serial merge/deploy under AGENTS.md and the user's standing agreement. Do not dispatch new Actions or claim absent checks are green. Verify `/api/health` release and read-only real menu/font/toolbar/hero behavior after rollout before closing #756. There are no schema changes; rollback is a revert of this PR.

## Follow-up outside this menu slice

Full checkout rearrangement, bag fee presentation, explicit quantity/stykpris in checkout, Club signup presentation and full paid-order confirmation QA remain separate work. No purchase or live data mutation is authorized by this visual regression suite. A menu release is not acceptance of those remaining checkout changes.
