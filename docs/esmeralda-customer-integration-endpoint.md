# Esmeralda consumer-customer integration endpoint

This document implements the first runtime slice of `docs/esmeralda-unified-platform-contract.md` for Orderfly v2 issue #22.

## Endpoint

`POST /api/integrations/esmeralda/customers/resolve`

The route is server-to-server only. It uses Firebase Admin against the Orderfly production-data project and does not reuse the browser/customer-admin Firebase client mutation flow.

### Authentication

The request must include:

`x-esmeralda-integration-secret: <shared secret>`

Orderfly reads the expected value from `ORDERFLY_ESMERALDA_INTEGRATION_SECRET`. Missing, incorrect or shorter-than-32-byte values return `401`. Equal-length secrets are compared with a timing-safe comparison. No integration secret is committed to the repository.

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

Email is normalized with trim + lowercase, and phone is normalized to digits with a leading international prefix preserved. Either value can locate a customer, always within the requested brand.

Resolution rules:

1. A unique email match or unique phone match resolves the existing customer.
2. If both values match the same profile, that profile is resolved.
3. More than one match for an email returns `409 ambiguous_email_identity`; more than one match for a phone returns `409 ambiguous_phone_identity`.
4. If the email and phone point to two different profiles, return `409 customer_identity_conflict`. Do not create a third profile or merge the two existing profiles automatically.
5. When one value matches a profile and the other is new, keep the profile's primary email and phone and add the new value to `emailAliases` or `phoneAliases`.
6. No safe match creates a new customer. Names are never used as identity signals.

The resolver checks the existing brand's customers, including normalized alias values, so older profiles with inconsistent formatting remain eligible for safe matches.

### Concurrent duplicate prevention

The normalized `(brand, email)` identity is hashed with SHA-256 and reserved in `integrationConsumerCustomerIdentities`. The normalized `(brand, phone)` identity is reserved separately in `integrationConsumerCustomerPhoneIdentities`. Profile creation/resolution and both reservations are committed in one Firestore transaction.

Concurrent booking, checkout and Omnisend requests using the same email or phone therefore contend on the same identity reservation rather than independently creating profiles. If the two reservations point at different customers, or an index points to a missing or wrong-brand profile, Orderfly returns a conflict instead of remapping the identity.

The reservation documents store hashes, brand id and native customer id. They do not put plain email addresses or phone numbers in their document ids.

## Existing-customer update safety

When an existing customer resolves, the integration may update profile identity fields, add the mapped location and record Esmeralda integration metadata. It does **not** write or reset Orderfly commerce/loyalty aggregates such as:

- `totalOrders`
- `totalSpend`
- `lastOrderDate`
- calculated loyalty history

An absent incoming phone does not clear an existing customer's phone or `normalizedPhone`. A new email or phone is recorded in the matching alias array rather than replacing the primary value. Likewise, the booking placeholder name `Ikke oplyst`/`Not provided` does not replace an already populated customer name.

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
- `409 ambiguous_email_identity` / `ambiguous_phone_identity` / `customer_identity_conflict` / `identity_index_conflict`
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
