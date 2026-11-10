# Esmeralda performance task 3: initial JavaScript and menu transport

## Findings

The observed production `1255-de0c1abd22c7cccd.js` is 171,371 bytes uncompressed. Static inspection of its Webpack modules identifies React Flight decoding, React, App Router, partial-prerender navigation and server-action reducers. It is framework code, not the Firebase client SDK. Module 99062 (about 22.9 KB) contains Flight decoding; modules 61426, 17297, 87317, 9766 and 62244 contain React/router work. The task-1 third Lighthouse run attributed about 959 ms scripting to this chunk. A local `next build --profile` also completed for investigation; profiling builds are not used as a comparable performance baseline.

The catalog server reader supplied full records to the client page, although ordering components already have a narrower ProductForMenu contract. Repeated option identifiers and identical override values dominate those records. Removing disabled options would change ordering behavior, so the transport now preserves every override and interns repeated identifiers/values instead.

## Change

`createMenuPayload` explicitly projects the existing ProductForMenu fields and category fields. It represents overrides as pairs of indices into menu-scoped dictionaries. `readMenuPayload` restores ProductForMenu before the existing menu/cart components see it. Explicit false, zero prices, default quantities, conditions, tenant/location identifiers and eligibility fields are retained. The combo projection retains the entire typed ComboMenu contract and excludes untyped administrative/import metadata. Server pricing, validation and checkout contracts are unchanged.

On the public catalog captured on 6 November (69 products, 54 distinct option IDs, 3 distinct override values), JSON transport falls from 170,446 to 67,247 bytes (60.5%). All restored fields were compared against all 69 source products. These are JSON transport bytes, not an observed new production HTML size or Lighthouse result.

Delivery-method dialog content and location information are separate chunks loaded on demand. The existing delivery event behavior and disabled-channel checks are retained. Product dialogs and the combo builder remain dynamically loaded. The menu header schedules its Club session request after two animation frames, then bounded idle time; focus refresh and unmount cleanup remain intact. The tracking runtime is imported only for granted purposes. Revocation, brand change and unmount invalidate a pending import before it can mount tracking. Existing event buffering and consent rules remain unchanged.

No content-visibility rule was introduced: category scrolling, sticky navigation and accessibility remain unchanged. Task 4 independently handles cookie settings and the local logo.

## Validation, 6 November 2026

- Typecheck passed.
- Production build passed after clearing a generated `.next/export` directory left by an ENOTEMPTY cleanup failure. No application configuration was changed.
- Requested menu-refresh, commerce-p2, checkout, tilvalg-storefront, combo-modifiers and delivery-method-labels browser suites were exercised. Initial timeout failures were investigated; the three checkout cases and all eight delivery-label cases passed on focused rerun without weaker assertions. The dynamic delivery fixture now serves generated chunks as well as its entry bundle.
- Menu transport, storefront performance, delivery bridge and deferred-work tests cover lossless values, disabled options, price adjustments, scope, revocation during import, and cancelled idle work.
- Focused brand-subdomain/navigation tests: 10 passed.
- A combined regression run with tasks 1 and 4 is required before release. Tests use loopback fixtures, not production mutations.

## Measurement and release

Production baseline after task 1: three identical Lighthouse 12.8.2 mobile runs, median score 74, LCP 3.16 s, Speed Index 25.91 s, TBT 374 ms, CLS 0. The Work HTTPS proxy and server timing affect absolute results; these must not be compared directly with PageSpeed Insights. Targets remain LCP <2.5 s, TBT <300 ms and HTML at least 30% below the original 333 KB. They are not claimed as met before a measured rollout.

Use the same three-run mobile lab procedure after deployment and verify the health release around each run. Preserve task 1 when building the combined release. This PR starts from main and is independently reviewable; do not deploy its standalone branch over unmerged task 1. Manual Firebase App Hosting is the authorized release path. No GitHub Actions, merge or push to main. Feature commits include `[skip ci]`; review and release requirements are still respected.

No `apphosting.yaml`, infrastructure, cache policy, secrets, Firestore rules, payment logic or production-data changes.

## Initial-render follow-up, 6 November 2026

The first integrated live release (`3006c0f`) measured median LCP 2.97 s and TBT 651 ms across three Lighthouse 12.8.2 mobile runs. Its HTML was 32.3% smaller, but the LCP/TBT targets remained open. The current follow-up removes work instead of changing measurement settings or hiding errors:

- V2's method-only menu no longer generates all pickup/delivery time slots. Checkout's actual time selection and the legacy menu keep their existing calculation. A browser probe asserts zero slot calculations on V2, including switching delivery mode, and confirms legacy times remain available.
- Category grouping and ref callbacks remain stable between navigation updates. Memoized category sections and product cards avoid repeated rendering when their inputs have not changed. Cart/analytics context updates still propagate, and price, options and cart logic are unchanged.
- Menu eligibility receives the same server timestamp for SSR and first hydration, then resumes its existing live clock updates.
- Portal targets are published only by their owning header component after hydration, keyed by brand and location. Previously the menu queried arbitrary server-rendered target elements and could insert children before React hydrated their owner. The subscription returns null during SSR/hydration and removes stale targets on unmount or location changes. This addresses a concrete hydration race without suppressing React errors.

The dedicated SSR browser regression deliberately hydrates the menu before its header and checks untouched server markup, working buttons after header hydration, no recoverable errors, route scope and cleanup at 320, 390, 768 and 1280px. Menu regression tests also cover search, category scrolling, fulfillment mode/prices, product options, combinations, cart and image geometry. Final build, review and production metrics are recorded in the release PR; target completion requires the production measurements, not the fixture timing.

The PM has authorized completing, merging and deploying tasks 3/4. Local tests replace Actions under that explicit constraint; commits and PR title retain `[skip ci]` and existing workflow guards are unchanged. No task 2, hosting configuration, cache policy, secrets, payment logic or production data changes.

## Critical-render follow-up

Release 2360940 passed the four-width production ordering and consent checks with no browser errors. Three identical Lighthouse 12.8.2 mobile runs measured score 80/78/32, LCP 2.82/2.96/5.97 seconds and TBT 268/314/5106 ms (median 78, 2.96 seconds, 314 ms). The slow third run is retained; no favorable-run selection is used. LCP and TBT targets remain open.

The next small change preloads the existing Inter font only on the Esmeralda location menu. Its URL, font metrics, display policy and content are unchanged; the browser can start the existing font request before discovering it through CSS. The analytics provider now preserves its context object while its public values remain unchanged, avoiding redundant menu-wide consumer renders during internal consent initialization. Consent events, attribution, scope, event timing and tracking decisions are unchanged. Existing commerce/consent browser coverage and a clean production build/typecheck remain required before review and rollout.

## Route content hydration (2026-11-10)

An intermittent #418 on repeat visits was traced to route content suspending directly under the brand layout's host `Content` element. The vendored React 19.2 canary replays that element without resetting hydration. `BrandLayoutClient` now renders `children` through `RouteContent`. Details and the regression test are in [route-content-hydration-2026-11-10.md](route-content-hydration-2026-11-10.md).
