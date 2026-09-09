# Product creation and image persistence (#81)

## Behavior

The product form submits controlled values for both create and edit, including brandId, unchecked flags and array selections. It prevents the native action reset, shows a persistent error, retains fields and the selected file on validation/upload/transport failure, and prevents concurrent clicks while saving.

The action normalizes zero, one and multiple selections (including legacy `[]` field names). Zero locations retains the existing meaning: all locations of the selected brand. Zero topping groups/allergens means none. Explicit locations must belong to the brand and the category must cover those locations. The category and topping groups must have a location belonging to the brand. Allergen IDs must exist. Editing cannot change the product's brand.

Creation writes the product and its canonical ID together. A UUID retained by the open form makes retrying after a lost response idempotent. This does not identify duplicates across newly opened forms or constitute a bulk-import reconciliation mechanism.

## Images

JPEG, PNG and AVIF files up to 5 MiB are decoded and checked with sharp before their original bytes are saved. The action body limit is 6 MiB to leave multipart overhead above the client/server 5 MiB file limit. Animated/multipage, corrupt, oversized and mismatched MIME content is rejected.

Objects are immutable and scoped as `brands/{brandId}/products/{productId}/{uuid}.{extension}`. The existing Firebase Admin app uploads to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. Firebase download tokens produce URLs accepted by the existing admin and customer image components. No public object ACL changes, picsum URLs or Dully URLs are used as upload substitutes. Existing images are preserved when editing without a new file.

Deployment must have the real Orderfly production-data bucket configured, belonging to `orderfly-39325`, and the existing runtime service account must be able to create/read objects in that bucket. Do not use the App Hosting project's bucket as a substitute. Missing configuration or upload permission fails visibly before the product write. This PR does not change infrastructure, credentials or production data.

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
