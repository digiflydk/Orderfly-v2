# Delivery merchant administration

Coordination: #657 / #672. Browser and external acceptance: #691. Release/pilot: #694.

## Operator workflow

Superadmin opens **Loyalitet → Levering**. The landing page lists enrolled delivery merchants, with filters and an add action. Enrollment is a delivery configuration for an existing brand/location and provider environment, not a new customer account or a duplicate native restaurant.

Create an enrollment, then complete its dedicated settings page. Wolt merchant ID, venue, API credential and callback configuration belong to that merchant/environment. Geoapify is configured once in platform routing settings and shared across enrolled merchants. Never enter a shared Wolt key as platform routing configuration.

Credentials are write-only. Read responses expose configured/not-configured status and sanitized connection results, never credential values, signing secrets or Secret Manager resource names. Empty credential fields retain the current value. Saving metadata must not silently activate customer checkout.

Use the merchant page for connection checks, callback registration and activation. Delivery prices, hours, coverage, preparation time, operational order views and logs remain inside the selected merchant context. A successful API authentication check is not proof of the venue address, a courier booking or full end-to-end acceptance.

Activation requires a separate explicit confirmation that the provider venue's pickup address matches the restaurant, in addition to general activation consent and production approval where applicable. The API enforces this confirmation; it is not an automatic address verification. Restaurant prices and delivery hours are shared between environments at the existing brand/location scope.

Deactivation stops new managed quotes and final checkout validation for that enrollment. Its persisted state takes precedence over the legacy `ORDERFLY_DELIVERY_*` environment gates, so disabling those flags is not the portal stop procedure. Recovery for existing paid orders, callbacks, cancellation and refunds must continue. Already-created Stripe sessions can still settle and original dispatch jobs can proceed; deactivation does not cancel either a payment or a courier. Deleting an enrollment archives its administrative record; the archived filter and restore action return it to inactive state with revision protection; it must not erase order history, financial records, provider references or credentials still required by existing deliveries. The original restaurant and its catalog are not deleted. Before resuming, reconcile in-flight and unknown outcomes and recheck the approved settings and pickup contact/venue. Activate through the normal revision-checked action with pickup confirmation and production approval where applicable; restoring an archived enrollment alone leaves it inactive. See [Recovery and rollback](release-readiness.md#recovery-and-rollback).

## Platform infrastructure

The portal performs enrollment and credential provisioning through authenticated server handlers. A platform operator may need to grant the runtime its infrastructure permissions once; this is not a recurring merchant setup step.

Keep projects separate:

- App Hosting: `orderfly-v21-10334086-b3076`.
- Firestore/Auth data: `orderfly-39325`.

The deployment sets `ORDERFLY_DELIVERY_SECRET_PROJECT=orderfly-v21-10334086-b3076`. Secret Manager operations must use this explicitly configured secret project and a server identity allowed to create the restricted delivery secrets, add versions and access those versions. Never grant these permissions to a browser client. Missing permissions are a setup failure, not a successful credential save. Never fall back to plaintext credential storage or publish secret values to resolve an IAM problem.

New private administration records are server-only and covered by the deny-all client Firestore rules. All mutations require a verified platform superuser, same-origin protection, validated native brand/location ownership, revision checks and sanitized audit records. Public checkout cannot choose a merchant, environment, venue, secret reference or Stripe account.

## Acceptance boundary

A deployed portal and a completed sandbox order are separate acceptance milestones. Verify each environment and location from stored configuration and actual operations, not fixed UI labels.

For Esmeralda, the historical Wolt sandbox venue is at Borgergade 10 while the real Amager location is Albaniensgade 6. Later controlled sandbox tests explicitly retained Borgergade as the pickup, as recorded in [native browser QA](native-browser-qa.md) and [PR #742](https://github.com/digiflydk/Orderfly-v2/pull/742). Preserve that ongoing test configuration until its authorized test/recovery procedure completes. This does not verify the real restaurant pickup for a production pilot; confirm the correct production venue/address/contact separately. Do not silently restore or substitute an address during an in-flight test.

External acceptance requires actual checkout and accepted quote, Stripe test settlement, one native dispatch and Wolt booking, genuine signed callback persisted in the native inbox, consistent authorized tracking/merchant state, original print intention and eligible feedback processing. Repeat for scheduled delivery. Callback simulation, isolated receiver evidence and local mocks must be reported separately from provider-origin events. Physical courier and printer output require their own observed evidence.

All validation for this work is internal; no GitHub Actions. Before release require current-main integration, relevant tests, typecheck, build and independent exact-head review. Merge at the reviewed SHA, verify merge parents and the deployed health release, then perform authorized portal and sandbox acceptance.

## Implementation map

- `deliveryMerchantEnrollments/{hash([brandId, locationId, environment])}`: validated administrative state, revisions and audit. Public DTOs omit callback key, secret references and internal operation details.
- `deliveryPlatformConfigs/geoapify`: one shared routing configuration. Approval references point to authorized audit revisions and the quota namespace is server-owned.
- `/api/delivery/merchants`: enrollment list/create; `/{id}` read/update; `/{id}/actions` lifecycle, connection and callback operations.
- `/api/delivery/platform` and `/api/delivery/platform/check`: shared routing configuration and explicit connection check.
- Existing native bindings, canonical Wolt merchant registry, callback inbox, adoption and runtime documents remain the source for delivery processing.

Only one environment may be active for new orders at a location. Already-created orders retain their own Stripe account and test/live mode for settlement, checkout-session cancellation and recovery. A platform Stripe active-mode change must not redirect an existing managed order to a different mode. Canceling checkout expires the payable session before releasing its discount reservation; it does not cancel a courier or refund an order.

The current canonical Wolt registry still permits one venue/location per Wolt merchant and environment. Competing bindings are rejected rather than overwritten. API authentication checks do not validate the pickup venue/address; check those with the provider before activating. API and signing credentials cannot be changed in place after native provisioning without a recovery-safe rotation workflow.

A callback registration creates durable intent before the provider write. If the result is unknown, subsequent reconciliation lists the existing subscriptions rather than issuing another blind create. An existing foreign subscription must not be overwritten. Credentials and callback ownership remain available for historical recovery after merchant archival.

## Rejected courier bookings and estimates (Wolt Drive certification)

When a courier booking is definitively rejected, the operator order detail (**Levering → Leveringer/Log**) and the merchant terminal order detail show a red "Kurérbestillingen blev afvist" box with a short Danish explanation and action, the refund state and a small "Fejlkode til support" line. Terminal board cards carry a "Kurérbestilling afvist" badge. Messages live in `src/lib/delivery/booking-failure.ts`; only its allowlisted codes reach the browser (any other code becomes `booking_rejected`, which shows the generic text). Native codes and provider text are never shown.

| Code | Merchant message (short) |
| --- | --- |
| `quote_expired` | Delivery price expired before the booking was sent to Wolt |
| `quote_changed` | Quote no longer matched the order; booking not sent |
| `quote_changed_or_expired` | Wolt price expired or changed at booking time |
| `settings_changed` | Delivery settings changed after the customer ordered; check settings |
| `binding_changed_before_dispatch` | Wolt connection changed just before booking; check Wolt setup |
| `invalid_create_payload` | Delivery details could not be sent to Wolt |
| `invalid_request` | Wolt rejected address/phone/time; contact the customer about pickup |
| `authentication` | Wolt rejected the access key; contact support before more courier orders |
| `configuration` | Wolt venue/merchant setup missing; contact Wolt or support |
| `unavailable` | Wolt cannot deliver to the address/time; contact the customer about pickup |
| `rate_limited` / `provider_error` | Wolt overload / technical error; contact support if repeated |
| `booking_rejected` (any other) | Generic: contact support with the code |

Every definitive rejection starts the automatic full refund (`booking/dispatcher.ts` → `payments/refund-worker.ts`). The UI says "Kunden er refunderet automatisk" only once the projected payment status is refunded; while it is still paid it says the refund is started automatically and to contact support if it does not complete. The terminal reads this code through `loadAuthorizedDeliveryTracking(..., 'merchant')`; customer projections never carry it. The stored order keeps `paymentStatus: Paid` after the refund; the refund itself is the native `refundedAmountOre` marker (see [payment orchestration](payment-orchestration.md)). Every view that shows a payment status projects a fully refunded order (refunded øre ≥ order total, total above zero) as **Refunderet** through one helper, `projectedPaymentStatus` in `src/lib/orders/presentation.ts`: operator delivery queries, customer tracking, the superadmin order detail badge and the merchant terminal board card, order detail, history and preorders (`terminalPaymentLabel`; English KDS text "Refunded"). A partial refund still reads Betalt with the refunded amount shown separately. Payment actions and queue rules keep reading the stored status, and revenue already excludes such orders because they are canceled and fully refunded (`paidSaleAmount`).

Courier pickup times on the terminal are estimates: "Forventet afhentning (estimeret): ca. … – …". Nothing in the merchant views says a pickup or delivery time is confirmed.

The Wolt drop-off comment is labelled ("Etage/dør: …" and "Besked: …"). It stays within Wolt's 500-character limit: the unit is never cut, only the customer message is shortened with "…".
