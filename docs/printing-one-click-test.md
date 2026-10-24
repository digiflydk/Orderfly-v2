# One-click dummy kitchen test (#562)

PO requested one **Print testbon** button without a hardware qualification ceremony. The existing authenticated printer-access panel now exposes the button directly and polls read-only status every five seconds. The receipt uses the existing fixed kitchen PNG with clearly marked test content and no customer/order information. The old issue/attest API remains compatible with previously saved records but is no longer the UI flow.

POST `/api/superadmin/printers/pilot` accepts `{operation:"print", brandId,locationId,printerId,printerRevision,credentialRevision,requestId}`. Origin, session/superuser, tenant ownership, active native configuration and current credentials are checked. A fresh authenticated connection (90 seconds) on **Test URL** is required. Config-write and synthetic-output flags must both be on. No caller content, firmware or claims of physical verification are accepted.

One transaction writes the canonical job, a schema-v2 `admin_test_request` record, audit, current pointer and idempotency mapping (`testPrintRequests`). These are server-only subcollections under the printer. This is an explicit print request, not a fabricated operator/manufacturer attestation. `physicalCompatibilityVerified` remains false. Legacy consumed qualifications remain readable.

A request ID returns its original job even after a lost response. The UI retains an unresolved request ID in memory and offers an explicit **Prøv samme testbon igen** action after an ambiguous response, including when status is `none`. This retries the same request; status polling never retries it automatically. Concurrent requests reuse active work. Confirmed work has a 30-second cooldown before another explicit click creates a new job. Expired queued/offered work can be replaced because it was never downloaded. Download-started, failed and uncertain jobs are never automatically replaced. Existing once-only download and device acknowledgement semantics remain unchanged. Historical records are retained. Status polling and reopening the panel never submit print work. An explicit print click cancels an in-flight read-only status request and takes priority; it is never silently dropped because a background poll is busy. In-flight print requests still exclude concurrent submissions.

A schema-v2 test must really reach confirmed status and retain its matching audit/content/revisions before it can qualify for the existing purchase-test window. The operator still explicitly checks the physical paper and supervises purchases. The legacy qualification path retains its firmware validation. The one-click path instead relies on the actual successful PNG delivery plus physical paper acceptance; it does not claim to have measured firmware. Routing, purchase-window duration and stop behavior are unchanged. Firmware/model documentation for hardware certification remains separate work in #485.

Validation: native transaction tests cover authority, stale/revoked credentials, disconnected/wrong endpoint, default-off gates, transaction retry, atomic audit failure, unknown commit, double clicks and expired/ambiguous delivery. Protocol tests cover actual one-shot PNG delivery for the new truthful record. Purchase tests reject missing paper checks and mismatched evidence. Playwright covers the actual mobile component with one click, no input/upload fields, progress, reopen and failure recovery.

Deployment/live verification must confirm the release and visible new controls read-only. A real print is a separately authorized onsite action; no physical success is claimed by CI.

## Empty DELETE transport and unresolved delivery (#585)

Next's Node request adapter represents DELETE requests with a ReadableStream even
when their HTTP body is empty. The synthetic and purchase HTTP adapters validate
that the stream contains zero bytes, rather than rejecting its presence. The
check rejects nonzero or malformed Content-Length, actual payload bytes, excessive
empty chunks, consumed streams and streams that do not end within two seconds.
Authentication, scoped job-token validation and duplicate-download exclusion are
unchanged. Tests exercise the actual NextRequestAdapter, including `code=200+OK`.

Read-only test status projects an expired `download_started` job as `unknown`,
not as an indefinitely pending transfer or a safely retryable expired offer. It
never infers successful printing or makes a new job automatically. Previously
rejected acknowledgements are not reconstructed as stored confirmation by this
change; physical output still needs operator inspection.

Production evidence (24 October 2026, Europe/Copenhagen): Esm-02 GET received
HTTP 200 at 23:14:40, followed by DELETE with `code=200+OK` at 23:14:49–50 that
received HTTP 400. Initial HTTP 401 challenges were followed by authenticated
requests; the rejection occurred after that challenge. No credentials or delivery
tokens are included here. This evidence confirms a rejected printer success
report, not the physical appearance of the paper.
