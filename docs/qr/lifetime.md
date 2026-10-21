# QR lifetime count primitives (#437, coordinator #389)

Implementation candidate. The helper preserves aggregate per-code counts independently of 90-day raw-event retention. It performs no I/O and activates no runtime path. Coordinator-owned transaction, store, scope and UI integration are separate acceptance work.

## API and invariants

`src/lib/qr/lifetime.ts` exports:

- `QrLifetime`: `{openings, probableScans, excludedOpenings, firstOpenedAt, lastOpenedAt}`.
- `emptyQrLifetime()`: fresh zero counts with null timestamps. Use this for new/duplicated codes.
- `readQrLifetime(previous: unknown)`: validates and projects exactly those five fields. Null or undefined initializes zero for a missing legacy field; any present malformed value throws `QrLifetimeError('invalid_lifetime')` rather than silently discarding historical counts. Extra fields are not returned.
- `incrementQrLifetime(previous, classification, at)`: validates the prior state, classification and supplied server epoch milliseconds, and returns a new projection. It never mutates inputs.
- `QrLifetimeError` codes: `invalid_lifetime`, `invalid_classification`, `invalid_time`, `counter_overflow`. Errors contain no request/customer details.

Counts must be safe nonnegative integers with `openings === probableScans + excludedOpenings`. Zero openings require null first/last times. Nonzero openings require valid, nonnegative safe-integer epoch times with first no later than last. Incrementing beyond the safe integer range fails closed.

Only a classified GET opening increments `openings`. A probable scan increments `probableScans`; known bot/prefetch/unknown-agent GETs increment `excludedOpenings`. The classification's exclusion and boolean flags must agree. HEAD and unsupported methods leave all counts/timestamps unchanged, while still validating supplied input.

For counted GETs, first/last times are min/max of existing timestamps and the supplied time. Requests can be recorded or retried in transactions out of timestamp order; an older valid request must not be dropped merely because a newer request committed first. Timestamps never move first forward or last backward.

No visitor key, raw IP, user agent, customer/contact identity, cookie, geography or individual unique count is stored or returned. These counters retain the measurement caveat: openings and probable scans are not proof of camera scans or identified people.

## Required integration contract

The coordinator must invoke the helper with freshly read counters **inside the same Firestore transaction** that records the GET event and limiter state. A rejected, rate-limited, rolled-back or otherwise unsuccessful transaction must not increment lifetime counts. The helper itself does not provide atomicity, duplicate-request detection or authorization.

Store lifetime counters on the code, without incrementing its business/configuration revision for a scan. Configuration edits must preserve current counts from the transaction, never replace them with a stale browser snapshot. Duplication must reset to `emptyQrLifetime()` instead of copying source scan history. Raw-event expiry must not delete lifetime aggregates.

Expose cross-location lifetime totals only to currently authorized brand-wide viewers. Location-scoped grants must not read a code's counters accumulated at other locations after reassignment. Detailed date-range analytics remain limited to the explicit raw-event horizon and completeness state. These lifetime primitives do not authorize a query and do not fabricate historical per-day/device statistics.

Initializing a missing field is not a backfill. If a code had openings before counters were introduced, those historical totals cannot be claimed as recovered. The new QR module can measure from activation; any legacy migration must state its own measurement start/provenance rather than present zeros as known full history.

## Verification

- `node --test tests/unit/qr-lifetime.cjs`: 10/10 pass using the actual classification helper.
- Full integration-based worktree `npm run typecheck`: passes.
- Coverage: missing defaults; first/subsequent human GETs; excluded GET families; HEAD/non-opening immutability; malformed counts/invariants/timestamps; exact identity-free projection; out-of-order timestamps; invalid clock/classification; safe-integer overflow.
- These pure tests do not prove actual transaction rollback/concurrency, configuration-edit preservation, duplicate reset, scope projection, browser presentation or production persistence. Those are mandatory coordinator integration tests before #437 can close. No production writes, migration, merge or deployment ran here.

## Store/redirect integration candidate

`QrRecord.lifetime?: QrLifetime | null` now stores the aggregate. New individual, bulk-created and duplicated codes receive `emptyQrLifetime()`. A legacy missing/null aggregate remains unknown on later GETs; no historical backfill or invented total is performed.

The internal `store.recordLifetimeInTransaction(tx, brandId, codeId, classification, at)` re-reads the complete validated code after the limiter read and before any writes. For a code with existing counters it sets the fresh full record with only `lifetime` changed. The HTTP GET transaction then records limiter and event writes. All three writes commit or roll back together. The extra read avoids changing the public/internal resolved-target projection, and unrelated business fields, `revision` and `updatedAt` remain unchanged by a scan. HEAD never calls the writer. Quota rejection and corrupt state produce no partial counter writes.

Configuration/status changes derive the next full record from their transactional read, preserving current counters. Receipt replay refreshes only lifetime from the already-authorized current record through `qrReceiptWithCurrentLifetime`; frozen business results stay idempotent without returning an obsolete scan total. Bulk replay does the same for each already-revalidated record. Receipt data is not rewritten on replay.

For #439, new create/update/status/duplicate and bulk-create audit entries carry immutable `before`/`after` business snapshots from `qrAuditSnapshot`. The whitelist includes code/brand/location IDs, slug, name, destination, campaign, tags, expiry, status, revision, creation/update times and explicit design fields. It excludes lifetime, unknown fields and arbitrary nested design properties. New-code operations, including duplication, have `before:null`. Legacy audit entries are not backfilled. Scoped history presentation and native authorization remain separate #439 integration work.

Additional actual-handler tests run store, bulk writer and HTTP redirect against an atomic read-before-write fixture. They verify event-write rollback, transaction retry exactly once, simultaneous GET/config updates without count loss or scan revision conflicts, HEAD, bot/prefetch counts, unknown legacy, quota/corrupt-state rejection, duplicate reset, receipt counter freshness and immutable audit snapshots. The combined lifetime/store/redirect/bulk suites pass **51/51**, and full worktree typecheck passes. This remains an isolated transaction fixture, not a Firestore emulator or production test. Brand-wide versus location-scoped lifetime projection and browser presentation are still coordinator-owned acceptance.
