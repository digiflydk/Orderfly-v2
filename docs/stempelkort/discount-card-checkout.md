# Personal discount cards in checkout (#573, #574)

Checkout reads the existing host-only verified Club session. Email input alone never authorizes a card. The canonical customer, current member/session epoch, active brand/location, unique active company mapping, feature scope, active group and assignment must all agree. Disabled, expired, blocked, moved and ambiguous records fail closed.

The percentage applies repeatedly to full-price merchandise only. Existing item offers and combo items are excluded; delivery, bags and administration fees remain payable. Integer øre calculation is shared between summary and server. The card competes against existing order offers and wins only when strictly better. Existing one-time Club signup discounts are unchanged.

The order keeps an immutable amount, eligible base, percentage, scope, identity and configuration-version snapshot. Creation and pickup acceptance revalidate within the native transaction; online checkout rechecks before creating the Stripe session. A changed entitlement rejects submission for a fresh quote. Once a provider session exists its authoritative order snapshot remains stable for settlement, cancellation and refund accounting. A card never consumes a voucher reservation. The snapshot marks discounted purchases as ineligible for purchase stamps; there is currently no automatic online purchase-stamp producer, and ordinary purchases by cardholders are unaffected.

A legitimate card can reduce the total to zero, including decimal percentages which round to the entire eligible subtotal. Settlement permits Stripe `no_payment_required` only for a complete payment-mode DKK session with exact zero amount and an independently validated zero-total card order with no residual fees. Print proof independently retrieves and verifies the provider session and checks the persisted order again. Setup, incomplete, nonzero, unrelated and malformed sessions remain rejected. Replays do not duplicate accounting or print jobs. Provider contract: https://docs.stripe.com/payments/checkout/no-cost-orders .

## Customer login boundary

The supported normal order-entry flow uses `orderEntryUrl`, which sends apex-domain visitors to the canonical brand subdomain. Club mail login uses that same brand host, where the secure host-only cookie reaches checkout. The checkout offers a Club login link and requires the card email in contact details. Cookies are never shared across brands or forwarded. Same-origin login remembers a validated relative checkout return route for 30 minutes, including when the mail opens in another tab. For exceptional direct apex/custom-host checkout, the UI explicitly explains that the existing cart stays on the current page and is not transferred; its link opens the canonical brand/location ordering page in a new tab to start a new order. The original cart remains intact. No arbitrary return URL is accepted. Custom-domain login support is not introduced by this change.

## Verification

- Real verified-session checkout service: 24 tests including forged email, scope, ownership, unique company mapping, revocation, stale versions and transactional conflicts.
- Existing Club/reliability regression: 31 tests.
- Actual checkout component in Chromium at mobile and desktop widths: 53 tests, including summary and submitted-total agreement, login affordance and email invalidation.
- Settlement, print proof, native retries and rollback: 58 combined tests before decimal-rounding extension; 10 focused zero-total cases passed after extension.
- TypeScript typecheck passes. No production configuration, customer, order, mail or payment was created for these tests. Release/live acceptance remains coordinator-owned.

## Club signup suppression (#596)

The checkout signup configuration accepts the current location and checks the existing authenticated Club session against current card eligibility. An active usable personal card suppresses the entire Club signup box before any contact email is entered, even when another offer wins the basket comparison. No email lookup or browser flag can grant this status. Missing/disabled/expired/blocked/out-of-scope cards leave the configured Club campaign unchanged.

On suppression, the form clears previous Club opt-in and omits `subscribeToClub`, Club terms, consent/campaign versions and the personal Club-selection field from the outgoing order payload. Configuration refreshes on brand/location changes and browser focus, with older responses discarded. The order action independently rejects a stale or forged Club opt-in from the verified entitled customer before signup or consent side effects. Ordinary newsletter campaign behavior is preserved.

Regression coverage includes the real server configuration/action, anonymous and invalid entitlement cases, mobile/desktop hidden signup and payload assertions, plus activation after the customer has already checked the Club boxes. No production settings, members, orders or mail are changed by this verification.
