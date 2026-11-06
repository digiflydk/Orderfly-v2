# Esmeralda performance task 4: local logo and first-render consent

## Behavior

Esmeralda's existing negative logo is copied byte-for-byte from its configured public URL into `public/images/esmeralda-v2/logo.png` (425 × 92 pixels, 10,793 bytes). `StorefrontBrandLogo` selects this file only for the exact `esmeralda` slug. Other brands continue to use their configured URL. The header reserves the existing space and supplies explicit dimensions and priority. The cart uses the same local asset. Middleware exempts only the exact logo path, not adjacent files or routes.

The Esmeralda brand layout reads the existing scoped public cookie texts and the request's consent cookie. It passes the current text/version and initial visibility into the client layout. The compact fixed banner therefore exists in the first HTML for visitors without current consent. It uses at most 30dvh, preserves all three choices and does not shift the page. The detailed settings component is loaded only when requested. Other brands retain their existing banner presentation.

The public cookie-text API and server layout share the existing reader, including its brand scope, language fallback, consent version and 60-second cache policy. No cache configuration was changed. A cold text read can still contribute to server response time. Browser hydration still respects the existing localStorage-first, cookie-fallback behavior. A visitor whose choice survives only in localStorage may briefly see the server banner; the server cannot read that storage.

Saving, rejected categories, consent versions, anonymous identity, expiry, retry queue, consent events and tracking permissions are unchanged. No preference is inferred from closing a dialog. There are no production-data writes in this change.

## Validation, 6 November 2026

- `npm run typecheck`: passed.
- `npm run build`: passed, including all 68 static pages.
- `storefront-consent-browser.cjs`, `brand-tracking-browser.cjs`, `menu-refresh-browser.cjs`: 31 passed.
- Existing system-cleanup, tracking-consent and consent-delivery tests: 33 passed.
- Focused brand-subdomain and server-layout tests: 3 passed, including exact asset routing and server cookie-version decisions.
- Real SSR + hydration browser fixture at 390 × 844: banner visible with JavaScript disabled; all three buttons fit within 30% height; hydration CLS 0; no settings chunk before interaction.
- Reject, accept, customize, reload, footer reopening, stale/malformed consent and blocked localStorage all passed against loopback fixtures. No real consent records, orders or payments were created.

Screenshots from the fixture are test evidence, not production screenshots. Full production Lighthouse measurements and the final live commit must be recorded after an authorized rollout. This document does not claim the LCP/TBT goals are already met.

## Release

PM explicitly accepted merge and deployment on 6 November 2026. PRs #858, #862 and #861 were merged, preserving task 1 and the concurrent feedback PR #860. Firebase App Hosting starts its rollout after merge. Feature and merge commits and PR titles carry `[skip ci]`, using the repository's existing internal-test path; GitHub records skipped checks without running Actions jobs. Independent review, local build/typecheck and live verification remain required.

The first live check of merge `88dc9ad` found that the local logo returned HTTP 404. The file existed in source but was absent from the standalone runtime, whose public directory already contained traced menu images. The exact logo path is now included in `outputFileTracingIncludes`, ensuring it is packaged independently of adapter public-folder copying. This does not change the logo, middleware allowlist, consent behavior or hosting settings. After a production build, `node --test tests/unit/storefront-static-assets.cjs` starts the actual standalone server on loopback and verifies HTTP 200, PNG content type and byte-for-byte original logo content through the Esmeralda host route. The test fails against the preceding build with the observed 404.

Task 2, `apphosting.yaml`, secrets, Firestore rules, payment logic and production data are unchanged.

## Hydration follow-up

The corrected local logo and first-HTML banner remain unchanged. The subsequent initial-render follow-up removes the menu's insertion of portal children into an unhydrated header, rather than hiding React #418. Its SSR regression exercises a delayed header at all four target widths. Consent persistence, categories, versioning and tracking permissions are unchanged. The previous production observation is only considered closed after live checks of the corrected release, including early interaction and slow loading.
