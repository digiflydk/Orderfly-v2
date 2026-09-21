# Superadmin feedback and latency (#52)

Code inspection found sequential independent reads on the Superadmin landing
page and dashboard. Those reads now run concurrently, preserving their queries,
results and error propagation. No cross-request cache or permissions change.
The statistics helper still reads complete customer, feedback and cookie-consent
collections, plus brands/locations also fetched for filters. This remains a
scaling bottleneck. No measured production speedup or cold-start diagnosis is
claimed by this change.

Superadmin Next links now share AdminLink, which retains Next Link props/ref and
uses the installed Next 15.5 useLinkStatus under the link. A fixed non-blocking
status indicator appears during actual navigation pending. It does not intercept
clicks, alter modified clicks or use a timeout as evidence of completion. A shared
loading.tsx covers streamed route content, including the dashboard. Upsell and
automatic-discount saves show Gemmer… from their existing pending state, retaining
submission locks and validation feedback. Other asynchronous buttons keep their
existing local indicators; there is no blanket spinner for every button click.

Validation: typecheck and node --test tests/unit/admin-loading.cjs. Local tests
cover pending/settled feedback, prop preservation, route status and concurrent
filter reads. These are not browser or live timing measurements. No full
Playwright suite or Actions requested, following the user's budget constraint.

Work Release reviews/merges/deploys. Work QA should throttle the network and check
sidebar links, create/edit/cancel links, back/forward, new tabs, query navigation,
route errors and consecutive clicks. Verify the indicator clears, no navigation
is duplicated, and validation failure clears Gemmer… while retaining form data.
Compare warm timings on landing/dashboard/upsells before and after release.

Reference: https://nextjs.org/docs/15/app/api-reference/functions/use-link-status

## Customer Funnel analytics (#150)

The Customer Funnel route and its data Suspense boundary reuse the same
`Indlæser…` spinner while the initial dashboard loads. Filter navigation runs in
a React transition and displays the same feedback until the new server-rendered
results commit. Existing results stay visible during the request, with the
dashboard marked `aria-busy`. Counting labels continue to describe the displayed
results until the next result arrives. No timers estimate completion, and the
existing route error boundary still handles failed reads.

Validation: `npm run typecheck` and
`node --test tests/unit/admin-loading.cjs tests/unit/analytics-loading-browser.cjs`.
The browser regression uses the production dashboard, filters and loading
component with controlled synthetic data and navigation transport. It checks
initial loading, pending filters, empty results, consecutive requests and errors.
It does not access production data. After independent review, PO acceptance,
merge and deployment, verify the initial spinner and date/brand/location filters
with a throttled connection on the live Customer Funnel page.

Requested sidebar cleanup in #53: remove Discount Validation and Offers/Combos
Validation links, move Upsells from Catalog to Promotions, place People & Access
directly before Billing, and remove Code Review, QA and UI Validation from System.
Standard Discounts remains available. These are navigation changes only; the
underlying routes are not deleted. Work QA should verify the group order and that
opening Upsells directly expands Promotions and highlights its link.
