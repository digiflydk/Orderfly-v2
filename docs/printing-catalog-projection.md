# Native product-only routing projection (#336)

`projectNativePrintCatalog(context, { orderId, brandId, locationId })` in
`src/lib/printing/catalog-line-projection.ts` prepares an immutable, credential-free
routing snapshot using the caller's **same native Admin transaction**. It has no
production imports/callsites, API, writes, order/payment changes, print enqueue,
transport, default routing, credentials or hardware effects. It does not close
parent integration issue #303. Every result has `dispatchAuthorized: false`.

## Actual storage and ownership

The inspected models and writers were `src/types/index.ts`,
`src/lib/checkout-items.ts`, `src/app/checkout/actions.ts`,
`src/app/superadmin/categories/actions.ts`, and
`src/lib/access/location-catalog.ts`. The `Category` TypeScript brand field is not
a reliable description of current storage: the category writer deliberately
omits `brandId`, and categories are owned through native `locationIds`. Shared
categories may span brands. Projection requires explicit category membership of
the selected native location, whose native `brandId` must match the request and
persisted order/product. It never uses a cart category field as authority. A
legacy category may retain a stale primary `brandId` because current writes merge
`{...before, ...categoryData}`. That field is deliberately neither read nor used:
a shared category remains valid across brands when native location membership
matches. Missing membership still rejects, regardless of the stale brand value.

The function reads the requested native order, brand and location in that
transaction, then referenced products and categories. Every document must exist
with its exact requested snapshot identity. An optional stored `id` must agree.
Known `deleted`/`isDeleted`/`isTestData` markers must be absent or false and
`deletedAt` absent or null. Products and categories must be explicitly active.
The canonical `isSyntheticProduct` storefront/checkout guard also rejects active
legacy QA titles and `DO NOT PREPARE` descriptions even when `isTestData` is
absent or false. Both selected native strings are type/length checked before the
guard regexes run (name at most 160, optional description at most 4,096 code
units); neither native description nor current name is returned.
Native brand/location `isActive`, if present, must be true. A product must belong
to the selected brand; its native category must exist and include the selected
location. Product `locationIds: []` retains the existing company-wide product
semantics in `documentScope`/`restoreCartItems`. Missing/malformed product
location lists are conservatively rejected. Category location lists must be
nonempty; no category membership is invented. No other brand's catalog rows are
queried or included by fallback.

## Lines and display text

This slice accepts only explicitly typed `product` lines from the persisted
order. Missing legacy product IDs/types require a later migration/adapter, not
name matching. Any combo or `comboSelections` property rejects the **whole**
projection as `combo_requires_projection`; no component is silently dropped,
invented or routed as one product. Native product/category lookups are deduplicated
while distinct order rows remain distinct. Line IDs are `line-0`, `line-1`, etc.
inside the returned order identity. They are stable for the same persisted row
sequence, not a claim of identity across arbitrary order rewrites/reordering.
Order mutation/revision identity remains work for the eventual integration.

Names and topping labels are historical display text from the persisted
`MinimalCartItem` written by checkout validation, preserving what was ordered.
Current native product/category ownership is independently verified. Stored row
category/brand assertions are ignored. This module does **not** independently
prove the checkout writer's provenance, reauthorize an option/topping selection,
validate current topping-group eligibility, or recalculate prices. Optional
`toppingIds`, when present, must be bounded/unique and correspond one-for-one with
labels; they are not returned. The future trusted transition integration must
retain its existing server checkout/option validation. No category label,
prices, customer details, payment/provider fields, receipt tokens or arbitrary
order objects are projected.

There is currently no canonical per-line kitchen-note field in `MinimalCartItem`
or its checkout writer. This slice does not invent a mapping from customer
address/delivery instructions. If a row contains `kitchenNote`, it rejects instead
of silently dropping it; a reviewed note-provenance adapter is future work.

## Bounds, retries and authority limits

There are at most 50 lines, 8 modifiers per line, 100 location IDs per native
catalog record, and 32,768 output code units. Native reads are bounded by
3 initial documents plus at most 50 distinct products and 50 categories.
Collection lengths are checked before element traversal; selected fields must
be own data properties, and sparse/accessor arrays reject without invoking an
accessor. Text lengths are checked before regex/trim, with an aggregate text
budget and a final output budget. Empty/oversized names, control commands,
newlines, bidi/format characters and lone surrogates reject. Nothing is truncated
and errors contain fixed codes, not supplied values. Only selected fields are
read: unknown private order fields, Firestore timestamps and provider objects
are neither traversed nor serialized. This is not a sandbox against privileged
Proxy traps or malicious Admin code.

The database must be the current server Admin database, and every read uses the
supplied native transaction. The function does not start or commit a transaction.
Call it again inside **every** fresh callback attempt and do not retain an older
projection for a retry. Changed native order/catalog ownership is then reread.
Context identity is not actor authorization, payment provenance, freshness or
write/commit authority. An internal trusted caller still has to authorize its
operation, validate the accepted/paid order transition and default-off target
policy, and compose the actual order plus original outbox/ledger writes atomically
within one shared application write budget. This module provides none of those
permits and cannot itself create a print job.

## Validation and release

```
npm run typecheck
node --test tests/unit/printing-catalog-projection.cjs tests/unit/printing-routing.cjs tests/unit/printing-domain.cjs tests/unit/printing-configuration.cjs tests/unit/printing-receipts.cjs
```

The dedicated tests execute the actual module with only Admin database I/O
isolated. They cover valid scoped projection, historical Danish display text,
location-owned categories, distinct duplicate-product rows, global products,
missing/deleted/foreign/inactive/malformed native rows, legacy synthetic-product
exclusion using the canonical guard with bounded strings, combo rejection,
bounded collections/strings/aggregate work, injection controls, private-field
omission, immutable results, retry revalidation, no writes and consumption by
the actual routing preview. One dedicated CI step is added without changing
workflow permissions or other test steps. There is no new browser flow requiring
Playwright fixtures.

The coordinator under #309 owns serial release after own tests, exact-current-head
CI and actual independent Codex review, then deployment identity and applicable
read-only live boundaries. Fixture success is not production invocation, live
catalog correctness, authenticated admin QA or physical print evidence. Existing
printer administration remains platform-superadmin-only. Configuration writes,
production intent/output and physical print remain off; no environment, secrets,
Firestore rules/indexes/data, hardware or Wolt configuration changes are needed.
