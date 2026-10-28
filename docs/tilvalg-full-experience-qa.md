# Full option experience acceptance

Browser acceptance renders the production components with synthetic catalog,
cart persistence and intercepted HTTP. Tests do not write orders or emit events
to production.

- Option search keeps selected choices when no result matches, reports result
  count, and clears its query without changing the selection.
- Reaching a group maximum gives visible feedback while preserving quantity
  and removal validation.
- Mobile edit cancellation and save return to the existing cart, preserving
  atomic draft semantics and current checkout totals.
- Both quick and configured upsells persist their offer identity; dismissing
  an offer keeps it hidden when the mobile cart reopens.
- The real analytics provider emits nothing before consent. Consent does not
  replay earlier selection changes. One successful add emits one outcome with
  the same interaction identity as its opening; editing gets a separate
  interaction and mode, without adding another item.
- Visible recommendation impressions and accepted offers share an interaction
  identity and session. Option event assertions exclude customer/option text.

Relevant browser files: `tilvalg-storefront-browser.cjs`,
`commerce-p2-browser.cjs`, `cart-browser.cjs`, and
`analytics-loading-browser.cjs`. Relevant contracts include option presentation,
public option serialization, restore/checkout pricing, relevant upsell products,
consent/aggregation and measurement cohorts. Final evidence must identify the
assembled source tree; development runs are not release signoff.
