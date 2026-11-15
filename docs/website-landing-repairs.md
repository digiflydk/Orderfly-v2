# Website landing repairs before the Google Ads launch (2026-11-15)

Google Ads sends paid visitors to www.esmeraldapizza.dk, so four visitor-facing problems from the website review were repaired. The site is developed in this repository; Webflow is no longer used, but the pages are still the pinned payload in `preview/esmeralda/`, so the repairs follow the payload-patch pattern.

## What changed

1. **Contact (`/kontakt`).** The contact form was disabled (no CAPTCHA or mail delivery was ever set up). Visitors saw "Kontaktformularen er ikke tilgængelig", and the send button did nothing. The form is replaced by two direct actions: **Ring 32 50 50 40** (`tel:+4532505040`) and **Skriv til info@esmeraldapizza.dk** (`mailto:`). The section intro now reads "Ring eller skriv til os". The cookie-settings form is unchanged. The contact adapter and its CSP entries remain, but they are inert without a form. If a real form is wanted later, it needs Turnstile and mail delivery first; see `website-contact-payload.md`.
2. **Mobile menu (`/menu`).** The category filter's eleven options sat on one line and widened the page to about 1200 px on a 390 px phone. The filter now scrolls sideways inside the screen. `position: relative` also contains its visually hidden, absolutely positioned radio inputs, which otherwise escape the scroller.
3. **Speed.** Dish and product images were served at up to 1440 px but shown at about 330–490 CSS px (the dish page's main image at up to about 675 px).
   - `scripts/preview-image-variants.cjs` creates 760 px AVIF variants (74 images; 5.5 MB → 1.8 MB). Chromium decodes some AVIF profiles that sharp's libheif cannot, so Chromium decodes and sharp encodes.
   - Variants live in `preview/esmeralda/variants/` with `variants.json` (hash and size per route). They sit beside the payload, so the payload's size budget and 406-route inventory are unchanged.
   - 435 images on 104 pages get `srcset`/`sizes`. The browser picks the variant on phones and normal screens and the original where it is really needed.
   - The unused preconnect to `cdn.prod.website-files.com` is removed from every page.
   - The Webflow JavaScript runtime (jQuery plus about 500 KB of chunks) remains. Removing it belongs to a larger rebuild of the pages.
4. **404 page.** Unknown addresses returned a plain "Not found". They now get a branded, noindex page (`src/lib/website-not-found.ts`: logo, "Siden findes ikke", links to the menu, booking, home and contact, and the phone number), still with status 404 and no scripts.

## How it is built and verified

- `scripts/website-landing-repairs.cjs` holds the exact, reversible changes. `scripts/preview-landing-repairs.cjs` applies them once (`manifest.landing_repairs`) after checking each variant's hash and that every page change reverses exactly.
- `src/lib/web-design-preview-server.ts` serves a variant only by exact route after checking its hash. `next.config.js` traces `preview/esmeralda/variants/*.avif` into the standalone build.
- Older pinned baselines reverse the repairs through `tests/helpers/website-landing-baseline.cjs`. `website-contact-payload.cjs` keeps the original contract on the reversed page and checks the new direct actions.
- Tests:
  - `website-landing-repairs.cjs`: variants, srcset integrity, the server and the 404 page.
  - `website-landing-repairs-browser.cjs`: no horizontal scroll on `/menu` at 320/390 px, phones load the variant and never the source, contact actions, and the 404 page at 390/1280 px.
  - `esmeralda-public-host-http.cjs`: the standalone server serves a variant and the branded 404.

  All run in Orderfly CI.
