# Customer Funnel paid-order indexes (#148)

## Confirmed failure

On 2026-09-21 an authenticated superuser opening
`https://orderfly.dk/superadmin/analytics/cust-funnel` received the generic
production Server Components render error. The matching App Hosting runtime
log reported `9 FAILED_PRECONDITION: The query requires an index` for
`orders(brandId ASC, paidAt ASC)` in the production data project
`orderfly-39325`.

`getPurchasesInRange` in `src/lib/analytics/sources/orders.ts` passes a `paidAt`
date range to `listScopedDocuments`. That helper always adds the authorized
`brandId`, including for superusers. Selecting a location, or using a grant
limited to locations, adds `locationId` equality or `in` filtering. Both query
shapes need composite indexes. Filtering `paymentStatus` in code does not remove
that requirement. The existing `orders(brandId, createdAt DESC)` index serves the
order list and cannot serve the analytics payment-date query.

The live index inventory already contains the event indexes
`analytics_events(brandId, ts)` and `analytics_events(brandId, locationId, ts)`.
Neither required paid-order index was present. No authentication or query code
change is needed for this confirmed failure.

## Additive production repair

The exact definitions are in [analytics-firestore-indexes.json](analytics-firestore-indexes.json).
This is a partial manifest, not the full production index inventory. Do not
deploy it as a replacement manifest or approve deletion of other indexes.

After PO acceptance, the release operator should open Firestore **Indexes** in
the **data project `orderfly-39325`**, database `(default)`, and create only
missing indexes with query scope **Collection**:

| Collection | Fields, in order | Direction |
| --- | --- | --- |
| `orders` | `brandId`, `paidAt` | Ascending for both |
| `orders` | `brandId`, `locationId`, `paidAt` | Ascending for all three |

Firestore adds the document-name field automatically. Preserve all existing
indexes, single-field overrides, documents, security rules and access grants.
If `FS_COL_ORDERS` is overridden, use that configured collection instead.
Do not create these indexes in the App Hosting project
`orderfly-v21-10334086-b3076`.

Wait until **both** indexes show **Enabled**. An index still building can return
the same error. Application merge or redeployment alone cannot repair this
failure. Do not run aggregation or modify orders as a verification step.

## Read-only acceptance checks

1. Reload Customer Funnel while signed in with the existing superuser account.
   Confirm that the dashboard and its default date range load, rather than the
   generic error boundary.
2. Select a brand, then one of its locations, and apply the filters. Confirm both
   views load. Use a date range containing known paid orders; verify order counts
   and revenue are populated. A true empty range should remain empty.
3. If a location-limited analytics account is available, verify it sees only its
   authorized brand/location. Do not grant access or create an account for this
   check. Existing server scoping is unchanged.
4. Check the matching fresh App Hosting logs for remaining index failures.
   Record index readiness and live results in issue #148 before marking it Done.

## Validation and release status

The query shapes and live failure were inspected before this change. Validate
the JSON syntax and run the existing funnel regression to check the unchanged
aggregation behavior. The Firestore emulator does not prove production index
readiness; the live acceptance checks above are required. No TypeScript or UI
behavior is changed by this documentation/configuration-only PR.

At preparation time the indexes have **not** been created, and the live defect
remains open pending PO acceptance and the additive production repair.
