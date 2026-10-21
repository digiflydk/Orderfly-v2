# Private device credential candidate contract (#356)

This independent pilot prerequisite adds a server-only cryptographic draft and
comparison helper. It does not authenticate a device, persist credentials, expose
an endpoint or authorize print output. Both positive and negative comparisons
explicitly return `authenticationAuthorized: false` and `dispatchAuthorized: false`.
A caller-supplied record or expected scope is untrusted even when the digest matches.

`createPrinterDeviceCredentialDraft` generates 32 cryptographically random bytes,
encoded as a canonical 43-character base64url secret. Its frozen private record
contains schema version 1, exact brand/location/printer IDs, positive safe integer
printer and credential revisions, a SHA-256 digest, server issuance milliseconds
and `revokedAt: null`. The framed digest binds all five scope/revision fields to
the secret. Only the digest belongs in a future private persisted record. The
one-time secret is a non-enumerable property to exclude it from ordinary object
logging and JSON serialization. Extracted secrets remain confidential: never log
them, send them in public DTOs, include them in URLs or place them in audit records.
No record from this module is a public printer DTO.

`comparePrinterDeviceCredentialCandidates` bounds and validates strict plain
records before hashing, rejects accessors/unknown fields and malformed or
noncanonical secrets, and uses `timingSafeEqual` on fixed 32-byte digests. It
rejects missing/foreign scope, mismatched current revisions, future/invalid issuance,
any non-null revocation, and invalid schema/digest. A matching digest proves only
that the supplied candidates agree. There is no exported identity/capability,
process-local authority registry or native database read in this slice.

Rotation must atomically replace the authoritative current record with a newly
generated secret and monotonically incremented credential revision; there is no
old-secret grace period in this contract. Old revisions and old secrets fail
against the replacement. A non-null `revokedAt` rejects all credentials. This
module deliberately cannot authorize rotation, clear revocation, enforce revision
monotonicity across database history or prevent a caller fabricating an old DTO.
Those are requirements for the dependent native provisioning/authentication service.

Before accepting any real poll, claim, download, acknowledgment or retry, that
service must obtain the authoritative current record and reread the actual printer,
brand/location ownership, current printer revision, credential revision, revocation
and applicable activation/dispatch policy. It must resolve races atomically with
the relevant operation and use a separately authenticated superadmin provisioning
and rotation path. Never trust MAC addresses, UID, supplied printer IDs, an old
snapshot or a positive candidate comparison as native identity. Credential storage
must remain private and inaccessible to browser clients and device correlation IDs
must not be treated as credentials.

No CloudPRNT credential/header mechanism is asserted or implemented here. Selecting
and verifying the real transport mechanism against official Star documentation
and the exact printer model/firmware is dependent work. Native provisioning and
rotation, authenticated durable endpoints, immutable bon payload, claim leases,
download/ack/retry, controlled activation/testprint and physical pilot remain
required. This helper cannot establish connectivity or physical readiness.

Run `npm run typecheck` and `node --test tests/unit/printing-device-auth.cjs`.
Production crypto is exercised directly with only the server-only module marker
isolated. Tests cover random-secret generation, digest-only private data, all scope
and revision changes, digest transplant rejection, rotation/revocation, every secret
character mutation, malformed/bounded data and accessor rejection. Root-authorized
CI adds exactly one dedicated regression step; permissions and other gates stay
unchanged. Root alone serializes current-head CI, completed independent Codex review,
merge/deploy and applicable live QA. No runtime callsites change, so live endpoint
authentication remains unimplemented and cannot be marked passed from these tests.
All configuration, print-intent and output flags remain OFF; no production records,
secrets, rules/indexes, printer settings or Wolt operations were changed.
