# Levering UX acceptance specification

Scope: #657.4. This specification describes required behavior, not completed UI or an accessibility certification. All administration belongs under **Levering**; existing checkout, Merchant app, orders and receipts show contextual delivery information.

## Navigation and ownership

Use existing Orderfly tokens, typography, buttons, fields, tables, dialogs and authenticated admin layouts. Superadmin and merchant views share components but obtain independently authorized data. Proposed routes are `/superadmin/delivery` and `/merchant/delivery`; coordinator owns navigation/access mapping. Existing `orderflySession`, `nativeCatalog` and server data authorization are reused. Hiding links never authorizes data access.

Subpages: Oversigt, Leveringer, Områder og priser, Åbningstider, Kampagner, Leverandører, Indstillinger, Log. Wolt Drive configuration appears inside Leverandører. Page links use `aria-current="page"`. Preserve location selection across subpages using validated scope; clear stale data immediately on scope change. Never show all-brand values as if they belong to a selected location.

## Scope and settings

Every settings page names brand/location and visibly labels **Arvet fra brand** or **Tilpasset denne restaurant**. Location override/reset is explicit; resetting previews inherited values before saving. Read permission and edit permission are separate. Fields include Danish labels, units and helpful examples. Examples are never silently saved as real prices. Changing location with unsaved changes requires an explicit discard choice. Save errors retain typed values. Successful saves show a concise inline status; repeated save is disabled while pending. Version conflicts require reload/reconciliation, never automatic overwrite.

Proposed settings transport for alignment, not a competing database schema:

- scope `{brandId, locationId?}` and revision
- `source`, `overriddenFields`, `effective`, `local`
- server-derived capabilities `{canEdit, canActivate}`
- activation `{enabled, blockers[]}`

No credentials or raw provider responses may enter this DTO. Exact settings fields and endpoint are owned by the settings agent/coordinator. Production activation is unavailable until provider, prices, coverage and launch acceptance are verified.

## Page behavior

| Page | Required content and actions |
|---|---|
| Oversigt | Selected scope, actual enabled/paused state, readiness blockers, direct links to relevant settings; metrics only from verified server aggregates |
| Leveringer | Bounded paginated table, date/status filters, scoped details, address/instructions, kitchen vs delivery vs payment status, ETA freshness, tracking and authorized recovery actions |
| Områder og priser | Route distance and source, eligibility boundaries, interval editor, minimum basket, price mode, explanatory test calculation clearly marked as preview |
| Åbningstider | Weekly schedule, date exceptions, pause, preparation and transport limits; timezone visible |
| Kampagner | Eligibility, minimum after discounts, distance limit, subsidy/customer caps, conflict explanation; reuse existing discount concepts |
| Leverandører | Available/enabled providers, mapping/readiness status, permitted setup actions; secret input only through approved server workflow |
| Indstillinger | Brand defaults/location overrides and explicit reset/save; activation is distinct from saving configuration |
| Log | Paginated human-readable delivery events/errors and next action, timestamps, original provider status where authorized; no secrets or unnecessary personal data |

Loading displays skeleton/text with busy state, not zero metrics. Empty state says what is absent and offers an authorized next step. Error state preserves filters and provides retry. Stale data is labeled with last successful update. Unknown booking/cancellation result states **Status afklares** and prevents a second dispatch. Never label simulated data as live delivery.

## Checkout

Reuse the existing cart and fulfillment selection. Once required address/contact input is valid, calculate delivery automatically. The delivery panel has no calculate-price button, separate price-acceptance checkbox or pickup-switch button. Address validation identifies the failing field and suggests correction. Quote refresh preserves entered information, announces progress and blocks payment until a valid current price is displayed. Show the server delivery fee, total and available estimated interval before payment. The normal payment action accepts that displayed total; background recalculation never submits payment. Changed inputs invalidate the old quote. Quotes with 60 seconds or less remaining and unavailable delivery keep payment blocked with a useful Danish error and a deliberate “Prøv igen” action, without automatic retry loops. Confirmation distinguishes payment confirmation from courier booking. Tracking never implies delivery completion from kitchen-ready status.

## Accessibility and responsive acceptance

Target WCAG 2.2 AA. Test mobile width 320/390 px, iPad portrait/landscape and desktop. No page-level horizontal overflow; long tables have labeled local scroll containers and retain meaningful column labels. Main actions target 44×44 CSS px (product standard, exceeding WCAG minimum where applicable), sufficient spacing and visible focus. Text contrast >=4.5:1, large text and essential nontext controls >=3:1; do not rely on color alone. Test 200% text zoom and reflow. Labels use explicit associations, errors `aria-describedby` and `aria-invalid`; summaries focus the first relevant error. Status announcements use polite live regions, urgent form errors use alerts without repeated polling announcements. Dialogs retain focus trap, Escape behavior where safe and return focus to opener. Navigation and all actions work using keyboard alone. Use native form controls or established accessible primitives; no hover-only information. Reduced-motion preference is respected.

## Internal QA evidence

Browser tests must cover navigation/current page, permitted/denied scopes, location switch, inherited/local edits, invalid values, pending duplicate-save prevention, save/reopen, stale version conflict, missing provider/route and unknown dispatch outcome. Inspect real rendered components at mobile/tablet/desktop with screenshots and keyboard checks. Mocked browser fixtures prove UI behavior only; they do not prove live backend, Wolt or physical-device behavior. No GitHub Actions or production writes are required or permitted by these tests. Record actual results and unresolved accessibility issues before claiming acceptance.

## Implemented configuration slice

The current component exposes Oversigt, Indstillinger, Åbningstider, Områder og priser and Kampagner inside one Levering view. Settings and pricing persist through the scoped settings API with strict DTO validation and exact revision receipts. Unknown save outcomes require reload; raw schema errors are not shown. Week/date exceptions, whole-location reset to previewed brand settings, distance limits, kilometer/band tariffs, free-delivery thresholds, subsidy/customer caps and optional local cost estimates are editable. New price fields start empty, require explicit real values and cannot save until validated. Preview uses only manually entered values and never requests a courier or claims provider coverage. All prices show their currency and tax basis.

Internal Chromium tests exercise settings save at 390/768/1440 px, opening hours, inherited location overrides, stale-write rejection, read-only controls, incomplete pricing rejection, exact minor-unit persistence, illustrative preview and stale success receipt rejection. These are synthetic API/browser fixtures, not production or Wolt acceptance. Deliveries/log/provider binding UI still depends on the corresponding operational APIs; the overview states that explicitly. No global WCAG certification or physical iPad test is claimed.

Leverandører currently shows the selected configuration and explicitly states that live connection status is not yet available. It does not infer a verified connection from a provider ID or allow activation. Operational list/log UI depends on the scoped read endpoint. Form error summaries receive keyboard focus when an error occurs.

Leveringer and Log consume the location-scoped `/api/delivery/orders` endpoint. They preserve a continuation even when a page contains no managed deliveries, show loaded count rather than a global total, and explicitly label document-ID order rather than chronological order. Detail checks the selected order identity and renders separate booking/delivery/payment/kitchen fields. Event pages deduplicate event IDs. Economic details and tracking URLs are not invented when absent from the projection. Internal browser regression covers an empty first page, continuation, separated statuses, detail/event display and mobile overflow. API authorization and data provenance are separately tested by the operational service owner.

Orders-view access exposes only a `costReviewRequired` boolean for an unexpected/unknown accepted provider cost. Leveringer and detail show “Leveringspris kræver kontrol”; quoted/accepted costs, customer fees, subsidies and exception internals are not included in this projection. Internal query regression verifies absence of those fields and values, with a browser regression for both warning surfaces.

### Operational cancellation
The order detail uses the server cancellation availability helper; the client never infers mutation permission from orders:view. A reason and explicit acknowledgement of an unknown possible courier fee are required. Cancellation only concerns the courier and does not refund customer payment. One request ID is sent once; ambiguous responses offer refresh, never an automatic retry. Only availability is projected to the read DTO.
