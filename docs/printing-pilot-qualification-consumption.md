# One supervised qualification, one synthetic pilot job

Issue #516 continues #510, coordinated in #309. This service is separate from
customer-order queues and production device capability. It prepares the first
controlled synthetic testbon; it does not dispatch it or activate any gate.

`consumePilotQualification` requires the existing authenticated platform
superadmin before inspecting input. Configuration writes remain default-off.
Every transaction attempt rereads current native platform/catalog authority,
brand and location ownership, exact printer and nonrevoked credential revisions,
the still-pending ceremony, job, single-device pointer and immutable consume audit.
Private paths are not read until tenant ownership has been validated.

The authenticated supervisor must be the ceremony's issuing actor. The native
printer must be active when the job is created; disabled/paused printers fail
before writes. Activation is a separate explicit audited lifecycle action and
changes the printer revision, so refresh/rotate the credential and start a new
ceremony afterward. Deactivation or credential changes also stop later delivery.
The strict
operator submission must match its nonce, scope, revisions and exclusive ten-minute
server expiry. Consumption also requires at least one full server-clock minute to
remain before that expiry. A later attestation is rejected without creating the
job, audit or permanent current pointer; the operator must explicitly begin a new
ceremony. Observed model/paper/raster must match the native printer. The
supervisor explicitly attests the onsite identification, StarIO firmware query,
enrollment correlation and capture. The operator label and capture digest are
accountable human statements, not authentication, independent device truth or
cryptographic manufacturer attestation. Protected capture collection and the
human procedure remain part of the controlled pilot, not inferred from a digest.

The service generates only the existing canonical #355 synthetic content. The
session ID becomes the immutable job ID. A single transaction creates the job,
creates `pilotState/current`, changes the session to `consumed`, and creates an
immutable consumption audit. The consumed record retains the original nonce
digest and expiry and adds job ID, canonical content digest and consumption time.
Plaintext nonce and payload are absent from its result/audit. Current printer
configuration, customer orders, print-history metadata and production capability
are unchanged. All returned output/dispatch/activation/physical flags are false.

An existing pointer, job, audit or consumed session conflicts. The service never
overwrites another pending/uncertain attempt or reconstructs prior history. The
delivery lifecycle must deliberately finish and clear its own pointer before a
new attempt. SDK retry rebuilds from current native reads. Late failure rolls all
four writes back. Unknown commit returns a fixed unavailable error; replay cannot
duplicate a committed job. A client must inspect the authorized existing state,
never automatically resend after an uncertain outcome.

The separate synthetic pilot lifecycle rereads native device authority, consumed
session and canonical job linkage on every operation and owns the explicit
default-off pilot-output gate. A pure record builder or consumed DTO is never a
transferable dispatch permission. HTTP/UI binding, onsite observation, a controlled
actual print and independent paper acceptance remain separate acceptance steps.

Verification: `npm run typecheck` and
`node --test tests/unit/printing-pilot-qualification-consumption.cjs`.
Tests run actual pending issuance, consumer, canonical job builder and content
reader with only session/native database I/O isolated. Coverage includes one
atomic successful job, all-read-before-write, no secret persistence, current
authority/revision/revocation, issuing actor, malformed/expired/foreign/nonced
input, outstanding pointer/replay, discarded retries, rollback and unknown commit.
The expiry regression proves that a 59.999-second remainder writes nothing while
the exact 60-second boundary creates a job with that full delivery window.
