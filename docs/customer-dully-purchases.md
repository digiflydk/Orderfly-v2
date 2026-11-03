# Dully customers and purchases (#834)

Dully orders from esmeralda.dully.io are a separate customer and retention source. The PM approved the processing basis (customer consent) on 2026-11-01. The agreed retention period is three years; it is not enforced automatically (see Deletion).

## What is stored

- `customers` (existing, brand-scoped): each Dully customer is matched to an existing Orderfly customer by normalized e-mail **or** phone, using `@/lib/customer-identity` and the shared reservations in `integrationConsumerCustomerIdentities` and `integrationConsumerCustomerPhoneIdentities`. A match adds the new e-mail or phone as an alias. Name and address are only filled in when empty; Dully never overwrites Orderfly data. With no match, a new customer is created with source `integrationSources.dully`.
- `dullyCustomerPurchases` (new, server-only): one document per Dully order. It holds brand, location, Dully account, customerId, order number, order and completion times (ISO with Copenhagen offset), pickup or delivery, line items, total, refunded amount, status and `retainUntil`. The document ID is `sha256(['dully-purchase', brand, account, externalOrderId])`, so reimports are idempotent. E-mail and phone live only on the customer, not on the purchase.
- `customers.externalPurchaseStats.dully`: count, amount, first and last purchase, recalculated from all of the customer's Dully purchases inside the same transaction. Only completed, paid orders that are not fully refunded count.
- `dullyCustomerImportConflicts`: when e-mail and phone point to different profiles, or the identity reservation is inconsistent, the order is held for manual review. Nothing is merged automatically. A conflict holds only the purchase reference and the reason, no contact data.

## What is not affected

Dully purchases are never written to `orders`. They do not change `totalOrders`, `totalSpend`, loyalty, revenue, printing, payment or feedback mail. An existing purchase stays with its customer: a changed e-mail or phone on a later import never re-links or merges profiles.

## Marketing

`marketingSubscriber: true` (from Dully's marketing-subscriber list) is stored only as evidence in `integrationSources.dully.marketingSubscriber`. The flag does not set `marketingConsent`, creates no event in the consent ledger and starts no sends or Omnisend sync. Any future use for marketing needs separate approval and must go through the existing consent flow.

## Deletion

`retainUntil` is the order time plus three years. The PM decided on 2026-11-02 not to build automatic deletion. Nothing enforces `retainUntil` today; it is kept so a later deletion job can use it. Access and deletion requests for individual customers follow the existing customer deletion.

## Import (PR B)

Superadmin → Feedback → Dully → "Kunder og køb til kundeanalyse" accepts up to 100 orders per import (JSON, format in the UI). The server action requires `feedback:edit` **and** platform-wide access (no brand-limited users). It uses the Dully account and restaurant already bound to the location, so a row from another restaurant is rejected. The audit (`dullyFeedbackAudit`, action `customers_imported`) stores counts only.

Backfill: every order from day 1 is exported from admin.dully.io in batches of 100 and imported here; reimport is idempotent. Daily delta: the existing daily run before 21:00 also imports the day's orders into this section. Marketing subscribers are marked with `marketingSubscriber: true` from Dully's subscriber list.

## Display (PR C)

- Customer list: customer type "Dully-kunde (webshop)" and a source badge "Dully · N køb". The no-orders segment still counts only Orderfly orders.
- Customer detail: the badge "Dully-webshop" and the card "Dully-køb (webshop)" with completed purchases, amount, first and latest purchase, days since the latest purchase, average days between purchases, and every order with time (Copenhagen), type, items, total and refund. The lookup runs only after `getCustomerDetails` has authorized the record, and is constrained to the record's brand. Only primitive fields reach the client.
- Dully page: "Vis køb der afventer afklaring" lists held purchases by Dully order ID and reason, for platform superadmins only and without contact data. They are resolved by correcting the contact details on the right customer and importing again; nothing is merged automatically.

## Retention report (PR D)

Superadmin → Customers → "Retention og genkøb" (`/superadmin/customers/retention?brand=`) shows one brand at a time. Brands are offered only when the session has a company-wide `orderfly.customers:view` grant for the brand, and only that brand's customer records are included. Purchases are paid Orderfly orders (`paidSaleAmount > 0`, matched by `customerDetails.id`) and counted Dully purchases (completed, paid, not fully refunded; net of refunds).

The page shows:
- Customers with purchases, the repeat rate (share with 2+ purchases), purchases per customer, and the median number of days between purchases.
- Customers active in the last 30/60/90 days, and customers with no purchase for 90+ days.
- A source split: Orderfly only, Dully only, or both.
- Monthly cohorts by first-purchase month (Copenhagen time), with the share who bought again 1–6 calendar months later. Future months are left empty.

The maths is pure and unit-tested (`src/lib/customers/retention.ts`). The report reads every purchase in the brand per request, which is fine at the current volume (~1,000 purchases). A pre-aggregated projection is needed before it grows by orders of magnitude.
