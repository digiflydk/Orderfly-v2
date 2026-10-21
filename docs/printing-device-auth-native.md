# Native device identity snapshot (#359)

`verifyNativePrinterDevice` composes the reviewed #356 crypto comparison with
authoritative native records inside a trusted caller's current Admin transaction.
It is read-only. No endpoint consumes its result, and the returned DTO is not a
capability, transaction freshness guarantee, commit proof or dispatch permission.

The only request fields are bounded `brandId`, `locationId`, `printerId` and the
canonical one-time secret. No stored credential, revision, MAC, UID or caller
identity can be supplied as authority. Validation precedes all native paths.
The exact four successful-path reads use the same caller-owned
`NativeTransactionContext`, in two ownership-gated stages:

1. `brands/{brandId}`.
2. `locations/{locationId}`, whose native `brandId` must match.
3. `locations/{locationId}/printers/{printerId}`.
4. `locations/{locationId}/printers/{printerId}/deviceCredentials/current`.

The first stage reads and validates native brand lifecycle/deletion and location
ownership. Only after `location.brandId` matches the requested native brand does
the second stage construct/read printer and private credential paths. A foreign,
missing, deleted or suspended scope therefore never loads another tenant's printer
or credential, and cannot expose whether those private records exist or fail.
All four reads still belong to the same current transaction; no cached ownership
proof is accepted, including on a reused SDK transaction retry.

`current` is the canonical private credential document identity for subsequent
provisioning work. Its contents are exactly the #356 digest-only record, with no
secret or public DTO fields added. This change neither creates that record nor
changes its database access rules. The service validates native snapshot IDs,
scope ownership, deletion/inactive/test markers, strict canonical stored printer
configuration and current printer revision. It obtains the current credential
revision only from the private record, and reuses #356 for strict schema, digest,
scope, current revisions and revocation checks. Missing, foreign, stale, revoked,
corrupt and unknown credentials share the generic `device_unverified` error.
External/Admin errors become `device_unavailable`; request errors are generic.
No error or returned snapshot includes the secret, digest, raw record or headers.

The native brand's canonical `status` is required: `suspended`, missing, unknown
or malformed values reject even if legacy `isActive` is true. `active`, `pending`
and `trialing` may verify identity for onboarding/status only; none grants output.
This matches the Brand lifecycle enum used by superadmin brand management, rather
than substituting the legacy activity flag for suspension. Suspension is reread
on each operation/retry alongside the other current scope fields.

Disabled, paused and active nondeleted printers can verify identity, allowing
controlled onboarding/status before activation. The result reports the current
state and revisions but always includes `dispatchAuthorized: false`,
`capabilityAuthorized: false` and `physicalCompatibilityVerified: false`. A known
configuration transport/model does not prove device firmware, token support,
network connectivity or physical compatibility. No native capability record is
invented. Each future job operation must separately reread current lifecycle,
actual capability and controlled pilot/output policy in its own transaction.

Call this function again within every operation and every SDK retry callback.
Firestore may reuse the same transaction object; no identity/context cache is
kept. Credential rotation/revocation, native reassignment and printer revision
changes are therefore reread. A previously returned DTO remains an old snapshot
and cannot authorize the next operation. A trusted native context is server-side
plumbing, not an input accepted from a browser/device. This helper does not prove
that its caller eventually committed, or prevent a caller retaining an obsolete
snapshot; no production operation accepts a snapshot instead of fresh verification.

Provisioning/rotation/revocation writes, authenticated superadmin setup, real
CloudPRNT credential extraction, poll/claim/download/ack/retry, capability/policy
enforcement and activation/testprint remain dependent work. No CloudPRNT header
or firmware compatibility is asserted. Physical printer output is unverified.
Configuration, print-intent and output flags remain OFF. No production records,
credentials, secrets, rules/indexes, devices or Wolt settings were changed.

Run `npm run typecheck` and
`node --test tests/unit/printing-device-auth-native.cjs tests/unit/printing-device-auth.cjs`.
Tests execute the production native helper and real #356 crypto, isolating only
Admin I/O. They cover all three onboarding states, exact four paths/no writes,
scope/current schema/revision, rotation/revocation/reused SDK retries, bounds,
reassignment, canonical brand suspension/onboarding states, malformed/proxy/accessor
rejection and secret-free generic errors. The suspension regression first failed
on the previous implementation with `Missing expected rejection`, then passed
after the canonical status check. Original assertions remain in place.
Root authorized one three-line CI step immediately after #356's existing step;
all other workflow bytes/permissions stay unchanged. Current-head CI and completed
independent Codex review precede root-only serialized merge/deploy and applicable
read-only live QA. No authenticated endpoint/live-device success is claimed.

The cross-tenant read-order P1 found during #370 review was first reproduced by
actual native-service regressions: rejected scope still read both private paths,
and a foreign credential provider failure changed the generic error to unavailable.
The two-stage fix retains all positive four-path and revision/rotation/revocation
checks, while new negative assertions require only brand/location reads. Existing
retry read counts were tightened to this smaller rejection boundary, with explicit
last-two-path assertions, rather than weakening lifecycle or credential checks.
