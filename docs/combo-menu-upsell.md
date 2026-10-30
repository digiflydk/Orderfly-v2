# Combo deals as menu upgrades

A native Combo Deal remains one catalog record, used by both the Menuer section and eligible product upgrades. Admin selects eligible dishes in “Opgradering fra produkt”; each must also be a choice in a combo product group.

V2 product pages offer a persistent “Køb som menu” button. With one eligible combo it opens directly; with multiple combos it takes the customer to the list. Upgrading carries the product quantity and selected modifier IDs/quantities to the first matching combo group. Returning to the dish preserves its draft. A successful upgrade from cart editing replaces the expected line rather than inserting an additional dish.

The combo builder validates required group and dish choices. The same dish may appear in different groups (for example Pizza 1 and Pizza 2) with independent modifiers. Optional single-choice groups can be cleared using “Ingen tak”. Product supplements are shown beside each choice. V2 shows the total only in the pinned bottom action.

Product group `productPriceAdjustments` maps product IDs to nonnegative DKK supplements, shared between pickup and delivery. The displayed minimum upgrade amount includes the retained dish and the cheapest remaining required group choices. The final line price is the combo's fulfillment base price plus selected product supplements plus dish modifiers. Server checkout and restoration recompute from catalog data; client prices are never authoritative.

Optional `storefrontVersions` controls merchandising visibility: absent or empty means both storefronts, while `['v2']` exposes the deal and upgrade only in V2 browsing. This is not an authorization restriction or a separate catalog.

Validation: real-component Chromium suites `combo-modifiers-browser.cjs` and `tilvalg-storefront-browser.cjs` cover modifier continuity, editing, required-choice rejection, option-load failure, V1 legacy behavior, mobile pinned actions, surcharge totals, independent same-dish groups and clearing optional choices. These use local synthetic catalogs and create no real orders or payments. Release/live verification is recorded separately in issue #780.

## Dish-origin upgrade correction

In V2, when a customer opens a dish and chooses “Køb som menu”, the first matching combo group displays that dish as a fixed “Din valgte ret” summary. A single-dish group does not offer other pizza choices. The retained dish's modifiers remain available below, while drinks and other combo groups remain selectable. Returning to the dish keeps the original draft. For a multi-dish group, the retained dish counts toward its limits and only remaining slots can be filled.

Opening a standalone deal still offers its dish choices. Editing a saved combo restores its selected dishes, modifiers and quantity using the existing cart behavior. This presentation correction adds no catalog migration or price changes.
