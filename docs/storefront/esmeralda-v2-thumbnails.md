# Esmeralda V2: 192px menu thumbnails (performance task 1)

The approved 960px transparent WebP cutouts remain untouched and authoritative for the product-dialog hero. Small menu cards, option/selection previews, cart rows, checkout summaries and compact promotion/upsell visuals instead request 192x192 WebP siblings (filename suffix `-192.webp`). Other tenants and replaced catalog images keep their existing image URLs.

## Source safety and routing

`src/lib/esmeralda-menu-images.ts` still requires the exact product ID, brand ID, category ID and original photo object path for every pizza/catalog substitution. Only an already approved asset path can be converted to a thumbnail. Combo preview URLs are mapped only if they are already on the approved static-image allowlist. The original and 192px variant paths are both permitted through brand subdomain middleware. The existing `next.config.js` `./public/images/esmeralda-v2/menu/*.webp` trace pattern matches both sizes and requires no change.

## Generation and deployment

Run `node scripts/esmeralda-menu-thumbnails.cjs` after `npm ci`, or simply use `npm ci` / `npm run dev` / `npm run build` (automatic generation). The idempotent Sharp script scans all source .webp files, excludes existing 192px variants, preserves alpha and complete edges, and regenerates changed sources. It writes files atomically, leaving the 960px originals unchanged.

**Binary artifacts committed:** All 56 generated `*-192.webp` thumbnails are part of this PR alongside their 960px originals. The exact GitHub Actions generator output totalled 408,946 bytes (399 KiB); the largest thumbnail was 13,086 bytes, below the 20 KiB image-size target. The images were generated with the project’s pinned Sharp dependency and copied byte-for-byte into Git. Idempotent regeneration is still available for future approved image additions. No production data or deployed settings were modified.

**Verification boundary:** The preceding numbers measure generated static assets, not actual first-load bytes or Lighthouse. Full CI, responsive browser checks and post-deployment mobile Lighthouse remain separate release checks. The thumbnails are public imagery; no proprietary or sensitive data is embedded in the images.

## Verification

- `node --test tests/unit/esmeralda-menu-thumbnails.cjs tests/unit/esmeralda-menu-images.cjs tests/unit/brand-subdomains-12.cjs`
- `npm run typecheck`
- `CART_CHROMIUM_PATH=/usr/bin/chromium node --test tests/unit/menu-refresh-browser.cjs tests/unit/tilvalg-storefront-browser.cjs tests/unit/combo-modifiers-browser.cjs tests/unit/checkout-browser.cjs`
- Confirm menu card and cart/checkout image paths end in `-192.webp`; product-dialog hero still requests the full `.webp`. Check 320, 390, 768 and 1280px.
- Repeat mobile Lighthouse three times and use medians. Baseline 4.7MB images at first view, target ~600KB, no material new image-sizing warnings. Results are not claimed until a deployed build is measured.

No changes to prices, checkout/payment, Firestore, secrets, `apphosting.yaml`, or other performance tasks.
