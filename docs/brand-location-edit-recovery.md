# Brand and location edit fixes (#75)

## Report and scope

PO reported on 9 September 2026:

- Saving brand information opens the Superadmin error boundary with `Server Action "…" was not found on the server`.
- Esmeralda locations display `Unknown Brand`; the brand selector on an existing location is empty and cannot be changed.

This change starts from main `7022c81` after PR #73. No production documents, brand assignments, credentials, or deployments were changed by Work Dev.

## Findings and resulting behavior

The location form explicitly disabled its brand selector whenever `location` was supplied. The selector is now editable on existing locations. A dangling current reference is shown as **Brand mangler. Vælg et brand.**, with all existing brands available for selection. An empty catalogue has an explicit explanation.

Brand readers previously spread stored data after the Firestore document ID, so an obsolete embedded `id` could replace the real ID. `orderBy('name')` also excluded documents without a name field. All three readers in the brand action module now use canonical document IDs. The list includes all existing brand documents, uses a fallback display name, and sorts the result in Danish. Location overview/edit reads also retain canonical document IDs. A truly missing reference is labelled **Brand mangler**, not silently assigned by name or guessed from a slug. The reported production Esmeralda documents have not been inspected: whether those specific references are dangling or were misread remains for read-only live verification.

Saving a location checks that the selected brand exists and, on an edit, that the location still exists, in one transaction before writing. Assignment changes affect this location only. Products, campaigns, customers, integrations and historical orders retain their existing brand ownership; this is not a tenant data migration. Selecting another real brand can therefore change which brand-scoped catalogue/offers are available at this location. The existing storefront cache is invalidated. Brand name changes also invalidate location pages.

The form serializes booleans as `"true"`/`"false"`; the server previously tested only for field presence. Saving unrelated information could therefore activate a disabled location, enable preorders and open closed weekdays. Parsing now respects the actual value, including native checkbox `on` and absent fields.

The missing Server Action message matches a build-version mismatch, commonly an old browser page after deployment. See [Next.js documentation](https://nextjs.org/docs/messages/failed-to-find-server-action). This PR adds recovery, not multi-build routing or a claim that deployment skew is eliminated:

1. Brand details/settings/analytics and location forms catch the error without discarding their fields.
2. **Genindlæs med mine ændringer** saves the current draft to that tab's session storage and does a full reload.
3. The new form restores the draft once, preserving the route's authoritative document ID, and asks the user to review and save again.
4. No failed mutation is replayed automatically. Generic transport failures do not trigger deployment recovery or automatic retries.
5. Drafts expire after 15 minutes and are removed on restoration. If storage is blocked, recovery does not reload or lose the current fields.
6. The Superadmin error boundary uses a full reload for missing actions instead of repeating a stale router reset.

The separate brand appearance editor is not changed. On an already-open page loaded before this release, the existing failure may still require an initial manual full reload to load the recovery code.

## Validation and permissions

Both save actions now invoke the existing operation-specific permission gate before parsing or writing. The existing `hasPermission` implementation is a development placeholder that grants access; this PR does not replace session/authentication infrastructure or claim production-grade authorization. No new API endpoints were introduced. Field validation, duplicate brand slug/CVR checks, canonical identities and server-side existence checks remain authoritative. Editing a deleted brand returns a controlled error.

## Local verification

All data and transport are synthetic. Browser tests render the actual React forms and call the actual server mutation functions through a local fixture transport, with in-memory Firestore substituted. They do not run against Firebase or the Next production Server Action protocol.

- TypeScript check: passed.
- 10 server/data/error-classification cases: passed.
- 8 Chromium browser cases: passed, including save/reopen, changing an existing/missing assignment, stale action recovery for both forms, no automatic replay, generic network errors, blocked storage, empty catalogue, expired drafts, identity preservation and full boundary reload.
- `git diff --check`: passed.

```bash
npm run typecheck
node --test tests/unit/brand-location-edit.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/brand-location-browser.cjs
```

## Review and release handoff

PM/PO requirements -> Work implementation -> targeted tests -> independent code review -> PO acceptance -> merge -> Firebase deployment -> read-only live verification -> Done.

After deployment, verify the real Esmeralda brand/document relationship and that the brand selection and name render on the overview and edit page. Live writes need a controlled reversible QA test. Open a brand form before a subsequent deployment and verify draft recovery on a stale action, then explicitly save and reopen a synthetic record. Existing product/offer ownership must be considered before assigning an established location to a different real brand.

## Additional product-page report in the same PR

PO also reported the generic production **Server Components render** error on the product page and requested that the fix be included in PR #76.

The product readers returned raw Firestore `createdAt`/`updatedAt` timestamps, and the list/new/edit pages passed related database records directly to client components. A reproducer using a real Firebase Admin `Timestamp` and the RSC renderer shipped with the installed Next.js fails with **Only plain objects ... can be passed to Client Components**. The fixed pages pass the same renderer with timestamps in products, brands, locations, categories, topping groups and allergens. The screenshot contains no usable digest or server log, so the live incident has not been correlated to a specific server exception; this is a reproduced render failure in the reported flow.

- Reuse the existing timestamp conversion at product reads and all three product page boundaries. No timestamps are rewritten in Firestore.
- Keep canonical product document IDs, including edit links when a stored `id` is obsolete.
- Include products without `sortOrder`, which the product creation action does not set. Existing numbered ordering (including zero) is retained; unnumbered records follow in deterministic ID order.
- Show **Pris mangler** for missing or non-numeric prices rather than crashing the whole list or treating the value as zero. Price validation and checkout calculations are unchanged.
- Load and convert the duplication dialog's locations with the page data, eliminating the uncaught post-mount Server Action request. Legacy locations without `deliveryTypes` do not crash this read.

Additional local verification:

- 6 RSC/data cases passed, including the regression reproducer, all three actual page components, canonical IDs, unsorted products and not-found behavior.
- 4 browser cases passed across the documented targeted runs: product overview/filtering at 390 and 1280 pixels, actual edit/new form navigation and related choices, and duplication dialog location availability. The harness uses Next's bundled React and actual components, with fixture transport and synthetic data.
- The 10 existing brand/location server cases passed again, now also covering missing legacy delivery types.
- Typecheck and diff check passed. There are 28 targeted cases covered across this PR's runs, including the previous 8 brand/location browser cases.

```bash
node --test tests/unit/product-page-rsc.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/product-page-browser.cjs
```

After deployment, open the actual product overview and an existing product on desktop/mobile. Confirm names, prices, edit links and product choices. If the generic server error persists, capture its digest and corresponding server log to identify any additional live-data failure. No product mutation or production data import was performed in this fix.
