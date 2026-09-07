# Loyalty release (#54)

One coordinated release delivers corrected customer scoring and customer rewards.
The score and balance are different: the score describes purchasing behaviour;
the balance is a financial credit earned by verified accounts on future purchases.

## Product rules

- Program configuration is per native brand ID, disabled by default. The draft
  defaults are 5% earned credit, 1 DKK minimum redemption and a 50% merchandise
  redemption cap. PO chooses values before activation. Earn rate is capped at 25%
  and redemption at 90% in this version.
- One point equals one ore. UI shows DKK. No expiry in this version. Balance is
  shared across that brand's locations, never between brands.
- Only a signed-in, email-verified customer earns or spends credit. Checkout email
  must match the verified account. Firebase UID, not a submitted email, owns the
  wallet. No rewards are granted for historical orders or anonymous purchases.
- Earn on rounded merchandise amount after discounts/redemption. Delivery,
  bags and admin fees do not earn credit. No redemption with cart-level automatic,
  code or newsletter discounts; product discounts can coexist. No marketing
  subscription is required for loyalty.
- Full/partial refunds reverse earned and restore used credit in proportion to
  cumulative refunded cash/paid cash. This is the explicit v1 refund policy,
  including fee refunds. Rounding is in integer ore, with full refund restoring
  the full original amounts. Credit already spent can create a negative balance;
  future earnings offset it. It must never be silently reset to zero.
- Paid orders must be refunded in Stripe before admin cancellation. Pending
  Stripe checkout cancellation uses the existing verified expiration flow.

## Customer score/data

`customerMetrics` is shared by the customer list, details and Esmeralda history.
It derives counts/spend/date from paid, non-cancelled orders with remaining net
value. Pending, cancelled and fully refunded orders do not contribute. Partial
refunds reduce spend. Missing lastOrderDate no longer hides new customers.

Recency and frequency bands are ascending lower bounds in days; frequency uses
average days between qualifying orders and is zero for fewer than two dated
orders. Delivery bonus retains its configured points weighted like other factors.
Default ideal repeat customer now scores 91 and can reach Loyal (minimum 80).
Weights must total 100; bands must increase; classifications cover 0–100 without
gaps/overlap. Both min and max have consistent meaning. No historical wallet grant.

The admin's explicit customer-reconciliation action transactionally recalculates
stored aggregates within the selected brand and audits the change. Use only for
reviewed legacy records. It uses recorded payment/refund truth, not direct Stripe
reconciliation: refunds made before this release need Stripe reconciliation or
replay before historical data is accurate. Admin/integration displays calculate
time-sensitive scores at read time; persisted scores are not a daily scheduler.

## Payment and storage

- `loyalty_wallets/{hash(brand,uid)}`: integer balance/held counters.
- `loyalty_orders/{orderId}`: immutable brand/UID/program-derived quote, hold,
  paid/released state and cumulative refund corrections.
- Wallet `entries` subcollection: reservation, paid/released and refund history.
  Customer account displays the latest 30 entries; history is not deleted.
- `loyalty_programs/{brand}` stores policy; `loyalty_audit` records configuration
  and reconciliation actor/actions. Server-only writes via Firebase Admin SDK.

Wallet transactions prevent two checkouts spending the same balance. Native
prices are checked before reserving credit. Program changes during reservation
reject stale quotes. Pre-request failures release; an unknown Stripe request
outcome retains the reservation until verified expiry. Normal expiry/cancel uses
the existing Stripe cancellation mechanism. No arbitrary shorter expiry timer.

Webhook and confirm-from-session now use one settlement function, verifying
order/brand/location/session/currency/amount and actual paid status. A merely
complete unpaid session cannot mark an order paid. Line amounts, fees and coupon
are rounded consistently so Stripe and stored receipt totals agree in ore.

Order/capacity settlement and wallet settlement use the Admin SDK in separate
idempotent transactions. If the latter fails, webhook returns 500 for retry; a
repeated payment still retries the wallet step without incrementing order counts.
Do not claim an atomic cross-ledger transaction. Monitor/replay failed webhooks.
Refunds arriving before payment are retained and netted on later settlement.
`charge.refunded` is cumulative, so repeats and older events do not double-reverse.

## Release activation gates (Work Release)

1. Review the entire PR. Before its initial deployment, provision hosting runtime
   secrets `LOYALTY_ADMIN_UIDS` (only Omair's verified native Auth UID) and
   `LOYALTY_FINANCIAL_RULES_READY` (initial value `false`) and grant the App Hosting
   backend access. `apphosting.yaml` declares both as RUNTIME-only references.
   Missing secrets will block App Hosting deployment. Merge/deploy the backend
   only after this preparation. No Actions/full Playwright requested by PO.
2. Use production data project `orderfly-39325` for Firebase Auth and data; hosting
   project remains `orderfly-v21-10334086-b3076`. Verify client project and Admin
   service account agree. Enable Firebase email/password auth, authorized domains
   and verification/password reset delivery. App uses Firebase's mail templates.
3. Create/verify the intended account. Set `LOYALTY_ADMIN_UIDS` to Omair's exact
   Firebase Auth UID. Do not use names, email or the legacy permissive admin guard.
   New program/score/reconciliation mutations verify token revocation and UID.
4. Deploy the reviewed backend first with loyalty disabled, then the scoped
   `firestore.loyalty.rules` to **data project `orderfly-39325`** using
   `firebase deploy --only firestore:rules --project orderfly-39325 --config firebase.loyalty.json`.
   Compare with the active rules before replacement. This file is based on the
   wildcard observed by Work Release and Work dev on 2026-09-07. If production
   rules changed since then, merge its explicit exclusions into the current rules.
   Browser clients cannot read/write loyalty financial records, capacity records
   or payment gateway secrets, or write orders/customers/score settings, including
   nested paths. The one compatibility wildcard explicitly excludes these paths;
   no overlapping allow bypasses the restriction. Existing unrelated permissions
   and order/customer reads remain unchanged. This is not a complete platform ACL.
   Checkout customer upsert, order creation, reservation, settlement, cancel and
   refund now use native Admin SDK access. Customer creation rereads inside a
   transaction; order UUIDs use create-only writes. Protected customer/status/
   payment-settings mutations require a revoked-token-checked, allowlisted 15-minute
   HttpOnly admin session. The UI provides explicit login/confirmation and logout.
   Check the deployed protections before enabling. Inspect any pre-existing
   loyalty documents; do not adopt untrusted balances written under the old rules.
   The previous payment gateway document and exported key getters were public.
   Rotate the Stripe secret/webhook credentials after this boundary is deployed;
   key getters now live in an internal `server-only` module and settings are only
   returned to an authenticated financial administrator. Never log secret values.
5. Only after that verification set `LOYALTY_FINANCIAL_RULES_READY=true` in runtime.
   Roll out that secret version on the reviewed SHA. Program activation and public
   program reads fail closed without this operator gate, even if a stored record
   already says enabled. This variable is an
   explicit operator attestation, not an automated rules inspection.
6. Verify Stripe webhook signature config and subscribed events:
   checkout.session.completed, checkout.session.async_payment_succeeded,
   checkout.session.expired and charge.refunded. Scope/currency checks use DKK.
7. PO selects rates/minimum/cap and enables the brand from Superadmin Loyalty.
   Record exact SHA, deployed rules, verified UID/provider/domain, Stripe mode/events
   and chosen economic configuration as release evidence. Financial release is not Done until controlled live QA passes.

## Targeted verification

Run `npm run typecheck` and:

```
node --test tests/unit/loyalty-release.cjs tests/unit/loyalty-payments.cjs tests/unit/checkout-session-persistence.cjs tests/unit/checkout-price-validation.cjs tests/unit/loyalty-boundary.cjs
```

Tests exercise actual score/ledger/payment/action code with mocked Firebase/Stripe,
including serialized concurrent reservation attempts, repeated settlement, stale
refund events, refund-before-payment, debt, deleted customer, incorrect scope,
invalid amounts, verified identity, quote caps, legacy checkout scenarios and
fractional percentage prices. They do not verify real Firestore contention, auth
mail delivery, browser redirects or deployed rules.

Focused local emulator and browser commands (Firebase CLI and Java 21 required):

```
firebase emulators:exec --project demo-orderfly-loyalty --config firebase.loyalty.json --only firestore,auth 'node --test tests/loyalty-emulator.cjs'
firebase emulators:exec --project demo-orderfly-loyalty --config firebase.loyalty.json --only firestore,auth 'npx playwright test --config playwright.loyalty.config.ts'
```

Both refuse to run without the exact loopback emulator hosts. Never point these
fixtures at production. The emulator suite exercises actual authorization rules,
Admin transactions/Firestore contention, token checks, payment/cancel/refund and
brand separation. The small browser application under `tests/loyalty-app` imports
production checkout, login, account, server actions and ledger. Only unrelated
cart/catalog configuration and external Stripe are simulated; Firebase Auth and
Firestore run locally. Fixture aliases exist only in the test application's
Next config, never in production. This does not prove real Stripe checkout,
mail delivery, production session config or live rules deployment.

Work QA on the exact released SHA: new/returning verified accounts; unverified,
wrong email and unauthorized admin refusal; program save/reopen; real Stripe test
payment -> matching order/receipt/balance; next purchase redemption; parallel
checkouts; cancel/expiry and retry; code/newsletter/item/automatic discount
combinations; full and partial test refund with event replay; brand separation;
signout/refresh; no double credit. Verify corrected admin/integration scores and
reconcile one approved legacy customer. Label test data and confirm cleanup.
Do not retroactively award historical credit. Retain failed webhook evidence.

Reference: Firebase ID-token verification and Stripe event types:
https://firebase.google.com/docs/auth/admin/verify-id-tokens
https://docs.stripe.com/api/events/types

## Local verification of the release-blocker correction

The correction includes explicit native brand selection for new admin-created
customers, preservation of their financial counters, and paid cancellation checks
inside the same transaction as the status update. The archived order action
forwards to that same guarded implementation. Existing financial admin sessions
are cleared by the shared logout action.

Current focused evidence: 29 local unit tests, 3 Firebase emulator scenarios and
4 Chromium checkout scenarios. The Chromium fixture exercises actual checkout
UI, token handoff and payment actions against local Firebase with simulated
Stripe. The full Playwright suite and GitHub Actions are not used. Production
Auth/UID, rules, credential rotation, historical Stripe reconciliation, brand
activation and live purchase/refund verification are separate release evidence.
