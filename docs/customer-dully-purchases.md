# Dully customers and purchases (#834, PR A)

Dully orders from esmeralda.dully.io are a separate customer and retention source. The PM approved the processing basis (customer consent) on 2026-11-01. Retention is three years.

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

`retainUntil` is the order time plus three years. Deletion runs in PR E (a daily job), which also removes Dully-only profiles with no purchase inside the retention period.

## Next PRs

- B: authenticated backfill from day 1, plus a daily delta in the existing 20:23 run.
- C: customer detail and directory filter.
- D: retention report.
- E: three-year deletion.
