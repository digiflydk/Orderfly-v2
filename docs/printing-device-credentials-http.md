# Superadmin printer credential write HTTP boundary (#368 / S1a)

`POST /api/superadmin/printers/device-credentials` is an authenticated administration
boundary over #364's `writePrinterDeviceCredential`. It is not CloudPRNT device
authentication, GET metadata, UI, activation or print output. No public printer
DTO changes. The service's native transaction, random generation, retry, audit and
revision logic are reused unchanged.

Platform-superuser session verification precedes all request inspection. The
handler requires the trusted canonical origin, rejects cross-site Fetch Metadata,
query parameters, URL userinfo and non-JSON content types, and bounds actual
streamed bytes to 8192 regardless of missing or misleading Content-Length. JSON
must be valid UTF-8. The strict body has operation (`issue`, `rotate`, `revoke`),
brandId, locationId, printerId, positive printerRevision and expected nonnegative
credentialRevision. Issue alone requires zero; rotate/revoke require positive,
non-exhausted revision. There is no client secret, actor, digest or stored record.

The service is called exactly once after the boundary validates. Its current
native platform-superuser/catalog policy, tenant ownership, canonical records,
write gate and CAS are authoritative inside every native write-transaction retry.
The HTTP layer does not perform a second credential transaction or generate any
secret. All configuration/output flags remain OFF; existing exact literal
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true` would be required by the service.

After the service confirms commit, issue returns 201 and rotate/revoke return
200. The handler reads own value descriptors, including the service's deliberately
nonenumerable secret, then validates exact same scope/printer revision and next
credential revision. Only these IDs/revisions, revoked, dispatchAuthorized:false,
activationAuthorized:false and (for issue/rotate only) the canonical one-time
43-character secret are explicitly projected. Revoke cannot return a secret.
Unexpected fields, digests, getters/proxies, mismatched scope/revisions or malformed
secret yield fixed `credentials_unavailable` 503 without plaintext.

Every handler response has `Cache-Control:no-store` and `Vary:Cookie`. Session
failures map to fixed unauthorized/forbidden responses. Known service codes map
only to their exact expected status; unknown native errors, commit uncertainty
and reflection failures become fixed safe 503 responses. No error text or result
is logged. Secrets are never accepted in URL/request, copied to audit, included
in generic errors or cached. A client can lose a successful one-time response;
this endpoint cannot retrieve/replay it. A future separate authenticated metadata
read plus explicit fresh-revision rotation is required for that recovery.

#364/PR365 is merged and deployed, including its fixed error mapping for secret-
generation failures. This existing HTTP branch is synchronized with current main
`88587bedba3ac42908b272e66d977ebfdd9c63c4`; the credential service is a main
dependency rather than a second feature diff. Release still requires own checks,
CI and completed independent review for the current branch commit. Root alone
serializes merge, deployment and live verification.
No production provisioning or live write acceptance is claimed. Read-only post-
deploy QA can verify session/CSRF/malformed boundaries only without mutating
production; controlled authenticated successful writes are a separate scenario.

Validation: `npm run typecheck` and
`node --test tests/unit/printing-device-credentials-http.cjs tests/unit/printing-device-credentials-service.cjs tests/unit/printing-device-auth.cjs tests/unit/printing-identity.cjs`.
Actual HTTP helper and route run with isolated session/service I/O. Eight new cases
cover issue/rotate/revoke, explicit one-time secret projection, auth-first poison
request, CSRF/content-type/UTF-8/streamed bounds, strict commands, service/CAS/gate
errors, unknown commit and malformed result rejection. One integration case runs
the real native service and real crypto with isolated Admin I/O, blocks commit,
proves no secret response before confirmation, then verifies the committed digest
matches the delivered secret and no plaintext exists in persisted/audit data.
Existing service tests retain rollback/retry/CAS coverage.

Planning: one task / one planned development sprint, nominal40 active minutes,
uncertainty30–55; actual active effort unmeasured. Implementation completion and
live acceptance are reported separately. Splitting original setup API into this
write boundary (S1a) and a separate safe-metadata read (S1b, #375 / PR377) revises the
provisional setup forecast3->4 and overall21->22. This is scope refinement, not a
calendar ETA or a claim of22 implemented issues. No environment, rules/index,
production data, hardware, firmware or Wolt settings changed.
