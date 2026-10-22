# Scoped QR change history (#439 / #389)

Implementation candidate. `createQrHistoryService(db, {getCode}).read(scope, id)`
returns `{rows, truncated, discarded}`. `getCode` is mandatory and must read the
current stored code under the verified native scope; the HTTP caller independently
checks the current `orderfly.qr_codes:view` permission before invoking this helper.
The helper validates brand, actor, code and location boundaries, calls `getCode`
before any audit query, and calls it again before returning the result to detect
a code moved outside the permitted locations while its audit page was loading.
It never accepts a client-selected collection/path. A brand-wide code requires
brand-wide scope; an empty location array grants nothing.

The only audit query is
`brands/{brandId}/qrCodes/{codeId}/audit.orderBy('at','desc').limit(51)`.
At most 50 rows are returned; the 51st makes `truncated:true`. This is explicitly
the latest bounded page, not a complete lifetime history or pagination feature.
Invalid or out-of-scope rows are omitted and counted in `discarded`, so incomplete data
is disclosed. Rows use the audit document ID as their stable key, not timestamp.

Row projection: `{id, at, action, actorId, revision, previousRevision, changes?}`.
New writer entries have immutable `before`/`after` whitelist snapshots; creation,
duplication and bulk creation have `before:null`, since a new code has no prior
state. The helper compares only name, destination, location, campaign, tags,
expiry, status and recognized design settings. It never returns raw audit data,
unrelated fields, secret values, public index contents or arbitrary nested data.
Actor is an internal ID, not a fetched employee profile or contact detail.

Snapshot ID/brand/location must match the code and permitted scope. For a
location-scoped viewer, either snapshot outside the allowed locations suppresses
the entire row, including actor/time. Legacy or malformed snapshots without
positive scope evidence are also suppressed for that viewer. Cross-brand/code
snapshots are discarded for everyone. For a brand-wide viewer, a legacy audit
header without snapshots remains visible with `changes` omitted; malformed
detail values remain unknown rather than invented. A valid snapshot pair
with no changed projected fields has `changes:[]`; this differs from unknown.
Historical details are never reconstructed from the current destination/style.

`QrHistory({codes:[{id,name}], load:(id)=>Promise<result>})` requires explicit code
selection and never automatically fetches the first code. It shows busy, empty,
error, truncated and discarded states, before/after values as safe React text,
and Europe/Copenhagen timestamps. Changing selection clears previous rows; a
late response for an earlier selection cannot replace the current code. Catalogue
scope removal and unmount invalidate outstanding responses. Errors never render
raw backend exception details. The parent supplies an authorized catalogue and
owns API/native guard and workspace integration.

Verification: actual helper tests cover mandatory guard/read ordering, exact
path/cap/order, cross-brand/location and missing records, post-query location
movement, legacy/malformed detail handling, before/after differences, unknown
detail redaction and secret-field exclusion. Actual component Chromium tests
cover explicit selection at390/1440px, Danish date, denial/retry, stale result,
empty/truncated/invalid-row notices, safe text and long mobile values. These are
synthetic isolated tests, not Firestore emulator, authenticated production QA or
deployment evidence. Writer snapshots, HTTP routing, CI registration and final
release review are separately coordinated. No production data is read or written.
