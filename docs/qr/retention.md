# QR event retention service (#417, coordinator #389)

Implementation candidate only. This change creates no scheduler, TTL policy, Firestore rule/index or production deletion. The coordinator separately connects an approved worker to the existing heartbeat and owns activation/release.

## Contract

`runQrRetention(db, {now?, limit?, cursor?})` in `src/lib/qr/retention.ts` accepts an injected Firebase Admin Firestore database exposing `collectionGroup`, `doc`, and `runTransaction`. The default time is `Date.now()`; `limit` defaults to 100 and must be an integer from 2 to 100. It is the combined maximum number of scanned candidates, and therefore also the maximum number of deletes/transactions, per invocation. Events receive `ceil(limit/2)` slots and rate limiters receive `floor(limit/2)`, so both families always make progress. Unused slots are not reassigned.

The input/output cursor is `{events: path | null, rateLimits: path | null}`. Each family queries its **unique** collection group ordered by `FieldPath.documentId()`, starts after a saved DocumentReference, and reads at most its allocated budget. No expiry compound index is needed: future and malformed rows participate in the path walk. A short page resets that family's cursor to null; an exactly full page returns its last path, and a subsequent empty page resets it. Null begins a new sweep.

The worker must persist `nextCursor` between invocations in internal worker state. Repeatedly starting with no saved cursor can starve records behind malformed or future rows. Do not present an unpersisted standalone call as an operational retention guarantee. Cursor paths are internal metadata and must not be returned to public clients or written into general logs. Log only counters. The worker must handle overlapping heartbeat invocations using its existing lock/checkpoint mechanism; deletion itself is transaction-safe and tolerates repeated sweeps.

Result fields are `scanned`, `deleted`, `skipped`, `errors`, `deletedEvents`, `deletedRateLimits`, and `nextCursor`. No raw event contents or exception details are returned. Query errors retain the failed family's input cursor while the other family may progress. Transaction errors are counted; later candidates still progress, and an errored record remains available for a later sweep. Consumers must surface nonzero errors and delayed cleanup rather than treating invocation as successful retention.

## Deletion boundary

Only these exact six-segment paths are eligible:

- `brands/{brandId}/qrCodes/{qrId}/qrScanEvents/{UUID}`
- `brands/{brandId}/qrCodes/{qrId}/qrRateLimits/{epochMinute}`

Brand/QR IDs must be safe bounded native IDs. Event IDs must be UUIDs; limiter IDs must be bounded decimal epoch-minute strings. The stored row must contain matching `brandId` and `qrId`. `expiresAt` must be an actual finite `Date` or Firebase Admin `Timestamp`, and must be at or before the invocation's fixed time. Numeric/string expiry, duck-typed `toMillis`, wrong scope/collection/path and missing expiry are skipped. The generic collection group `events` is never queried.

Each apparently expired candidate is re-read in its own transaction and its complete path, scope and expiry are checked again before `transaction.delete`. A concurrently refreshed, rescoped or removed document is not deleted. Firestore transaction retries retain these checks. There are no QR-code, audit, public-index, customer or other business-record deletes.

This is intentionally a privileged, cross-brand service-principal sweep. It must be called only by trusted internal worker code, never from an employee, customer or public admin API. Authorization of a cron/heartbeat caller remains the worker's responsibility.

B2's writer contract is 90-day `Date` event expiry, and minute-end plus 24-hour `Date` limiter expiry, with matching brand/QR fields. The service implements stored expiry, not policy selection. The actual deletion time also depends on successful worker frequency, cursor progress, traffic volume and error recovery; no exact deletion deadline is claimed.

## Verification and release

- `node --test tests/unit/qr-retention.cjs`: 9/9 pass with the actual Firestore `Timestamp`/`FieldPath` classes and an injected transactional fixture.
- Full integration-based worktree `npm run typecheck`: passes.
- Tests cover expired/future Date and Timestamp rows, noncanonical paths/IDs/scope/types, concurrent refresh/rescope/removal, cursor advancement past foreign malformed rows, 100-row combined budget, both-family fairness, exact-page follow-up, query/transaction errors and invalid options.
- These are isolated service tests, not a Firestore emulator/production cleanup test. No heartbeat wiring, cursor persistence, scheduler, TTL change or live delete ran here. The coordinator must test the actual worker integration with synthetic isolated records, register this suite in CI, complete independent exact-head review and verify deployed source before activation.

Release remains implementation -> relevant CI/typecheck and independent review -> coordinator serial merge/deploy -> controlled integration verification -> separately authorized runtime activation -> operational counters/checkpoint evidence -> Done.
