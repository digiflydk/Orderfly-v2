# QR retention heartbeat integration (#421, parent #417/#389)

Implementation candidate. The QR module is **OFF by default**. No scheduler, paid integration, secret, rule, index, environment activation or actual production deletion is created by this change.

## Entry point and gate

The existing `POST /api/internal/feedback/send` remains the only HTTP entrypoint. Its existing bearer-secret verification runs before any worker. The QR worker is added alongside feedback, order-notification, games, marketing and loyalty workers. Its failures are isolated: the other workers can still complete and the response includes a sanitized `qr.state`. Authentication is not broadened, and no public QR maintenance endpoint exists.

`runQrRetentionWorker(getDb, options?)` checks `process.env.QR_MODULE_ENABLED === 'true'` before resolving the database. Missing values, `false` and other spellings leave retention disabled. This is the same rollout flag used by the public redirect candidate. Internal unit tests may inject `enabled`, clock, lease ID and retention function; these are not HTTP parameters.

Disabled returns `{state:'disabled'}` with zero QR database reads/writes. The existing heartbeat's other workers retain their existing behavior; disabling QR does not disable them.

## Internal state and concurrency

The service uses only the dedicated server-owned singleton `qrMaintenance/retention-v1` for its worker checkpoint. The collection must remain denied to all browser/client reads and writes. Verify deployed Firestore policy as a release prerequisite; this PR does not change or deploy rules. The worker is an intentional privileged cross-brand service operation and must never be imported into a user-facing data action.

State schema version 1 contains:

- `revision`: a monotonically increasing lease generation.
- `lease`, `leaseUntil`: random owner token and five-minute expiration.
- `cursor: {events, rateLimits}`: internal collection-group path cursors from the retention service.
- `updatedAt`, `lastFinishedAt`: server-clock milliseconds.
- `lastResult`: aggregate scan/delete/skip/error counters only.
- `lastError`: null, `partial_failure`, or `retention_failed`; never raw exceptions.

A transaction claims an unleased/expired checkpoint and increments the revision. Another invocation with an active lease returns `busy` without running cleanup. The holder calls `runQrRetention` once with `limit:100` and the saved cursor. Completion checkpointing re-reads the singleton and requires both the same revision and lease token. An expired former owner cannot overwrite a newer cursor and returns `superseded`. Deletion itself retains #417's transactional path/scope/expiry revalidation.

A valid partial retention result persists both family cursors and counters with state `partial`. A thrown retention failure preserves the previous cursor and releases only its own lease with state `failed`. If acquiring/saving state fails, the result is `failed`; an acquired lease remains recoverable after expiration. No response claims successful cleanup without successful checkpoint persistence. Invalid existing schema/state fails closed instead of resetting the cursor.

Worker responses contain only state and, for completed/partial runs, aggregate counters. Cursors, lease tokens and raw events are not included in the heartbeat JSON. Internal cursor paths must not be sent to public clients or general logs. Monitor `failed`, `partial`, nonzero errors and overdue `lastFinishedAt`; a running heartbeat alone is not evidence of successful retention. The existing heartbeat schedule/frequency is unchanged and cleanup completion time depends on its successful cadence and traffic.

## Verification

- `node --test tests/unit/qr-worker.cjs tests/unit/qr-retention.cjs tests/unit/loyalty-merchant-routes.cjs`: 24/24 passed (10 worker, 9 retention, 5 unchanged loyalty-route regressions).
- Full integration-based worktree `npm run typecheck`: passed.
- Worker tests exercise default-off/no DB, partial/completed cursor persistence, active lease exclusion, expired lease takeover/stale-owner CAS, retention failure, checkpoint failure/recovery, invalid state/clock, sanitized DB failure, authenticated heartbeat isolation and unauthorized no-work behavior.
- Fixture transactions are serialized for atomicity. These tests do not prove deployed Firestore policy, actual concurrent Firestore retries, runtime activation or production cleanup. No real data was deleted.

Before release: integrate and register the suite in relevant CI; independent exact-head review; verify the internal collection's client-denial policy; run synthetic isolated end-to-end heartbeat/checkpoint/expiry scenarios; coordinator serial merge/deploy; verify deployed commit and default-off behavior. Enable the module only under the agreed runtime activation scope. Live acceptance must separately verify the actual bounded worker, cursor progress and counters rather than merely seeing a successful deployment.
