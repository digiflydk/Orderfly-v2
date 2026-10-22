# QR page and same-origin workspace adapter (candidate, #416)

The server page `/superadmin/qr-codes` calls `loadQrWorkspace()` before rendering its client workspace. It is dynamic, uses the Node runtime and is noindex. A verified 401 redirects to `/admin-login`; a verified 403 renders the existing access-denied page. An unavailable or unexpected runtime error renders a generic unavailable pane without a catalogue, provider messages or credentials. This pane is an application error state, not a claim that a Next page can set an arbitrary HTTP 503 status.

`QrWorkspace` receives the server snapshot: `brands`, `codes`, `capabilities`, `analytics` and `truncated`. Initial mount does not fetch the catalogue again. Truncation remains visible because search and filters apply only to loaded codes. Client flags never replace server authorization.

## Transport and mutations

Every command uses `POST /api/qr/admin` with JSON, `credentials: same-origin` and `cache: no-store`. No third-party analytics, storage, image or QR service is called. The server independently verifies origin/content type, session, action and the stored native brand/location scope.

- Save sends `{action:'save', draft, context}` using the manager's unchanged request ID, ID and revision.
- Status looks up the stored code in the snapshot and sends `{action:'status', id, brandId, locationId, status, revision, requestId}`. It never derives brand/location from a free-text field or global selector.
- Render sends `{action:'render', draft, context, format:'preview'|'png'|'svg'}`. Dynamic renders include the saved ID/revision. Static renders are transient and do not create catalogue records.
- A confirmed mutation updates the row from the authoritative response, then requests `{action:'list'}`. If that refresh fails, the confirmed row remains, a separate warning appears and the write does not become an uncertain replay. A successful refresh replaces the catalogue/capabilities and remounts the manager after the confirmed write.

HTTP 400/401/403/409 errors become known manager codes only when the status and the server's sanitized `error` value match the documented no-write rejection. Network failures, malformed/non-JSON responses, unknown error codes and 503 remain unavailable/uncertain. Provider text is never rendered. The manager keeps its state mounted when switching to statistics, so navigation inside this workspace cannot bypass an uncertain-write retry lock. A full reload still requires server-side idempotency/reconciliation; browser state is not an exactly-once guarantee.

## Generated assets

Preview uses the renderer's PNG data URL and the manager's same-origin asset guard. Download replies are `{content,mime,encoding,filename}`. PNG base64 is decoded to bytes; SVG stays text. The adapter accepts only expected MIME types and bounds reply content, then creates a local object URL. Filenames are sanitized by the manager. URLs are revoked after 60 seconds and all remaining URLs/timers are cleaned up on unmount. A late response after unmount cannot allocate a new object URL. No response HTML is injected and no arbitrary remote URL is opened.

The manager now renders the reviewed logo/print tools through a gated renderExtras hook. Export permission is required; a dynamic draft must be saved, unchanged and enabled. Static export remains available while dynamic redirects are disabled. The same-origin render command carries format and optional logoBase64. Print opens the trusted HTML blob in a separate window with opener severed; PDF remains the browser’s Save as PDF operation, not a direct PDF generation API. Changing the draft/context remounts the ephemeral export tools so a late old result cannot become the new draft’s export.

## Statistics integration

The workspace connects `QrAnalytics` to the authenticated analytics command:

`{action:'analytics', brandId, locationId, id, from:'YYYY-MM-DD', to:'YYYY-MM-DD'}`.

Dates are the submitted inclusive calendar-date filter; the server owns conversion to the actual `[from,to)` interval in Europe/Copenhagen. Initial dates cover seven Danish calendar days. No analytics request runs until the filter is submitted. Request generations discard late responses. An error leaves earlier results visibly marked as earlier loaded data and disables export.

The current server command is per code. The workspace explicitly requires one concrete QR ID and validates campaign/placement against that code before a request. It does not silently add unique counts or claim all-code totals. The dashboard's general “all” selection is rejected with a choose-code explanation until an aggregated server contract is implemented. Multi-code, campaign-wide and placement-wide comparisons remain a named follow-up; their unique counts must be computed from underlying permitted events, not added from per-code estimates.

CSV uses the same submitted scope/date command with `export:true`. It is offered only with analytics and export capability, successful complete loaded metrics and no filter/query error. The server still checks permission and completeness. The response `{csv}` is downloaded through a local UTF-8 CSV blob. Formula escaping is the backend serializer's responsibility and is separately tested with the metrics implementation.

## Validation boundaries

`node --test tests/unit/qr-workspace-browser.cjs` renders the actual workspace, manager and dashboard in Chromium with an intercepted HTTP API. The server page is also executed against controlled runtime/auth mocks. Cases cover initial SSR data without a duplicate fetch; save/list at 390 and 1440 pixels; confirmed-save refresh failure; normalized 403; unchanged idempotent retry across tabs; stored brand/location status; PNG blob download and cleanup; exact scoped analytics/CSV; denied capability visibility; malformed-success preservation; and page 401/403/unavailable behavior. The later assembled integration checkpoint runs 19 page/workspace, nine manager, ten bulk and seven print cases (45 total) with a real local Chromium 153 executable. Successful API replies are also shape-checked before applying rows or metrics.

This verifies transport and component behavior. It does not prove deployed Firestore policies, real authentication, production event collection, full application CSS, a physical scan, a printer or live release. Full repository typecheck, current-head CI and independent review, authenticated application QA, deployment SHA verification and production-safe live acceptance remain separate gates under #389. The coordinator owns their serial execution.

`allowWholeBrand:false` on a server-projected brand choice hides the whole-brand location and defaults a new or brand-changed draft to its first permitted location. Brands with no available scope cannot be selected for a new draft. An absent flag retains compatibility with existing callers. Server-side action and scope validation still applies.


## Integrated bulk commands and scope keys (#434)

CSV-import is available only with projected create capability and dynamicEnabled===true. The always-mounted bulk component is hidden/disabled when unavailable; changing tabs never drops an uncertain commit. Its preview callback sends `{action:'bulk_preview',brandId,csv}`; commit sends `{action:'bulk_commit',brandId,canonical,sha256,requestId}`. A successful records receipt updates the scoped catalogue, then refreshes list. A refresh failure remains separate from a confirmed import. Server row authorization and atomic commit/idempotency remain authoritative.

Catalogue replacement, row keys, status context and analytics choices use brandId/codeId, so identical IDs in different brands cannot select or replace each other. Status receives the selected row’s explicit brand context. Period metrics retain their server counts; the single selected raw QR key is translated only for display labels. No counts are added during that translation.

## Lifetime projection and department boundary (#437)

The optional allTime map uses explicit `${brandId}/${id}` keys. Only codes with an own map entry render in the lifetime table. A null legacy value displays Unknown; missing keys do not expose a row or fabricate zero. Known zero is displayed as zero, separately from unknown history. Counts come exclusively from the lifetime projection, never the selected period or a sum of estimates. The server limits this projection to current brand-wide analytics rights.

Analytics replies must include a boolean currentLocationOnly before metrics can replace the previous result. The dashboard receives that exact validated boolean and explains whether prior departments are included. A malformed/missing boundary flag fails the query rather than implying broader history. Lifecycle totals, date-filtered event statistics, print styling and physical scan acceptance remain distinct.

A catalogue refresh updates the mounted manager's row state through props; it must never change the component key or reset its editor, uncertain-outcome state, original request ID or retry closure. Independent review reproduced an aborted editor save followed by a successful sibling CSV import losing that identity when the old adapter remounted the manager. The corrected browser regression performs that sequence and confirms the original locked draft retries exactly the same command while imported rows remain visible.
