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
