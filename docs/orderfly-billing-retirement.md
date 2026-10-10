# Orderfly Billing retirement (#227)

Orderfly will launch without subscription billing. Future shared billing will be designed in mPanel as a separate implementation.

## Audit and removal

The retired module read subscriptions and estimated MRR from active status and the brand plan monthly price. Its invoice reader returned an empty list. No subscription synchronization writer or subscription/invoice webhook handling was found. The existing Stripe webhook processes webshop order payments, not subscription billing.

Removed: Billing navigation, dashboard, brand billing dialog, manual brand-status mutation, Stripe customer portal action, duplicate billing sources, unused mock subscriptions/invoices and their unused types. Old `/superadmin/billing` bookmarks still require platform superuser authorization and redirect to Dashboard without billing reads or writes.

## Retained boundaries

- Webshop checkout, payment settings, Stripe order webhooks and order invoices remain intact.
- `SubscriptionPlan`, brand plan references and the mPanel catalogue bridge remain in use. Existing subscription reference checks still protect plan deletion.
- Stored subscriptions/invoices and legacy billing permission vocabulary are retained for data and integration compatibility. Retained permission strings do not expose a billing UI.
- No database migration, production data deletion or mPanel billing implementation is included. The deleted implementation remains available in Git history.

## Verification and release

Run typecheck, production build, desktop/mobile admin shell browser tests, access navigation and endpoint authorization tests, mPanel platform administration and brand editing tests. Confirm the removed menu is absent and old bookmarks cannot bypass authorization. CI and independent review precede PO acceptance and merge; production deployment and read-only live verification follow separately. Launch readiness of the rest of Orderfly is outside this removal.
