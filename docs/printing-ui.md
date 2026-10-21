# Superadmin printer pilot (#325, #318)

Printer administration is restricted to platform superusers at
`/superadmin/printers`. The server page explicitly requires `session.superuser`
and the superadmin navigation policy before loading any native catalog data.
Delegated catalog:view/create/edit roles cannot render the page. The merchant
page remains retired as not-found, with no merchant navigation entry.
The superadmin sidebar places Printere under System, not Commerce (#330).

The existing `/api/merchant/printers` URLs remain for compatibility. All six
administration HTTP operations retain `requirePlatformSuperuser` before parsing
or service access, plus existing native brand/location and transactional grant
checks. The UI never authorizes a write. Configuration writes and live output
remain default-off; there are no credentials, new backend contracts or production
data changes in this form work.

## Scope and configuration

The page loads selectors only through native `catalog:view`. It independently
loads native `catalog:create` and `catalog:edit` location metadata for form
controls, and projects only IDs/names. All three reads happen behind the
superuser gate; grants from unrelated features are never combined into selector
or write scope. The actor-keyed client clears state after a new server identity.

A selected brand/location loads a bounded20-row GET page, strict DTO validation,
and ID cursor pagination. Foreign, malformed and oversized pages fail closed.
Rows distinguish operational state from connectivity/output, which remain
unverified. Loading, empty, denied and unavailable states are explicit; raw
provider errors are never rendered.

The new form creates a disabled printer or edits an existing disabled printer.
POST sends `{ configuration }`; PATCH adds the expected revision. The exact
configuration fields are ID, native brand/location, name, manufacturer `star`,
model, transport, state `disabled` and paper width. Edit fixes ID/native scope.
mC-Print2 permits only HTTP/58mm. mC-Print3 uses existing supported configuration
choices; MQTT explicitly requires subsequent model/firmware verification.
Configuration does not prove a connected device or a physical printed receipt.

## Pending operations and recovery

Submit is guarded before the pending render. Native scope selectors, pagination,
overview refresh and competing edit controls cannot replace an open form;
Cancel is disabled during save. Create requires a validated completed page.
Opening either editor synchronously invalidates/aborts existing GETs, and reads
suspend throughout editing, including same-scope metadata updates. A stale read401
cannot interrupt a write that may already commit on the server.

Native write-grant revocation disables new submissions immediately. Prepared
input without an active request clears. An active save keeps its original form
and scope snapshot mounted until the response settles. Its validated success or
safe rejection/uncertain-outcome message survives revocation, so client abort
cannot silently hide a server commit. An uncertain or stale outcome blocks new
forms until deliberate refresh, even if the grant metadata is subsequently
restored. The API still reauthorizes the actual transaction.

Ordinary400 and explicit503 `writes_unavailable` retain input for retry. A403,
404,409, generic503, network error or malformed successful response requires
refresh before another attempt. Successful responses must match the submitted
configuration/native scope and exact expected revision. No raw provider text is
used. A401 clears input/rows and synchronously closes the read gate before editor
removal; automatic rerenders cannot reauthenticate and restore controls. Only
explicit `Opdater` or a fresh actor-keyed server context can initiate recovery.

## Verification and release

`printing-ui-page.cjs`, navigation and merchant portal tests verify platform
superuser-only rendering, native metadata projection, delegated-role denial,
retired merchant page and absent merchant navigation. Existing identity/route
tests prove all six HTTP superuser guards precede services; their checks remain
unchanged. Typecheck and affected read/write/lifecycle/queue/transaction tests
remain required after main synchronization.

`printing-ui-browser.cjs` bundles the actual superadmin components and production
CSS with synthetic selectors and intercepted fixture APIs. Fifteen Chromium cases
cover existing reads, desktop/mobile201 create+200 edit, exact credential-free
DTOs/revisions, unsupported native options with DOM+keyboard+submitted-body proof,
no overflow, pending controls,400/401/403/404/409/503, stale responses, explicit
session recovery, initial-read gates and GET401/write201-or-uncertain503 races.
The added revocation race keeps an actual pending request alive through metadata
removal, then verifies success or uncertainty and blocked retry until refresh.
Screenshots are retained as `printing-overview-*` and `printing-config-*` PNGs.
All fixture mutations are intercepted locally; none reach production.

Exact-current-head CI and independent Codex review precede the coordinator's
serialized merge/deploy. Current deployed SHA and read-only live login/retired
route/API boundaries require separate verification. Authenticated superadmin
success/delegated denial and controlled save/edit acceptance remain blocked until
safe access and an explicitly reversible scenario exist. Fixture success and
public smoke do not prove live authenticated writes. Physical printer pilot and
Wolt/hardware configuration remain separate and last.

## Superadmin table slice (#341)

`/superadmin/printers` remains under System and is still guarded by the platform
superuser check before native catalog reads. The overview now uses one row per
printer with activation date, brand, location, Active/Deactive status, last used,
total printers, printer name, model/transport/width and actions. Paused printers
are labelled `Deactive · På pause`, preserving their distinct backend state.
The wide semantic table scrolls inside its container on small screens.

Brand and location select the native authorized scope. Printer type is a server
model filter (`model=mc-print2|mc-print3`) applied before ID pagination, so a matching
printer after the first unfiltered page remains discoverable. The optional
`overview=true` list projection adds a scoped Firestore aggregation count of all
nondeleted printer records under the selected native location. This count ignores
the model filter and continuation cursor and is never inferred from page length.
The detail DTO and callers omitting `overview` retain their existing shape. Invalid
count data and filtered foreign/malformed rows fail closed; aggregation/index
outages use the existing generic unavailable state. No indexes or production
records are created or changed by this slice.

Activation and confirmed-use timestamps do not exist in the current authoritative
read contract. Both cells explicitly show `Ikke registreret`; missing historical
metadata is not proof of `Aldrig`. Follow-up #344 owns authoritative lifecycle and
confirmed-ack history projection, with bounded reads and no invented dates.
Therefore this slice does not complete all of #341's metadata acceptance.

Edit preserves the existing disabled-only, revisioned configuration form.
Deactivate and Delete require an explicit confirmation and use the existing
same-origin lifecycle POST with captured native scope and exact revision. Delete
has its own current native `catalog:delete` selector grant, distinct from edit.
Existing server-side authorization, write feature gate, atomic audit, capability
invalidation and soft-delete history remain unchanged. No resume or activation
control is added. Pending mutations lock filters, cancellation and duplicate
submits; changed native grants cannot abort an accepted request. Conflict,
permission, missing or unknown outcomes require a deliberate refresh. A precise
`writes_unavailable` response permits retry while making the default-off gate
visible. Session loss clears rows and mutation controls.

Validation: `npm run typecheck`; existing read/page/lifecycle/resume tests; actual
React/CSS browser regression file `tests/unit/printing-ui-browser.cjs` now includes
table columns, scope total versus type filtering, exact lifecycle commands,
confirmation, independent delete permission, pending locks, conflict/default-off/
unknown outcomes, session expiry and native grant revocation. Existing stale-read,
create/edit and tenant isolation cases are retained. Synthetic browser fixtures
are not authenticated live acceptance or a physical print. Root #309 owns fresh
main/current-head CI and independent Codex review, serial deployment and read-only
live checks; authenticated superadmin/merchant QA and #344 remain open.
