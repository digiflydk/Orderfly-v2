# First Esmeralda V2 menu setup

Migration: `esmeralda-first-combo-menu-2026-10-30`. Issue #780. PM authorized the first menu setup on 2026-10-30 and waived the Codex review quota gate for the implementation release; functional tests and normal deployment verification remain required.

The existing ordinary Pizza Combo is preserved. This creates only `comboMenus/esmeralda-v2-pizzamenu-20261030`, named **Pizzamenu**, scoped to Esmeralda brand `oeypKaMyYcQjIwaa1PtV`, Amager location `eibiesSbluQTmp3mUqly`, and `storefrontVersions: ['v2']`. No unrelated catalog records, orders, payments, secrets or access settings change.

| Selection | Existing product | Menu price before product modifiers |
|---|---|---|
| Margherita | `a401ceb4-3638-4bad-9a39-0088827eade4` | 95 DKK |
| Pepperoni | `9e6202ff-1f3a-4ed8-81f8-1615c13be554` | 105 DKK |

One 0.33 l Pepsi, Pepsi Max, Faxe Kondi or Faxe Kondi free is included. The two pizza products use their existing required base selection and product-specific optional modifiers. Both standalone prices are 16 DKK below their corresponding menu price. The surcharge is explicitly 10 DKK for Pepperoni, not inferred from standalone prices. Pickup and delivery prices are identical. No dip/dessert is added. Menu contents and prices are verified against the live legacy Pizza Combo and public catalog on 2026-10-30.

Only these confidently matched pizza choices are in the first review menu. Other legacy pizza choices, including ambiguous Salat pizza, are not migrated. The legacy offer retains all of its choices.

## Release and apply

1. Merge implementation and migration, deploy, and verify the release supports per-product price adjustments and V2-only visibility.
2. Dispatch existing **Firestore data migration** workflow (`firestore-migration.yml`) from `main`, `migration=esmeralda-first-combo-menu-2026-10-30`, `mode=preview`.
3. Inspect its one planned create and retain its manifest SHA-256. Preview reads exact scoped source documents and refuses changed prices, names, inactive/missing products, incorrect brand/location or changed legacy group cardinality.
4. Dispatch the same workflow from `main` with `mode=apply` and the reviewed `manifest_sha256`. Preserve the existing required-reviewer protection on its `production` environment. No new secrets or workflow permissions are needed. Apply rereads every source and the target in one transaction, checks their hash, and only creates the one menu. The migration runner records `dataMigrationAudit`.
5. A subsequent preview must report zero planned changes. Refresh public catalog caches, then verify V2 standalone menu and Pepperoni upgrade, drink selection, required base selection, modifiers, cart edit/reload and checkout total. Verify V1 does not show the new menu. Do not submit an order or payment as part of read-only acceptance.

The normal-price metadata uses the existing admin convention: highest standalone pizza89 plus drink20 equals109. This is not a universal savings claim: Margherita standalone plus drink is99, while Pepperoni is109. Do not display a blanket discount of14 for this heterogeneous menu.

The migration never overwrites a preexisting target. Its own completed menu is treated as complete on reruns, preserving later merchant edits or deactivation. An unrelated target with the same ID stops the run. To withdraw this first menu, deactivate its exact record through the normal authenticated admin flow; do not rerun a migration to override merchant choices.

Tests: `node --test tests/unit/esmeralda-combo-migration.cjs` covers read-only planning, exact scope/prices, one-document create, idempotency, preserving legacy data and later edits, missing/changed sources, wrong tenant, target collision and preview/apply race rejection.
