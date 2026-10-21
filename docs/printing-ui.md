# Printer overview (P4.1a, #310)

`/merchant/printers` is a read-only merchant workspace. The merchant dashboard
and shared sidebar expose it only with `orderfly.catalog:view` (or a superuser).
The page independently checks the session/navigation policy and requests
`nativeCatalog('orderfly.catalog:view')`. It does not reuse the union of scopes
from unrelated features. Only brand/location IDs and display names reach the
client. Native catalog and the existing read API both validate stored location
ownership; the browser selection is not an authorization decision.

After the user chooses one brand and one location, the overview calls
`GET /api/merchant/printers?brandId=…&locationId=…&limit=20`. Reads use the current
same-origin session and `cache: no-store`. There are no mutations or new backend
read semantics. Pagination follows the API's bounded ID cursor, replaces the
current page, and offers return to the first page. Refresh returns to the first
page. Brand/location changes reset pagination and clear the previous display
immediately. Aborted/late requests cannot replace a new scope's data. Foreign,
malformed or oversized response pages are rejected before displaying any row.

The cards show name, operational state, model, configured transport, paper width
and revision. **Operational state is not proof of connectivity or output.** The
read API has no verified connection-status DTO, so the overview explicitly shows
`Ikke verificeret` and explains that it cannot establish online state or a printed
receipt. Transport is configuration, not verified firmware capability. No testprint,
queue receipt, resume, configuration edit, credentials or output activation is
included. All feature gates remain unchanged.

Loading, no authorized locations, no selected scope, empty successful page,
expired session, forbidden response and unavailable/malformed response each have
an explicit state. Raw provider errors and payloads are never displayed.

## Verification and release

- `node --test tests/unit/printing-ui-page.cjs tests/unit/access-navigation.cjs tests/unit/merchant-admin-portal.cjs`
  exercises actual page rendering, permission denial, native catalog permission,
  selector projection and unavailable/forbidden handling.
- `node --test tests/unit/printing-ui-browser.cjs` bundles the actual client and
  production CSS, with synthetic authorized selectors/API responses. It verifies
  desktop and 375px mobile rendering, no horizontal overflow, scoped GET and
  pagination, status separation, loading/errors/retry, empty/malformed/foreign
  pages and late response protection. Screenshots are written under `test-results`.
  These are fixture browser tests, not a real authenticated production session.
- `npm run typecheck`; run existing printing read/navigation regressions.
- CI runs the server/page tests and the Chromium browser test. Exact-head CI and
  independent Codex review are required before the coordinator serializes merge
  and deploy under AGENTS.md. Public release smoke does not prove authenticated
  UI acceptance. After verifying the deployed commit, check the live
  `/merchant/printers` login boundary read-only. Success/forbidden scope UI QA
  remains blocked until a safe authorized session is available. No unattended
  production data writes are required. Physical printer QA remains separate.

## Disabled configuration forms (P4.2a, #318)

The overview can prepare a new **disabled** configuration or edit an existing
**disabled** configuration. The page still selects locations exclusively through
`catalog:view`. It separately resolves `nativeCatalog('orderfly.catalog:create')`
and `nativeCatalog('orderfly.catalog:edit')` for write affordances, projecting only
native brand/location IDs. A session permission name alone never grants a
location; create/edit grants are not combined with each other or with selectors.
The existing POST/PATCH API remains the authority and reauthorizes in its write
transaction. Actor-keyed page identity and a401 response clear prepared input;401 also removes prior overview rows.

The form sends only the existing `{ configuration }` or
`{ configuration, revision }` envelope. Configuration fields are ID, native scope,
name, manufacturer `star`, model, transport, state `disabled` and paper width.
Edit keeps ID/native scope immutable and carries the displayed revision.
mC-Print2 restricts input to HTTP and58mm; mC-Print3 permits the existing
configuration choices. MQTT selection explicitly requires later model/firmware
verification and does not certify device support. Credentials, network identity,
capability evidence, lifecycle changes and actual output are absent.

Duplicate submit events are guarded before the pending render. Cancel is disabled
while saving; native scope selectors, overview refresh and other edit buttons
cannot replace an open form and race an in-flight server transaction. Cancel
before saving to switch scope. Authoritative permission revocation clears the
editor; an actor-keyed server context change still unmounts and clears it. Ordinary400 and explicit503 `writes_unavailable` responses retain input, use
safe messages and permit retry; the latter explains that writes may be switched
off. Other503 outcomes are uncertain and require refresh, since the server
transaction may have committed. A403/404/409 or uncertain outcome requires an
overview refresh before retry, rather than replaying a stale revision. Raw
provider detail is never shown. Successful responses must match the exact scope,
configuration and expected next revision before showing success. Aborted/late
responses cannot change a new scope's form, success message or session state.
Changing scope, session or revoking write metadata unmounts prepared input.

`printing-ui-page.cjs` verifies the independent native create/edit scopes and
revoked writes with continuing view access. `printing-ui-browser.cjs` additionally
executes actual React forms with intercepted fixture API calls:201 create and200
revisioned edit at desktop/mobile widths, exact credential-free bodies,
unsupported choices, pending submit,400/401/403/404/409/503 handling, view-only
and disabled-state affordances, revoked metadata, late201/401 server-context and scope changes, foreign/wrong-revision success rejection, and initial-load gating and an obsolete GET401 racing either a successful201 or uncertain503 write.
Screenshots use `printing-config-*.png`. Fixture writes never reach production.

The configuration-write flag remains default-off. Live read-only login checks
can verify the deployed boundary; authenticated save/edit acceptance remains
blocked without safe access and an explicitly controlled reversible scenario.
Synthetic201/200 results do not establish live write or hardware acceptance.

The mC-Print2 unsupported-option browser assertions inspect the actual native
option `disabled` property and exercise keyboard navigation to the last enabled
choice, then verify the exact submitted HTTP/58mm DTO. Playwright's generic
form-control disabled matcher does not establish native option disabledness.
The stronger interaction check runs at both desktop and mobile fixture sizes.

Overview reads cannot run concurrently with an editor/save. Create is offered
only after a validated successful page; opening either editor synchronously
invalidates the read generation and aborts any existing GET before React effects
run. The read effect suspends while editing, including same-scope metadata
refreshes, and both pagination controls are locked. Closing/settling then refreshing
starts a new GET. An old read401 cannot close the form and abort a transaction
that may commit. The fixture holds a background GET401 alongside a write and
verifies both201 success and uncertain503 handling remain visible and the write
settles before refresh, with no new reads while editing.

A session401 also synchronously closes the read gate and invalidates/aborts any
read before clearing the editor. Editor removal and same-scope metadata rerenders
cannot automatically refetch and restore write controls. Only a deliberate
`Opdater` action opens the gate for a fresh read, or a new actor-keyed server
context creates fresh state. A failed recovery read keeps the gate closed. The
fixture asserts no extra GET after mutation401 or metadata replacement, then
exactly one explicit recovery GET and empty prepared input after successful
revalidation. Existing API authorization remains authoritative.
