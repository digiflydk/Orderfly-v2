# Newsletter stacking and compact product options

User-requested follow-up to the merged order flow #71 / PR #72, based on main
`edc13a988402916aebb206bdaa6baefa64ba9fe1`. Includes the previously prepared
newsletter preview/actual-saving correction, which had not been pushed.

## Campaign setting

In `/superadmin/discounts`, select **Automatic on newsletter signup**. The
**Tillad rabatstabling på nyhedsbrevsrabatten** switch is directly below that
selection. It reuses the persisted `discounts.allowStacking` boolean and saves
and reopens both values. No new collection, migration or parallel promotion
engine is introduced. No live campaign configuration was changed.

- Missing/false: existing policy, non-combo products without item discounts.
- True, only for `applicationType = newsletter_signup`: all charged merchandise
  after item discounts, including toppings and combos. The minimum is evaluated
  against this same merchandise amount.
- Delivery, bag and admin fees are excluded. Monetary amounts round to øre,
  including the total discount submitted by the browser.
- Automatic cart/quantity offers still compete with the newsletter amount;
  only the better cart discount applies, and an existing manual code is retained.
  The switch does not enable stacking of several cart discounts or manual codes.
- Fixed-amount newsletter offers use the same base and cannot exceed it.

The public offer projects the persisted setting. Checkout previews use
`basketTotals`. Payment loads the campaign independently and uses the validated
charged item totals, so the browser cannot enable stacking or increase the
discount by submitting a different amount. Existing brand/location, schedule,
signup eligibility, usage limits, catalog/option price validation and consent
checks remain in place. Unchecking signup removes its discount.

### User's example

| Item | Original amount | Charged amount |
| --- | ---: | ---: |
| Pizza with 25 kr. of toppings | 114.00 | 84.00 |
| Fries | 45.00 | 45.00 |
| Pepsi Max | 35.00 | 33.25 |
| Merchandise | 194.00 | 162.25 |

Stacking off: 45 × 10% = 4.50 kr.; total including 4 kr. bag = 161.75 kr.
Stacking on: 162.25 × 10% = 16.23 kr. after rounding; total = 150.02 kr.

## Product and combo options

Groups are always expanded sections with one heading and one short
required/optional selection rule. Removed the duplicated summary/heading,
collapse control, consecutive separators, header border and group divider lines.
The footer remains distinct, with quantity and total visible. Required groups
remain first. Whole-row selection, radio/checkbox limits, default choices,
keyboard navigation, validation focus, edit/cancel and combo selections remain.

## Focused local verification

Synthetic external I/O only; actual production components and price calculation.
No Actions run, deployment, live payment or customer/provider write.

- Typecheck and diff whitespace check.
- 14 selected checkout browser cases, including the exact screenshot with stacking
  on/off, preview, check/uncheck, payment request, email/cart changes, minimum,
  competing discounts and rounding.
- 13 server/calculation/configuration cases: basket/order/Stripe totals, option
  prices, menus, minimum based on net merchandise, fee exclusions, consent
  rejection, manipulated amounts, default-off behavior, save and reopen.
- 7 existing availability and newsletter discovery/eligibility cases, now also
  checking projection of the stacking setting.
- 5 product/combo browser cases: desktop/mobile options, retry/cache, required
  choices and validation focus, row selection, maximum 50 options and retaining
  other combo selections during an edit. Mobile screenshot inspected locally.

```sh
npm run typecheck
node --test tests/unit/newsletter-discount.cjs tests/unit/checkout-availability.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='newsletter' tests/unit/checkout-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='options retry|topping cap|recommended product|editing one combo' tests/unit/commerce-p2-browser.cjs
```

Publish this follow-up in a new PR into main; #72 is already merged. Independent
review, PO acceptance and release/live verification remain separate steps.
Live QA should check the configured newsletter discount on/off with approved
synthetic data and confirm the same totals on real iOS/Android devices.
