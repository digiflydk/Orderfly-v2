# Combo deals as menu upgrades

A native Combo Deal remains one catalog record, used by both the Menuer section and eligible product upgrades. Admin selects eligible dishes in “Opgradering fra produkt”; each must also be a choice in a combo product group.

V2 product pages offer a persistent “Køb som menu” button. With one eligible combo it opens directly; with multiple combos it takes the customer to the list. Upgrading carries the product quantity and selected modifier IDs/quantities to the first matching combo group. Returning to the dish preserves its draft. A successful upgrade from cart editing replaces the expected line rather than inserting an additional dish.

The combo builder validates required group and dish choices. The same dish may appear in different groups (for example Pizza 1 and Pizza 2) with independent modifiers. Optional single-choice groups can be cleared using “Ingen tak”. Product supplements are shown beside each choice. V2 shows the total only in the pinned bottom action.

Product group `productPriceAdjustments` maps product IDs to nonnegative DKK supplements, shared between pickup and delivery. The displayed minimum upgrade amount includes the retained dish and the cheapest remaining required group choices. The final line price is the combo's fulfillment base price plus selected product supplements plus dish modifiers. Server checkout and restoration recompute from catalog data; client prices are never authoritative.

Optional `storefrontVersions` controls merchandising visibility: absent or empty means both storefronts, while `['v2']` exposes the deal and upgrade only in V2 browsing. This is not an authorization restriction or a separate catalog.

Validation: real-component Chromium suites `combo-modifiers-browser.cjs` and `tilvalg-storefront-browser.cjs` cover modifier continuity, editing, required-choice rejection, option-load failure, V1 legacy behavior, mobile pinned actions, surcharge totals, independent same-dish groups and clearing optional choices. These use local synthetic catalogs and create no real orders or payments. Release/live verification is recorded separately in issue #780.

## Dish-origin upgrade correction

In V2, when a customer opens a dish and chooses “Køb som menu”, the first matching combo group retains the dish. A single-dish group is represented once by the dialog header (`<dish>-menu`) and its image, without a repeated “Din valgte ret” box or another dish selector. For a multi-dish group, the retained dish still counts toward its limits and remaining slots stay selectable.

Dish customization panels are initially closed behind “Tilpas”. Selected customization summaries remain visible; opening and closing a panel does not modify quantities or prices. Missing required choices keep submission blocked and automatically open the relevant panel when the customer presses the bottom action. Included menu groups remain available directly. Standalone deals retain their normal dish choices and saved-cart editing preserves the selections.

The verified Esmeralda pilot `esmeralda-v2-pizzamenu-20261030`, brand `oeypKaMyYcQjIwaa1PtV`, omits the optional drink-upsell group `D7lnGx57JS0BnSFqSzHn` from new combo customization. This is the observed “Drikke til maden” group containing larger extra drinks, while the menu already includes a 0.33 l drink. The policy uses exact catalog identities, not translated names. It applies only to this V2 pilot. Existing selected paid extras remain visible and editable, and required groups are never hidden. No catalog data, server validation, prices, or V1 behavior changes. Dip choices and pricing are not configured by this change.

Local real-component browser coverage includes compact 320/1280 layouts, hidden/expanded customization, required-choice recovery, retained modifiers and quantity, standalone dish selection, optional drink suppression, preservation of existing extras and other-brand behavior. CI and deployed verification remain separate release gates recorded in #780.
