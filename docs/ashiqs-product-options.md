# Ashiqs: one product per dish

The import incorrectly created size and meal choices as separate products.
The correction retains 25 pizza, 9 burger and 3 pita/durum product IDs and
deletes their 43 sibling variants after backing up the affected documents. Historical orders remain unchanged.
Drinks and other categories are outside this correction.

Required single-choice groups hold the original price differences. Pizza
choices are Alm./Fam.; burgers Burger/Menu; pita/durum Pita, Pita Menu,
Durum, Durum Menu. The source's Classic Burger has no drink group; preserve it.

`Product.toppingGroupConditions` maps an attached group ID to option IDs that
activate it. At least one trigger must be selected in an unconditional group
attached to the same product. Only one level is supported. Family extras and
regular extras use separate existing price lists; the drink group is required
only for menu selections. Changing the controlling choice clears hidden
selections and applies defaults to newly active groups. Restore and checkout
enforce the same rules and reject hidden, missing or unrelated options.

## Release and apply

This branch does not change production data. Independent code review/CI and PO
acceptance precede merge. Deployment is a separate step, followed by read-only
verification of the deployed commit. Never apply this catalog plan to an older
release: it would expose both extra lists and require drinks for non-menu items.

After release verification, an authorized operator with existing ADC access to
the data project `orderfly-39325` runs:

```sh
node scripts/ashiqs-product-options.mjs
node scripts/ashiqs-product-options.mjs --apply --verified-release=FULL_DEPLOYED_COMMIT_SHA
```

The first command is a read-only preflight. Apply checks brand/location ownership,
all captured product fields and collisions, and performs one atomic transaction.
It creates seven groups and sixteen options, updates the 37 retained products,
and deletes 43 duplicate listings. Any concurrent catalog edit aborts the
whole transaction for review. A migration receipt and complete original product
records are saved in `catalog_migrations/ashiqs-product-options-v1`; a repeat run
is a no-op. No credentials or security configuration are changed.

Wait for the storefront cache TTL (60 seconds), then verify 25 pizza, 9 burger
and 3 pita/durum listings on `/ashiqs/ashiqs-place`. Check Alm./Fam. including
cheese prices, burger/menu with required soda only for menus, all four pita/durum
prices, and cart edit/reload. No purchase is required. Preserve current hours,
activation, delivery fees, other brands and unrelated source-import work.

Rollback, if required, must first preflight current records against this migration's
after-state, then restore the backup in a transaction. Do not delete records that
may now be referenced by orders. Do not automatically roll back subsequent edits.

## Validation

`npm run typecheck`; `node --test tests/unit/topping-conditions.cjs
tests/unit/ashiqs-correction-plan.cjs tests/unit/cart-restore.cjs
tests/unit/commerce-p1.cjs`; and targeted Playwright coverage in
`tests/unit/commerce-p2-browser.cjs` (`--test-name-pattern='conditional product options'`).


## Administration for all brands

Create/edit product now loads active topping choices and exposes **Betingede tilvalg** below the attached groups. Choose **Vis ved bestemte valg** on each target group and check one or more choices. Any checked choice activates the group; the same choice can activate several groups. Rules belong to the product, with no brand-specific UI or identifiers. Existing group minimum/maximum rules apply only while visible. Configure these limits in the existing topping group editor.

Triggers must be active, in an attached always-visible group, and available at every product location. Server validation rejects empty rules, unattached groups, foreign/unavailable triggers, self references and conditional chains/cycles. Removing a referenced group requires explicitly fixing its rule; failed saves preserve entries. Legacy callers omitting the field preserve existing rules and validate them against the submitted groups.

The updated migration **deletes the 43 duplicate product documents**. It backs up all 80 affected documents in the transaction receipt and blocks on combo, discount or upsell references to duplicate IDs. Historical orders are left intact; saved baskets referring to deleted variants are subject to existing cart restoration validation. No production migration has been run. Apply only after independent review, PO acceptance, merge, deployment and verification of this release.
