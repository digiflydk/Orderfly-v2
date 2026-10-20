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
  | Menu | `/esmeralda-pizza-amager` | `/esmeralda/esmeralda-pizza-amager` |
  | Checkout | `/esmeralda-pizza-amager/checkout` | `/esmeralda/esmeralda-pizza-amager/checkout` |
  | Stripe return (confirmation, cancel) | `/esmeralda-pizza-amager/checkout/confirmation?…` | `/esmeralda/esmeralda-pizza-amager/checkout/confirmation?…` |
  | Stamp card | `/club` | `/esmeralda/club` |

  - One helper builds them: `storefrontPath(slug, onBrandSubdomain, ...segments)` in `src/lib/brand-subdomain.ts`, following `clubBase`. "On the brand subdomain" means `brandSlugFromHost(host) === slug`, so `www`, reserved names, `localhost` and another brand's subdomain keep the long form. The short form is used only when the middleware rewrites it back to the same page, so a location whose slug equals the brand slug (the subdomain serves `/{slug}` as the brand page) or an app-wide path such as `feedback`, `games` or `api` keeps the long form.
  - Server redirects use `storefrontHref` (`src/lib/server/storefront-path.ts`, request host). Stripe `success_url`/`cancel_url` and the pay-at-pickup confirmation in `src/app/checkout/actions.ts` use the checkout origin's host.
  - Browser code uses `useStorefrontPath` for links and `browserStorefrontPath` for `router.push` (`src/hooks/use-storefront-path.ts`). Links are rendered with `/{slug}/…` on the server, which works on every host, and switch to the short form after hydration. That keeps the storefront pages static, without reading request headers in the brand layout.
  - The storefront layout reads the page from the path after the brand (`storefrontSegments`), so headers and footers are the same on both forms.
  - **Old links keep working and are not redirected.** The middleware still serves `/{slug}/…` on the subdomain unchanged, so bookmarks, mails and Stripe sessions created before #282 (`…/esmeralda/…/checkout/confirmation?order_id=…&session_id=…&receipt_token=…` and `…/checkout/cancel?order_id=…&token=…`) open with all their query parameters. No redirect was added: it would only be cosmetic and could break a form or server action posted from a page opened before the change.
  - No data changes. Brand and location slugs are unchanged; a shorter location slug (`/amager`) is a separate data decision.
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
   - `https://esmeralda.orderfly.dk/esmeralda-pizza-amager` shows the Amager menu.
   - Navigating from `https://esmeralda.orderfly.dk` to the menu and checkout never shows `/esmeralda/` in the address bar (#282).
   - An unknown subdomain returns 404.
   - `https://orderfly.dk` and `https://www.orderfly.dk` behave as before.

## Local and preview testing

Browsers resolve `*.localhost` to the local machine. With `npm run dev`, open `http://esmeralda.localhost:3000` to exercise the same routing. Unit coverage: `node --test tests/unit/brand-subdomains-12.cjs` (routing, `storefrontPath`, old links, and Stripe return addresses on the subdomain and the apex).

## Rollback

Remove the `*.orderfly.dk` custom domain in App Hosting, or its DNS records. Subdomains then stop resolving, while `orderfly.dk/{slug}` keeps working. Reverting the code change alone is safe: without the middleware rewrite, a brand subdomain would show the apex landing page instead of the brand.
