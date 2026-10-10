# Brand Website: standard takeaway storefront (OF-221)

## Overview

Brand Website means the brand's takeaway ordering website. The existing native menu/cart/checkout flow is the single standard. There is no separate website page builder, website activation flag, template chooser, home editor, menu-layout editor or domain router. The separate **Orderfly Website** marketing CMS is retired in #223; see [marketing cleanup](orderfly-website-cleanup.md).

The root landing and `/m3pizza` compatibility alias keep their existing product/promotion-driven ordering entry. Components now live under `src/components/storefront`. `/{brandSlug}` selects a restaurant; `/{brandSlug}/{locationSlug}` shows the native menu. `/esmeralda` now renders the real brand restaurant selector and retains GamePlacement, instead of a template preview. This route is explicitly dynamic, so builds do not read live restaurant data or freeze its availability. Existing brand appearances and the current commerce CSS remain unchanged in this first consolidation; no new visual theme editor is introduced.

## DB Structure

Native brand and location records, products, categories, toppings, combos and promotion collections remain authoritative. Orders, payment settlement, customer data, reservations, feedback and game/mail outboxes are unchanged.

Historical website/config is retained only as a read-only compatibility source for footer social/legal links. Old CMS data is not deleted or migrated. Config.active never controlled the real ordering flow and is no longer displayed as a webshop activation switch.

## DB Paths

- `brands/{brandId}`: name, slug, logo, appearances, legal URLs and brand status.
- `locations/{locationId}`: brandId, slug, active status and fulfillment settings.
- `products/{productId}`, `categories/{categoryId}`: native brand/location menu.
- `brands/{brandId}/website/config`: only an allowlisted social/legal projection is read by the landing.
- Retained historical data with no builder: `brands/{brandId}/website/home`, `brands/{brandId}/website/menuSettings`, `brands/{brandId}/websitePages/{slug}`.

## Schema → UI Mapping

| Source | Display/use |
| --- | --- |
| brand.name | Brand heading |
| brand.status | Explicitly labelled **brand status**, not invented website activity |
| brand.slug + location.slug | Canonical webshop/menu links |
| location.isActive | Real location status; inactive locations have no admin menu CTA |
| brand.logoUrl / appearances | Existing storefront branding; managed through brand settings |
| legacy config.social / config.legal | Existing landing footer links only |
| website.active / domains / template | Retired builder data; not interpreted as production routing |

The overview uses website-view grants, including native location boundaries. Brand settings CTA additionally requires company-wide catalog-edit permission. A missing or malformed slug produces a visible unavailable-address state. Missing records are omitted; a read error shows retry UI, not an empty or inactive success state. Empty authorized inventory has an explicit empty state.

## Validation

Brand overview authorizes before reads and queries only granted brands/locations. A foreign location is rejected from output even if a stale grant references its ID. Legacy editor bookmarks require a native website-view grant for the requested brand, including location-scoped grants, before redirecting to the overview. Foreign-brand bookmarks remain denied. Existing server-side catalog/checkout validation remains unchanged.

The public footer adapter accepts native document IDs only and returns only known string fields, without private fields, timestamps, tracking or design-system payloads. Footer URL safety checks remain in the rendering layer. No extra public database endpoint is introduced.

## Audit

This is a source-code cleanup, not a production data reset. Builder write actions and their UI are removed. Shared audit records remain untouched. The retired builder-specific API logger is removed only after its last consumer is removed. Normal order, payment, access and other audit behavior is unchanged.

## Data Dump

Authenticated schema/path metadata endpoints remain and describe the standard native paths plus explicitly retained legacy paths. The former un-routed CMS export implementations under src/api and their broken links are removed. No endpoint claims to export current CMS records. A future data purge must first define and export its exact scope.

## Backlog

Deferred: a deliberate unified brand-colour configuration across all storefront surfaces and body-mounted dialogs, unrelated duplicate files, traffic-based CMS data retention review, CI workflow-name repair and the pre-existing order-flow-71 test harness error. Do not delete the `orderfly.website` permission: game administration also relies on it.

## Tests

- TypeScript: `npm run typecheck`.
- Access, public projection and retired routes: `node --test tests/unit/website-access.cjs tests/unit/root-order-entry.cjs tests/unit/settings-access.cjs tests/unit/access-navigation.cjs tests/unit/stripe-lifecycle-189.cjs`.
- Actual desktop/mobile React components with synthetic data: `node --test --test-name-pattern='P2 landing|#221' tests/unit/commerce-p2-browser.cjs`.
- Existing menu/cart/checkout browser regressions and `npm run build` before review.
- Existing smoke suite now checks a retired header endpoint (410), real ordering CTAs and a retired mock confirmation (404), rather than the removed CMS behavior. These are replacement acceptance criteria for deliberately removed features, not skipped assertions.

## Local verification

Verified on 2026-10-09: typecheck and production build passed; 21 targeted access/order/payment unit tests passed; 4 desktop/mobile storefront and admin browser tests passed; 62 existing cart/checkout browser regressions passed with synthetic data. Chromium 141 headless was used via CART_CHROMIUM_PATH after the default Chromium 151 download failed. The admin screenshots were inspected at 390 px and 1280 px. Built-server checks confirmed the retired API returns 410, legacy M3 routes redirect and mock confirmation returns 404.

This is not a full live-data or cross-browser acceptance run. Independent CI, review and PO acceptance remain required.

## Compatibility and release

`/m3` redirects to `/`. `/m3/{brand}/{location}` redirects to the real menu and preserves a valid delivery choice. The old mock confirmation is gone (404), so it cannot pretend an order was paid or received. `/m3pizza` and `/m3pizza/order` retain their existing rewrite/redirect behavior. The preview-only header API returns 410. Old brand CMS subpaths redirect after authorization.

No live order, payment, email or database mutation belongs to this verification. Independent review and PO acceptance precede merge; deployment and live verification remain separate stages under AGENTS.md. Rollback is the source commit; no data migration needs reversal.
