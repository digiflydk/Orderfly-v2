# Receipt presentation settings

`GET /api/superadmin/receipts?brandId=…` returns `{brandId, revision, settings}`. Missing settings produce revision `0` and the client-safe frozen defaults in `src/lib/receipts/settings.ts`; reading never creates a document. `PUT /api/superadmin/receipts` accepts exactly `{brandId, expectedRevision, settings}` and returns the committed next revision. A stale editor receives `409 record_conflict` and must reload before trying again.

Both editor endpoints require a native platform-superuser session before inspecting requests. The transaction rereads the current platform policy and native brand scope; membership revocation, company suspension, and reassignment are evaluated on every transaction attempt. Settings use the existing catalog permission at company scope, with no new permissions or printer activation flags. PUT requires the configured same origin, JSON and a streamed 8 KiB body bound. All responses are `no-store` with `Vary: Cookie`; unknown failures return a fixed 503 without driver details.

Editor reads and writes require the native brand's canonical `status` to be `active`, `pending` or `trialing`, matching printer administration. `suspended`, missing and unknown status values are rejected, even when a legacy `isActive` flag is true. The check is repeated inside every transaction attempt. Historical order reads intentionally retain the existing order access contract described below.

Server storage is `receiptSettings/{brandId}` with immutable revision audit records at `receiptSettings/{brandId}/audit/{revision}`. Configuration and actor/revision/settings audit are committed in one Firestore transaction. Existing `firestore.access.rules` denies every direct client read and write, including this new root collection and its audit descendants. Neither collection is exposed through a client SDK.

The order preview uses `readReceiptSettingsForOrder(brandId, locationId)`, which authenticates and checks the current native `orderfly.orders:view` permission, company, brand and location in the same read transaction. Location-scoped staff can read the presentation settings only for their authorized order scope; they cannot edit settings. Callers must still authorize and load the order itself through the existing order access path. Historical orders retain that existing access behavior even if the native brand is marked inactive, deleted or test data; the brand document must still exist and current policy and native location ownership must still authorize the read. The editor separately rejects those brand lifecycle flags.

The strict settings schema allows 58/80 mm presentation width, bounded plain text, and display switches. Financial rows and totals are not configurable. The physical synthetic printer test payload, credentials, dispatch, printer configuration and activation remain independent of these settings. Online rendering is a preview and does not prove physical printer operation. Invalid existing records fail closed rather than being silently replaced with defaults.

Run `node --test tests/unit/receipt-settings*.cjs` and `npm run typecheck` for backend validation. Tests use isolated in-memory transactions and make no production writes.

## Separate kitchen settings

`GET /api/superadmin/receipts/kitchen?brandId=…` and `PUT` on the same path
use the same auth-first, native scope, lifecycle, CSRF, size bound, strict request,
CAS and atomic audit guarantees. Storage is independently versioned at
`kitchenReceiptSettings/{brandId}` with `audit/{revision}` and action
`kitchen-receipt.settings.update`. Existing blanket client deny covers both.
No customer-receipt record is migrated or overwritten. Missing kitchen records
return defaults without writing; corrupt records fail closed.

The schema allows `paperWidthMm` (58/80), `heading` (80-character bound),
`textSize` (normal/large), `groupByCategory`, `showBrandName`, `showLocationName`,
`showCustomer` and `showPhone`. Default text is large; phone is off by default.
Core preparation details cannot be disabled. `readKitchenSettingsForOrder` keeps
the historical native orders:view contract and does not grant edit access.


### Automatic customer receipt company details (#542)
Customer preview reads `brands/{brandId}` within the existing freshly authorized receipt-settings transaction. Only companyName (fallback name), companyRegNo, street/zipCode/city/country and a valid HTTPS logoUrl are projected. Editor GET and successful PUT return this read-only `brandIdentity`, never persisting it in settings/audit. The selected-brand editor uses it with fictional order lines; brand switches and stale responses use the existing generation guards. Company details are edited at their brand source, not duplicated in receipt address settings. Existing legacy address values remain stored for compatibility but do not override or duplicate authoritative company addresses.

Actual orders without an invoice use this authorized company identity. Issued invoices retain their immutable seller name/CVR/address; the current brand logo is presentational. Missing company name/address/CVR are explicitly marked; missing or non-HTTPS logos are omitted. No physical output, fiscal snapshot, production data or access policy is changed. Verification: receipt-settings projection/scope tests, receipt-preview invoice preservation and actual Chromium editor brand-switch/save/recovery regression.
