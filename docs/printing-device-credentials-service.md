# Native private printer credential provisioning (#364)

`writePrinterDeviceCredential` is a server-only service, with no HTTP route, UI,
CloudPRNT credential extraction or transport. It reuses #356 random 256-bit secret
and scope/revision-bound digest construction. The current record lives at
`locations/{locationId}/printers/{printerId}/deviceCredentials/current`, matching
#359's native identity verifier contract. Never return its result as a public
printer DTO. No consumer, activation or dispatch permission is introduced.

The established authenticated platform-superuser session is checked first. Every
write transaction then rereads the current policy, independently requires
`isSuperuser`, and reuses native `orderfly.catalog:edit` authorization. It reads
native brand, location, canonical nondeleted printer, current private credential
and the proposed audit revision before any write. This rereads grants, tenant
ownership and revisions on every SDK retry; a session boolean is not write
transaction authority. Active, pending and trialing canonical brands may prepare
identity during onboarding. Suspended, missing, malformed, deleted, inactive or
foreign scopes cannot. Disabled/paused/active printers keep their existing state.
Identity preparation is independent from future output policy and hardware proof.

The strict command contains operation (`issue`, `rotate`, `revoke`), native IDs,
expected `printerRevision` and expected `credentialRevision`. Issue requires zero
and absence of both current credential and first audit; resulting revision is one.
Rotate/revoke require the exact current positive credential revision and advance
it once, with immutable `deviceCredentialAudit/{revision}` in the same transaction.
The current schema is strict and scoped; corrupt, future-dated or inconsistent
revocation records reject. A configuration edit may invalidate an older bound
credential, so explicit rotation can replace a credential from an older printer
revision, binding the new digest to the current expected printer revision. A
credential from a future printer revision rejects. Rotation has no old-secret
grace period. Revoke retains the digest as private history and sets server
revocation time; repeated revoke rejects, and only explicit new rotation issues
a replacement secret. Neither operation changes public printer configuration,
printer revision, job history, queue, capability records or output flags.

For issue/rotate, one secret is generated per invocation outside the retried SDK
callback, with fixed requested scope and next credential revision. Every retry
must satisfy the original CAS. The callback returns metadata only. The secret is
attached as a nonenumerable, immutable server-only property only after the SDK
transaction promise confirms commit. JSON/object enumeration omits it. No secret
is written to database/audit, logged, accepted from callers or placed in a URL.
Audit includes actor and scoped revision/action metadata, never digest or secret.
Errors are fixed contextual messages rather than driver/private input text.
Secret-generation failures also map to `credentials_unavailable` (503) before
native I/O; generation remains outside the retried transaction callback. Revocation
does not generate a replacement secret or depend on the entropy provider.

There is deliberately no plaintext recovery or idempotent secret replay. If a
commit succeeds but its response is lost, the secret may be unavailable. Repeating
the old CAS must fail, not rotate twice or reveal a cached secret. A future
explicitly authenticated administration workflow must read current metadata and
request a new rotation with its new revision. That workflow and delivery endpoint
are separate work. A failed or unknown commit never returns the generated secret;
audit failure rolls back current record too. Deleted records cannot be resurrected.

Configuration writes still require the existing exact literal
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true`, which remains default OFF and was
not enabled. No production data, environment, secret, rules/index, hardware or
Wolt setting was changed. All dispatch and activation results stay false.

Validation: `npm run typecheck` and
`node --test tests/unit/printing-device-credentials-service.cjs tests/unit/printing-device-auth.cjs tests/unit/printing-domain.cjs tests/unit/printing-identity.cjs`.
The production service, real crypto and real native policy functions run with only
Admin I/O and session boundary isolated. Coverage includes success/rotation/revoke,
onboarding states, tenant and authorization rejection, malformed native records,
revision CAS/concurrency/replay, SDK retries reusing one transaction object and
one generated secret, rollback/audit errors and ambiguous commit outcome. No live
provisioning or physical printer success is claimed. The dedicated CI step is
exactly three lines after the existing private credential regression, with all
other workflow bytes and permissions preserved. Root alone serializes release.
