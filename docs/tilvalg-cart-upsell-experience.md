# Cart and contextual recommendations

## Customer behavior

- On mobile, editing a basket line returns to the basket after saving or cancelling. The customer does not need to find and reopen the basket to review the result.
- Quantity, remove and close controls preserve 44px touch targets. The checkout area stays outside the scrolling basket and respects the device bottom safe area.
- Configured recommendations remain inline, with at most three distinct products and compact 64px images. They do not block checkout or introduce another mandatory step.
- Offer products are taken from the current native catalog, in configured offer order. Missing, inactive, duplicate, standalone already-added and combo-included products are removed from the visible recommendations. Server matching additionally owns brand/location/channel eligibility.
- Dismissing a recommendation synchronizes responsive basket views and survives basket close/reopen for the browser session.
- Quick add and configured products both preserve the offer ID in the basket. Checkout continues to validate the offer and price on the server. Required product options still must be selected; a recommendation never bypasses them.

## Measurement

An actually visible recommendation emits `upsell_offer_shown`. Its stable interaction ID is passed to acceptance and dismissal events. Acceptance fires only following a successful cart save. Responsive views are observed separately and hidden offers do not count as visible impressions. These interaction events are not paid conversions or proof of sales uplift.

## Validation

`tests/unit/relevant-upsell-products.cjs` verifies native catalog authority, configured order, duplicate/availability filtering, cart/combo exclusions and the three-offer display cap. Commerce browser coverage verifies quick add, required options, cart editing, rejection and checkout non-blocking behavior. Typecheck, independent review, production build and read-only post-deploy acceptance remain release gates. GitHub Actions are not used under the PM's explicit instruction.
