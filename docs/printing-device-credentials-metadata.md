# Safe native credential metadata (#375 / S1b)

`readPrinterCredentialMetadata` and
`GET /api/superadmin/printers/device-credentials` expose private administration
metadata, not a device credential or output capability. They reuse the single
canonical `credentialSchema` exported by #364; its validator and write-service
behavior are unchanged. The existing #368 POST helper/export remains unchanged.
#344 continues to own activation and confirmed-print dates; these are distinct.

Both service and handler require the established platform-superuser session
before input/query inspection. The service runs one native SDK transaction with
`readOnly:true`. Every attempt rereads current policy and requires `isSuperuser`
and existing native `orderfly.catalog:edit`, the permission for private credential
administration. Native brand/location ownership and canonical active/pending/
trialing brand lifecycle are validated before reading a private printer. Suspended,
deleted, inactive and foreign native scopes reject. Only after a strict canonical
nondeleted printer with matching native identity and current revision is validated
does the service read `deviceCredentials/current`. This staged frontier repeats
on a reused transaction retry; a cached session/DTO grants no native read access.

The strict safe result contains brandId, locationId, printerId, printerRevision
(the current canonical printer revision), credentialRevision and state, plus
`dispatchAuthorized:false` and `activationAuthorized:false`. Missing private
record yields revision0/state missing. Existing records use the canonical strict
schema, exact scope and server-time checks. Credential printer revision greater
than current, future issue/revocation time, invalid chronology, corrupt schema or
foreign identity rejects with a fixed safe unavailable error. `revoked` takes
precedence if revokedAt exists; otherwise an older bound printer revision yields
`stale`, and an exact printer revision yields `current`. No timestamps, digest,
private record, secret, audit or customer data is returned. No writes are possible.

Missing revision0 supports a later explicit issue operation; reading the current
revision after a lost one-time POST response supports a later explicit rotation.
It never recovers/replays plaintext. Metadata itself cannot authorize provisioning,
activation, dispatch or a subsequent operation; that operation reauthorizes current
native state in its own transaction. No write flag is enabled or needed for this
read. All output flags remain OFF.

GET accepts exactly brandId/locationId/printerId once each. Query bytes are bounded
to1024, IDs to128 canonical ASCII characters; unknown/duplicate/missing fields,
userinfo, non-GET method and any request body reject before native service I/O.
Responses explicitly project validated same-scope safe metadata, require zero
revision iff missing, and always use `Cache-Control:no-store`, `Vary:Cookie`.
Known identity/native error codes map only to fixed expected statuses; unexpected
errors/result validation failure return fixed credentials_unavailable503 without
private text. No secret, digest or private record is logged or placed in URLs; the three
query scope identifiers are identifiers only, never authentication.

The existing isolated branch has been reconciled with released #365 on main
`88587bed` and the stable #368 POST candidate `c8c4e3a6`. The credential service's
reviewed generation-error handling is preserved; its sole metadata change is the
export of the existing schema. POST helper/export behavior and source remain
unchanged, apart from adding the independent GET export. Release waits until
#369 is actually on main, then requires a fresh synchronization, own checks and
independent review of that current commit. Root alone serializes workflow slots,
merge, deploy and applicable read-only live QA. No live successful native metadata
scenario is inferred from fixtures or anonymous boundary checks.

Validation: `npm run typecheck`; actual native/HTTP tests in
`tests/unit/printing-device-credentials-metadata.cjs` plus existing credential
service/POST/crypto/native-verifier/identity/domain regressions. New cases run the
actual service/handler with only Admin/session I/O isolated: four states, exact safe
keys, native lifecycle/policy/scope before private paths, canonical printer before
credential, corruption/future revisions/times, rotation/revocation/reassignment
on reused SDK retry, strict GET input, auth-first poison query and no writes or
private/error leakage. The SDK fixture enforces readOnly and fails on any write.

Planning: one task / one planned development sprint nominal45active minutes,
range35–60, actual active effort unmeasured. This is the already forecast S1b
read split, so the provisional22-slice budget does not change. Implementation and
live acceptance are separate counters. No UI, provisioning, CloudPRNT transport,
activation, physical printer/FW/Wolt changes or production/environment/secrets/
rules/index writes are included. Shared workflow additions/publication require
root's serialized slot grant.
