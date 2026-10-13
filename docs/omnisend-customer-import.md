# Omnisend contact import

Orderfly remains the canonical per-brand customer record. The Esmeralda table-booking bridge already resolves booking guests into `customers` through its protected, non-blocking outbox. Booking does not submit or infer newsletter consent.

The authenticated marketing worker also polls each enabled Omnisend brand through `GET /api/contacts`. It verifies `/brands/current` against the configured Omnisend brand before reading contacts. The first run paginates through the existing audience; later runs request contacts changed since a five-minute-overlapped watermark. Cursor state is brand-scoped, retryable and idempotent.

Every valid email contact is resolved into that brand's `customers` record by normalized email. New records preserve the provider creation date where available; existing commerce totals, loyalty values, customer notes and location links are retained. A hashed identity reservation coordinates with the booking resolver. Ambiguous same-brand matches are recorded in `omnisendContactImportErrors` without creating another customer. Different brands always receive separate customer records.

Email subscription status and consent evidence are stored separately from the profile:
- Current provider status is kept in `marketingContacts`; `unsubscribed` and `nonSubscribed` never count as Orderfly consent.
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
