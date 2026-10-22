# Native claim reservation (#460)

This server-only internal slice reserves a durable job-bound identity. It does
not authorize dispatch, mark a delivery, expose an HTTP endpoint, remove a queued
job, update queue metadata, or materialize last-confirmed-print. #456 and its
integration #461 remain open. Existing production flags remain unchanged.

Create one opaque `createNativePrintClaimAttempt` handle before entering the
caller's native Firestore transaction; reuse that exact handle on SDK retries.
The handle contains no enumerable values and is accepted only by the module's
private WeakMap. It holds the supplied device credential and two independent
server-generated 256-bit random tokens in server memory. Tokens are not exposed
by this slice, persisted, logged or returned in a public DTO. There is no token
recovery, arbitrary supplied token or renewal of a lost response.

`reserveNativePrintClaim` requires the exact existing configuration-write gate,
fresh native device verification on every attempt, active printer state and a
strict canonical queued original job at its exact native location. All reads
precede writes. Claim path is `locations/{location}/printers/{printer}/claims/{job}`.
Only a strict versioned `reserved` record is created: original immutable job
snapshot, current configuration/credential revisions, fixed first attempt,
server reservation and exclusive 60-second lease expiry, and two scoped token
digests. No caller timestamp or authorization boolean is accepted.

The digest domain agrees with #456 without importing its unreleased module:
SHA256 of JSON `["orderfly-delivery-v1", kind, brandId, locationId, printerId,
jobId, token]`. `kind` distinguishes `claim` and `delivery` tokens. Only fixed
64-character digests are persisted. Retrying the same opaque attempt matches
both digests and native job exactly, preserving the original lease without a
second write. A different attempt, expired lease, changed job/scope/revision or
credential fails closed. No repeated attempt counter or blind retry is added.

The result explicitly says `dispatchAuthorized:false`; it is neither proof of
transaction commit nor a capability. No native dispatch-capability/output policy
exists in current source. Identity verification and configuration-write gating
cannot be used as that authority. Future #461 integration must independently
establish native capability/output policy, actual immutable content provenance,
durable terminal identity used by outbox replay protection, queue/ledger transfer
and conservative unknown-use state BEFORE any possible physical dispatch. It
must not treat this reservation as delivered or printed. #456's delivered
envelope is a later separate contract, not a synonym for this record.

The caller owns transaction commit/rollback; this module stages exactly one
create and never commits, changes queue state or touches activity itself. There
is no production callsite. Physical verification and actual native emulator QA
remain separate from software tests. Run `node --test
tests/unit/printing-native-claim.cjs` and typecheck. Tests execute the actual
native verifier, crypto, canonical job ID and service with database I/O isolated;
they cover scoped success, replay/expiry, fresh retry revocation, rollback,
strict input and absence of queue/activity mutations.
