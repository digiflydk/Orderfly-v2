# Product creation and image persistence (#81)

## Behavior

The product form submits controlled values for both create and edit, including brandId, unchecked flags and array selections. It prevents the native action reset, shows a persistent error, retains fields and the selected file on validation/upload/transport failure, and prevents concurrent clicks while saving.

The action normalizes zero, one and multiple selections (including legacy `[]` field names). Zero locations retains the existing meaning: all locations of the selected brand. Zero topping groups/allergens means none. Explicit locations must belong to the brand and the category must cover those locations. The category and topping groups must have a location belonging to the brand. Allergen IDs must exist. Editing can explicitly move a product to another brand. The form sends its original brand separately, clears incompatible category/location/topping selections, and requires a valid category for the target brand. The server compares the submitted original brand with the stored brand and validates all target references before uploading or saving. A Firestore update-time precondition prevents a concurrent edit or brand move from being overwritten. These consistency checks are separate from authorization. The product ID, prices and existing image are retained unless the user changes those fields; no other product or historic order is rewritten.

Before a brand move, the server checks the stored source brand's `comboMenus`, `standard_discounts` and `upsells`. Product-group/upgrade references, product discounts, upsell product offers and product triggers block the move, including inactive or scheduled records. The error lists each affected record by name and ID and asks the administrator to remove or replace the references in the original brand before retrying. No image upload or database write occurs on rejection; form values and the selected file are retained. Category references, unrelated products and other brands do not block the move. An unavailable reference lookup also prevents saving. Same-brand edits do not need this check. This is a pre-save dependency check, not a transaction across all campaign writers; the product update-time precondition protects the product itself from concurrent edits.

Creation writes the product and its canonical ID together. A UUID retained by the open form makes retrying after a lost response idempotent. This does not identify duplicates across newly opened forms or constitute a bulk-import reconciliation mechanism.

## Images

JPEG, PNG and AVIF files up to 5 MiB are decoded and checked with sharp before their original bytes are saved. The action body limit is 6 MiB to leave multipart overhead above the client/server 5 MiB file limit. Animated/multipage, corrupt, oversized and mismatched MIME content is rejected.

Objects are immutable and scoped as `brands/{brandId}/products/{productId}/{uuid}.{extension}`. The existing Firebase Admin app uploads to the server-only runtime setting `FIREBASE_STORAGE_BUCKET`, falling back to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` for existing installations. Whitespace and the console's `gs://bucket/` notation are normalized. Invalid settings and standard Firebase buckets that do not match `FIREBASE_STORAGE_PROJECT_ID` are rejected before upload. If that server-only setting is absent, the expected project remains the Admin data app project. Custom bucket names still require release-time ownership verification. Firebase download tokens produce URLs accepted by the existing admin and customer image components. The URL is built from the token already saved in object metadata, with no second Firebase metadata API read after the GCS save. This removes a failure point that previously reported a failed upload even if that save had succeeded. Tests make that metadata endpoint fail to verify it is no longer a dependency. No public object ACL changes, picsum URLs or Dully URLs are used as upload substitutes. Existing images are preserved when editing without a new file.

Deployment must have the PO-confirmed Orderfly v2 product-image bucket configured, `studio-2819118380-ae26c.firebasestorage.app`, and the service account in `FB_SERVICE_ACCOUNT_JSON` (or its `FIREBASE_SERVICE_ACCOUNT_JSON` alias) must be able to create objects in that bucket. The code uses this explicit data credential, not the App Hosting default runtime identity. Saved token URLs must also be readable by customers. Do not grant roles to the hosting identity without checking which account actually signs the upload. Do not use the App Hosting project's bucket as a substitute. Missing/invalid/wrong-project configuration and Storage 401, 403 and 404 failures have specific, safe error messages. SDK errors are not logged wholesale because they may contain authenticated request headers. Storage logging records only stage, bucket and the safe diagnostic code. These messages preserve the form and selected file, and failures occur before the product write. This PR does not change infrastructure, credentials or production data.

An upload followed by a failed database write can leave an unreferenced object. Old or newly uploaded objects are not automatically deleted because an ambiguous write acknowledgement could mean the product already references them. Cleanup needs a separate reference-aware procedure.

References: [Next.js action body limit](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [Firebase Admin storage/download URLs](https://firebase.google.com/docs/storage/admin/start).

## Verification

Run from the repository root:

```sh
npm run typecheck
node --test tests/unit/product-save.cjs
node --test tests/unit/product-save-browser.cjs
```

The browser test can use an installed Chromium via `CART_CHROMIUM_PATH`. It runs the actual form and customer product card with an HTTP adapter into the actual product action and image-upload code. Only Firestore, Storage, navigation/Next image optimization and the cart/analytics contexts use synthetic fixtures. Storage objects retain actual bytes and are served back to Chromium, verifying JPEG/PNG/AVIF rendering after a full reload. No production writes occur. The tests do not establish production bucket permissions or the deployed Next image optimizer; those need post-deployment verification.

The action uses the existing `hasPermission('products:create'/'products:edit')` contract. The repository's permission implementation is still a placeholder that returns true. This pre-existing authentication limitation is not resolved by the product import fix and needs separate security work; brand validation is not a substitute for authentication.

## Import preservation and release

No live categories, groups, toppings, products or images are changed by this PR or its tests. Preserve Amager's existing 16 categories, 11 topping groups and one topping. Preserve Hellerup's existing products. Resume the separate import only after reconciling existing source-to-Orderfly identifiers; do not replay all creates blindly. The reported remaining import comprises 71 products, 23 groups, 138 toppings and 59 downloaded image files.

Workflow: PM -> PO -> Work -> targeted tests -> independent code review -> PO acceptance -> merge -> deployment -> live verification -> Done. Work does not merge or deploy. Post-deployment verification should confirm that saved image URLs load in admin and the customer menu. Creating the real Kildevand test record is a separate controlled write; issue #81 remains open until that acceptance check is completed.

## Follow-up after release #82 (#89)

PO reported a continuing upload failure on 9 September 2026. The original UI catch did not distinguish object save, metadata lookup, bucket configuration or IAM failures. Do not treat local fixture tests as proof that production IAM/bucket configuration works. #87 remains the controlled live acceptance gate, and #81 must remain open until it passes.

The initial investigation looked at Storage in **Orderfly - DB (`orderfly-39325`)**, which showed Get started. That did not establish whether the intended image project had Storage enabled. PO clarified that product images belong in the separately named **Orderfly v2** project. On 9 September 2026, read-only inspection of that project's Files view confirmed an active, empty bucket:

- Console project name: **Orderfly v2**.
- Project ID: `studio-2819118380-ae26c`.
- Bucket: `studio-2819118380-ae26c.firebasestorage.app`.
- Verified [Storage Files view](https://console.firebase.google.com/project/studio-2819118380-ae26c/storage/studio-2819118380-ae26c.firebasestorage.app/files).

The original Storage setup prerequisite is therefore withdrawn. Do not provision an additional image bucket in Orderfly - DB for this fix. `apphosting.yaml` now sets the explicit image bucket and `FIREBASE_STORAGE_PROJECT_ID` with `RUNTIME` availability. The latter retains bucket/project validation while allowing the approved separation from Firestore. These values come from trusted deployment configuration, never product form fields.

Firestore, Authentication and the existing Firebase Admin credential remain in the current data setup. The project named **Firebase app** (`orderfly-v21-10334086-b3076`) is still the documented hosting project, not the PO's image project. No database/credential migration, IAM modification or production upload has been performed by Work. Access to the Files view uses the console user's session and does not prove the application's service account can upload.

### Required release steps

1. Confirm the runtime pair matches the active Orderfly v2 bucket above. Keep existing Firestore/Auth configuration and production Storage rules; no open/test-mode rules or public write ACLs are required by Admin SDK.
2. Verify the account actually used by `getAdminApp()` from the existing service-account secret has `storage.objects.create` on that bucket in `studio-2819118380-ae26c`. This is cross-project Storage access; access to the console under the user's account is insufficient evidence. No broad Storage Admin grant is required by this implementation. Do not paste credentials or whole authenticated SDK errors into an issue.
3. Complete independent review, PO acceptance, merge/deploy and controlled JPEG/PNG/AVIF save/reload verification in #87, including token-based customer image downloads. Also edit an existing synthetic product to another brand with a valid category/location, reload, and verify that prices/image are retained. Do not close #81/#89 or resume the import solely because a health check or fixture tests pass.

The follow-up tests cover successful JPEG/PNG/AVIF persistence, an unavailable post-upload metadata endpoint, runtime bucket precedence/normalization, wrong-project rejection, safe authentication/access/missing-bucket diagnostics, successful brand moves, stale/concurrent edit rejection, target-reference validation and browser retry with both a replacement image and a changed brand. PR #90's review follow-up covers every source-brand reference type, inactive references, named dependency errors, lookup failures, unrelated/category references, same-brand edits and browser retry after a dependency is removed. Existing tests still cover singleton/multiple arrays, idempotent creates, price clearing and form preservation.
