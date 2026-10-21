# QR analytics service (#412, #389)

Candidate service; not deployed. `createQrAnalyticsService(db, {getCode, now?}).read(scope, codeId, {from,to})` reads one code's statistics. The mandatory `getCode` callback must use the scoped store's `get` operation. The caller must first obtain a verified current native session and independently authorize `orderfly.qr_codes:analytics`; CSV requires `orderfly.qr_codes:export`. Client filters and navigation are not authorization.

The service validates brand/code/actor keys, the stored code's brand and location, and the requested scope before constructing any events query. It queries only `brands/{brandId}/qrCodes/{codeId}/qrScanEvents` with equality predicates for `brandId`, `qrId` and the code's **current** `locationId`, plus `[from,to)` timestamp bounds. Results sort by timestamp then document ID and request at most 10,001 records. A location-scoped caller cannot request a brand-wide code or a foreign location. No arbitrary collection path is accepted.

`parseQrAnalyticsDates({from,to})` accepts real inclusive `YYYY-MM-DD` dates and converts Danish midnight to a half-open millisecond interval, including 23/25-hour DST days. Date ranges are limited to 366 calendar days. Numeric intervals are bounded to the equivalent maximum plus the DST hour. Invalid and reversed dates fail rather than roll into another month.

The result contains the safe code summary, `metrics`, `complete`, `totalsAreExact`, `truncated`, `retentionLimited`, `futureLimited`, `discardedEvents`, `sampledEvents`, `dataAsOf`, `period`, and `currentLocationOnly:true`. **Counts describe recorded events, not guaranteed camera scans or people.** QR opens that never reached or could not be recorded by the server cannot be reconstructed here. The public recording service owns recording completeness and rate-limit behavior.

- 10,001 matching records make the sample truncated. Only the first 10,000 are aggregated. `complete` and `totalsAreExact` are false; clients must display a partial-data warning rather than exact/lifetime totals.
- Public events expire after 90 days. An interval starting earlier than this retention window is explicitly incomplete, even if no documents remain. Firestore TTL is not assumed to have deleted records immediately.
- A requested end later than `dataAsOf` is incomplete for the full interval. Today-to-midnight queries therefore need a “so far” label or a current-time bound.
- Invalid or inconsistent stored rows are excluded, counted in `discardedEvents`, and make the result incomplete. Database/index failures throw; they are never returned as a successful zero.
- A moved code's statistics include only events at its current assigned location, for every caller. This explicit narrow scope prevents a newly delegated reader seeing historic scans from a former location. It is not an all-location lifetime report. A future history view needs a separately scoped design.
- This release discards any stored `visitorKey` and generates none. Probable scans without identifiers have `estimatedUnique:null`, not a fabricated count. Empty datasets have zero observed events.
- No raw IP, user agent, full referrer path/query, headers or event payloads are returned. Referrer origins are sanitized again. Geo is not inferred.

`exportQrAnalyticsCsv(result)` exports aggregate rows with completeness, interval, timezone and current-location scope on each row. It uses `serializeQrCsv` to quote cells and neutralize spreadsheet formulas. The HTTP adapter, filename, response headers, native authorization, query index registration and safe runtime error messages are coordinator-owned integration in #395/#397.

Index requirement: the `qrScanEvents` query combines `brandId`, `qrId`, `locationId` equality with `timestamp ASC`, then `__name__ ASC`; register the matching Firestore collection index before runtime acceptance. This change does not deploy indexes, TTL settings, Firestore rules or production data.

Verification: `npm run typecheck` and `node --test tests/unit/qr-analytics-service.cjs`. Fixtures execute the actual service with an isolated fake query adapter. They cover scope-before-query, brand/location rejection, dates/DST, timestamp boundaries, truncation, retention/future limits, invalid records, privacy projection, formulas, bots and DB failure. They do not attest a live Firestore index, authenticated browser flow, production metrics or hardware scanning.
