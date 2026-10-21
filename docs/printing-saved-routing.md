# Saved routing contract (#345, first slice of #342)

The superadmin printer editor needs durable routing before its UI can save rules.
This slice adds `GET` and `PUT /api/superadmin/printers/routing`; it does not add the
editor or connect routing to orders. #342 remains open for the UI and preview.
Printer administration remains under Superadmin > System only. There is no
merchant route, navigation or delegated catalog-only access for these endpoints.

Both the HTTP boundary and service require the trusted platform-superuser
session. Each native transaction additionally rereads the access policy and
requires its current principal still be a superuser, plus current native
`orderfly.catalog:view` or `orderfly.catalog:edit` authorization for the supplied
brand and location. Revocation and native ownership changes are checked on every
retry. Reads use an SDK read-only transaction and return `no-store`/`Vary: Cookie`.

GET accepts exactly `brandId` and `locationId`. PUT accepts exactly those fields,
`expectedRevision` and `rules`. The canonical planner's exported
`printerRoutingRuleSchema` validates the same product/category/all, include/exclude
and Pickup/Delivery rule shape used by `previewPrinterRouting`; its behavior is
unchanged. Rules carry their native brand/location and an explicit printer ID.
Bounds are 256 rules, 16 distinct printers and 32,768 JSON code units, with raw
collection/string/depth/node limits before schema work. HTTP PUT independently
limits streamed bytes to 32,768, checks same-origin JSON and rejects query strings.

The location-owned record is:

`locations/{locationId}/printerRouting/original`

It has strict schema version 1, ID `original`, brand/location, revision, rules,
`deletedAt: null` and opaque server timestamp metadata. Missing routing returns
revision `null`, empty rules/printers and `referencesVerified: true`. It never
falls back to all printers.
PUT with expected revision 0 creates only an absent document. Updates require the
exact current revision and increment it, preserving creation time. Invalid stored
identity/schema/scope/tombstones cannot be overwritten as an absent record.
`audit/{revision}` is created atomically with the routing document and records the
actor principal hash, before/after rules and server timestamp. A failed audit or
commit leaves both unchanged. There are only two writes per successful save and
all native/catalog reads happen before either write.

Saving a replacement and native dispatch preparation require strict current
references. Every referenced printer is read from the current location, checked with the
canonical printer storage/configuration schema, and must have the exact native
brand/location. Disabled printers may be saved as drafts. Saving routing does not
activate printers or enable print intent. Every product must be active, native to
the brand and applicable to the location; canonical synthetic-product exclusions
are retained. For products only, omitted `locationIds` and an explicit empty list
mean global applicability, matching the storefront/catalog/checkout contracts.
Only an absent value is normalized: null, non-arrays, malformed/oversized lists,
duplicates and lists naming another location still reject. Categories always
require an explicit valid nonempty location list; this compatibility never
changes their native membership requirement. Every referenced category, including products' categories, must be
active and explicitly include the native location in its bounded location list.
The actual Category model uses location membership as ownership, so a stale
legacy `brandId` is not treated as authority. Missing, deleted, corrupt or foreign
references reject saves and native preparation. A user can replace rules with a
valid new set at the correct revision if an old referenced catalog item was removed.

Management GET first reauthorizes the current superuser/catalog-view grant, native
brand/location ownership and the strict, bounded location-owned saved document.
These checks remain outside reference recovery: corrupt saved scope/schema,
duplicate rule identities, tombstones or revoked access still reject the read.
Only an expected `reference_unverified` 409 while validating the saved rules
returns recoverable management state: the owned stored rules and actual revision,
`printers: []`, `referencesVerified: false` and `dispatchAuthorized: false`. No
partial printer snapshots, native foreign details or diagnostic cause are returned.
Provider failures remain unavailable errors. A successful current reference check
returns `referencesVerified: true`; successful PUT responses do too.

This structural management snapshot is not validated preview/intent input. A
client with `referencesVerified: false` must disable preview until rules have been
repaired and validated. PUT still verifies all replacement references in its own
revision-checked transaction, preserving the original rules in its atomic audit;
clearing rules or replacing stale references does not bypass concurrent revision
checks, write gates or rollback. #353 must update its strict management-response
schema and missing-selector recovery in its own dependent UI PR before release.
`prepareSavedPrinterRouting` retains its exact strict contract, without this flag
or fallback, and always rejects stale references on every native transaction attempt.

`prepareSavedPrinterRouting(context, {brandId, locationId})` exposes the same
native validation for a future trusted order integration. It runs in the caller's
Admin transaction, rereads all references each attempt, and returns frozen scope,
revision, rules and referenced printer configuration/revision snapshots. A caller
must separately authenticate its event/actor and rerun preparation on each retry.
The snapshot is not payment, write or commit proof. Every result explicitly has
`dispatchAuthorized: false`; it cannot authorize output or policy enablement.

Writes require the existing exact
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true` gate, which remains default OFF.
The API does not change `printIntentPolicies`, credentials, capabilities, printer
lifecycle, jobs, ledgers or order/payment records. No production data writes,
rules/index changes, device connections or Wolt changes were performed.

Validation uses production services/routes/native authorization with only session
and Admin I/O isolated. Run `npm run typecheck` and:

```
node --test tests/unit/printing-saved-routing.cjs tests/unit/printing-routing.cjs tests/unit/printing-intent-target-policy.cjs tests/unit/printing-catalog-projection.cjs
```

These tests cover successful audited draft saves/readback/clear, anonymous and
merchant rejection, current superuser/native scope, malformed/bounded inputs,
reference ownership, revisions/concurrent creates, transaction retries, rollback,
immutability and no secret/output fields. Review finding4339745805 was first
reproduced through exported HTTP GET returning 409 without a repair revision. New
GET-to-PUT tests cover inactive/deleted products/categories/printers, clear and
replacement repairs, concurrent revision conflict, preserved before-audit and
rollback, immutable stale snapshots, native revocation/retries, corrupt scope and
duplicate rejection, and provider/foreign-detail non-disclosure. The prior mixed
missing-printer assertion now explicitly separates recoverable management state
from unchanged strict native preparation rejection; no strict dispatch guard was removed. No browser flow changes in this API
slice; #342's subsequent UI must add browser tests. Root #309 alone serializes
fresh-main/current-head green CI and completed independent Codex review before
merge/deploy. Live acceptance of authenticated success, native rejection, stale
revision and default-OFF 503 requires a controlled authorized session/scenario;
missing access is QA blocked, never passed from fixtures or public smoke.

For the earliest single-printer pilot, this API alone is insufficient: the UI and
saved-rule preview, actual atomic order integration, isolated device credentials,
CloudPRNT authenticated poll/claim/download/ack, durable retry/unknown-result
handling and controlled activation/testprint still need delivery and verification.
Physical paper output, Danish characters, width/cut, failure recovery and Wolt
coexistence require the actual printer. Simulator success is separate evidence.


Review finding4339848189 was first reproduced through exported HTTP PUT rejecting
a canonical global product with omitted `locationIds`. The fix normalizes only
undefined product membership to an empty global list. New PUT-to-GET-to-native
preparation positives cover omitted and empty product lists, alongside strict
product/native/synthetic/category and malformed-membership rejection matrices.
The earlier stale-reference recovery and all original assertions remain intact.
