# Native print confirmation persistence (#456)

The #549 supervised purchase endpoint now calls
`prepareCloudPrntPrintConfirmation` in its native result transaction. That helper
freshly authenticates the device and supervised window, reads the server-owned
claim binding and strict delivery/terminal identity, and stages confirmation with
the dispatch/pointer update. See [supervised purchases](printing-supervised-orders.md).
The standalone legacy API described below remains unwired; unattended production
capability and physical acceptance are still separate open requirements.

This is an internal, unwired persistence service. It does not deliver jobs, expose
an HTTP endpoint, enable physical output, or prove a physical printer printed.
The missing durable claim/delivery identity is tracked in #460. Its canonical
producer integration and authenticated result endpoint are tracked in #461;
#461 must reuse #460 rather than implement another claim module.
Parent #456 and metadata/table parents #344/#361/#341 remain open until the actual
integration and their acceptance criteria are verified. Release remains subject
to current-main CI, independent current-code review, serial coordinator release,
verified deployment and Claude QA.

`persistNativePrintConfirmation` owns one native Firestore transaction. Every
attempt invokes the existing device verifier against current brand/location,
printer and private credential before reading delivery/result records. An explicit
CloudPRNT `200`/`OK` confirmation is parsed using the existing protocol parser.
Other 2xx, busy, failure and unknown outcomes cannot confirm a print. MAC/UID are
protocol fields, never device authentication.

## Private delivered contract and pending queue

The future producer owns `locations/{location}/printers/{printer}/deliveries/{job}`.
It must write the strict exported `deliveredPrintEnvelopeSchema` only after actual
authorized immutable-content delivery. The envelope binds canonical original
`printJobId`, exact job scope/kind/revision and content digest, current printer and
credential revisions, independently scoped claim/delivery token digests, and
server-generated delivery/expiry times. Tokens must be server-generated with
adequate entropy and never persisted in plaintext. The exported digest helper
does not create claims, validate delivery or grant any authority.

Before any possible dispatch, that producer must atomically transfer pending-job
ownership, maintain queue count/revision/oldest metadata and downgrade an existing
`never` activity state to `unknown`. Unknown physical outcome must remain unknown.
It must also retain durable terminal original-job identity and update outbox
idempotency checks: removing a queued job alone permits the current outbox to
re-enqueue it on payment replay. Claim/download code without that coordinated
queue/outbox integration cannot establish a valid delivered envelope.
The acknowledgement writer does not change current queue storage: existing readers
accept only queued jobs, so terminal records must not be added to that collection.
Pending original-job absence is checked defensively; absence alone is not evidence
of a successful queue transfer. A valid private envelope from the reviewed producer
is essential, and no such producer currently exists. Never seed these records in
production to bypass #461. Synthetic #355 testbon content cannot establish the
provenance of a real order's immutable content.

## Confirmation and replay

The service timing-safely matches both scoped token digests. Current revisions,
canonical native job identity, an unexpired delivered envelope and absent pending
original job are required for a first confirmation. Lease expiry is exclusive:
confirmation must occur strictly before `expiresAt`, including saved duplicate
result validation. It creates the immutable
`printResults/{job}` confirmation and updates `statusMetadata/current` together.
The confirmation time comes from the server inside the transaction, never caller
input. Existing activity and activation are preserved; latest use advances by
server confirmation time, with stable existing job identity on equal times.
Invalid server clock or a clock earlier than stored history fails closed rather
than accepting future data or silently rewriting prior confirmation time.
This write guard is deliberately stricter than the activity reader's bounded
cross-instance clock-skew tolerance; tolerating a read does not authorize an
older confirmation write.

Duplicates authenticate again and validate the entire immutable saved result
against the same delivery/content/scope/revisions and its original valid time
window. They preserve the first confirmation time without writes, including after
delivery expiry. Corruption, rebinding, changed credentials/revisions and inconsistent
activity fail closed. Commit failures roll back both changes, and retries recompute
fresh authentication and reads. No raw credential, HTTP payload, digest or provider
error appears in returned data or application errors.

## Verification limits

`node --test tests/unit/printing-print-result-native.cjs` executes production
modules, real credential hashing and real protocol/job parsing with native database
I/O isolated. It covers success, scope/auth rejection, exact claim/delivery binding,
canonical content/job checks, pending-job rejection, expiry, immutable duplicate
validation, older-delivery arrival, same-time order, retry/revocation and atomic
rollback. These are software tests, not native emulator or physical-print evidence.
No production writes, flags, device settings or Wolt paths are changed.
