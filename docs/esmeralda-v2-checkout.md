# Esmeralda V2 cart and checkout

Issue #780 retains the existing cart, price calculation, quantity limits, delivery quote, discounts, loyalty, consent and hosted checkout request contract. No example foods or prices are introduced.

The server-provided StorefrontV2 context enables the V2 presentation only for the Esmeralda V2 host. Cart portals carry the same version marker. The floating cart and checkout action bars reserve the mobile safe-area inset and content space beneath the forms.

V2 shows only the configured online payment handoff, labelled **Gå til betaling**. Payment methods remain the responsibility of the hosted provider. A location with online payment disabled cannot submit via V2: the customer sees an explanation and the action stays disabled. V2 never silently falls back to pay-at-pickup. V1 still offers the existing configured payment choices.

Validation:

- `node --test tests/unit/storefront-v2-payment.cjs`
- `node --test tests/unit/checkout-browser.cjs`
- `npm run typecheck`

The browser suite uses a local HTTP server, a synthetic catalog, mocked customer data and a fake hosted payment endpoint. It verifies valid hosted handoff, invalid contact rejection, disabled hosted payment rejection and mobile action visibility without production writes. Fixture prices exist only in tests.

Release still requires current-head green CI, independent review, repository merge gates, deployment SHA verification and a read-only live journey. These tests do not authorize unattended production orders or payments.

## Mockup layout correction

The V2 mobile cart now fills the viewport instead of reusing a short bottom sheet. Its branded top bar, delivery/location summary, image-led item rows, separate edit/remove controls, rectangular quantity selector and outlined “Tilføj flere retter” follow the approved menu-to-payment and à la carte references. Only the middle of the cart scrolls; checkout remains reachable at the bottom. Desktop uses a bounded side panel.

Checkout has its own heading, compact service/time cards, labelled 16px contact inputs and guest reassurance. Existing consent, offers, validation and order totals stay present. The fixed payment bar is inset with safe-area clearance; the online provider still owns payment selection. The V2-only selectors leave V1 presentation intact.

`CHECKOUT_SCREENSHOT_DIR=/path/to/evidence` enables initial/scrolled 320px and 390px checkout captures in the browser suite. Geometry checks cover overflow, minimum input font size and sticky payment action position. The captures must also be visually reviewed against the mockups; these geometry tests alone do not establish visual approval.
