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
