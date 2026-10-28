# Product options: complete customer journey

## Scope and acceptance

This release covers five connected improvements requested by the PM: option discovery and ordering, clearer presentation, mobile cart editing, relevant complementary offers, and measurable customer outcomes. It extends the existing compact product dialog rather than replacing price resolution or checkout validation.

| Area | Acceptance |
| --- | --- |
| Discovery | Preserve explicit catalog ordering, required choices and defaults. Make unranked options predictable and search useful without hiding selected options. |
| Presentation | Explain selection limits and missing required choices. Retain accessible 44px controls, price labels and content-sized panels without redundant success text. |
| Mobile | Edits preserve selections and return customers to their cart. Checkout remains reachable on short screens; recommendations do not block navigation. |
| Complementary offers | Use configured eligibility and current catalog prices. Exclude already-present products, preserve offer attribution through customization, and keep paid additions opt-in. |
| Measurement | Record consented impressions, interactions and successful additions. Surface cohort-based completion/dropoff and upsell results in existing analytics; use paid orders for financial totals. |

The component-specific documents describe the final implementation and tests. No claim of increased sales is made from automated tests: effects require real observations after deployment. Missing samples must not be presented as proven zero performance. Historical periods without new instrumentation are not a comparable baseline.

## Reference patterns

- [Domino’s Denmark builder](https://www.dominos.dk/menu/pizza/PIZZA): base/size followed by ingredient categories and a running total.
- [Pizza Hut customization](https://www.pizzahut.com/c/content/build-your-own-pizza): crust, sauce, cheese and toppings; availability varies by location.
- [McDonald’s mobile ordering FAQ](https://www.mcdonalds.com/us/en-us/mcdonalds-app/faqen.html): customization, saved preferences and unavailable-product handling.

These sources inform design choices, not a claim that a particular layout causes a sales uplift. No inferred dietary suitability or invented popularity labels are introduced.

## Release workflow

PM scope → coordinator and implementation agents → local unit/browser tests and typecheck → independent review → expected-head merge → Firebase App Hosting → read-only live acceptance. GitHub Actions are not used, as explicitly instructed by the PM. Production data and real customer orders are not test fixtures.
