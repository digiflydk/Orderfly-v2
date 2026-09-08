# Local evidence and release QA — #71

Candidate: branch `work/71-unified-order-flow`, based on main
`7518f2592987480326b35bca3fbc8934a206398b`. The PR records the exact published
source SHA; these fixtures and this report are in that same tree. No deployment
has been created by Work Dev. See [implementation and activation](unified-order-flow-71.md).

## Completed local checks

Only focused Node tests and local Chromium cases were selected. No Actions
dispatch, broad Playwright suite, production checkout or provider contact write
was performed. External payment/database/provider I/O uses synthetic fixtures;
React components, price/restore logic and transactional worker code are real.
Fixtures render the actual Tailwind theme and commerce stylesheet. Product
images are synthetic placeholders, so their screenshots do not validate live
catalog assets or image-loading performance.

| Area | Evidence |
| --- | --- |
| TypeScript | `npm run typecheck` |
| Cart/consent/provider contracts | `tests/unit/order-flow-71.cjs`: exact-line edit, stale edit rejection, atomic upgrade, option identity, concurrent consent dedupe, tenant rejection, email-only payload, provider account check, unsubscribe races, retries/leases, missing config, explicit renewal, test-data filtering, fail-closed admin/worker and public projection |
| Responsive cart | `commerce-p2-browser.cjs` selected #71 cases at 360, 390, 768, 820, 1023 and 1280 px: reachable CTA, no horizontal overflow, cancel/save and synchronous persisted changes |
| Products/upsell | Product upgrade save/cancel, inline add, required options, double-add prevention, editing one combo group without resetting another, hanging optional read and actionable delivery minimum |
| Old payment tab | Selected `cart-browser.cjs`: real provider invalidates the old checkout reference before a different tab confirms payment; native topping identities remain distinct |
| Checkout | Selected `checkout-browser.cjs`: invalid-email recovery, duplicate submit, optional read failure, server/transport retry, uncertain-payment lock, no extra payment link, bag only at checkout, mobile keyboard and newsletter grant/uncheck/best-price cases |
| Receipt | Selected `commerce-p1.cjs`: pending/failed cannot look paid; paid receipt includes combo choices and local pricing |

Commands use the locally available Chromium executable:

```sh
npm run typecheck
node --test tests/unit/order-flow-71.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='#71' tests/unit/commerce-p2-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='presentation|newsletter|immediate|invalid|retry|uncertain|direct|native-mobile|#71 lab:' tests/unit/checkout-browser.cjs
node --test --test-name-pattern='real receipt component' tests/unit/commerce-p1.cjs
```

These are reproduction commands for selected changed boundaries, not an
instruction to start all tests or Actions. A failed fixture selector was fixed
to include option price in its accessible name, and responsive-only selectors
were scoped to the visible panel. Business assertions were retained.

## Controlled before/after measurement

Identical synthetic checkout and local Chromium, 900 px viewport height, real
theme, a hanging optional upsell response. Time is from clicking the payment CTA
until navigating to the simulated hosted-payment URL. The baseline loader reads
the exact main source above; the candidate uses this PR tree.

| Width | Main baseline | Candidate |
| --- | ---: | ---: |
| 390 px | 2,080 ms | 88 ms |
| 1280 px | 2,061 ms | 72 ms |

These are individual local observations showing removal of the optional two-
second wait. They are not Stripe latency, field p75 Core Web Vitals, a statistical
benchmark or measured conversion uplift. Existing consent-aware Web Vitals and
verified-payment metrics remain the source for post-release LCP/INP/CLS and
conversion analysis. Target field p75: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1, with
release, date range, device profile and sample count reported.

Client events include recommendation shown/accepted/dismissed, combo upgrade and
newsletter selection. They remain behind the existing analytics consent gate.
Outbox status is operational sync evidence. Client acceptance is not a purchase
or proven incremental revenue; purchase value stays tied to verified paid orders.
Brand welcome-flow activation and causal uplift reporting are not claimed here.

## Independent QA and activation still required

Use one deployed release candidate with exact SHA, deployment reference,
browser/device, scenario, expected/actual result and screenshot recorded per row.
The following checks have not been performed against live services by Work Dev:

1. Real iOS Safari and Android Chrome: keyboard/safe-area, back, focus, reduced
   motion, zoom, long names and late-loading actual images. Confirm all six
   widths against the deployed build, not only the local fixture.
2. Complete controlled pickup and delivery through Stripe **test mode** to
   receipt, including correct restaurant/time/fees, cancel/retry, delayed and
   duplicate webhook, and an edited cart with an old payment tab.
3. Verify all existing ordinary/code/product/category/quantity/combo/newsletter
   combinations against current catalog configuration. Check stale campaigns,
   wrong store, unavailable options, after-close/time expiry, missing delivery
   minimum, stored old carts, blocked storage and network recovery.
4. Before provider activation: approve native-to-Omnisend brand mapping,
   single-opt-in policy, API key access and existing welcome automation. Verify
   private Firestore access and indexes, then the guarded administrator session,
   scheduler and retry view. The connected Esmeralda account must not receive
   CPH Pizza contacts by default.
5. Only after authorizing a specific test brand/contact with customer sends
   disabled: check one unique grant, duplicates, timeout/429/retry and opt-out
   before/during retry in that exact Omnisend account. Verify no SMS or welcome
   messages and preserve an evidence/cleanup plan. No bulk imports.
6. Review exact native test-product/combo records and publication flags before
   applying the documented reversible deactivation plan. Verify historical
   paid receipts remain unchanged.

Open activation dependencies are not waived by green local tests. Work Dev
publishes `[skip ci]` for review, and does not merge, deploy or mark #71 Done.
