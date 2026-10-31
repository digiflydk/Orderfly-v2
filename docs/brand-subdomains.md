# Brand subdomains (#12)

Every brand gets a public address under the production domain: `https://{slug}.orderfly.dk`, for example `https://esmeralda.orderfly.dk`.

## How it works

- **One identifier.** The existing, unique brand `slug` is the subdomain label. The same slug already drives `https://orderfly.dk/{slug}`, so both addresses always show the same brand and cannot drift apart.
- **Slug rules** (`src/lib/brand-subdomain.ts`, enforced in the brand form and again on the server):
  - 2–40 characters: `a–z`, `0–9` and hyphen; starts and ends with a letter or digit.
  - Unique across all brands. A taken slug is rejected with free alternatives (`esmeralda-2`, …).
  - Reserved names are rejected: `www`, `api`, `admin`, `app`, `staging`, `mail`, `support`, plus first-level app routes and middleware aliases such as `superadmin`, `merchant`, `feedback`, `games` and `m3pizza`, and `club` (the stamp card portal path).
  - A location cannot use the slug `club`, because `/{brand}/club` is the stamp card portal (`locationSlugError`, enforced in the location form and on the server).
  - New brands get a suggestion from the name. Danish letters are spelled out (`æ`→`ae`, `ø`→`oe`, `å`→`aa`); `Pizza & Pasta` → `pizza-pasta`.
- **Administration.** The brand form shows the resulting public URL. Changing the slug of an existing brand requires an explicit confirmation, because the old subdomain and `/{old-slug}` stop working. The change is written to `auditLogs` with `action: brand_slug_changed`, `brandId`, `oldSlug`, `newSlug`, `actorId` and `createdAt`.
- **Routing** (`src/middleware.ts`):
  - The middleware reads the requested host from `X-Forwarded-Host` (what App Hosting sends), falling back to `Host`.
  - For a single valid label under `orderfly.dk`, the path is rewritten to the brand's routes: `/` → `/{slug}`, and `/{location}` → `/{slug}/{location}`.
  - A path that already starts with `/{slug}` is kept, so existing links work.
  - Any other first segment is scoped under this brand, so one subdomain can never render another brand.
  - App-wide paths (`/_next`, `/api`, `/feedback`, `/games`, `/tracking`, admin areas, `robots.txt` etc.) pass through unchanged.
  - Brand subdomains are HTTPS-only, like the apex.
- **Short storefront addresses (#282).** On a brand subdomain every storefront link and redirect leaves out the brand slug; on `orderfly.dk` they keep `/{slug}/…`:

  | Page | `esmeralda.orderfly.dk` | `orderfly.dk` |
  |---|---|---|
  | Brand (choose a restaurant) | `/` | `/esmeralda` |
  | Menu | `/amager` | `/esmeralda/amager` |
  | Checkout | `/amager/checkout` | `/esmeralda/amager/checkout` |
  | Stripe return (confirmation, cancel) | `/amager/checkout/confirmation?…` | `/esmeralda/amager/checkout/confirmation?…` |
  | Stamp card | `/club` | `/esmeralda/club` |

  - One helper builds them: `storefrontPath(slug, onBrandSubdomain, ...segments)` in `src/lib/brand-subdomain.ts`, following `clubBase`. "On the brand subdomain" means `brandSlugFromHost(host) === slug`, so `www`, reserved names, `localhost` and another brand's subdomain keep the long form. The short form is used only when the middleware rewrites it back to the same page, so a location whose slug equals the brand slug (the subdomain serves `/{slug}` as the brand page) or an app-wide path such as `feedback`, `games` or `api` keeps the long form.
  - Server redirects use `storefrontHref` (`src/lib/server/storefront-path.ts`, request host). Stripe `success_url`/`cancel_url` and the pay-at-pickup confirmation in `src/app/checkout/actions.ts` use the checkout origin's host.
  - Browser code uses `useStorefrontPath` for links and `browserStorefrontPath` for `router.push` (`src/hooks/use-storefront-path.ts`). Links are rendered with `/{slug}/…` on the server, which works on every host, and switch to the short form after hydration. That keeps the storefront pages static, without reading request headers in the brand layout.
  - The storefront layout reads the page from the path after the brand (`storefrontSegments`), so headers and footers are the same on both forms.
  - **Old links keep working and are not redirected.** The middleware still serves `/{slug}/…` on the subdomain unchanged, so bookmarks, mails and Stripe sessions created before #282 (`…/esmeralda/…/checkout/confirmation?order_id=…&session_id=…&receipt_token=…` and `…/checkout/cancel?order_id=…&token=…`) open with all their query parameters. No redirect was added: it would only be cosmetic and could break a form or server action posted from a page opened before the change.
  - No data changes in #282. Afterwards, on 2026-10-20 before launch, the Amager location slug was changed in superadmin from `esmeralda-pizza-amager` to `amager` (PO decision, no customers yet). A location slug is an ordinary field on the location: changing it does not redirect, so links with the old slug return 404. The hard-coded order entry (`M3PIZZA_MENU_PATH` in `src/lib/m3pizza-order-flow.ts`, used by "Bestil her" on `orderfly.dk/m3pizza` and `/m3pizza/order`) must follow the same slug.
  - **"Bestil nu" on orderfly.dk moves to the subdomain.** When a customer on `orderfly.dk` (or `www`) chooses pickup or delivery in the "Bestil nu" sheet, the browser continues on `https://{slug}.orderfly.dk/{location}?deliveryMethod=…` (`orderEntryUrl` in `src/lib/brand-subdomain.ts`, used by `src/components/modals/DeliveryMethodModal.tsx`). Esmeralda's landing on `orderfly.dk/m3pizza` (`src/app/brand-site/m3pizza/landing-client.tsx`; it was served on `orderfly.dk/` until #814) and the `/m3pizza/order` redirect (`getM3PizzaOrderEntryUrl` in `src/lib/m3pizza-order-flow.ts`, used by `src/middleware.ts`) follow the same rule, so every order from `orderfly.dk` continues on `https://esmeralda.orderfly.dk/amager`. It is a full page load, so the address shows the short form from then on. Other hosts (the subdomain itself, `localhost`, previews) keep in-app navigation, and `orderfly.dk/{slug}/…` still serves the storefront for existing links. Cookie choices and the cart are stored per address, so a customer who already chose cookies on `orderfly.dk` is asked again on the subdomain.
- **Unknown, inactive and suspended brands.**
  - An unknown subdomain resolves to `/{unknown}`, which has no brand and returns the neutral 404. There is no fallback brand.
  - A brand with `status: suspended` shows a neutral "Siden er midlertidigt lukket" page on its subdomain and on `/{slug}`, without brand data.
  - Other statuses keep today's behavior.
- **Isolation.** Pages, server actions and APIs keep their existing brand/location scoping. Checkout origin checks and Stripe return URLs use the request host, so checkout works on a subdomain and returns there. The analytics collector (`src/lib/analytics-origin.ts`) accepts `https://{slug}.orderfly.dk` origins with a valid, unreserved label, so storefront events from a subdomain are recorded. Look-alike hosts are still rejected.
- **Unchanged.** `orderfly.dk` and `www.orderfly.dk` (308 to the apex) keep their behavior.

## Production setup (one time)

This is the only manual infrastructure step. New brands then work without per-brand DNS or certificate work.

1. **Firebase console → App Hosting → backend `studio` (project `orderfly-v21-10334086-b3076`) → Settings → Domains → Add custom domain.** Enter `*.orderfly.dk`. App Hosting supports wildcard custom domains for multi-tenant apps.
2. **DNS at the `orderfly.dk` registrar.** Add exactly the records the console shows for the wildcard: the `*` host record(s) and the verification TXT record. Keep the existing apex and `www` records.
3. Wait until the console shows the domain as connected and the certificate as active. App Hosting provisions and renews the wildcard certificate automatically.
4. Verify:
   - `https://esmeralda.orderfly.dk` shows Esmeralda.
   - `https://esmeralda.orderfly.dk/amager` shows the Amager menu.
   - Navigating from `https://esmeralda.orderfly.dk` to the menu and checkout never shows `/esmeralda/` in the address bar (#282).
   - An unknown subdomain returns 404.
   - `https://orderfly.dk` and `https://www.orderfly.dk` behave as before.

## Local and preview testing

Browsers resolve `*.localhost` to the local machine. With `npm run dev`, open `http://esmeralda.localhost:3000` to exercise the same routing. Unit coverage: `node --test tests/unit/brand-subdomains-12.cjs` (routing, `storefrontPath`, old links, and Stripe return addresses on the subdomain and the apex).

## Rollback

Remove the `*.orderfly.dk` custom domain in App Hosting, or its DNS records. Subdomains then stop resolving, while `orderfly.dk/{slug}` keeps working. Reverting the code change alone is safe: without the middleware rewrite, a brand subdomain would show the apex landing page instead of the brand.

## Esmeralda design preview (`web.orderfly.dk`, Website #60)

`web` is reserved infrastructure, not a merchant slug. The existing wildcard
App Hosting domain serves the reviewed Esmeralda v8 public snapshot on this
exact host. No DNS or Firebase data configuration is changed. This is a visual
preview, not acceptance of the migration or a working booking/contact service.

Middleware intercepts **every** preview path (including `/api`, `/_next/image`,
admin and unknown paths) before merchant routing. Only GET/HEAD reach a static
allowlist; all other methods receive 405. Unknown paths receive 404, with no
app/API fallback. The internal route also checks the host and exact allowlist.
The handler selects the original request pathname (Next15 preserves it through rewrites); client query parameters never select a file. Direct access to `/internal-web-preview` is denied on all hosts. Existing
non-preview routing and its prior asset exclusions are retained. HTTPS
redirection remains in place. Host precedence follows existing App Hosting
routing: `x-forwarded-host`, otherwise `host`; preview host comparison rejects
comma lists, lookalikes and alternate ports.

The immutable gzip JSON payload is **outside `public`**, at
`preview/esmeralda/payload.json.gz.part-*` (three transport parts). `outputFileTracingIncludes` retains it in
the standalone App Hosting deployment. Its pinned SHA256 is verified before
bounded decompression (100 MiB maximum), and each requested entry is checked
against its byte size/SHA256. It is cached only when this host is used. There
are 104 HTML pages, 269 assets and robots.txt. Source bytes, design and production
canonical URLs are unchanged. No private/admin pages or source manifests are
served. A failed integrity/read check returns 503, never app content.

The preview has one explicit legacy-route exception: `GET`/`HEAD /book-bord`
returns a temporary 307 to `/bordbooking` on the same host. The old captured
page contains an inert booking mount and lacks its source-owned handoff. This
restores the existing canonical booking contract documented in Ops
`webflow/book-bord-legacy-redirect-head.html` (blob
`954e6fedebd07b01c05e8228c8ef27672c6baf74`), rather than introducing a second
booking flow. Encoded query bytes are preserved; the relative Location contains
no fragment, so a browser retains the original fragment. This is preview-host
only, does not relax CSP, does not activate booking submissions, and leaves the
immutable source payload unchanged. Unsafe methods remain 405 before the
handoff. Real Next HTTP regression covers the redirect, encoded query and
tampering cases as well as the 373 remaining exact-byte responses. Browser
fragment preservation is a separate live coordinator check.

All preview responses carry noindex/nofollow/noarchive and no-store. CSP permits
only same-origin resources/connections and blocks forms/frames; same-origin APIs
are denied by the static allowlist. Inline scripts/eval remain necessary for the
existing Webflow design. Third-party tracking, booking, contact, newsletter and
external widgets are intentionally unavailable; normal external navigation links
remain links. This public preview is not an authentication boundary.

Reproduce with Website PR59's output and the accepted v8 manifest:

```sh
python scripts/package-web-preview.py /path/to/sites-preview /path/to/asset-manifest.json
node --test tests/unit/web-design-preview.cjs tests/unit/brand-subdomains-12.cjs
npm run typecheck
npm run build
node --test tests/unit/web-design-preview-http.cjs
```

The packager checks the original source-manifest SHA256
`d4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc`,
all page hashes and all asset hashes/sizes, with no network. Original accepted
archive SHA256 is `ce08640b677a4f3a2cc7232068258bfe9323935086e5694e8b6888303edecf0c`.
Browser/live QA is a separate coordinator gate: desktop/mobile design, menu and
dish visibility, local asset loading, no external tracking/form requests, preview
API denial, and unchanged apex/merchant behavior. Release identity is checked
on the apex `/api/health`; the preview host intentionally returns 404 there.
Rollback is reverting this scoped code/payload change, with no DNS/data rollback.
