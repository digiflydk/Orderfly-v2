# Saved routing editor and sample preview (#352 / #342)

`/superadmin/printers/routing` provides the saved-rule editor under Superadmin
System > Printere. It depends on the independently reviewed saved-routing API
in #345/PR351. Its branch includes that exact dependency, not a second
implementation. Root #309 must release the API first, then sync this branch to
its actual merge and rerun current-head CI and independent Codex review.

The page denies non-superusers before reading selector metadata. Current native
view scopes supply brand/location names; independent edit scopes control save
affordances. Native authorization and current platform-superuser status are
checked again in every API transaction. Merchant printer navigation stays closed.

The editor loads saved rules, a bounded printer page and native named product and
category choices. A rule selects a printer, all/products/category, include or
exclude, and all/Pickup/Delivery fulfillment. Users can add, edit and remove rules,
preview a sample product, and save against the loaded revision. Rules' current
state is distinct from the saved revision and success feedback. Referenced labels
outside loaded catalog pages are explicitly marked as not loaded; pagination
loads further names without an unbounded query or exposing raw IDs as controls.

`GET /api/superadmin/printers/routing/catalog` accepts strict brand/location,
`kind=product|category` and optional `after` cursor. Product queries are bounded to
the native brand; category queries require native location membership. Both read
50 rows plus one overflow row and preserve the native continuation even when valid
products belong to another location or are inactive/synthetic. Each returned
product's category is validated at the current native location. Active native
names and product category IDs are the only catalog data returned. Legacy category
brandId is not ownership authority. Malformed scopes/identity/location lists and
foreign category references fail closed. No global product/category action is used.

`POST /api/superadmin/printers/routing/preview` accepts candidate canonical rules,
Pickup/Delivery and up to 20 `{productId, quantity}` sample rows. It uses one
read-only native transaction to reauthorize the platform superuser and native
scope, validate all referenced printers/rules, and derive each sample name/category
from current native product/category records. Client line labels, category claims,
orders, payment status and customer fields are rejected. The existing canonical
server-only planner determines precedence, exclusions, disabled/paused behavior
and unrouted lines. It remains server-only; its boundary was not relaxed for the
client. Responses say `sampleOnly: true` and `dispatchAuthorized: false`.

Catalog GETs are no-store. Preview POST adds same-origin JSON/CSRF validation and
a streamed 32,768-byte cap; canonical structural and aggregate limits apply before
schema work. A 131,072-code-unit preview output cap rejects the entire result rather than truncating it. Both endpoints recheck the actual native references in their current
transaction and create no records. They never use a sample as order/payment proof.

The client validates every response shape/scope/reference before rendering it.
Scope/session/read generations and aborts discard stale GETs. Pending actions lock
brand/location and changes; grant revocation disables new saves while allowing an
in-flight response to settle visibly. Conflicts, default-OFF 503, denied writes
and unknown/malformed save outcomes require explicit reload before resubmission.
There is no automatic PUT retry. Expired sessions clear routing data. Candidate
changes invalidate the previous preview; a malformed preview never exposes its
raw error payload or alters the saved rules.

Validation includes production services/native authorization with only session and
Admin I/O isolated, actual page gating/projection, and seven actual React/browser
flows with production CSS: desktop/mobile named create/edit/preview/save,
scope/session race rejection, conflicts/default-OFF/unknown results, pending grant
revocation and malformed saved/preview DTOs. Meaningful screenshots use
`printing-config-routing-{desktop,mobile}.png` within the existing artifact pattern.

Run:

```
npm run typecheck
node --test tests/unit/printing-routing-editor.cjs tests/unit/printing-saved-routing.cjs tests/unit/printing-routing.cjs tests/unit/printing-catalog-projection.cjs
node --test tests/unit/printing-routing-ui-browser.cjs
```

The local browser fixture builds the actual React bundle and production CSS, but
execution is blocked when the runtime has no installed Chromium. That is not a
passing browser result. The dedicated CI step runs both new service and browser
files after the existing Chromium installation. Root must inspect actual passing
browser execution and rendered artifacts before release. There is no production
write QA in these fixtures. Authenticated live page/save/preview/native denial,
stale revision and default-OFF acceptance still require controlled authorized
access after the deployed commit is verified; missing access remains QA blocked.

Routing saves retain the API's existing default-OFF configuration write gate and
audit/revision rules. This UI has no activation, device credentials, intent-policy
enablement, order/queue mutations or printer transport. No secrets, rules, indexes,
production data or Wolt settings were changed. Device-auth CloudPRNT poll/claim/
download/ack/retry, controlled activation/testprint and physical output remain
separate pilot requirements. A sample or simulator cannot prove physical readiness.


## Current-main management contract recovery (#352 continuation)

This branch now genuinely includes #351 on main, the default cross-scope printer
table and its optional filters/row actions, and the shared shell overflow fix.
The overview changes only by its existing Routingregler link.

Regression-first checkpoint: management fixtures now use the explicit
`referencesVerified` boolean required by the deployed API. New actual React and
production-CSS cases cover stale printer/product/category repair at desktop and
mobile, exact revision save and canonical readback, malformed false DTO rejection
and uncertain unverified PUT results. Existing assertions remain intact. The
original client still rejects the new valid management DTO before adaptation, so
actual browser CI must demonstrate this failure first. Local Chromium remains
unavailable; missing executable is not an assertion result.

An added production-service unit test first reproduced the existing picker
addition rejecting canonical products with omitted global membership. Its fix
will be limited to the picker, preserving #351's API and both P2 fixes unchanged.
