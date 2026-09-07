# Storefront loading

Baseline production HTML: 5,679,647 bytes; 5,626,154 characters of embedded raster images. Two observations: first byte 15.10–15.23 seconds, total 16.12–16.13 seconds. This is an external measurement, not a database timing trace.

Local compression of the nine distinct images in that saved response: 2,249,782 source bytes to 384,538 WebP bytes (83% reduction). This is a local asset-size result, not a production response-time measurement. Typecheck, production build and all three focused tests passed.

Public rendering replaces embedded raster images with versioned URLs. A read-only image endpoint serves resized WebP (960px, quality 80) with browser/CDN cache headers. Existing Firestore data and admin editing images remain intact; no migration, bucket permissions or production writes are required. Only listed catalog collections and raster content are served, with content-hash validation, inactive-document rejection and an input pixel limit. Existing externally hosted images are unchanged.

Menu, public brand/settings and raw campaign data use the Next data cache (60 seconds) tagged `storefront`. Common product/category/combo/brand/location/standard-discount writes and general settings updates invalidate the tag. External database writes rely on the 60-second fallback. Campaign schedules are evaluated outside the cached raw rows. Checkout still uses its existing uncached authoritative discount validation.

Layout/page brand reads share request memoization; layout settings run in parallel. Initial standard discounts use the URL delivery method and the browser skips the matching first duplicate lookup. Later switches fetch again and ignore obsolete replies. Combo product IDs already in the menu reuse existing data, fetching only missing IDs with brand scope.

Validation: typecheck, targeted Node tests in `tests/unit/storefront-performance.cjs`, and production build. No full Playwright suite. Post-deployment verification must repeat cold/warm HTML and image measurements, check admin-edit invalidation, delivery switching and checkout totals. No production speed claim is made before those measurements.
