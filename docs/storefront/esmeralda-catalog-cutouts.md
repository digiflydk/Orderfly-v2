# Esmeralda catalog cutouts

The V2 storefront presents approved soda, dip, sides, dessert, sandwich, burger and pasta photographs on transparent backgrounds. The product dialog image surface is true black (`#000`). Catalog data, pricing, quantities and order payloads retain the original product records and image URLs.

`esmeraldaProductImage` in `src/lib/esmeralda-menu-images.ts` extends the existing pizza mapping. Every catalog override requires V2, Esmeralda's exact brand ID, approved product ID, original native category ID and original image origin/object path. Removing or replacing a catalog image automatically disables its cutout; rotating a download token for the same object does not. There are no product-name or category-wide substitutions. Shared photographs can share a WebP asset while retaining separate source guards.

`StorefrontProductImage` applies the mapping to menu cards, product dialogs, menu selections, cart and checkout. Promotion cards use the same helper. Cutouts use `object-fit: contain`. The existing pizza data marker remains pizza-only, with a generic product marker for all cutouts. The brand-subdomain passthrough allowlist includes every registered image.

Images are source-based AI edits, not new product photography. Pasta retains its plate; Penne el Pollo removes the accompanying bread. The two Tiramisu products already use the same original photograph and continue sharing one visual. Previously approved dip illustrations stay labelled as illustrations. Missing originals are not invented. Gelato visibility is managed through existing product activation settings, not a hardcoded storefront exclusion.

The final approved product/source/asset inventory is `tests/fixtures/esmeralda-catalog-images.json`. Files are optimized transparent WebP on consistent 960px canvases with clear borders.

## Verification

- `npm run typecheck`.
- `node --test tests/unit/esmeralda-menu-images.cjs tests/unit/brand-subdomains-12.cjs` covers exact source/brand/category isolation, replacement/removal fallback, unchanged input records, subdomain passthrough and alpha/edge integrity.
- `CART_CHROMIUM_PATH=<chromium> node --test tests/unit/menu-refresh-browser.cjs` exercises mobile and desktop rendering and true-black product-dialog surfaces using loopback fixtures.
- Existing checkout, product-option and combo browser regressions remain required for their consuming flows.
- Review the generated images against the original product and inspect the final dark menu before publishing. CI must be green on the exact head before merge; production health/release and read-only storefront checks follow deployment. No production orders, payments or print jobs are created by these checks.

## Separate catalog operation, 1 November 2026

Following explicit user clarification, the coordinator deactivated both Gelato products through the existing admin product form and verified `Inactive` in the product list:

- `72a8fb05-5261-4fe8-816c-ffd402c3b734`: Hjemmelavet Italiensk Gelato, take-away box 1.0 l.
- `f3bd2891-5988-4487-bf3e-ecef4635dd1b`: Hjemmelavet Italiensk Gelato, take-away box 0.750 l.

Both belong to brand `oeypKaMyYcQjIwaa1PtV`, location `eibiesSbluQTmp3mUqly`. This is a reversible `isActive=false` catalog operation, separate from this code release. Product records and historical orders remain intact. Reactivation uses the same admin form. No hardcoded Gelato filter is added.

The coordinator also verified the live customer menu at `/amager?deliveryMethod=pickup`: Desserter lists only the four Tiramisu/Nutella products, with both Gelato variants absent. This confirms the catalog operation independently of the image release, which was not deployed at that checkpoint.

## Final approved inventory

This release adds 34 product mappings across 33 unique assets: 13 soft drinks (including one Italian soda), 5 dips, 1 side, 2 Tiramisu products, 4 burgers, 2 sandwiches and 7 pasta dishes. Together with the existing 15 pizza mappings, the generic helper covers 49 photographed products. Products without usable original photographs, including Parmesan Bæger and burger 39a, keep their existing fallback. The inventory count and native category counts are locked by the unit tests.

The existing Fanta catalog photo shows a 1 L bottle while its product name says 1.5 l. This pre-existing mismatch is preserved and documented; the image edit does not invent a different label or alter product data. The original Italian lemonade photo contains two flavors; its mapped cutout keeps the lemon bottle matching that product. Four previously approved transparent soda cans and the garlic cup are reused. All other new cutouts were compared against their originals and approved by the coordinator before publication.
