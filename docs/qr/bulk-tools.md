# Bulk CSV component and guarded retry corrections (#434, candidate)

`QrBulkTools` is a client component with injected APIs. It does not directly access Firestore, install a route or authorize a caller. Its parent must supply only permitted brand/location metadata, keep the component mounted during uncertain writes, and expose dynamic bulk creation only when the real runtime enables it. Server authorization, atomic commit/idempotency, request limits and dynamic activation remain mandatory independent gates.

## API and preview

Props: `brands: QrBrandChoice[]`, `api` and optional `onCommitted(records)`. The parent adapter owns same-origin authenticated transport:

- `api.preview(brandId, csv)` returns the real `QrBulkPreview` shape from `bulk.ts`, with `plan.sha256` added. A valid plan includes `schemaVersion:1`, normalized `entries`, `canonical` JSON and its lowercase SHA-256 digest.
- `api.commit(brandId, {canonical,sha256,requestId})` returns `{records:QrCodeSummary[]}`. The server must verify scope and the canonical plan again and commit atomically. Client confirmation is not authorization.
- `onCommitted(records)` runs only after a confirmed successful commit. A rejected refresh callback produces a separate warning and never causes a second import.

The UI accepts pasted CSV or a file, requires strict UTF-8, bounds input to 128 KB and supports at most 100 data rows. It shows a template using the selected brand and a permitted default location. Examples are labelled as examples; the destination must be replaced before use. Changing CSV or brand invalidates the prior preview and confirmation. Preview itself performs no writes.

Any row error suppresses the whole commit plan. Errors use fixed Danish labels for row/field/error code and never display provider messages. A valid preview is additionally checked for selected brand/location ownership, bounded count, agreement between displayed rows and canonical entries, schema version and the SHA-256 digest computed by browser Web Crypto. This is a consistency check, not a replacement for server validation. Users must explicitly tick the displayed count/brand confirmation before the create button enables.

`allowWholeBrand:false` excludes an empty location from client acceptance; only listed locations are valid. Brands with neither whole-brand scope nor an available location cannot be selected. The parent must still project actual create permission and the server must validate every row.

## Write outcomes and retries

The first commit captures one immutable brand, canonical plan, digest, count and random UUID. A synchronous guard blocks double clicks. A lost response or malformed successful reply locks the CSV, brand, new preview and new commit. **Prøv samme import igen** resubmits the identical captured payload and UUID. Only a successful receipt clears an earlier uncertain state. A 401/403/validation rejection on replay cannot prove that the original attempt was never committed, so it cannot unlock a new import. If access cannot be restored to retrieve a receipt, an operator must reconcile the request before a new import; reloading does not prove exactly-once delivery.

A documented no-write validation/permission rejection on the *first* request permits correction and requires a fresh preview. The API adapter must not classify ambiguous server/transport failures as such definitive codes. Successful records must match the selected brand and expected count before the UI treats a commit as confirmed. A failed post-commit directory refresh remains separate from the confirmed write.

The same replay correction is applied to the existing `QrManager`: a later denial no longer clears a previous uncertain write. Browser coverage explicitly executes abort → forbidden → successful same-ID receipt and proves cancel/new actions stay locked until success.

## Disabled dynamic runtime

The real workspace passes `dynamicEnabled={data.dynamicEnabled===true}`. An absent projection is disabled. The manager shows the disabled state, defaults new drafts to the static generator and disables dynamic selection, duplicate, save, preview and PNG/SVG download. Existing rows and statistics remain visible; pause/archive continue to use server authorization. Static payload preview/download remains available. Direct component fixtures retain their historical optional default, while actual workspace fixtures explicitly enable the runtime for enabled-flow tests. The backend independently rejects dynamic save/render while disabled, so no QR linking to an inactive redirect should be printed from this interface.

## Verification and remaining acceptance

`tests/unit/qr-bulk-tools-browser.cjs` mounts the real component in Chromium and uses the real pure CSV parser to construct intercepted preview replies. It covers desktop/mobile count confirmation, canonical/digest preservation, row and foreign-scope rejection, invalidation on edit, unknown retry including a later denial, double click, refresh failure, size/UTF-8 limits, tampered digest, permitted template locations and 100-row cap. Manager/workspace browser suites cover the replay correction and false/missing runtime flag, including successful static preview.

These are component and transport-fixture tests. They do not prove actual server atomicity, deployed authorization, real login, full application styling, production writes or physical scanning. The coordinator owns real API wiring, exact-head combined checks/review, authenticated application QA, deployment evidence and live acceptance under #389. No production data or configuration is changed by this slice.
