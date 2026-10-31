# Checkout consent text layout

The checkout newsletter, Club signup and personal Club offer cards keep their
copy within the available width on mobile and desktop. This includes full,
unbroken privacy-policy URLs supplied by the Club programme.

The previous checkbox rows used a flex child with the default minimum content
width. A long URL could make that child wider than the card and push ordinary
lines past its right border. The text child now uses `commerce-consent-copy`:
`min-width: 0`, `flex: 1` and `overflow-wrap: anywhere`. The checkout card itself
also permits wrapping, including headings and notices. Existing checkbox
non-shrinking rules remain in place. Text is wrapped, never clipped or truncated.

This is a presentation change only. Consent wording and versions, checkbox
state, Club terms links, validation, discount eligibility and payment payloads
are unchanged. No production data migration or new setting is required.

## Verification

Run from the repository root:

```sh
npm run typecheck
CART_CHROMIUM_PATH=/tmp/menu-chromium node --test tests/unit/checkout-browser.cjs
```

`CART_CHROMIUM_PATH` is optional when Playwright's browser is installed normally.
The regression uses the production React checkout and compiled styles, with
external I/O simulated. It checks rendered text ranges against the card's inner
padding for newsletter, Club signup and personal Club offers at 320 and 390 px,
with normal and doubled text sizes, plus desktop and the existing V1 layout.
It also checks checkbox sizing, explicit unchecked defaults, toggling, the
unchanged Club terms destination and absence of payment requests.

The 390 px Club case reproduces the reported overflow on baseline `a60033a`
and passes with the correction. Existing checkout tests continue to cover
signup consent payloads, discount selection and payment safety.

Post-deployment verification should inspect the Club/newsletter card on the
normal brand checkout at mobile width without submitting an order or payment.
A physical iPhone accessibility setting is not simulated by the Chromium test;
its doubled-font case exercises the same available-width constraint.
