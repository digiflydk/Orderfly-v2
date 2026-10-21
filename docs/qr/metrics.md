# QR measurement primitives (#392, coordinator #389)

Implementation candidate only. No route, database collection, permission, event writer or dashboard is activated by this change. The runtime integration and its release gates are separate work.

## API

`src/lib/qr/metrics.ts` has no imports, network, storage, cookies, fingerprinting or IP processing.

- `classifyQrRequest({method, userAgent?, purpose?, secPurpose?, referrer?})` returns `opening`, `probableScan`, an exclusion reason, coarse `device`, `os`, `browser`, and `referrerOrigin`.
- `qrReferrerOrigin(value)` returns only a valid HTTP(S) origin, or null. Paths, query strings, fragments, credentials, relative and opaque URLs are not retained.
- `qrLocalBuckets(timestamp)` returns a Danish calendar date and local hour including UTC offset.
- `aggregateQrMetrics(events, {from, to, qrId?})` returns totals, day/hour/QR buckets, and probable-scan counts by device, OS, browser and referring origin. The interval is **from inclusive, to exclusive**, expressed as Unix milliseconds.
- `serializeQrCsv(rows)` emits comma-separated UTF-8 text with quoted cells and CRLF row endings. Quotes and embedded newlines remain inside a cell; formula-leading string cells are prefixed with an apostrophe, including formulas hidden after whitespace/control/invisible characters.

An event is `{timestamp, qrId, classification, visitorKey?}`. A visitor key is an optional bounded opaque identifier supplied under the integration's separately reviewed identity policy. Never pass raw IP addresses, user agents or customer/contact details as visitor keys. This primitive cannot enforce what an opaque caller-provided identifier represents.

## Meaning of the numbers

`totalOpenings` counts GET events, including known bots and prefetchers. HEAD and unsupported HTTP methods do not count. `probableScans` excludes known bots, link previews, prefetch/prerender, and requests without a user agent. Browser/device detection is heuristic and spoofable, and unknown families remain `unknown`. iPad desktop-mode user agents may look like macOS desktops. A human may open a copied QR link without scanning. A scanner may show a preview without opening it. These numbers are not proof of individual people or camera use.

`excludedOpenings = totalOpenings - probableScans`. Breakdowns by device/OS/browser/referrer count only probable scans. Missing referrers are `unknown`, never a guessed source.

`knownUnique` is the size of the union of supplied nonempty visitor identifiers across the selected interval and QR scope. `unidentifiedScans` counts probable scans with no identifier. `estimatedUnique` is null when any probable scan is unidentified; otherwise it is the union size. Empty data returns zero. The value is still an estimate of identifiers, not people. The caller must document the key's scope, rotation and identity horizon. For example, daily rotated keys cannot identify the same visitor across days and must not be presented as month-wide unique people.

Day bucket uniqueness must never be added to calculate interval uniqueness: one visitor appearing on two days appears once in the whole-window union. Danish day boundaries use `Europe/Copenhagen`; the two autumn 02:00 hours have separate offset-bearing keys and remain chronologically ordered.

The aggregate consumes one event per recording. It does not guess duplicate transport retries or validate completeness of a paginated DB result. The event writer owns idempotency, trusted timestamp, event integrity and consent/retention policy. The dashboard must disclose incomplete results rather than treating a bounded page as a lifetime total. Actual location/country data requires a trusted separate source; this module does not infer geography, GPS or customer identity.

## Verification

- `node --test tests/unit/qr-metrics.cjs`: 11 tests pass in the isolated workspace with the unchanged canonical `tests/helpers/load-ts.cjs` and TypeScript 5.5.4.
- `npx tsc --noEmit --strict --target ES2022 --lib ES2022,DOM src/lib/qr/metrics.ts`: passes.
- Tests exercise real UA families, exclusions, safe referrers, Danish month boundaries, spring and autumn DST, identifier union/missing identifiers, exact interval/QR filtering, shuffled fallback-hour ordering, invalid input, CSV quoting and formula injection.
- Full repository `npm run typecheck`, CI integration/discovery, independent exact-head review, deployment and live/browser QA have not run here. No UI or route is changed by this primitive-only PR; no production scan has been recorded. Physical phone scanning is not covered by these unit tests.

Release sequence: implementation -> repository typecheck/CI and independent code review on the actual head -> serial coordinator merge -> runtime integration/deployment -> live verification -> Done. This primitive's passing unit tests do not approve the integrated QR product.
