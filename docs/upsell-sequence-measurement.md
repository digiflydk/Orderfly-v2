# Upsell sequence, badges and effect report

## Customer flow

All available configured products are retained in campaign order, inside a scrollable popup. On mobile this opens before the basket; on desktop the basket renders its editable lines and totals inline, and offers open only from the checkout button (including checkout from the header basket). The continue button stays outside the scrolling list. The add button adds products without option groups directly. Product titles/images still open details, and products with option groups retain native dialogs and validation. Already selected products (including menu components), inactive products and combo-only components are excluded as before.

An ordinary campaign has no `afterUpsellId`. A second campaign names the first campaign in `afterUpsellId`; it is only looked up after the first popup successfully adds an item. Its normal triggers, exclusions, location, channel, calendar and priority still apply. The second campaign uses its own existing percentage/fixed/no-discount settings. There are at most two popups in an interaction; rejecting either proceeds to the original destination (mobile basket or desktop checkout). After accepting the first offer, the next lookup uses the committed cart including the parent campaign ID. The follow-up has a 30-second bounded request budget instead of silently disappearing after ten seconds; a visible loading dialog lets the customer continue immediately. Skipping aborts and invalidates the request so a late response cannot reopen it. A failed optional lookup cannot trap checkout.

The public request carries the first campaign ID and cart line campaign IDs. These are hints, not authority. Server catalogue and price validation require an active, same-brand, first-level parent, a genuinely offered parent product in the cart, and qualifying parent triggers. Removing the qualifying item invalidates the follow-up discount on restoration/checkout. Standard and upsell item discounts compete rather than stack. Existing handled-offer storage remains session-scoped, not a permanent customer blacklist.

## Administration

The existing upsell form adds:

- **Vis efter accepteret kampagne**: blank means first offer; choose a first campaign to make this a follow-up. The parent must cover all selected restaurants.
- **Automatiske badges** and per-product **Automatisk / Populær / Vi anbefaler / Ingen badge**. Product choices refresh with the selected offer and brand.
- **Kontrolgruppe (%)**, 0–50, applicable to first offers. New campaigns default to 10%; legacy campaigns remain at 0% unless changed. No production campaign is modified by this code change.

Use the second campaign's existing heading, description, triggers and discount fields, e.g. a soda-first campaign followed by dessert with 20% off, or fries followed by dip. Turning off/deleting the parent safely prevents the follow-up from qualifying.

## Badges

Count paid, non-cancelled, non-refunded product units from the restaurant's last 30 days. Include explicit menu selections multiplied by menu quantity. Orders with partial refunds are excluded from popularity because there is no authoritative per-item refund allocation. Historical menus without saved component selections cannot contribute component units.

Among offered products the highest positive count gets **Populær**. If tied, the first in stable campaign order gets **Populær**, the second **Vi anbefaler**. No positive sales means no automatic badge. Manual choices always win, including **Ingen badge**, and replace the product's ordinary badge within the popup. Automatic badges use a five-minute server cache; a cold/failing lookup has a 750ms budget and omits automatic badges until data is available. Manual badges do not depend on sales availability. No client sees raw sales totals.

## Measurement and report

`/superadmin/upsells/report`, linked as **Se upsell-effekt**, requires analytics view access. Every event/order query retains native brand/location scope. Filters: Copenhagen calendar dates (maximum 93 days), brand, restaurant, campaign, product and step.

Client events use existing consent and identifier allowlists:

- `upsell_eligible`: first-offer assignment to treatment/control for a statistics-consented session.
- `upsell_offer_shown`: one popup interaction.
- `upsell_product_shown`: once per interaction/product when at least 50% of its card intersects the scroll viewport; includes actual badge/source and step.
- Existing `upsell_accepted` / `upsell_rejected` join by session, campaign and interaction. No replay of pre-consent actions.

Without a statistics session, offers remain available and no control-group assignment is made. The deterministic group uses restaurant/channel/session/campaign identity. Reopening with the same identity retains the group. Editing the configured percentage can change the allocation; compare stable campaign settings over a fixed test window.

Checkout saves `upsellMeasurement` from server-verified cart lines: campaign, native product, step, units, amount and item discount. Pending orders do not count as paid revenue. The report uses current paid/non-cancelled state, allocates cart discounts across merchandise, and applies net refund ratios. Partial-refund upsell revenue is explicitly an estimate. Unit counts and discount totals are before partial refunds. Older orders without a snapshot are not retroactively reconstructed.

The report separates:

- Offer impressions, acceptances, rejections and acceptance rate.
- Paid orders with upsell, units, net attributed upsell merchandise, item/allocated order discounts.
- Consented control/treatment sessions, purchasing sessions, conversion, net revenue/session and average order value. Only purchases after eligibility are joined. Mixed assignments are excluded. Product/step filters do not affect cohort totals; compare the same campaign/restaurant. Both visits and payments must fall in the date window, so recent windows can be immature.
- Badge/source product impressions, accepted additions and acceptance rates, deduplicated by interaction/product.

Attributed upsell revenue is not causal incremental revenue. Badge comparisons are descriptive, not randomized badge experiments. Cohort results do not claim statistical significance. There are no profit claims without product cost data. A cart addition removed before payment never becomes paid upsell revenue. No new pixels or third-party destinations are added.

## Validation and release

Local typecheck, production build, unit tests for rules/prices/refunds/serialization/popularity and real-component Playwright tests cover the first/second popup, discounts, skipping, mobile/desktop scroll, viewport impressions, stable controls and admin fields. Synthetic fixtures only; no production mutations.

Use a feature PR with `[skip ci]`; GitHub Actions are not used per PM instruction. Implementation remains separate from merge/deploy approval. After an authorized release, verify the deployed health SHA and a read-only storefront/admin flow. Configure real follow-up campaigns deliberately after release; this change does not create or activate them.

## Prepared follow-up branches

The public response now includes a follow-up per offered product without option groups. Each hypothetical acceptance is evaluated on the server with its native channel price and campaign discount. Campaign, catalog, standard-discount, linked-option and combo reads are deduplicated within this one request only. No shared cross-request cart or tenant cache is introduced. The first offer and its prepared branches arrive together, so accepting a simple drink switches directly to the matching second offer without a network round trip or loading dialog. Null branches continue immediately.

The prepared branch is used only for the unchanged source basket. Products requiring option selection and legacy responses retain the validated fallback lookup, because the actual selection may change eligibility. Final checkout still verifies prices and parent eligibility. First-load network latency remains; this change removes the additional request between prepared steps rather than guaranteeing zero network latency.
