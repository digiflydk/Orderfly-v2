# Legacy promotion details (#186)

Discount and standard-discount documents predate the current forms. Their dates
may be Firestore timestamps, ISO strings, or serialized timestamp objects;
optional form fields may be absent. Read paths normalize these representations
before rendering. Missing day/time restrictions retain the checkout meaning of
no restriction, and edit forms supply defaults for absent optional fields.

The write actions retain unknown stored fields and usage counters on edit. No
bulk migration or production record change is required. An absent description
is accepted when an old code is saved. A malformed date is omitted from the
form instead of throwing during server rendering. An edit preserves an
unrecognized stored date for explicit administrative review; a user clearing
a visible date sends a separate clear instruction. No hidden legacy date is
silently erased on save.

An older singular `referenceId` is shown as the selected product or category
and saved into `referenceIds` without removing the legacy field. An active
standard discount with a populated date that cannot be parsed is excluded from
storefront and checkout eligibility; the admin form remains readable.

`node --test tests/unit/legacy-promotion-details.cjs` exercises the three
document IDs named by QA with historical field variants, read and edit paths,
and preservation of usage, schedule, scope and product configuration. These
fixtures are reconstructed variants, not exports of live Firestore documents.
After an approved deployment, inspect the actual `SUMMER20`, newsletter signup
and `Pizza Pizza` documents in signed-in Superadmin before saving changes.

## September 28 P0 list navigation

Firebase App Hosting runtime logs for revision `studio-build-2026-09-28-015`
record `Error: unauthorized` at 17:29:56 UTC during the five-list QA run.
The RSC request for `/superadmin/discounts` at the same instant returned 200
with an error payload; a plain HTTP status therefore did not prove that the
page rendered. The generic client boundary hides the error in production.
The log also records stale Server Action IDs from an earlier deployment.
The parent Superadmin layout redirects an expired session, but its page can
render concurrently and throw first. Each promotion list and edit/new route
now checks its own scoped read before loading data. A 401 redirects to login,
a 403 renders the access-denied view, and unexpected Firestore/data failures
still surface for diagnosis. The check never grants access; the existing
scoped reads and transaction authorization remain in force.

Combo list/detail reads also tolerate absent historical location arrays and
Firestore, ISO or serialized timestamp dates. These values are normalized
only for display. There is no migration or change to stored campaigns.

Read-only inspection of the three actual Firestore documents found the
retired native location `AkGaLAwyJfJ1KR12Dd79` on all three. `Pizza Pizza`
has four product references; the regression fixture checks that all survive
an unchanged save. The existing newsletter rule ends on September 18, 2026,
so a September 28 checkout is ineligible by its current terms. Do not extend
its end date as part of this P0 fix.

Manual verification after deployment: sign in to Superadmin, open the five
list routes, inspect the three named edit forms and one newly created QA rule,
and compare the saved configuration before and after a controlled no-op save.
Check Sales & Orders, Newsletter & Omnisend, Loyalty and Esmeralda Amager
checkout as regressions. A signed-out visit must go to login. If access to an
authenticated session is unavailable, leave the issue open and report the
live-positive-path verification as pending.
