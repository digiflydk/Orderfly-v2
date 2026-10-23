# Protected supervised pilot control

Issue #519, coordinated in #309. Node-only dynamic
`POST /api/superadmin/printers/pilot` connects actual server issuance (#510) and
atomic single-job consumption (#516) to an explicit superadmin action. It does
not activate configuration/output gates or send anything to a printer.

The platform-superadmin session is checked before URL, headers or body. Requests
require the established trusted Origin and reject cross-site fetches. Only JSON
POST without query parameters is accepted. Body reads are bounded to 8192 actual
bytes regardless of Content-Length, decoded with strict UTF-8 and validated with
strict action schemas. Every response uses Cache-Control:no-store and Vary:Cookie.

The issue action contains `operation:issue`, brandId/locationId/printerId and the
current positive printerRevision/credentialRevision. The actual service freshly
authorizes current native scope and commits the pending ceremony before the
handler explicitly projects its one-time nonce. The nonce is private session
material: do not place it in URLs, logs, storage or analytics. Lost response
does not provide a nonce recovery endpoint; start a fresh supervised ceremony.

The attest action contains `operation:attest` and the strict nested `attestation`
defined by #510, including the session nonce, observed device/profile, operator
label and protected capture digest. These are deliberate supervised operator
statements, not manufacturer attestation. The actual consumer requires the
issuing actor and current native state, and commits one fixed synthetic job
atomically with session consumption. The handler returns only matching scope,
session/job identity and content digest. Neither payload bytes nor nonce appear
in the attest response. Human capture collection and truthful onsite observation
remain required during the controlled pilot.

Both operations explicitly project strict same-scope service results rather than
serializing arbitrary server objects. All output/dispatch/activation/physical
flags stay false. Malformed, foreign or unexpected results, errors and uncertain
commit outcomes return fixed safe errors with no reflected provider text. Each
request invokes its one actual service exactly once; service SDK retries retain
their existing native transaction semantics. Request retries must not be used to
automatically resend a job after an uncertain delivery.

The dedicated operator panel is mounted within Printeradgang for a current
credential and HTTP printer only. The test start is disabled until that native
row is active. Activation requires the separate audited printer action followed
by a credential refresh/rotation and a new ceremony, never a hidden mutation.
The row supplies model, paper width and exact
printer/credential revision. It first starts a ceremony, then requests observed
label/installed firmware, an accountable operator label and two explicit onsite
confirmations. Selecting a local capture computes SHA-256 in the browser; no raw
file, filename or nonce is sent to analytics or persistent browser storage. The
file remains on the operator's device. An unknown/failed attest response clears
the ceremony and never retries a write automatically. The screen reports one
prepared job, not a successful physical print.

The default-off controlled output window and authenticated CloudPRNT lifecycle
(#517) remain separate from this administration panel. Neither its endpoint nor
its browser tests prove device connectivity, installed firmware or paper output.

Verification: `npm run typecheck` and
`node --test tests/unit/printing-pilot-control-http.cjs`. Route tests run the actual
handler with only session/service I/O isolated; #510/#516 tests separately run the
actual transactional services and canonical content. Coverage includes auth-first,
nonenumerable nonce projection, strict one-service delegation, same-scope result,
CSRF/media/query/method/bounds failures, native conflicts and error/result leakage.
`tests/unit/printing-pilot-controls-browser.cjs` exercises the actual mobile-width
StrictMode component with bounded synthetic HTTP responses: explicit confirmation,
local file digest, one scoped job, no nonce in DOM/storage, no repeat after unknown
response and permission revocation. It requires the pinned Playwright Chromium;
an unavailable executable is an environment blocker, not a passing browser test.

## Read-only testbon progress

`GET /api/superadmin/printers/pilot` accepts exactly `brandId`, `locationId`, `printerId`, `printerRevision` and `credentialRevision`. It rechecks the authenticated superuser, native location edit grant, brand ownership, current printer and credential in an SDK read-only transaction. It validates the durable pointer, consumed qualification and canonical synthetic payload before returning a bounded status projection. It does not require output gates to remain enabled, so an operator can inspect the result after closing a test window.

The printer panel's explicit **Opdater testbonens status** button reports `none`, `queued`, `offered`, `download_started`, `confirmed`, `failed`, `unknown` or `expired`. Nonterminal jobs past their deadline show `expired`; terminal results remain visible. A saved job suppresses new preparation in the panel. Refresh does not prepare, resend, reset or clear a job, and opening the panel does not poll automatically. Responses contain only the exact scope/revisions, state, creation/expiry/confirmation times and `physicalCompatibilityVerified: false`. Tokens, credentials, operator captures and print payloads are never exposed.

`confirmed` means the printer reported success; the operator must still inspect the paper. An unavailable or conflicting status is not evidence of success or permission to retry. Stale printer/credential revisions require refreshing the printer overview. The existing durable one-test pointer is not reset by this change.

Verification: `tests/unit/printing-pilot-status.cjs` exercises the actual GET/service/module graph against bounded Admin I/O fixtures, including all states, expiry, tenant/revision rejection, revoked credentials, corrupt records and read-only enforcement. The real Chromium pilot-controls test covers explicit status refresh and recovery after reopening, with no duplicate preparation.
