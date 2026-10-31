# Brand identity on the mobile home screen

The public storefront inherits its install metadata from the server-resolved brand in `src/app/[brandSlug]/layout.tsx`. Both the restaurant chooser and location/checkout routes use the configured brand name as page title, application name and Apple home-screen title. There is no `ordering page` or Orderfly suffix.

## Install resources

- Manifest: `/api/storefront/brands/{brandSlug}/manifest.webmanifest`.
- PNG icon: `/api/storefront/brands/{brandSlug}/icon/{size}`; only 180, 192 and 512 pixels are supported.
- Apple touch icon uses 180 pixels. The manifest supplies 192/512 pixel icons and a 512 pixel maskable icon.
- On a matching brand subdomain, including the Esmeralda V2 alias, the installed app starts at `/` and has `/` as its scope. On the apex path deployment it starts at `/{brandSlug}` with that path as scope. The app starts at the restaurant chooser so it does not retain an obsolete location, delivery choice or checkout URL.
- The existing root `src/app/icon.png` and platform title remain available to platform/admin pages. Next's metadata resolver prefers the explicit brand icons over that root static icon. Club retains its own child-layout title, manifest and Apple icon.

## Logo and security

The existing brand logo is fitted inside a square using the shared `src/lib/server/home-screen-icon.ts` renderer. A valid configured hexadecimal background colour is used; otherwise the square is white. The logo stays inside the safe area used by maskable icons. No new logo setting or database migration is needed.

External images can only be fetched over HTTPS from the existing allowed image hosts. Credentials, arbitrary hosts and nonstandard ports are rejected, redirects are not followed, and downloads are bounded by a five-second timeout and two megabytes. Rasterization limits input pixels. Inline uploads are decoded from the already resolved brand's own record, with slug/status rechecked; client-supplied document IDs or image URLs are never accepted by these routes. Unknown/suspended brands and cross-brand requests from a different brand subdomain return 404.

If a configured image is unavailable or unreadable, the existing renderer returns the brand background square. The storefront manifest and icon responses are `private, no-store`, so a temporary upstream failure cannot cache that fallback on a CDN or across tenants. This also prevents the host-dependent manifest scope from being reused between subdomain and apex deployments. Club's existing response cache policy is unchanged by the shared renderer extraction.

## Validation and release

- `npm run typecheck`.
- `node --test tests/unit/storefront-home-screen.cjs tests/unit/brand-subdomains-12.cjs`.
- `CART_CHROMIUM_PATH=/tmp/menu-chromium node --test tests/unit/storefront-home-screen-browser.cjs` (or an installed Playwright Chromium).

Tests invoke the real brand layout metadata hook, Next's actual metadata accumulator, real API handlers and image renderer against isolated brand fixtures. They cover platform/Club inheritance, normal/V2/apex paths, title and icon tags in a mobile browser, image decoding/dimensions, tenant rejection, suspension, inline uploads, size limits and external-image restrictions. They do not create orders or change production data.

After release, check the live brand HTML, manifest and the actual PNG content. The browser regression verifies the metadata consumed by installation but cannot perform a physical iOS Home Screen installation. Previously saved iOS shortcuts can retain their old title/icon; remove and add the shortcut again to check the new metadata. Installing on an actual device remains a separate confirmation.
