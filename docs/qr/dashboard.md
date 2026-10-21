# QR statistics client (#397, coordinator #389)

Implementation candidate, stacked on the measurement primitives in #405. This change does not activate a page, server route, database collection or permission. The coordinator integrates the component into the authenticated QR module and owns release.

## Component contract

`src/app/superadmin/qr-codes/qr-analytics.tsx` exports `QrAnalytics`, `QrAnalyticsProps`, `QrAnalyticsFilter`, and `QrAnalyticsCode`.

Required props:

- `metrics: QrMetrics | null`, from `src/lib/qr/metrics.ts`.
- `period: {dateFrom, dateTo}`: the requested calendar dates as `YYYY-MM-DD`; the end date is inclusive in the filter UI.
- `complete: boolean`: explicit query-completeness evidence from the server. The runtime fallback is false. A bounded DB page must not be called complete merely because it contains some events.
- `canExport: boolean`: permission projection from the server. Hiding the button is display policy; the export API must separately authorize every request and brand scope.

Optional props:

- `codes: {id, name, campaign?, placement?}[]` is the authorized selector catalogue and current QR metadata. Campaign/placement labels are current catalogue values, not immutable historical event attribution.
- `selection: {qrId?, campaign?, placement?}` controls the applied selection.
- `onFilterChange({dateFrom, dateTo, qrId, campaign, placement})` receives submitted filters. The parent validates/sanitizes them, converts Danish inclusive calendar dates to a server `[from,to)` interval, applies brand and permission scope, and avoids stale-response races. The component rejects empty/inverted date inputs but is not a security boundary.
- `loading`, `error`, `onRetry`: explicit loading/failure transport state. Error details are never rendered. Previously loaded results remain labelled as previous results while a request is pending or failed.
- `onExport(): void | Promise<void>` owns authorized CSV transport/download. The button is unavailable without permission/callback/data and while loading, failing, incomplete or already exporting. Callback failure produces a retryable sanitized error. CSV generation must use `serializeQrCsv` or equivalent protection server-side; this presentation component does not fetch or serialize private records itself.

The actual loaded interval is displayed separately from the requested form dates using the aggregate's `from/to`, Danish timezone and exclusive endpoint. Editing a filter does not silently relabel previously loaded results.

## Behavior and measurement limits

The client shows total GET openings, probable scans, estimated unique identifiers and excluded openings. It explains that scan estimates are not proof of camera use or identified people. Unknown identifiers remain `Ukendt`, with known-key/missing-key counts separately explained. Incomplete results display a prominent partial-data warning, hide interval/bucket unique estimates, and cannot be exported as a full period.

Daily/hourly bars have accessible image labels and equivalent detailed tables. The autumn fallback hour retains its UTC offset. Graphs show at most the most recent 60 intervals with an explicit notice; the table retains all loaded intervals. Day/hour uniqueness must not be added to calculate period uniqueness.

Device/OS/browser/referring-origin tables and QR/campaign/placement rows show available counts. No geography, GPS, revenue or conversions are fabricated. The aggregate currently supplies a combined excluded-opening count, not separate bot/prefetch totals; the UI does not invent a breakdown. Actual trusted geographic fields or per-reason counts require a separate aggregate contract extension. Counts tables use semantic column/row headers inside horizontal overflow containers.

## Verification

- Full worktree `npm run typecheck`: passed with this client and the underlying #405 primitives.
- `CART_CHROMIUM_PATH=/tmp/qr-chromium-153 node --test tests/unit/qr-analytics-browser.cjs`: 10/10 passed in real headless Chromium 153.0.8010.0. The browser was installed as a local-only test tool; package manifests/locks were not changed.
- The tests bundle the actual component and metric functions. Only the outer transport/authorization fixture is synthetic. Coverage: totals, safe referrer origins, current campaign/placement labels, DST-hour switching, exact filters and invalid intervals, unknown identity, truncation/export prevention, loading, sanitized errors/retry, export visibility/busy/failure, empty vs unloaded data, and 390px viewport overflow.
- No CI discovery wiring is changed here; the coordinator must register this suite in the integrated candidate. No production browser/login, backend authorization, live scan, physical phone or print acceptance is claimed by these isolated browser tests.

Release requires integration, relevant exact-head CI and independent review, coordinator serial merge/deploy, matching deployed commit and live verification. The issue remains open until its integrated acceptance is documented.
