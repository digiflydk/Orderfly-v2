# Native print-intent target policy (#335)

`preparePrintIntentTargetPolicy` is an **unwired server preparation function**.
It adds no API, UI, configuration write, order mutation, outbox call or dispatch.
The caller must already authenticate its event or actor, provide its real current
Admin transaction context, and rerun preparation inside every retry. Context and
the returned DTO are not payment, write, order-eligibility or commit authority.
The later #303 adapter must combine these checks with native order/catalog
provenance and one atomic order/outbox plan before any production integration.

## Explicit, default-off storage contract

The single location policy document is
`locations/{locationId}/printIntentPolicies/original`. **No such document is
created by this change.** Its absence returns `enabled: false`, no targets and
`policyRevision: null`. There is no scan, all-printer fallback or environment
variable enabling it. The distinct existing configuration-write gate and the
physical-output gate remain unchanged and off. This policy governs future intent
selection only, never dispatch or physical printing.

The strict proposed version-one document contains:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `id` | Exactly `1`, exactly `original` |
| `brandId`, `locationId` | Native requested scope, bounded canonical IDs |
| `revision` | Positive safe integer, included in the preparation |
| `deletedAt` | Exactly null |
| `enabled` | Boolean |
| `targets` | At most 16 explicit printers, no duplicate printer IDs |
| Each target | `printerId`, positive safe `printerRevision`, `kinds` |
| `kinds` | One or both of `kitchen`, `packing`, without duplicates |

OFF requires an empty target list. ON requires at least one target. Contradictory,
foreign, legacy, deleted, malformed or unknown fields reject the entire policy.
An ON document is deliberately tied to each selected printer's **exact current
configuration revision**. Configuration changes invalidate that selection until
a future authorized configuration workflow explicitly reviews the new revision.
That write/review workflow is not implemented here. Product/category routing
rules and receipt projection remain separate; these explicit candidates are
neither automatic routing nor proof that a line should print.

## Native reads and failure behavior

The function uses only the supplied caller-owned transaction. It reads native
brand, native location and the single policy document, verifies snapshot IDs,
optional native IDs, brand ownership and absent/null deletion timestamps plus
absent/false recognized deletion booleans. These checks also run when the policy
is absent or OFF. Only an explicit valid ON policy reads its selected native
`locations/{locationId}/printers/{printerId}` documents, at most sixteen reads.
No independent transaction, collection scan, direct `.get()` or database writes
are performed.

Each printer must pass the existing canonical stored-record/configuration
validator, be nondeleted, match its native ID and brand/location, and have the
reviewed revision. Active and paused accept intent candidates. Disabled, missing,
foreign, unsupported, corrupt or changed printers reject the whole preparation.
There is no partial fanout. Existing device capability verification, queue
review, production flags and lifecycle dispatch gates are never bypassed.

Raw scope, policy and printer configuration values receive bounded data-property
snapshots before schema refinements: strings at most 400 code units, arrays at
most 16 entries, at most 12 fields per object, depth five and 256 nodes.
Accessors, sparse arrays and non-data shapes reject without invoking getters.
Policy-specific schema limits are smaller where appropriate. The existing opaque
printer timestamp metadata is validated only as part of the canonical stored
record and omitted from output. This boundary is not a sandbox against privileged
JavaScript Proxy traps or malicious code with Admin database credentials.

Output is a frozen credential-free copy of native configurations, reviewed
revisions and kinds. `dispatchAuthorized` is **always false**, both globally and
per target. Copies cannot mutate input or siblings. Native read failures become
generic `policy_unavailable`; validation failures have fixed safe codes. A
prepared DTO has no expiry/freshness guarantee outside the current attempt:
never retain it across retries or treat it as a permit to mutate data.

## Canonical brand lifecycle (#363)

Only native `Brand.status` values `active` and `trialing` can expose explicitly
enabled policy targets. `pending`, `suspended`, missing, malformed and unknown
status values produce effective OFF: `enabled: false`, no targets, and the valid
saved policy revision is retained. No policy or printer record is changed. This
uses the canonical brand field rather than legacy `isActive`; it does not add a
blanket restriction to superadmin disabled-printer or saved-routing draft CRUD.

Native scope, stored policy schema/revision, enabled/target consistency, duplicate
identities and every selected native printer/revision are still validated before
lifecycle OFF. Suspension does not hide corrupt or stale policy configuration.
Each caller-owned transaction attempt rereads the brand status; an earlier
enabled result cannot survive suspension across a Firestore retry.

The actual #349 integration treats this as print eligibility, preserving ordinary
financial settlement for money already received. An ineligible preflight retrieves
no extra Stripe print proof. Suspension after preflight or during a retry creates
no manifest, jobs or ledgers, while settlement commits once. Reactivation after
an OFF preflight without a trusted proof still aborts the whole operation. Paid
replay while suspended preserves existing original manifests/jobs/ledgers, and
reactivation cannot backfill a Paid order that has no original manifest. Global
OFF still adds zero print-related I/O. These are isolated integration tests, not
production writes, payment-provider or physical-printer verification.

## Verification and release

Run `npm run typecheck` and:

```
node --test tests/unit/printing-intent-target-policy.cjs tests/unit/printing-configuration.cjs tests/unit/printing-domain.cjs
```

The dedicated suite runs the actual production module with only Admin I/O
isolated. It covers default OFF, native ownership/deletion even when OFF,
explicit active/paused fanout, current revisions, unsupported and missing targets,
strict document identities, bounds before traversal, zero writes, immutable
copies, and retry changes. No new user flow requires browser fixtures. Shared CI
runs the dedicated regression alongside existing printing checks.

Root coordinates serial release only after fresh-main current-head CI and actual
independent Codex review complete without findings/holds. Applicable deployed
release/health/read-only QA remains separate. Fixture success is not authenticated
production invocation or physical print proof. All printer administration remains
platform-superadmin-only, existing flags/output remain off, and no production
data/rules/index, credentials, hardware or Wolt configuration changes are made.
