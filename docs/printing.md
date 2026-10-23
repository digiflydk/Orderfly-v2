# Orderfly printing

## Current delivery: domain foundations (#291)

`src/lib/printing/domain.ts` defines scoped printers, print jobs, stable job identity
and production eligibility. It does not create database records, expose endpoints,
change checkout, connect to a broker or print. No browser/iPad is needed by the
planned server-to-printer architecture. Physical QA belongs to the final pilot.

Initial printers are Star mC-Print2 and mC-Print3. HTTP CloudPRNT is the compatibility
path. MQTT requires checking the exact mC-Print3 variant and firmware against
[Star's compatibility table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html).
Do not infer MQTT support from the mC-Print3 family name or overwrite Wolt settings.

## Trigger integration points (not wired yet)

- `src/app/api/stripe/webhook/route.ts` verifies Stripe's signature and calls
  `settlePaidCheckoutSession` in `src/lib/server/settle-checkout.ts`.
- Settlement atomically transitions payment to `Paid` and a `Pending` order to
  `Received`. It already writes `orderNotificationJobs` in the transaction.
- `src/app/checkout/actions.ts` accepts pay-at-pickup orders in a transaction only
  after the capacity reservation is `held`; it writes `Received`, `acceptedAt`
  and the `pickupReceived` notification job together.
- A future print outbox must be committed with those accepted transitions, with
  all transaction reads before writes. Do not rely on a browser success page.
- Later payment of a pickup order must reuse the original kitchen job identity.
  Receipt/payment events must not start another kitchen production.

Eligibility currently allows `Received`, `In Progress` and `Ready` orders only.
Stripe requires persisted `Paid`. Pay-at-pickup requires pickup fulfillment, no
PSP record and either an accepted unpaid `held` reservation or paid state.
Pending, canceled, error, completed and delivered orders fail closed. This is a
production gate, not authorization: callers must load authoritative server data,
authorize the actor and validate brand/location membership before invoking it.
Dispatch rejects paused/disabled printers. Intent acceptance includes paused printers,
so pause holds new eligible jobs without losing intent. Both reject mismatched scope.

Job keys hash a versioned JSON array of brand, location, order, printer, bon kind
and explicit revision. Original production uses revision 0. Keys do not depend on
payment provider events or payment state. The future transactional create/claim
must enforce uniqueness; the pure key function alone does not guarantee delivery
or exactly-once physical output. Unknown print outcomes must not be blindly retried.

## Following bounded deliveries

### Validated setup and capabilities (#293)

`src/lib/printing/configuration.ts` is server-only. It validates credential-free
configuration DTOs, not authentication or database ownership. Callers must first
authorize an actor, load an authoritative location, and project it to `{id, brandId}`.
`validatePrinterConfiguration` checks that the location, authorized scope and
submitted configuration all agree. Names accept Danish characters, trim outer
spaces and have an 80-character limit; Unicode controls/formatting, line/paragraph
separators, unpaired surrogates and malformed identifiers are rejected. Unknown
fields (including credentials or claimed capabilities) are
rejected. Return only the fixed error code, never raw input/Zod errors to logs or
clients. Printer credentials require a separate private server store later.

Transport selection is a request, not proof of device compatibility or readiness.
Both models can be prepared without a printer. `printerTransportCapability` stays
pending until separately trusted, scoped device evidence is supplied by a server
verification workflow. Never pass evidence from the configuration request. HTTP
needs firmware >=1.2; MQTT is disallowed for mC-Print2 and requires mC-Print3 variant
MCP31CBI or MCP31CI with firmware >=5.1. Unknown variant remains pending; other
verified variants are unsupported. Evidence is bound to printer ID, brand,
location and model; device replacement/reconfiguration must invalidate evidence.
Verified means transport compatibility only, not a connection, successful print,
Wolt coexistence or physical pilot. Future dispatch must also check operational
state, capability verification and the production feature flag; eligibility alone
does not authorize dispatch.

Paper widths are 58 mm for mC-Print2 and 58/80 mm for mC-Print3. Using 58 mm on
mC-Print3 requires the physical guide and device print-width setting.
Sources checked 2026-10-21:
- [Star CloudPRNT supported printers and firmware](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html)
- [mC-Print2 paper specifications](https://www.star-m.jp/products/s_print/mcprint2/manual/en/basicOperations/installingPaper.htm)
- [mC-Print3 paper guide and width setting](https://www.star-m.jp/products/s_print/mcprint3/manual/en/installing/installingAccessories.htm)

Lifecycle policy is defined without persistence in this delivery:

| State | Accept new jobs | Dispatch | Setup visibility | History |
| --- | --- | --- | --- | --- |
| Active | Yes | Subject to dispatch gates | Visible | Retained |
| Paused | Hold in queue | No | Visible | Retained |
| Disabled | No | No | Visible | Retained |
| Soft-deleted | No | No | Hidden | Retained |

Resume requires queue-age review before releasing held jobs. `kitchenPrintEligibility` rejects paused printers for dispatch;
`kitchenPrintIntentEligibility` accepts paused printers for durable held-job creation.
Neither pure eligibility helper sends anything. Soft-delete is
a lifecycle policy, not a new configurable device state or physical deletion.
Job history/audit references must survive future deletion; queued jobs must be
reviewed/canceled/rerouted explicitly, not silently purged or replayed.

No API, database write, UI or printer connection is introduced in #293. Unit tests
are not live API or hardware evidence. Follow-up persistence/API reads and writes
must each have their own <=60-minute task, server authorization, tenant boundaries,
tests and release/QA evidence.

Each work item has at most 60 minutes of active work, its own issue/PR, explicit
acceptance criteria and handover. Split before expanding scope.

### Authenticated printer reads (#295)

`GET /api/merchant/printers?brandId=BRAND&locationId=LOCATION` lists a single
authorized location. Optional `limit` is an integer from 1 to 50 (default 20);
`after` is the last returned printer ID. The result is
`{items: [{configuration, revision}], nextCursor: string | null}`. Pass the
returned cursor with the same scope to continue. Add `printerId=ID` instead to
read one record as `{item: {configuration, revision}}`; detail requests cannot
include list pagination. Unknown/duplicate parameters and malformed IDs fail.

The server requires a verified Orderfly session, the existing
`orderfly.catalog:view` permission for the requested brand and location, and
native brand/location ownership via `requireOrderflyAccess`. It rechecks the
loaded location's brand before reading any printers. Supplying scope in a URL
does not grant access. No cross-brand/global scan is performed. The existing
catalogue read permission grants configuration visibility only, not access to
future printer credentials or permission to send print jobs.

Prepared records live at `locations/{locationId}/printers/{printerId}` in the
production **data** project, using this versioned envelope:

```ts
{
  schemaVersion: 1,
  configuration: PrinterConfiguration,
  revision: number, // positive safe integer, starting at 1
  deletedAt: null, // a tombstone timestamp will hide future soft-deleted records
  createdAt?: unknown, // private server timestamp metadata, never returned
  updatedAt?: unknown
}
```

The nested configuration is validated using #293 and its ID must match the
document path. Its brand/location must match the independently authorized scope
and native location. The public projection contains only validated configuration
and revision. Unknown envelope/configuration fields (including credential fields)
are rejected; no raw document, timestamps, validation issues or error details are
serialized. Preparatory writes (#296) use this envelope and keep credentials in
a separate private store, without enabling client Firestore access.

Lists filter `deletedAt == null`, order by document ID and read at most
`limit + 1` records. Missing/soft-deleted rows are not listed. A malformed,
unsupported-version or foreign-scope record in a page makes the request fail
with generic 503, rather than silently hiding a configured printer or exposing
its ID as a cursor. Detail returns the same 404 for missing, deleted, malformed
and foreign records. An empty valid location returns an empty list.
Authentication failure is 401, authorization failure 403, invalid query 400,
and unexpected storage or authority-service/configuration failure generic 503.
Only explicit 401/403 authority decisions become authentication/permission errors.
All responses are `no-store` and
vary by Cookie; errors are not logged with raw data. No rules, indexes,
production data, UI, queue or printer transport are changed by this read-only
delivery.

The shared identity guard now distinguishes invalid sessions from unavailable
identity infrastructure. Missing, expired, revoked, disabled or malformed sessions
remain 401, with revocation checks enabled. Opsfly HTTP/network/throttling and
missing signing-key failures, Firebase initialization/network errors, and unknown
verification failures become generic `identity_unavailable`/503. The Admin SDK
13 certificate-fetch path can use `auth/argument-error`; only recognized SDK
token-validation messages under that code are classified as invalid credentials.
Unknown messages remain unavailable and are never returned/logged. Tests exercise
the real guard and Opsfly cookie/HTTP implementation with external I/O replaced,
plus malformed-cookie rejection through the installed Firebase Admin SDK.

Release QA must first verify the deployed `/api/health` commit, then check
unauthenticated list/detail rejection on this live endpoint. Authenticated live
scope/DTO checks require an existing safely accessible authorized session and
records; if unavailable, record that portion as **QA BLOCKED**, not passed.
Use fixture tests for writes/data-corruption scenarios. Never seed production
printers, fabricate credentials or treat a generic smoke test as authenticated
API or physical printer evidence.

### Audited preparatory writes (#296)

`POST /api/merchant/printers` takes `{configuration: PrinterConfiguration}` and
returns `{item: {configuration, revision: 1}}` with status 201. `PATCH` takes
`{configuration: PrinterConfiguration, revision: number}` and returns the same
projection with the next revision (status 200). These are full, strict DTOs;
unknown keys, credentials, actor IDs, device evidence, invalid IDs and revisions
are rejected. Query parameters are not accepted for writes.

Both the submitted and any existing configuration must be **disabled**. This
delivery prepares configuration only; active/paused printers cannot be edited
through it. Stop transitions belong to #298 and reviewed resume to #301, so a
configuration edit cannot bypass a queue-age review. Duplicate
creation conflicts even if the existing ID is a tombstone or corrupt record;
deleted printer identities are never reused. There is no print worker/dispatch,
customer/order mutation or printer credential provisioning in these operations.

The existing `orderfly.catalog:create` and `orderfly.catalog:edit` permissions
are checked by `authorizeTransaction` against the currently stored policy, brand
and location in the **same Firestore transaction** as the mutation. The requested
location must actually belong to the requested brand. The stored record must
also match that scope and its document ID; it cannot be reparented by a request.
The transaction reads authorization before exposing existence, and retries
recheck grants, ownership and revision. A stale revision, exhausted safe integer
or edit of an active/paused record gives generic 409 `record_conflict`. Missing,
deleted, malformed or foreign stored records give the same 404 `not_found` on
edit. Authentication/permission failures remain 401/403; unknown failures are
generic 503 with no raw data logged or returned.

Create persists server timestamps and revision 1. Edit preserves `createdAt`,
sets a new server `updatedAt` and increments the revision. The transaction also
creates an immutable-by-API `audit/{revision}` child document containing the
verified identity's namespaced principal hash, action, before/after validated
configuration, revision and server timestamp. The API accepts no audit actor or
timestamp from the browser and offers no audit update/delete operation. Failed
audit creation/commit rolls back the configuration change too.

Trusted capability verification is a separate private record at
`locations/{locationId}/printerCapabilityVerifications/{printerId}`. Every
successful configuration revision deletes that evidence in the same transaction,
conservatively requiring fresh verification even for a rename. Device model,
transport and paper changes therefore cannot retain stale verified capability.
Future verification/dispatch must use this private record and bind evidence to
the current configuration revision. Credentials must remain in another private
store and never appear in configuration, audit or public projections.

Write HTTP handlers authenticate before reading the body, require same-origin
JSON and reject cross-site fetches, query parameters, malformed JSON and bodies
larger than 8192 streamed bytes (regardless of Content-Length). Every response is
`no-store` and varies by Cookie, including errors.

**Rollout gate:** `ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED` must equal exactly
`true` to allow even these preparatory writes. The service itself enforces it,
not only the HTTP route. `apphosting.yaml` now sets it to `true` after the active
rules verification recorded below, and the
absent/default value also fails closed with 503 `writes_unavailable` before
database access. This is independent of future production-print activation.
Do not enable it until the **active** Firestore release in data project
`orderfly-39325` has been inspected and tested to deny unauthorized direct
client reads/writes of printer, audit, capability and future credential records,
including any broader recursive matches. Local rule files are not live proof.
Read-only `node scripts/firestore-rules-release.mjs preview` requires available
authorized Rules API credentials; missing credentials are a rollout blocker,
not evidence of unsafe or safe production rules. Rules/index changes require
their own reviewed release under `AGENTS.md`; unattended QA never writes rules
or data and must not enable this gate.

Configuration activation evidence (2026-10-24, Europe/Copenhagen): read-only
[Firestore rules preview #4](https://github.com/digiflydk/Orderfly-v2/actions/runs/40035010241)
on main `cd97e1dc386fb17bff3b953db0f1fd7aaef200e5` inspected the active
`orderfly-39325` release. Live and candidate SHA-256 both equal
`b19c7515e7e33841891e099379d9fea94c875a3d9a52d443a824948bdf9131be`.
The exact source is a recursive deny-all client policy with no broader allow
matches; authenticated/scoped server handlers remain the write authority.
The platform rules CI exercises anonymous, signed-in and admin-claim denial
for reads and writes including descendants. Activation enables authorized
configuration, lifecycle and credential controls, but does not enable the
independent pilot output, order-test output or print-intent flags. No rules,
credentials, printer records or purchases are created by this configuration change.

Fixture tests exercise actual transaction authorization and service/HTTP code
with isolated database I/O, including atomic audit failure, competing revisions,
transaction retry after revocation/location reassignment, malformed/foreign rows,
default-off gate and lifecycle bypass rejection. They do **not** prove production
write execution, active Firestore policy, authenticated live QA or physical
print. After exact-head release verification, live checks may verify anonymous
POST/PATCH rejection and existing GET behavior without mutations. Authenticated
authorization/configuration checks require safe existing access; controlled
production write QA needs a separately defined PO-approved reversible scenario.
Keep missing access/rules/write QA explicitly blocked and the issue open.

### Audited stop transitions (#298)

`POST /api/merchant/printers/lifecycle` accepts exactly
`{brandId, locationId, printerId, revision, action}`. IDs and positive safe integer
revision are validated. This separate command endpoint cannot change name,
model, scope or other configuration fields. It authenticates before reading the
body and uses the same same-origin JSON, 8192 streamed-byte limit, no-query,
no-store/Vary Cookie and generic error boundaries as configuration writes.

| Action | Allowed current state | Result | Existing permission |
| --- | --- | --- | --- |
| `pause` | active | paused | `orderfly.catalog:edit` |
| `deactivate` | active or paused | disabled | `orderfly.catalog:edit` |
| `delete` | active, paused or disabled | disabled with a server `deletedAt` tombstone | `orderfly.catalog:delete` |
| `resume` | paused or disabled, with valid server receipt and verified empty queue | active configuration; capability invalidated, no dispatch | `orderfly.catalog:edit` |

An already paused pause or already disabled deactivate is a 409
`record_conflict`, not a new audit event. Stale/exhausted revisions also conflict.
Current policy, native brand/location ownership, stored printer ID/scope and
revision are read in the same transaction as the mutation. Authorization happens
before record existence is exposed. Missing, deleted, malformed and foreign
records all return 404 `not_found`. Concurrent transactions and retries must
recheck grants, ownership and revision, including revocation/reassignment.

Each successful stop increments the revision, preserves `createdAt` and sets a
server `updatedAt`; it creates `audit/{revision}` atomically with namespaced actor,
action, validated before/after configuration, deletion indicator and timestamp.
Like config edits, it invalidates the separately trusted capability record.
Audit creation/commit failure rolls back the entire transition. Delete is always
soft: the printer document/ID, audit children and every job identity/reference
remain. No operation enumerates, changes, cancels, replays or deletes jobs or
credentials. Existing list/detail projection excludes tombstones and create/edit
cannot reuse or modify them. Future dispatch must independently recheck current
printer state/tombstone immediately before delivery; changing a config state
alone cannot prove stopping an already delivered job.

These operations remain behind the unchanged, default-off
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED` gate. This release does not verify active
Firestore policy, enable that gate, connect hardware or activate live output.
There is no lifecycle UI yet. Pause's future new-job acceptance and dispatch
semantics must follow the documented lifecycle policy; this endpoint itself has
no queue side effects.

Resume was split **before implementation**: #300 supplies durable job/outbox and
authoritative queue-revision metadata; #301 supplies the read-only summary;
#305 issues the scoped expiring receipt; #306 consumes it atomically with audited
empty-queue resume (see below). Without a receipt, resume still fails closed
after authorization and revision checks. Client booleans, counts, timestamps and
fabricated evidence cannot bypass review. Missing queue metadata is never treated
as a verified empty queue. Stop commands cannot set active state directly.

Tests use the actual transaction authorization with isolated storage I/O, shared
with the existing config-write fixture. They cover all allowed stops and grants,
no-op/stale/conflicting edits, current ownership/revocation during retry,
soft-delete identity/history preservation, non-reuse, secret/unknown payloads,
audit rollback and rejected blind resume. Fixture results are not production
write-path or physical QA. After exact-head deployment, live anonymous/invalid
session rejection may be checked with empty payloads (no possible record
mutation), alongside the existing read API and public release smoke. Valid
session/write QA remains blocked unless safe access and an explicitly controlled
reversible scenario are available.

1. Validated printer configuration and authenticated scoped persistence/API.
2. Transactional print-intent outbox and tests for payment/pickup idempotency.
3. Printer management UI with overview, add/edit/pause/deactivate and test preview.
4. Category/product routing and per-station bon data/preview.
5. CloudPRNT HTTP adapter and protocol simulator.
6. MQTT adapter, status and reconnection (compatible hardware only).
7. Deployment and feature-specific live QA for each exposed capability.
8. Physical pilot with both printers, Wolt coexistence and failure recovery.

Actual production printing remains disabled until the pilot. Code/UI deployment
does not depend on physical printer availability.

## Durable original-intent transaction foundation (#300)

`src/lib/printing/outbox.ts` is server-only and has no route, scheduler, event
listener or transport. `prepareOriginalPrintIntent(db, tx, command)` accepts exactly
`{brandId, locationId, printerId, orderId, kind}`. It reads the persisted order,
brand, native location, strict printer envelope, original job and queue metadata
inside the caller's Admin SDK transaction. Callers must authenticate/authorize
server events or actors before invoking it. Scope IDs are selectors, not authority;
this internal helper is never a browser-callable payment/acceptance endpoint.

It returns `{jobId, created, apply()}`. Finish **all** transaction reads before
calling `apply()`, then stage the caller's writes in the same transaction. Throwing
or a failed commit rolls back everything. Prepare once per printer per transaction;
multi-intent callers now use the combined batch API described under#317 below,
never multiple independent plans against the same printer. Re-run preparation on each Firestore retry. The helper
does not start or commit its own transaction and does not perform network side
effects. Applying a creation plan twice throws. A duplicate plan performs no writes.

This bounded foundation deliberately accepts only an **already eligible persisted
order**. It cannot turn a client claim, Pending order or failed payment into a job.
The actual integration sites inspected are `src/lib/server/settle-checkout.ts`
(verified Stripe session or transaction-authorized pickup staff payment, capacity,
Paid/Received + invoice + `orderNotificationJobs` atomically) and
`src/app/checkout/actions.ts` (held pickup capacity plus current native location,
Pending -> Received + pickup notification atomically). The matching prepare/apply
pattern already exists in `src/lib/server/discount-capacity.ts`.
The separately planned #303 integration task must provide a trusted **same-transaction
transition adapter** for those Pending -> accepted/Paid transitions, after their
server proofs, and wire print intent before the first write. Calling this helper
in a second transaction after checkout would leave a loss window and is **not**
the intended integration. No order/webhook code is changed here. Fixture atomicity
with an already eligible order is not proof that checkout now creates print jobs.

Canonical paths beneath `locations/{locationId}/printers/{printerId}`:

| Path | Version 1 contents |
| --- | --- |
| `jobs/{printJobId}` | schemaVersion, brand/location/printer/order IDs, kind, original revision 0, deterministic ID, printerRevision, queued state, attempts 0, server-clock createdAt and commit updatedAt |
| `queue/state` | schemaVersion, brand/location/printer IDs, monotonic revision, pendingCount, oldestPendingAt (null iff zero), commit updatedAt |

No credentials, contact details, bon payload or client review evidence are stored.
Routing identity is printer + kind + original revision 0, independent of payment
events; later payment of an eligible pickup order reuses the original job. Active
and paused printers accept intents; disabled, deleted, malformed, missing or foreign
printers do not. A queued job does **not** authorize dispatch. Capability, liveprint
flag, current state/tombstone, order freshness and reviewed resume remain separate
dispatch gates. Queue age is the trusted server-clock creation time, independent
of a future release/not-before time; scheduled order release is not implemented.

Each new job and queue revision/count/oldest update commit together via `create`
for unique original identity. Duplicate events validate the existing job and ledger
and do not advance counters. Shared queue reads serialize competing transactions;
Firestore retries must re-read current order/ownership/printer eligibility. Missing
ledger is initialized only after an actual transactional complete bounded job query proves no canonical
jobs exist. Legacy jobs without metadata, unsupported/corrupt metadata, count/oldest
mismatch and exhausted revisions fail closed, never silently reconstruct or reset
history. A transactional query reads at most 501 documents, validates **every** counted
job (including ID/scope/schema) and computes count/oldest. V1 allows at most 500
unresolved jobs per printer: a new insertion at capacity, or a larger/invalid
existing queue, fails closed before any writes. The overflow row must never be
treated as a complete truncated page. This is an explicit insertion-only foundation
bound, not a production backpressure policy; #303 must handle it atomically with
acceptance, and a later scalable worker/queue design must be reviewed before
activation. Read cost scales with backlog (up to the bound), requiring measurement
before transport-scale rollout. No new composite index is required or deployed.

V1 is an insertion-only queue foundation: all recognized jobs are unresolved
`queued` originals with zero attempts. There is no worker, completion, cancellation,
retry, release or terminal-job mutation. A later worker must extend the versioned
schema and maintain queue revision/count/oldest **atomically on every membership
or review-relevant change**, retaining job history; it must not mutate job state
using this insertion-only ledger unchanged. Missing/legacy metadata is not a valid
empty-queue receipt for #301. Server-clock anomalies must block future age review.

Tests replace storage I/O only, exercising actual helper/domain validation with
transaction rollback, retry, serialized competitors, duplicates, pickup payment,
pause acceptance, native ownership, invalid inputs and corrupt/legacy ledgers.
They are isolated fixture tests, **not** live Firestore concurrency/production
write, checkout end-to-end or printer evidence. No feature live endpoint exists.
After deployment verify exact release and public regression smoke; live creation
of jobs remains **QA BLOCKED** without safe authorized access and a controlled
reversible scenario. Configuration-write gate stays false; live output stays off.

## Read-only scoped queue age snapshot (#301 / P1.7a)

`GET /api/merchant/printers/queue?brandId=...&locationId=...&printerId=...`
accepts exactly those three scoped IDs. The handler and service authenticate;
duplicate, missing, malformed and unknown query keys (including client counts,
clock or review flags) are rejected. Current `orderfly.catalog:view` policy,
native brand/location ownership, strict nondeleted printer, queue metadata and
jobs are read in one **SDK read-only Firestore transaction**. Catalog edit alone
does not grant view. A missing/deleted/malformed/foreign printer gives the same404
without reading its queue. Unauthenticated/forbidden callers get401/403 before
queue access; identity/storage outages stay generic503 `queue_unavailable`.
All responses, including errors, use `no-store` and `Vary: Cookie`.

The service shares version1 schemas and the500-job limit with the insertion
helper through `src/lib/printing/queue-storage.ts`. It reads at most501 jobs,
without filters/orderBy that could hide malformed rows. Every row must match
scope, strict queued-original schema, document ID and deterministic identity;
ledger count/oldest must match the complete verified set. It never initializes,
repairs or changes metadata, jobs, audit or printer state. An explicitly stored
valid zero-count/null-oldest ledger with no jobs is verified empty; absent ledger
remains blocked **even if no jobs exist**.

A200 response contains scoped IDs, printer state/revision, server `evaluatedAt`,
`status`, `reason`, `queueRevision`, `summary`, and **`resumeAuthorized: false`**.
For a verified snapshot, summary contains pendingCount, oldest/newestCreatedAt
and oldest/newestAgeMs derived only from server time. Empty queue ages/times are
null. No order IDs, job IDs/payloads, customer data, credentials, device evidence,
raw timestamps or raw validation errors are returned. The response carries no
signed/opaque review token and cannot be submitted as resume evidence.

| Block reason | Meaning |
| --- | --- |
| missing_metadata | No authoritative queue ledger; never guessed empty |
| invalid_metadata | Legacy/malformed or foreign ledger |
| queue_too_large | More than500 rows; a truncated page cannot prove coverage |
| invalid_jobs | Malformed, foreign, wrong-ID or unsupported version/state job |
| unknown_outcome_jobs | Otherwise canonical v1 shape with dispatching/uncertain state |
| expired_jobs | Otherwise canonical v1 shape marked expired |
| clock_invalid | Missing/unsafe server clock, zero or future job creation time |
| inconsistent_metadata | Ledger count/oldest disagrees with complete canonical set |

Blocked responses have null queueRevision/summary and grant no resume authority.
Recognizing an unsafe state is not support for its transport lifecycle: insertion
v1 only supports queued originals with zero attempts. Other malformed fields
still block as invalid_jobs. No new cutoff/expiry/auto-release policy is invented;
old but structurally valid queues report their actual age and still require an
explicit later handling decision. Clock anomalies are blocked, never clipped to
age zero or treated as fresh. This snapshot has no order-freshness, capability,
physical readiness or delivery guarantee, and may become stale immediately after
its read. It is information for review, not proof that replay is safe.

The original #301 scope was split **before implementation**: #301 owns this
read-only snapshot; #305 creates an actor/scope/printer/queue-revision-bound,
expiring single-use review receipt after explicit handling; #306 rechecks and
consumes it atomically with audited resume (see their sections below).
Each has its own <=60-active-minute issue/PR. This GET snapshot itself introduces
no receipt writes, resume or dispatch. The configuration-write
flag stays false and this read requires no write-flag activation. Live output
remains disabled until physical pilot. No rules/index/data migration is performed.

Tests run actual transaction authorization and service/HTTP code with isolated
storage I/O: success/verified-empty vs missing metadata, every row/capacity,
revocation/native reassignment, unsafe states/clocks, strict projection/query,
identity/storage errors and read-only/no-mutation enforcement. They are not live
Firestore or authenticated production scope proof. After exact release verification,
live anonymous/invalid-session boundary checks and public regression smoke may
run without writes. Authenticated summary acceptance needs safely available
existing access and controlled existing records; absent access is **QA BLOCKED**,
not passed. Do not seed production queues/printers for unattended verification.

## Server-issued queue review receipt (#305 / P1.7b)

`POST /api/merchant/printers/queue/review` accepts exactly
`{brandId, locationId, printerId, printerRevision, queueRevision, decision}`.
The only initial handling decision is **`resume_empty`**. It permits issuance only
for an existing valid explicit zero-count/null-oldest ledger with no jobs.
Even fresh valid queued jobs are rejected with `queue_not_empty`; nonempty/stale
queue handling requires a separately designed policy. Nothing is replayed,
discarded, marked fresh or silently repaired by this decision.

The handler authenticates before CSRF/body parsing and requires same-origin JSON,
no query parameters and at most8192 body bytes. The service independently verifies
identity, strict input and the existing exact-true
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED` gate (still false in production).
Current `orderfly.catalog:edit` grants and native brand/location ownership, the
strict nondeleted paused/disabled printer, both expected revisions, the complete
bounded canonical job set and matching queue ledger are re-read in **one write
transaction**. Active printers and exhausted revisions are rejected. Revocation,
reassignment, configuration changes and queue changes on retry are rechecked.

The shared internal `queue-snapshot.ts` validator accepts the caller's transaction;
it never starts a second transaction. GET still owns an SDK read-only transaction
and returns the same DTO as before. POST never calls GET or trusts its DTO, client
clock/ages/counts/review flags, or a prior separately read snapshot as authority.
All existing missing/legacy/foreign/corrupt/inconsistent/oversized/clock-invalid/
expired/unknown-result blockers remain. Both services read the same canonical
ledger and bounded501/max500 job set. All reads precede staged writes.

On success the server returns a fresh256-bit random opaque `receipt`, scoped IDs,
decision, printer/queue revisions, numeric `expiresAt`, and
**`resumeAuthorized: false`**. The lifetime is120 seconds from server evaluation
inside the successful transaction attempt. Unsafe server clocks/expiry overflow
are blocked. Receipts can expire before a caller uses them; consumers must never
extend TTL or trust the client clock. No actor/contact/job/order payload, credentials,
raw database records or stored hash are returned. All responses use `no-store` and
`Vary: Cookie`; unexpected errors are generic503 `queue_review_unavailable`.

Only SHA-256(token) is used as the private document ID under
`queueReviews/{tokenHash}`. The strict version1 record binds actor principal hash,
native scope, paused/disabled state, printer and queue revisions, explicit decision,
server issuedAt/expiresAt, consumedAt:null and commit createdAt. A separate immutable
issuance event is created at `queueReviewAudit/{tokenHash}` in the same transaction.
Receipt and audit are create-only, so collisions/failure cannot overwrite history;
audit or commit failure rolls both back. No plaintext token is persisted or logged.
No printer revision/state, jobs, ledger, capability evidence or old audit is changed.

Receipt issuance remains separate from the atomic consumption described below.
The issuance API always returns `resumeAuthorized:false`; neither its response nor
the read-only GET summary independently authorizes a lifecycle transition.

No rules, indexes, production data or activation changes are part of this PR.
Fixture tests exercise real authorization/HTTP/service logic with isolated storage
I/O, rollback/retries and read-before-write enforcement. They are not live Firestore
contention, production receipt creation, authenticated scope or physical print proof.
Live QA after exact release can safely check anonymous/invalid-session auth-first
rejection with empty bodies plus public release smoke. Authenticated gate and
issuance/expiry/single-use end-to-end QA remain **BLOCKED** without a safe session
and an explicitly controlled reversible scenario. Do not seed production records
or turn on the flag to obtain unattended QA. Physical output remains off.

## Verification and release

Run `node --test tests/unit/printing-domain.cjs tests/unit/printing-configuration.cjs tests/unit/printing-reads.cjs tests/unit/printing-identity.cjs tests/unit/printing-writes.cjs tests/unit/printing-lifecycle.cjs tests/unit/printing-outbox.cjs tests/unit/printing-outbox-batch.cjs tests/unit/printing-queue-summary.cjs tests/unit/printing-queue-review.cjs tests/unit/printing-resume.cjs`
and `npm run typecheck`.
There is no changed browser flow in this delivery.
Follow `AGENTS.md` for current-head CI, independent Codex review, merge and release
verification. PO/PM has authorized qualifying merge/deploy without another prompt.
After deployment verify `/api/health` release and run issue-specific live QA for
exposed features. The internal domain/capability foundations are not exposed as
live operations; the printer read endpoint has its own live authorization checks.
Local tests are not live end-to-end evidence.
Do not mark final print acceptance as passed until actual printer output is proven.

## Atomic reviewed empty-queue resume (#306 / P1.7c)

`POST /api/merchant/printers/lifecycle` retains its existing stop command format.
For `action:resume`, the caller additionally supplies `receipt` (the opaque
43-character server token) and `queueRevision`. Both fields must be present
together and are prohibited on stop commands. Resume without either retains
`409 queue_review_required`; client booleans, counts, clocks and decisions remain
invalid input. Existing same-origin/auth-first JSON, byte limit, no-store and
default-off configuration write gate apply unchanged.

The lifecycle service reauthorizes the current actor's `catalog:edit` grant and
native brand/location ownership, validates the strict nondeleted printer and
expected revision, then reads the SHA-256-addressed unconsumed receipt in the
**same Firestore write transaction**. Strict schema/document/hash, actor, native
scope, paused/disabled state, printer revision, queue revision and `resume_empty`
decision must match. It re-reads the entire canonical bounded queue and ledger in
that transaction, requires a verified empty queue at the receipt's revision, and
checks server `issuedAt <= now < expiresAt`. Missing, legacy, foreign, corrupt,
inconsistent, oversized, unknown-outcome, expired or clock-invalid queue data
blocks consumption. Missing/invalid/bound-to-other-state receipt returns
`queue_review_required`; canonical queue/time failure returns
`queue_review_blocked`. Neither error consumes the receipt or changes the printer.

Only after all reads succeed, one transaction consumes the private receipt,
increments printer revision, changes configuration state to active, invalidates
capability evidence and creates the normal immutable lifecycle audit. The audit
records actor/server timestamp plus receipt hash, queue revision, decision and
issued/expiry/consumption times, never the raw token. The separate issuance audit,
queue ledger, jobs, credentials, original identity and older history are preserved.
Other issued receipts become stale through the incremented printer revision.
Retries repeat authorization, all bindings, queue and clock checks. Audit or
commit failure rolls back consumption and all transition effects together.

Configuration state `active` is not transport/output authorization: this endpoint
does not dispatch, create jobs, activate capabilities or change production flags.
Production configuration writes and live kitchen output remain off. Fixture tests
exercise the actual issuance-to-resume path plus expiry boundary, fabricated and
foreign/used receipts, grant/ownership/revision/queue changes, competing requests,
retries and atomic rollback. Their serialized transaction fixture does not prove
live Firestore contention. Authenticated production success/scope/expiry/single-use
QA remains **BLOCKED** until a safe existing session and controlled reversible
scenario are available; unattended verification must not seed production data.

## Combined original-intent batch (#317 / P1.8a)

`prepareOriginalPrintIntents(db, tx, { intents, reservedWriteCount })` prepares one
combined plan in the caller's existing write transaction. Each strict intent uses
only native brand/location/printer/order IDs and `kind:kitchen|packing`. It still
requires an already eligible **persisted** order. No Pending-to-Received/Paid
transition, Stripe/pickup wiring, route, transport, dispatch or activation is supplied;
#303 must provide the separately reviewed trusted transition adapter first.

The input contains 1..64 intents across at most16 native printer scopes. Duplicate
original revision0 identities are collapsed in first-seen order. For every printer
the helper re-reads native brand/location, strict nondeleted printer, all referenced
orders, the ledger and the complete canonical bounded501/max500 job collection.
It rejects invalid, foreign, legacy, inconsistent, expired/unknown-state or unsafe
clock records without repair. Paused printers accept durable intent, never dispatch.
After all checks, `jobs` distinguishes existing valid duplicates from newly prepared
jobs; `createdCount` and `writeCount` describe only this plan's effects.

Capacity checks apply to the **combined** new jobs per printer. At499 jobs, two new
kitchen/packing identities are rejected together; duplicate+one new can reach500.
At500, valid duplicates remain a no-op. Existing jobs and histories are unchanged.
Each changed printer's ledger advances its revision once per batch, adds the full
new-job count and preserves the actual oldest creation time. Its ledger is written
exactly once, avoiding independently prepared last-write-wins deltas.

The trusted caller must declare **all other transaction writes**, including the
order mutation, in `reservedWriteCount` (0..500). Before apply, actual new-job writes
plus one ledger write per changed printer plus this reservation must fit the500
write application limit. The batch itself can use at most80 writes (64 jobs plus16
ledgers). `write_budget_exceeded` and capacity errors must propagate and abort the
caller transaction; never accept the order after swallowing outbox failure. This
is a write-count bound, not a guarantee against Firestore document/transaction byte
or runtime limits. Every caller must also keep its own other work bounded.

Finish all caller reads before `apply()`, then stage its mutation in the same
transaction. Reusing a mutating plan throws; retry by rerunning the whole transaction
and prepare, which revalidates orders, printer state and current queue capacity.
No helper-owned transaction or commit exists. The backwards-compatible
`prepareOriginalPrintIntent` facade retains its one-intent DTO and duplicate no-op,
with zero reserved writes as before. It remains limited to **one call per printer
per transaction**. Multi-intent callers must use one batch for the entire transaction;
independent prepared plans against the same printer are not composable.

`tests/unit/printing-outbox-batch.cjs` executes the real helper with isolated
read-before-write-enforcing transaction I/O. It covers combined capacity, mixed
new/duplicate jobs, native ownership, paused state, multi-printer budget, full
canonical validation, contention/retries and caller/job/ledger/commit rollback.
Serialized fixtures are not live Firestore contention or authenticated end-to-end
order acceptance proof. There is no new live endpoint to exercise in this delivery.
After qualifying serialized release, verify the deployed release SHA and read-only
public smoke; internal behavior is validated locally/CI. Unattended production
writes, rules/index changes and config/output flag activation remain prohibited.
