# Menu cart and payment presentation (#65)

## Behavior

- Cart restoration shows a spinner with an accessible loading label. The visible
  “Indlæser kurv og aktuelle priser…” sentence is removed. Current-price readiness
  and the real restore-failure message/retry remain in place.
- Desktop menu totals/checkout CTA, mobile drawer total and floating cart amount
  exclude the bag fee. Other fees and discounts keep their existing calculations.
  A 50 kr. basket with a 4 kr. bag therefore shows 50 kr. on the menu and 54 kr.
  at checkout. The checkout Bag row and confirmed opt-out remain available.
- Complete Order still redirects immediately to hosted payment. There is no
  additional Continue to payment link. If browser navigation is interrupted,
  pressing Complete Order again opens the same returned URL without calling the
  session endpoint again. Customer, time, discount, terms and bag controls remain
  locked after a session is known. An unresolved response without a known URL
  still prevents another submission.

No payment API, reservation, pricing validation or storage contract is changed.
This presentation issue does not replace the independent checkout recovery fixes
in #63. Coordinate overlapping checkout/component test files when releasing them.

## Local verification

Typecheck passed. Nine targeted Chromium cases passed: seven checkout/menu cases
and two CartProvider restoration cases. The browser fixtures run actual React
components with synthetic cart data or simulated catalog/checkout I/O; they do
not represent a live Stripe payment or a full styled Next.js build.

```sh
npm run typecheck
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern 'presentation:|^success:|invalid email|immediate submissions|^uncertain:' tests/unit/checkout-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern 'spinner|catalog failure' tests/unit/cart-browser.cjs
```

Coverage includes menu desktop/mobile amounts, checkout bag removal, direct
payment, interrupted navigation on both CTAs, a single request after repeated
submission, required-field rejection, uncertain payment lock and restoration
failure/retry. The CartProvider fixture has no Tailwind CSS; its loading check
asserts mounting and readiness rather than spinner styling.

No Actions, broad suite or production data mutations were run. Publish with
`[skip ci]`; independent review/PO acceptance, Work Release merge/deployment and
live verification remain separate gates.

## Work QA prompt after deployment

Record the deployed SHA and test on desktop and mobile:

1. Open the menu, add an item and reload. Confirm that no cart/prices loading
   sentence appears and the restored quantities/prices remain correct.
2. With a configured 4 kr. bag, verify a 50 kr. basket displays 50 kr. in the
   desktop total/CTA, mobile floating bar and drawer. At checkout verify the Bag
   row and 54 kr. total. Remove the bag through its confirmation and verify 50 kr.
3. Using the approved test-payment setup, complete valid checkout. Verify direct
   Stripe navigation without an extra Continue to payment link. Invalid customer
   fields must still prevent the payment request.
4. In an isolated browser fixture, interrupt only the Stripe navigation after
   successful session creation. Confirm the primary button reopens that same URL
   with no second session request and payment details remain locked.

Do not mark the issue Done from local results alone. Report live PASS/FAIL with
the tested SHA; redact customer details and payment/session URLs from evidence.
