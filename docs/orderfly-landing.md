# Orderfly marketing landing (#814)

`orderfly.dk/` (and `www.orderfly.dk/`) presents Orderfly as an All-in-One platform for restaurants and take away. Design approved by the owner 2026-10-31 with the requirement **mobile first**.

Esmeralda's ordering landing that used to render on `/` is unchanged and still served on `/m3pizza` (middleware rewrite to `/brand-site/m3pizza`). `/m3pizza/order` and the brand subdomains (`{slug}.orderfly.dk/`, which rewrite to the brand's own pages) are not affected.

## Files

- `src/app/page.tsx` – route, metadata and fonts (Bricolage Grotesque for headings, Inter for text via `next/font/google`, self-hosted at build time, so the browser never calls Google).
- `src/components/orderfly-landing/orderfly-landing.tsx` – the page. Server component, no client JavaScript, no forms, no tracking scripts.
- `src/components/orderfly-landing/content.ts` – all copy: features, steps, packages, FAQ, contact address and links.
- `src/components/orderfly-landing/orderfly-landing.css` – styles scoped under `.ofl`.

## Content rules

- `orderfly.dk/` is only a landing page (owner decision 2026-10-31). It never links to ordering pages: no webshop, menu, checkout or brand-subdomain links. Links are limited to in-page anchors, the demo `mailto:` and merchant login (`/admin-login`); a test enforces this.
- Only features that exist in the codebase are listed. Wolt Drive is marked "Kommer snart" until it is released (#672).
- No invented prices, figures or testimonials. Packages describe content only; the price is "Få et tilbud".
- "Book en demo" is a `mailto:` link to `ORDERFLY_CONTACT_EMAIL`. There is no contact form: the old one was removed in #223 because it showed success without sending anything.
- Customer references (currently Esmeralda Pizza) need the owner's consent.

## Mobile first

Base CSS targets 320 px. Wider layouts are added only with `min-width` queries:

| Width | Layout |
|---|---|
| < 600 px | One column, full-width buttons, hamburger menu, phone illustration only |
| ≥ 600 px | Two-column grids, buttons side by side |
| ≥ 900 px | Desktop navigation, hero and loyalty side by side, order terminal illustration, three columns |
| ≥ 1100 px | Four feature columns |

The mobile menu and FAQ use `<details>/<summary>`, so they work with keyboard and without JavaScript. Touch targets are at least 44 px; text contrast is at least 4.5:1.

## Tests

`tests/unit/orderfly-landing-browser.cjs` renders the real component and stylesheet in Chromium at 320/390/820/1440 px: no horizontal scroll, no element outside the viewport, contrast ≥ 4.5:1 for all visible text, touch targets ≥ 44 px, the right navigation per width, keyboard-operated mobile menu and FAQ, and no third-party requests. `tests/unit/root-order-entry.cjs` checks that `/` renders the landing and that `/m3pizza` still serves Esmeralda's landing. Locally: `CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/orderfly-landing-browser.cjs`.

These are isolated browser tests, not production live QA.

## Release

Normal PR gates (CI, independent review). After deployment: check that `/api/health` reports the release, then read-only on mobile and desktop: `orderfly.dk/` shows the landing, the menu opens, no link on the page leads to a webshop, and `orderfly.dk/m3pizza` still serves Esmeralda's landing for existing links. No orders or payments.

Note: `StorefrontVitals` classifies `/` as a storefront landing (it is also the root of every brand subdomain). On `orderfly.dk/` web vitals are only sent for visitors who already have an Orderfly session cookie.
