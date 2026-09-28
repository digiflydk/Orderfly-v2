# #192: Code minimum with nonstackable item offers

The checkout policy for ordinary codes is unchanged: only full-price products
without an active item offer count toward the code's minimum and discount base.
Already discounted products and combos are excluded. The newsletter signup
campaign can opt into a separate, explicit stacking policy; `allowStacking`
metadata on an ordinary code or a standard discount does not enable general
stacking.

Previously, checkout sent only the eligible amount to code validation. A cart
with Margherita 79 kr. discounted 5% to 75.05 kr., dressing 10 kr. and two
drinks at 20 kr. has 125.05 kr. charged merchandise but only 50 kr. eligible
for the code. The generic “minimum 100 kr. not reached” response concealed the
automatic item offer that excludes the pizza.

Validation now reports that an existing offer or menu cannot be combined with
the code when charged merchandise reaches the minimum but eligible merchandise
does not. It displays the eligible amount and required minimum. If the charged
merchandise itself is below the minimum, the ordinary minimum message remains.
Client precheck sends rounded charged merchandise for this explanation; the
payment action independently derives both amounts from validated catalog and
cart prices and makes the authoritative decision before creating an order or
Stripe session. No campaign configuration or migration changes.

## Verification

- Targeted `tests/unit/discount-conflict-192.cjs`: exact QA cart rejects before
  order/Stripe with the same message in precheck and payment validation.
- Without the automatic offer, the 129 kr. cart accepts 10%: 12.90 kr. code
  saving and 116.10 kr. merchandise total with bag fee disabled.
- A genuinely undersized basket retains the minimum error. Existing newsletter
  stacking and checkout settlement tests cover adjacent rules.

After release, QA should use an isolated, reversible QA campaign and verify
both messages and the unchanged totals at Esmeralda Amager. A code-only
checkout may be verified without completing a payment; no production campaign
needs to be modified for this code change.
