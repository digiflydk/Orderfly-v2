# Merchant terminal reprints (#626 / #627)

The terminal uses the existing immutable manual receipt pipeline, including its receipt layouts, PNG bytes, audit, request UUID, per-printer pointer, CloudPRNT delivery and uncertainty handling. It does not replay an original automatic job.

`GET /api/merchant/orders/reprint?orderId=…&brandId=…&locationId=…[&after=…]` returns a minimal printer picker. It verifies the current session and `orderfly.orders:edit` inside the native read transaction, checks actual order/location/brand ownership, and reads at most 51 raw printer documents per page (50 returned candidates plus a continuation marker). Only valid active Star CloudPRNT 58/80mm devices with current nonrevoked credentials are eligible. It exposes name, revision and connection freshness, never credentials or editable configuration. The UI follows at most four pages and fails visibly beyond that rather than showing an incomplete list.

A strict `ManualPrintCommand` GET reads one previous request; POST explicitly requests a copy. Same-origin JSON, bounded body, strict keys and no-cache responses apply. Merchant entry points establish their own session. Each transaction rechecks current order-edit permission and native scope, printer/configuration/credential revisions, job ownership and flags. An unpaid online attempt is not eligible; accepted PayAtPickup may print without recording payment. Existing saved jobs remain readable/retryable by their original actor after a payment-state change. Rendering occurs outside the transaction, followed by a fresh authorization and source-fingerprint check before atomic job/audit/pointer writes. Permission revocation or changed source blocks commit.

The existing superadmin URL and default `ReprintControls` behavior retain their superuser gate. The merchant API does not grant printer configuration, deactivate or delete access.

`TerminalReprint` accepts `{orderId, brandId, locationId}`. Kitchen/customer choices are separate collapsible sections; controls stay mounted when collapsed to retain each request identity. Merchant controls ask for explicit confirmation before a new copy. A lost-response retry uses the exact command and UUID. Queued/sent/confirmed/failed/unknown/expired remain distinct; an unknown download does not permit a fresh copy. Read-only polling never creates jobs. A new page load is not recovery storage, and changing/reopening a view does not imply that the previous job failed. The per-printer server pointer still rejects unresolved output.

Production output retains existing configuration/output feature gates and requires a correctly configured printer using Live URL. No data, flags, credentials or physical jobs are changed by this implementation or its local tests.

## Validation boundaries

- `node --test tests/unit/merchant-reprint.cjs tests/unit/printing-manual-request.cjs tests/unit/printing-manual-native.cjs`: actual service/HTTP transaction fixtures, success and denial, rollback, source changes, idempotency, unknown dispatch, scoped minimal/paginated picker.
- `tests/unit/merchant-reprint-browser.cjs`: actual React control in Chromium, no write on load, confirmation cancellation, same-ID recovery and unknown lock. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` / `CART_CHROMIUM_PATH` selects an installed local browser.
- Existing `receipt-reprint-controls-browser.cjs` verifies unchanged default admin UI behavior.
- Local tests are not physical iPad/paper acceptance. Current-head independent review/CI and coordinator release/live acceptance are separate requirements. No Actions dispatch or production write was performed.
