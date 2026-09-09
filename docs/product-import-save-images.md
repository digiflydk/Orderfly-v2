# Product creation and image persistence (#81)

## Behavior

The product form submits controlled values for both create and edit, including brandId, unchecked flags and array selections. It prevents the native action reset, shows a persistent error, retains fields and the selected file on validation/upload/transport failure, and prevents concurrent clicks while saving.

The action normalizes zero, one and multiple selections (including legacy `[]` field names). Zero locations retains the existing meaning: all locations of the selected brand. Zero topping groups/allergens means none. Explicit locations must belong to the brand and the category must cover those locations. The category and topping groups must have a location belonging to the brand. Allergen IDs must exist. Editing can explicitly move a product to another brand. The form sends its original brand separately, clears incompatible category/location/topping selections, and requires a valid category for the target brand. The server compares the submitted original brand with the stored brand and validates all target references before uploading or saving. A Firestore update-time precondition prevents a concurrent edit or brand move from being overwritten. These consistency checks are separate from authorization. The product ID, prices and existing image are retained unless the user changes those fields; no other product or historic order is rewritten.

Creation writes the product and its canonical ID together. A UUID retained by the open form makes retrying after a lost response idempotent. This does not identify duplicates across newly opened forms or constitute a bulk-import reconciliation mechanism.

## Images

JPEG, PNG and AVIF files up to 5 MiB are decoded and checked with sharp before their original bytes are saved. The action body limit is 6 MiB to leave multipart overhead above the client/server 5 MiB file limit. Animated/multipage, corrupt, oversized and mismatched MIME content is rejected.

Objects are immutable and scoped as `brands/{brandId}/products/{productId}/{uuid}.{extension}`. The existing Firebase Admin app uploads to the server-only runtime setting `FIREBASE_STORAGE_BUCKET`, falling back to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` for existing installations. Whitespace and the console's `gs://bucket/` notation are normalized. Invalid settings and standard Firebase buckets belonging to a different project than the Admin data app are rejected before upload. Custom bucket names still require release-time ownership verification. Firebase download tokens produce URLs accepted by the existing admin and customer image components. The URL is built from the token already saved in object metadata, with no second Firebase metadata API read after the GCS save. This removes a failure point that previously reported a failed upload even if that save had succeeded. Tests make that metadata endpoint fail to verify it is no longer a dependency. No public object ACL changes, picsum URLs or Dully URLs are used as upload substitutes. Existing images are preserved when editing without a new file.

Deployment must have the real Orderfly production-data bucket configured, belonging to `orderfly-39325`, and the service account in `FB_SERVICE_ACCOUNT_JSON` (or its `FIREBASE_SERVICE_ACCOUNT_JSON` alias) must be able to create objects in that bucket. The code uses this explicit data credential, not the App Hosting default runtime identity. Saved token URLs must also be readable by customers. Do not grant roles to the hosting identity without checking which account actually signs the upload. Do not use the App Hosting project's bucket as a substitute. Missing/invalid/wrong-project configuration and Storage 401, 403 and 404 failures have specific, safe error messages. SDK errors are not logged wholesale because they may contain authenticated request headers. Storage logging records only stage, bucket and the safe diagnostic code. These messages preserve the form and selected file, and failures occur before the product write. This PR does not change infrastructure, credentials or production data.

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

Read-only inspection of Firebase Console on 9 September 2026 found that **Orderfly - DB (`orderfly-39325`) → Storage still shows Get started**. Opening the setup wizard showed the proposed default bucket `gs://orderfly-39325.firebasestorage.app`; the wizard was cancelled without provisioning. This is a confirmed missing default Storage setup, not proof of the exact HTTP error returned by the earlier upload. Firebase's runtime log view exposed request entries but did not establish the failing Storage request or its IAM status. Build logs show hosting-project auto-configuration, which is not evidence of the actual `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` value used by the uploader.

`apphosting.yaml` now explicitly proposes `FIREBASE_STORAGE_BUCKET=orderfly-39325.firebasestorage.app` with `RUNTIME` availability. It is the name shown by the data project's setup wizard, not a guessed fallback or the hosting bucket. The bucket does not get created by this YAML. Work has not provisioned storage, changed IAM/secrets or deployed the configuration.

### Required release steps

1. Before deploying, the release owner provisions the default bucket in [the data project's Storage console](https://console.firebase.google.com/project/orderfly-39325/storage). Confirm the storage region as part of that infrastructure change; the wizard's initial US-EAST1 selection was not accepted by Work. Use production security rules, not open/test-mode writes. The upload uses Admin SDK and does not need permissive client write rules.
2. Confirm the resulting bucket is exactly `orderfly-39325.firebasestorage.app`. If a different approved bucket is chosen, amend the runtime setting before release; never point data storage at the App Hosting project.
3. Verify the account actually used by `getAdminApp()` from the existing service-account secret has `storage.objects.create` on this bucket. No blanket public ACL or broad Storage Admin grant is needed by this implementation. Verify Firebase token downloads work on a saved object during controlled QA. Do not paste credentials or whole authenticated SDK error objects into an issue.
4. Complete normal independent review, PO acceptance, merge/deploy and controlled JPEG/PNG/AVIF save/reload verification in #87. Also edit an existing synthetic product to a different brand with a valid category/location, reload, and verify that prices/image are retained. Do not close #81/#89 or resume the import solely because a health check or fixture tests pass.

The follow-up tests cover successful JPEG/PNG/AVIF persistence, an unavailable post-upload metadata endpoint, runtime bucket precedence/normalization, wrong-project rejection, safe authentication/access/missing-bucket diagnostics, successful brand moves, stale/concurrent edit rejection, target-reference validation and browser retry with both a replacement image and a changed brand. Existing tests still cover singleton/multiple arrays, idempotent creates, price clearing and form preservation.
