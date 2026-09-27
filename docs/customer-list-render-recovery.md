# Customers module audit and list render recovery

## Active boundaries

| Area | Source | Behaviour |
| --- | --- | --- |
| Admin entry | `src/app/superadmin/layout.tsx`, `customers/page.tsx` | Session gate, then parallel customer, brand and location reads. |
| Customer read/write | `src/app/superadmin/customers/actions.ts` | Tenant-scoped list/detail, create/edit/delete, derived loyalty metrics. |
| Authorization | `src/lib/access/orderfly-session.ts`, `scoped-data.ts` | Native grants limit the customer query to authorized company brands. |
| List/detail UI | `src/app/superadmin/customers/client-page.tsx`, `[customerId]/page.tsx` | Local search/filters and details with orders, feedback and cookie consent. |
| Data creation | `src/app/checkout/actions.ts`, `src/lib/integrations/esmeralda-consumer-customer.ts` | Checkout and Esmeralda booking integration create or update native customers. |
| Financial updates | `src/lib/server/settle-checkout.ts` | Paid checkout transaction updates stored counters and latest order date. |
| Scores and feedback | `src/lib/loyalty/model.ts`, `src/lib/feedback/customer-history.ts` | Recalculate scores from paid orders; feedback detail is permission-gated. |

`src/customers/*` is a legacy copy outside the active App Router tree. The
`/superadmin/website/customers` page edits website logo entries in general
settings and does not read the restaurant customer collection.

## Investigated failure paths

The active list reads *every* customer of each authorized brand, then *every*
order for those brands, plus all brands and locations. It recalculates metrics
and passes the full list to the client. This is unbounded work on each render;
large production data or a failed Firestore request can still cause a server
error. Production logs or the failing digest are required to determine whether
this is the reported failure. No query error is suppressed.

App Hosting logs for `/superadmin/customers` on September 27 identified the
reported live failure: `Only plain objects ... can be passed to Client
Components`. The logged nested value was
`integrationSources.esmeralda.lastSyncedAt`, a Firestore Timestamp. The former
list mapper spread the entire database document into Client Component props.
The initial defensive date/location conversion did not handle this nested field.

The list now constructs an explicit row containing only fields its UI uses, and
passes only brand IDs and names. This excludes integration metadata, consent
details and any future nested Firestore objects from the server-to-client
boundary. It also handles a missing `locationIds` array and different
top-level date formats.

Both list copies use the same conversion. Missing locations display as an empty
list and invalid optional dates display as blank. No database records change.

The customer detail route has independent Firestore queries and date formatting.
Its Export and Anonymize buttons currently have no action. These do not explain
an error upon opening the list and are not silently changed by this repair.

Verification: `npm run typecheck`, focused Playwright conversion tests and
`node --test tests/unit/loyalty-internal.cjs`. The form browser test needs a
Chromium executable, which is unavailable in the current local environment.
After merge and deployment, open `/superadmin/customers` with a permitted
admin account and check the list, brand filter and a customer detail link.
If the server error remains, inspect the App Hosting log for the exact digest
and failing Firestore request before changing query behavior.
