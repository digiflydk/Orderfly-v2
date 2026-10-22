# One-shot synthetic pilot delivery

Issue #517 is the bounded server service used by the controlled first-testbon path.
It does not consume customer orders, queue manifests or the ordinary print outbox.
It reuses #355's canonical immutable PNG, containing no customer or meal order.

## Creation and authority

`createSyntheticPilotJobRecord` is a pure data builder, not authorization. The
separate authenticated #516 consumer must create the job, consumed qualification,
audit and `pilotState/current` pointer in one native transaction. The current
pointer is a single bounded record, never a collection scan. A submitted job DTO
does not authorize bytes or state changes.

Every device operation calls the existing strict Basic/native verifier in its
current transaction. It then rereads the consumed qualification, exact pointer,
canonical job and current private credential. Scope, printer revision, credential
revision, session ID, consumed timestamp, expiry and canonical content digest must
match. A paused or disabled printer cannot receive work. Credential revocation or
rotation and a changed native tenant/configuration stop the operation.

Both `ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED` and
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED` must equal `true`. The pilot flag is a new
default-OFF deployment setting; this change does not enable either setting. The
supervised qualification does not claim manufacturer attestation or physical fit.

## Durable sequence

| Device operation | State before | Committed state before response |
| --- | --- | --- |
| Ready poll | queued | offered with token digest and server time |
| Repeated ready poll | offered | unchanged, same token |
| Busy/error poll | any | no pilot read/write after native authentication |
| Content download | offered | download_started before PNG bytes are returned |
| Repeated download | download_started or terminal | rejected, no resend |
| Strict protocol result | download_started | confirmed, failed or unknown |
| Same result replay | same terminal result | unchanged, duplicate:true |
| Changed result replay | different terminal result | rejected |

The HTTP adapter supplies `ready` only from the existing parsed status and must
derive `outcome` from the strict protocol result parser, never a client JSON
success boolean. `ready:false` can only withhold work. It cannot bypass native
authentication or authorize output.

The job token is domain-separated HMAC-SHA256 over immutable scope, native
revisions, session/job ID and content digest. The HMAC key is the freshly verified
current private credential digest and never leaves this service. Only the token
digest is persisted. Plaintext token is delivered only to the authenticated
device protocol. It is not a replacement for Basic/native authentication.

## Lost responses and remaining work

The service waits for transaction commit before returning a token, bytes or
result. A lost poll response can be retried with the same token before download.
After download starts, a lost response is uncertain and never causes an automatic
second download. The pointer remains reserved even for terminal jobs. Another
session needs a separately reviewed explicit operator clear/cancel operation;
there is no automatic replacement or background retry.

A protocol confirmation remains distinct from operator verification of actual
paper output. This synthetic service does not update ordinary last-confirmed-use
metadata or imply acceptance of #344/#456/#461. Those production integration
criteria remain separate.

The separate #518 POST/GET/DELETE adapter and #516 superadmin consumption flow must
be integrated and tested with the actual modules before controlled hardware use.
No production session, feature flag, printer, firmware or Wolt configuration was
changed by #517.

## Validation and release

The focused tests execute the actual content encoder, native identity verifier,
credential comparison, qualification/job schemas and lifecycle service. Only
native database I/O is isolated. Tests cover successful one-shot state changes,
credential and scope rejection, expiry/corruption, forged tokens, retry/rollback,
lost-download responses, terminal unknown/failure and secret absence.

Run `node --test tests/unit/printing-synthetic-pilot-job.cjs` and
`npm run typecheck`. Dedicated CI registration belongs to the coordinator. Current
main, completed independent review, CI, serialized merge/deployment and applicable
live acceptance are separate gates. These tests do not prove physical printing.
