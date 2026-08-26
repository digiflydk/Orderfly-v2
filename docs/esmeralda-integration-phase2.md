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

Orderfly validates brand, location and customer scope. One deterministic Firestore invitation identity exists per `(brand, booking)`. The public link contains an opaque HMAC-SHA256 signed token with a 30-day expiry. The token is verified server-side before the public feedback form can resolve a booking.

Submission revalidates the invitation, customer, source and active question version. A booking invitation is consumed transactionally with feedback creation, preventing duplicate feedback documents for repeated form submissions.

The private Firestore collection is `integrationFeedbackInvitations`; all access in checked-in code uses Firebase Admin. The repository does not contain Firestore client rules, so deployment rules remain an external Firebase configuration concern and must not grant browser access to this collection.

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
