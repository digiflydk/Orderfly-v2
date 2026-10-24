# QA3 core resource contract (issue #383)

This is an EXTRA prerequisite for #374, separate from the adopted QA3a/QA3b
execution slices. It is not an executed QA package, browser proof, production
acceptance or physical-print evidence. Only three new files are owned here; the
existing launcher, seed, browser, auth and cleanup implementation remain owned by
the original QA0 worker.

## Current boundary and engine hold

Root held HTTP case-engine implementation while the external HTTP driver's source,
pinned versions and evidence are reconciled. Accordingly this module exports only
`describeQa3CoreProof` and `prepareQa3CoreProof`, plus its fixed contract error.
There is no HTTP case engine, bootstrap, emulator process, server, auth discovery,
module-path loader, SDK patch, seed, native operation or cleanup implementation.
A successful preparation result is **WAITING_ENGINE_HANDOFF** and explicitly
`nativeExecutionVerified:false`, `productionAcceptance:false`,
`physicalPrintVerified:false`. It must never be reported as a successful native
integration run. No external driver was copied or independently reimplemented.

## Authoritative owner handoff

A later separately reviewed hook in the EXISTING guarded QA0 lifecycle must supply
resources. Current main c274's launcher and seed are private IIFEs with no such
hook. This task does not change them or run a parallel environment. The owner
keeps process lifetime, real users/session creation, scope seed and finally
cleanup, including failure paths. No arbitrary caller-provided module path is
accepted here.

The resource object has exactly these own data properties (no accessors):

| Property | Required contract |
| --- | --- |
| projectId | `demo-orderfly-qa0` |
| baseUrl | Exact `http://127.0.0.1:3100`, no suffix/credentials/query |
| sourceCommit | Forty lowercase hex characters; owner independently pins the actual source. Shape alone does not verify Git provenance. |
| db | Actual installed native `@google-cloud/firestore` Firestore instance; same constructor used by Firebase Admin. Fixed project/default database and effective SDK `servicePath=127.0.0.1`, `port=8088`, `ssl=false`. |
| session | Exactly `{cookie}`: the real `__session` cookie from the unchanged actual login/session API, held only in memory. The contract bounds its HTTP-header shape; it does NOT authenticate or cryptographically verify it. |
| scope | Exactly `{brandId,locationId}` from the owner's already created, registered native scope. IDs are strict strings and bounded identifiers. |
| fixtureKey | Bounded identifier, 1–32 characters. Derives distinct `qa3-core-*` and `qa3-rollback-*` native IDs; no arbitrary path accepted. |
| registry | Exactly own functions `{has,register}`, the authoritative owner's in-memory cleanup bookkeeping. `has(path,recursive)` must synchronously return the literal boolean true for owned paths, not a truthy string or Promise. |

The process itself must retain QA0's explicit sanitized demo environment,
loopback-only preload marker and exact endpoints; production credentials,
ADC/provider claims and output/intent/dispatch configuration reject. No real
service-account credentials are inspected. A resource passed from another runtime
is not a portable permission to use production. These checks are a process/test
contract, not an OS sandbox or a substitute for the original reviewed guard.

`describeQa3CoreProof(resources)` verifies scope registration for the exact brand
and location before deriving a deeply frozen registration plan. It never calls
native SDK operations or HTTP. The installed Firestore7.11.6 SDK normalizes its
constructor host into `servicePath` and `port`; this version-specific effective
endpoint check must be re-reviewed with a dependency upgrade, rather than silently
skipped. The checker reads no credential field and starts no SDK connection.

`prepareQa3CoreProof(resources)` asks the owner to register the exact plan and
requires acknowledgements for every document and recursive root. It rechecks
runtime/resources after the asynchronous acknowledgement and rejects changed
scope, session, native handle, registration functions or plan before any future
engine I/O. Registration is bookkeeping only: registered paths do not establish
that data exists or that any service is authorized. A future engine must recheck
resources at each operation boundary and use the actual service/native policy.
The current result supplies no native/authentication/commit/dispatch authority.

## Finite registration plan and cleanup ownership

Before a future engine can perform I/O, the owner registers both derived printer
roots recursively, plus each explicit printer document, `queue/state`, `audit/2`
and the separate `locations/{locationId}/printerCapabilityVerifications/{id}`
document. This is eight explicit documents and two recursive roots. The recursive
roots cover unpredictable server-generated hash-addressed `queueReviews` and
immutable `queueReviewAudit` records, as well as nested audit/history. This avoids
pretending a random server receipt hash can be registered before issuance.

**Named integration hold: reservation versus creation ownership.** Registering a
candidate document or recursive root is only reservation/bookkeeping. It gives NO
authority to delete a preexisting record, child or unknown history, including if
prepare or seed later fails. The future authoritative owner must distinguish
reserved candidates from namespaces it actually CREATED successfully, reject any
collision without overwriting it, and clean only proven created resources. A
failed preparation must preserve all prior/unknown data. This ownership contract
must be resolved and reviewed before any hook/engine integration; no speculative
cleanup implementation is supplied here.

The owner must reject a collision/previously owned namespace rather than overwrite
it. Later engine integration must verify native absence before creating any
fixture, retain history through all assertions and return to the owner's finally
cleanup. This module never deletes paths, wipes projects, removes production
history or owns cleanup. Registration failure leaves owner bookkeeping in place
so authoritative finally cleanup still knows the attempted namespace.

## Deferred case-engine contract

The held engine is LIMITED to a fresh disabled/empty-ledger core variant and a
separate real audit-create-collision rollback variant. Reuse existing production
schemas and the actual queue GET/review POST/lifecycle POST, actual native
revision/receipt/audit assertions and memory-only receipt handling. Reconcile the
external driver first. Summary/review/resume/replay/rollback logic is **not
implemented by this contract module**.

Natural expiry, 501/unknown-outcome matrices, contention/observed SDK retry,
revocation barriers and the full QA3 acceptance matrix are separate prerequisites
or the adopted execution slices. A parallel request is not retry proof. Nothing
here enables printer output, changes production flags or establishes physical
compatibility. The original one conditional sprint is historical/provisional;
QA3a+QA3b are two adopted execution slices, both still distinct from this EXTRA
prerequisite and its engine handoff.

## Source checks and safe failures

Run `node --test tests/unit/local-qa-qa3-core.cjs` and the existing QA0/session/
identity guard tests, plus the repository typecheck. Tests use the real installed
native SDK object identity/effective settings but prohibit native methods and
observe owner bookkeeping only. These mocked-frontier checks are source checks,
not actual native integration or service authorization. Wrong project/origin,
unregistered scope, malformed/hostile resources, missing acknowledgements,
mutation during registration and reflective/private exceptions must reject.

Failures are fixed error codes (`runtime_invalid`, `resources_invalid`,
`scope_unregistered`, `registration_failed`) without raw errors, causes, bearer
values, payload/headers or credential details. No request logger, HAR, trace,
storage state or password/token artifact exists. Safe preparation output contains
only version/status/counts/false verification booleans; do not publish a resource
object or the private plan as execution evidence. A later real engine must emit
only allowlisted scenario/status/revision/count/boolean/version evidence.

Actual native execution remains WAITING_DEPENDENCY until the original QA0 owner
supplies the reviewed resource/registration hook and root reconciles the external
engine handoff. Parent #374/#376 remain open; no acceptance is inferred.
