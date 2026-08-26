# Esmeralda consumer-customer integration endpoint

This document implements the first runtime slice of `docs/esmeralda-unified-platform-contract.md` for Orderfly v2 issue #22.

## Endpoint

`POST /api/integrations/esmeralda/customers/resolve`

The route is server-to-server only. It uses Firebase Admin against the Orderfly production-data project and does not reuse the browser/customer-admin Firebase client mutation flow.

### Authentication

The request must include:

`x-esmeralda-integration-secret: <shared secret>`

Orderfly reads the expected value from `ORDERFLY_ESMERALDA_INTEGRATION_SECRET`. Missing or incorrect values return `401`. The route compares equal-length secrets with a timing-safe comparison. No integration secret is committed to the repository.

### Request contract

```json
{
  "organization_id": "<native Orderfly brand id resolved by Esmeralda mapping>",
  "location_id": "<native Orderfly location id resolved by Esmeralda mapping>",
  "booking_id": "<Esmeralda booking UUID>",
  "full_name": "Guest Name",
  "email": "guest@example.com",
  "phone": "+45 12345678",
  "marketing_consent": false
}
```

`marketing_consent` is optional. Esmeralda phase 1 omits it for ordinary table bookings because booking consent is not marketing consent.

The canonical boundary uses snake_case. Firestore documents keep the existing Orderfly camelCase field names.

## Tenant and location boundary

Before resolving a customer, Orderfly verifies:

1. `brands/{organization_id}` exists.
2. `locations/{location_id}` exists.
3. The location document's `brandId` equals `organization_id`.

A mismatched location is rejected rather than allowing a cross-brand customer mutation.

## Identity resolution

Email is normalized with trim + lowercase and is the primary identity signal inside the requested brand.

Resolution rules:

1. Exactly one normalized email match: resolve that customer.
2. More than one normalized email match: return `409 ambiguous_email_identity`.
3. No email match and a normalized phone is available: phone may be used as a secondary signal.
4. More than one phone match: return `409 ambiguous_phone_identity`.
5. One phone match with a different existing email: return `409 phone_identity_conflict`.
6. No safe match: create a new customer.
7. Never match by name alone.

The implementation compares normalized values in memory after a brand-scoped customer query. This preserves compatibility with older customer documents whose stored email case or formatting predates normalized helper fields.

## Existing-customer update safety

When an existing customer resolves, the integration may update profile identity fields, add the mapped location and record Esmeralda integration metadata. It does **not** write or reset Orderfly commerce/loyalty aggregates such as:

- `totalOrders`
- `totalSpend`
- `lastOrderDate`
- calculated loyalty history

A newly created consumer customer receives the existing new-customer defaults only because no prior commerce history exists.

## Response

Successful requests return HTTP 200:

```json
{
  "customer_id": "<native Firestore customer id>",
  "operation": "created",
  "normalized_email": "guest@example.com",
  "normalized_phone": "+4512345678"
}
```

`operation` is one of `created`, `resolved`, or `updated`.

Expected error classes:

- `400 invalid_json` / `invalid_payload`
- `401 unauthorized`
- `404 organization_not_found` / `location_not_found` / `location_organization_mismatch`
- `409 ambiguous_email_identity` / `ambiguous_phone_identity` / `phone_identity_conflict`
- `500 integration_failure`

## Idempotency model

The endpoint does not use the booking id as the Firestore customer document id. Repeated requests for the same booking resolve the same brand-scoped normalized customer identity, while Esmeralda separately stores a unique one-job-per-booking outbox record and the resulting Orderfly customer id.

This deliberately avoids pretending that Supabase UUIDs and Firestore document ids are interchangeable.

## Tests and release

Before merge:

- `npm run typecheck` must pass.
- `tests/esmeralda-customer-integration.spec.ts` must pass.
- relevant existing Playwright/quality gates must remain green.
- no production customer write is part of unattended verification.
