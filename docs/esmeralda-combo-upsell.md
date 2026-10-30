# Esmeralda Combo Deal and product upgrades

Tracking: #780. This extends the existing `comboMenus` catalog; it does not create a second menu/pricing system.

## Catalog and prices

A combo retains its brand, locations, fulfillment prices, schedule, activity state and product groups. `upgradeProductIds` selects the dishes that offer the same combo from their product page. Every upgrade dish must also belong to a combo product group.

Optional `storefrontVersions` limits visibility to `v1`, `v2`, or both. Omitting it preserves the existing all-storefront behavior. The first menu uses `['v2']` so the PM can inspect it on `esmeralda2.orderfly.dk` without adding it to the existing V1 menu.

Each product group may contain `productPriceAdjustments: Record<productId, number>`. A missing entry means zero supplement. Amounts are finite, nonnegative currency values, apply to both pickup and delivery, and may only reference products in that group. Existing combos without the field retain their previous prices.

For one menu, the payable amount is the fulfillment-specific combo base price, plus supplements for the selected products, plus their validated ingredient modifications. Quantity multiplies the completed menu total. The original standalone dish price is not added again. The upgrade offer includes the retained dish's supplement and the cheapest completion of required groups; later choices can change the final amount.

The browser sends selection IDs and modifier quantities, not trusted prices. Cart restoration and checkout resolve the catalog again, validate eligibility, membership, cardinality and modifier rules, and recompute the amount. Supplements must not accumulate when a cart is restored repeatedly.

## Customer flow

1. Standalone: open the combo card, select its dishes and remaining groups, customize the actual dishes and add one combined cart line.
2. Upgrade: open a dish, customize it if desired and choose the linked menu. The dish, quantity and ingredient choices carry over. Complete the remaining groups and add the combined line.
3. V2 provides a back action and a persistent rectangular purchase button. Its final total is in the bottom purchase control. Product supplements are displayed next to the corresponding choices.
4. Reopening a combo from the cart restores its selections and modifications. Checkout retains the completed menu and uses the existing hosted-payment handoff.

Menus containing multiple required main dishes still require completion of all selections. Selecting an upgrade dish does not satisfy the remaining required positions automatically. Existing V1 plain combos preserve their uncustomized behavior.

## Configuration and rollout

Use the existing Combo Deal administration. Select the actual products, define required selection counts, enter any catalog-supported supplements and select upgrade dishes. Reuse verified existing Pizza Combo contents/prices for the first menu; do not invent a new offer or overwrite the legacy product. Activation is a separate catalog operation after the implementation is deployed.

The first configuration is **Pizzamenu**, one Margherita (95 kr.) or Pepperoni (105 kr., including its 10 kr. supplement), with one existing 0.33 l can: Pepsi, Pepsi Max, Faxe Kondi or Faxe Kondi free. Both fulfillment prices use the existing offer's 95 kr. base. The selected pizza retains its own crust and ingredient options. Example verification: Pepperoni menu 105 + garlic 5 = 110 kr.; an existing 4 kr. bag charge produces a 114 kr. checkout total. These amounts are configuration inputs, not a claim that the menu has already been activated.

The PM authorized implementation, the first menu configuration, merge and deployment, and explicitly waived Codex code review because of quota exhaustion on 2026-10-30. This is a task-specific waiver, not a change to repository policy. Local tests, CI, release verification and honest reporting remain required.

## Verification

Local tests cover server-authoritative prices, modifier continuity, invalid choices, forged prices, fulfillment differences, cart persistence and component interaction. `combo-image.cjs` mocks the `server-only` environment marker while exercising the real combo actions with in-memory scoped storage; it does not bypass permission assertions.

After deployment, confirm `/api/health` reports the merged revision. Use fresh isolated mobile browser contexts at 320 and 390 pixels with the real catalog. Test both standalone and dish-upgrade entry points, required-choice rejection, supplements, modifications, cart editing, reload and checkout. Confirm no horizontal overflow and the bottom action remains visible while scrolling.

Live verification stops before submitting an order or payment. No customer data is entered. The local browser cart is discarded afterward. Record the actual menu IDs, contents, prices, release and results in #780; preparation of this document is not evidence that deployment or live tests have passed.
