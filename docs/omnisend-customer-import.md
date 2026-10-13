# Omnisend contact import

Orderfly remains the canonical per-brand customer record. The Esmeralda table-booking bridge already resolves booking guests into `customers` through its protected, non-blocking outbox. Booking does not submit or infer newsletter consent.

The authenticated marketing worker also polls each enabled Omnisend brand through `GET /api/contacts`. It verifies `/brands/current` against the configured Omnisend brand before reading contacts. The first run paginates through the existing audience; later runs request contacts changed since a five-minute-overlapped watermark. Cursor state is brand-scoped, retryable and idempotent.

Every valid email contact is resolved into that brand's `customers` record by normalized email or phone. Matching is brand-scoped and uses normalized primary values plus `emailAliases` and `phoneAliases`. If email and phone identify the same profile, both source records attach to it; the existing primary email and phone stay in place and new values are saved as aliases. If the two values point to different profiles, or either value matches multiple profiles, the importer records a conflict in `omnisendContactImportErrors` and does not create another customer or merge existing profiles. Hashed email and phone identity reservations coordinate with the booking and checkout resolvers. Different brands always receive separate customer records.

Email subscription status and consent evidence are stored separately from the profile:
- Current provider status is kept in `marketingContacts` per imported email address; `unsubscribed` and `nonSubscribed` never count as Orderfly consent. `customers.marketingConsent` represents consent for the profile's primary email only. Subscription or unsubscribe status for an email alias does not change consent for the primary address.
- `marketingConsent` becomes true from an Omnisend import only when the email channel is subscribed and Omnisend supplies both a consent source and consent timestamp. A provider status by itself does not prove consent.
- Imported status/consent snapshots are written idempotently to `marketingConsentImports`. They contain the brand/customer ids, hashed email, provider contact id, status, consent source/date and import time, not the email address, IP address or user agent.
- A provider unsubscribe suppresses older synced consent. Pending explicit Orderfly consent jobs remain subject to the existing captured-time and provider checks. Consent is never copied between brands.
- Imported contacts with no paid orders appear under the existing no-orders customer type. Customer filters remain based on the current brand-scoped Orderfly customer and paid-order data.

The importer runs inside the existing authenticated notification/marketing heartbeat. It does not create campaigns or send newsletters. Runtime setup reuses `ORDERFLY_OMNISEND_BRANDS`; each enabled mapping needs the correct Omnisend brand ID and an API key with the `contacts.read` scope. The existing contact sync also reads Omnisend contacts to reconcile local signups. No secret or key is stored in source control.

Verification:
```sh
node --test tests/unit/omnisend-contact-import.cjs tests/unit/omnisend-193.cjs
npm run typecheck
```

Run a controlled QA address only after merge, deployment, and confirmation of the runtime mapping. Check the customer, import snapshot and consent status. Do not trigger an Omnisend campaign as part of this check.
