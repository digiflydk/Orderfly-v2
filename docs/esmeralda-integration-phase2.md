# Esmeralda integration phase 2

Phase 2 completes the code path from a completed Esmeralda table booking to Orderfly feedback and exposes a server-only customer-history boundary for mPanel.

## Booking feedback

Orderfly feedback now has a canonical source reference:

- `sourceType`: `commerce_order` or `booking`
- `sourceId`: native Orderfly order ID or Esmeralda booking UUID
- `customerId`
- `brandId`
- `locationId`

Legacy commerce-order feedback continues to persist `orderId` for backward compatibility. New booking feedback does not invent an Orderfly order.

Feedback question versions can target `pickup`, `delivery` and/or `booking`. The superadmin question builder exposes all three experience types.

## Invitation security

Esmeralda cannot construct a trusted public feedback context in the browser. It calls the protected server endpoint:

`POST /api/integrations/esmeralda/feedback/invitations`

Authentication uses `x-esmeralda-integration-secret`. The payload uses canonical snake_case and includes mapped native Orderfly brand/location/customer IDs plus the Esmeralda booking ID and booking-time guest snapshot.

Orderfly validates brand, location and customer scope. One deterministic Firestore invitation identity exists per `(brand, booking)`. The public link contains a tamper-evident HMAC-SHA256 signed token with a 30-day expiry. The claims are signed rather than encrypted, so authorization never relies on token confidentiality. The token is verified server-side and matched to the private invitation document before the public feedback form can resolve a booking.

Submission revalidates the invitation, customer, source and active question version. The server also validates the submitted response set against that exact active version: required questions must be present, star values are restricted to 1-5, NPS to 0-10, option values must exist in the configured question, min/max selections are enforced, unknown question IDs are rejected and stored question labels/types come from the authoritative version rather than browser input. A booking invitation is consumed transactionally with feedback creation, preventing duplicate feedback documents for repeated form submissions.

The private Firestore collection is `integrationFeedbackInvitations`; all access in checked-in code uses Firebase Admin. The repository does not contain Firestore client rules, so deployment rules remain an external Firebase configuration concern and must not grant browser access to this collection.

## Consumer identity tenant hardening

The existing checkout customer path previously derived its deterministic customer document id from email alone. That could make the same email address collide across two brands. Checkout now normalizes the email and derives new customer ids from a SHA-256 digest of `(brandId, normalizedEmail)`, so consumer identity is tenant-scoped at creation time.

Backward compatibility is preserved for existing email-hash customer documents: a legacy customer id is reused only when the loaded document already belongs to the requested brand. A legacy document owned by another brand is never updated; checkout creates/uses the new brand-scoped id instead. Existing customer updates also verify `brandId`, and checkout rejects a location whose `brandId` does not match the selected brand before creating the customer or order. New/updated records store `normalizedEmail` for consistent identity resolution while preserving the native Firestore customer id chosen for that customer.

## Customer history

Esmeralda calls:

`POST /api/integrations/esmeralda/customers/history`

with the same machine secret and:

```json
{
  "organization_id": "<Orderfly brand id>",
  "customer_id": "<Orderfly customer id>",
  "limit": 100
}
```

The endpoint first verifies that the customer belongs to the requested brand. It returns a bounded canonical summary of:

- the Orderfly customer profile and loyalty aggregates;
- restaurant `commerce_order` rows for that customer and brand;
- feedback rows for that customer and brand, including booking feedback.

No Firebase service-account credential or integration secret is returned to mPanel.

## Runtime configuration

Firebase App Hosting injects `ORDERFLY_ESMERALDA_INTEGRATION_SECRET` from Secret Manager through `apphosting.yaml`. The actual secret value remains out of git and must be the same high-entropy value configured for the Esmeralda Edge Functions.

## Compatibility

- Existing `/feedback?orderId=...&customerId=...` links remain supported.
- Existing pickup/delivery question versions remain valid.
- Existing feedback rows without `sourceType` are interpreted as `commerce_order`, with `orderId` used as the canonical source id.
- Existing customer order/spend/loyalty aggregates are not changed by booking integration.
- Existing same-brand legacy checkout customer ids are retained when safely resolvable; only new/cross-brand-conflicting identities move to the brand-scoped v2 id format.


## Planned-end booking feedback (issues Orderfly #152 / mPanel #295)

Booking feedback is scheduled from `bookings.ends_at`, without requiring manual completion. Confirmed, arrived, seated and completed bookings are eligible; cancellation and no-show stop delivery. Orderfly owns invitation/reminder scheduling. mPanel never falls back to the legacy `booking.feedback` sender.

Booking automation is a separate opt-in, disabled by default. `bookingDelayMinutes` is X (0–10080, default 120); `bookingReminderAfterMinutes` is Y (1–20160, default 1440); `bookingMaxReminders` permits zero or one reminder (default zero). UI accepts minutes or hours. Jobs freeze timing settings. Invitations wait until current planned end + X; reminders wait until the initial message was accepted by the provider + Y and never precede the current booking end. Worker cadence can add latency. Provider acceptance is not proof of inbox delivery.

All email content stays in Notification Center: `orderfly.feedback.invitation`, `orderfly.feedback.reminder`, `orderfly.feedback.thank_you`, with existing published DA/EN versions and preview/edit/publish flow. Queued legacy `booking.feedback` sends are suppressed. An already sent legacy invitation prevents a second invitation. Thank-you remains conditional on the existing automatic-reply setting.

Before provider delivery, mPanel checks current booking status/end, recipient, tenant/location/customer mapping and calls Orderfly's read-only, shared-secret protected `POST /api/integrations/esmeralda/feedback/delivery-check`. Orderfly checks the exact event/job, scope, current settings and whether feedback has been submitted. Replies stop invitations/reminders; lookup failures retry without sending. Suppression uses the existing terminal failed state with `booking_feedback_suppressed`; intentional waiting does not consume attempts. Pending central messages recheck within 60 seconds, including bookings moved earlier. Orderfly's preliminary worker may enqueue after a concurrent schedule change; this final check enforces the current authoritative end.

Migration `20260923055845_booking_feedback_planned_end.sql` adds `schedule_version` (old rows remain 0). Only future existing visits are seeded as version 1; past history is not replayed. Booking changes reschedule the one booking job. The trigger preserves booking operations if integration bookkeeping fails. The sync worker skips old-version jobs and requires `automation_owner: orderfly` in the handoff response. Handoff success is not email delivery (`notification_enqueued_at` remains null).

Rollout is coordinated: deploy Orderfly's new contract and delivery check with booking automation disabled, then apply the mPanel migration and deploy notification-worker with both shared helpers. Verify the two matching revisions and existing central templates before enabling the booking switch. Do not enable during a mixed-version rollout. No production activation or mail send is part of these changes. Post-deployment verification starts only after deployment evidence; rollback disables booking automation first, since reverting to the old sender can recreate duplicates.
