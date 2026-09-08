# Commerce P1 corrections, issue #67

## Scope and release baseline

Developed from main `a433dbee0dc045bae97d3964a85ae545f12775e7`, including #63.
This change implements the four P1 work packages in #67. The subsequent P2
implementation is included in the same PR; see [commerce-p2-67.md](commerce-p2-67.md). No new customer login, configured
secret, production data migration or external payment is required to install
this code. Review, PO acceptance, merge, Firebase release and live QA remain
separate gates. Local tests are not live release evidence.

## Receipt access and payment state

New checkouts generate a random 256-bit receipt capability independently of the
cancel capability. Only its SHA-256 hash is saved on the order. The raw value is
sent to Stripe in the success URL, and must be kept with that URL. It is not a
new runtime secret. The existing attempt cache continues to encrypt the hosted
payment URL.

The canonical receipt, legacy redirect, lookup API and compatibility actions all
use `readGuestReceipt`. It checks the exact linked Stripe session, receipt token
when present, supplied order ID and store scope. It never derives a session or
token from an order ID. Internal full order reads are `server-only` modules and
are no longer callable public Server Actions. Public responses use an explicit
receipt projection, excluding PSP data, cancel/receipt hashes, payment references
and arbitrary database fields. Receipt routes suppress referrers and indexing;
API responses and dynamic receipt rendering are not cached.

Previously issued success URLs remain valid only with their exact linked random
Stripe session and store scope. This compatibility applies only to orders without
a receipt-token hash. Removing the token from a new receipt URL is rejected.

A Pending receipt checks Stripe server-to-server with a five-second SDK timeout
and no SDK retry. It becomes Paid only after the common transactional settlement
succeeds. That same helper handles signed webhooks, checks order/session/store
scope, counts an order once and tolerates a deleted customer or discount. Optional
analytics cannot turn a committed payment into a failure response. A temporary
read failure remains Pending; confirmed expiration is displayed as Failed without
inferring reservation release from a timeout.

The client shows Pending/Failed distinctly and polls at most ten times within a
45-second window. Polling stops on terminal state, unmount or timeout, and offers
manual status retry. Only a Paid receipt calls the existing matching-order cart
completion guard. It never creates a replacement payment.

**Security dependency:** this protects the application receipt entry points. It
does not close #57's broader Firestore rules, raw database/financial access or
payment-secret exposure work. Do not interpret this PR as certification of those
independent access paths. Existing admin authorization remains required. No live
customer record was accessed to test these rejection cases.

## Fulfillment and authoritative basket validation

Checkout's API and directly callable server action share the same bounded input
schema, including terms and delivery address. The location must be active, belong
to the brand, match the requested route and support the selected fulfillment
mode. The server reads current native catalog records and reuses restore's
availability and selection rules before customer/order/payment side effects.
Invalid products, combos or options produce an actionable rejection, never a
silent item removal during payment.

Selections use `asap` or an absolute ISO UTC timestamp. Display labels such as
“Tomorrow at 12:20” are no longer payment input. The shared calculator uses
Europe/Copenhagen, current opening hours, preparation/busy-time settings,
delivery duration and the seven-day preorder policy. Unsupported, expired and
out-of-policy slots are rejected. ASAP resolves to the earliest available slot,
including next opening when preorders are permitted. Scheduled selections are
rechecked immediately before the Stripe request, after potentially slow reads
and customer/reservation work. A failure there uses the existing safe hold-release
path. The order stores `fulfillmentAt` plus a human-readable deliveryTime snapshot.

Checkout refreshes time availability every 30 seconds and on window focus. The
time dialog filters stale slots every 15 seconds and on focus, then checks again
on Save. It computes the valid slot set once per update, not once per option.

The established delivery minimum policy is enforced server-side: native catalog
goods plus selected options, before promotions, excluding delivery, bag and admin
fees. Browser-provided subtotals cannot satisfy that minimum. The location model
has no delivery-zone/radius rules; this change enforces the configured delivery
mode, address requirement and minimum, and does not invent geographic coverage.

The existing price floor, discount eligibility, reservation, idempotency and
uncertain-payment handling remain in place. Toppings must have current catalog
prices in the submitted line total. A stale price is rejected for review. The subsequent P2
implementation unifies fractional-øre rounding; see the P2 document.

## Combo and option identity

The cart, saved choices, checkout schema, order and receipt carry native combo
group/product IDs. New builders set group IDs, and restoration upgrades legacy
group names only when they resolve uniquely. Unknown or duplicated groups,
missing selections, min/max violations, inactive/foreign selected products and
unavailable combo schedules/modes are rejected. Different selections cannot
collapse into the same outgoing order payload.

The server replaces submitted product/group/topping names with current native
labels. Kitchen/admin order detail, the customer receipt and Stripe line
descriptions show the selection snapshots. New product options carry topping IDs;
legacy option names are accepted only when uniquely resolvable. This preserves
#63's same-name/renamed topping behavior.

## Optional menu upsell

Desktop cart, mobile drawer and CartSheet use the shared `useMenuCheckout` hook.
A rejected or unresolved upsell read falls back to checkout after at most two
seconds. Late results cannot reopen an offer after navigation. A synchronous
in-memory guard blocks duplicate reads and navigation, and unmount stops late
navigation. Analytics failures cannot block the click. A valid offer still opens
normally and can be accepted or skipped. Menu navigation never creates payment.

## Focused local verification

No Actions, broad cross-browser suite, production writes or real Stripe charges.
Actual production source runs against synthetic external I/O. The local browser
checks use the installed Chromium binary and only the named cases.

```sh
npm run typecheck
node --test tests/unit/commerce-p1.cjs tests/unit/checkout-availability.cjs tests/unit/checkout-price-validation.cjs tests/unit/checkout-reliability.cjs tests/unit/checkout-route.cjs tests/unit/checkout-session-persistence.cjs tests/unit/promotion-review.cjs tests/unit/cart-restore.cjs tests/unit/checkout-recovery-regressions.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='P1 menu|^success:|two immediate|skipping an upsell|accepting upsell' tests/unit/checkout-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='only the matching paid checkout|changed fulfillment or bag' tests/unit/cart-browser.cjs
```

Local results: TypeScript passed. The selected server/component regression set
passed 111 cases; the added late-slot reservation regression also passed (112
covered cases in total). Eight selected checkout Chromium cases passed, plus six
cart completion cases including fulfillment/bag changes in another tab. These
counts describe local synthetic fixtures, not production test payments.

## Work Release and Work QA

Review and release the exact PR head with `[skip ci]`. Do not dispatch Actions.
Deploy through the established Firebase App Hosting flow after merge and verify
the actual running source SHA. Keep #67 open for independent review and exact-release live verification of P1/P2.

Targeted QA after release, using only authorized synthetic orders/test payments:

1. Pickup and delivery: open checkout normally, after closing and after leaving
   a selected time idle. Valid times open Stripe; stale times offer correction.
2. Ordinary, code, newsletter and automatic discounts: totals match and safe
   cancellation still releases that order's capacity. A transport uncertainty
   must not free a potentially payable session or start another order.
3. Two combos with different products and identified toppings: verify cart,
   reload, Stripe, saved kitchen order and receipt retain the exact selections.
4. On desktop and mobile, simulate upsell rejection/timeout. Checkout remains
   reachable; accept/skip works and double clicks create one payment attempt.
5. Complete an authorized Stripe test payment. The receipt shows Paid only after
   verification. Delay the completion webhook to check reconciliation; repeat
   the webhook and receipt refresh without duplicate counting.
6. With a synthetic receipt URL, remove/change token/session/order/store scope.
   No receipt data should be returned. No personal/payment data appears in logs.
7. Change the cart or fulfillment/bag choice in another tab before visiting an
   older paid receipt. The changed cart remains intact.

Do not mark the P1 release live-verified from local test results. Track #57's
remaining platform access risks separately and report any release blocker to PO.
