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
revision `null` and empty rules/printers. It never falls back to all printers.
PUT with expected revision 0 creates only an absent document. Updates require the
exact current revision and increment it, preserving creation time. Invalid stored
identity/schema/scope/tombstones cannot be overwritten as an absent record.
`audit/{revision}` is created atomically with the routing document and records the
actor principal hash, before/after rules and server timestamp. A failed audit or
commit leaves both unchanged. There are only two writes per successful save and
all native/catalog reads happen before either write.

Every referenced printer is read from the current location, checked with the
canonical printer storage/configuration schema, and must have the exact native
brand/location. Disabled printers may be saved as drafts. Saving routing does not
activate printers or enable print intent. Every product must be active, native to
the brand and applicable to the location; canonical synthetic-product exclusions
are retained. Every referenced category, including products' categories, must be
active and explicitly include the native location in its bounded location list.
The actual Category model uses location membership as ownership, so a stale
legacy `brandId` is not treated as authority. Missing, deleted, corrupt or foreign
references reject the complete operation. A user can replace rules with a valid
new set at the correct revision if an old referenced catalog item was removed.

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
immutability and no secret/output fields. No browser flow changes in this API
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
