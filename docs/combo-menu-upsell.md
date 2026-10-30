# Combo deals as menu upgrades

A native Combo Deal remains one catalog record, used by both the Menuer section and eligible product upgrades. Admin selects eligible dishes in “Opgradering fra produkt”; each must also be a choice in a combo product group.

V2 product pages offer a persistent “Køb som menu” button. With one eligible combo it opens directly; with multiple combos it takes the customer to the list. Upgrading carries the product quantity and selected modifier IDs/quantities to the first matching combo group. Returning to the dish preserves its draft. A successful upgrade from cart editing replaces the expected line rather than inserting an additional dish.

The combo builder validates required group and dish choices. The same dish may appear in different groups (for example Pizza 1 and Pizza 2) with independent modifiers. Optional single-choice groups can be cleared using “Ingen tak”. Product supplements are shown beside each choice. V2 shows the total only in the pinned bottom action.

Product group `productPriceAdjustments` maps product IDs to nonnegative DKK supplements, shared between pickup and delivery. The displayed minimum upgrade amount includes the retained dish and the cheapest remaining required group choices. The final line price is the combo's fulfillment base price plus selected product supplements plus dish modifiers. Server checkout and restoration recompute from catalog data; client prices are never authoritative.

Optional `storefrontVersions` controls merchandising visibility: absent or empty means both storefronts, while `['v2']` exposes the deal and upgrade only in V2 browsing. This is not an authorization restriction or a separate catalog.

Validation: real-component Chromium suites `combo-modifiers-browser.cjs` and `tilvalg-storefront-browser.cjs` cover modifier continuity, editing, required-choice rejection, option-load failure, V1 legacy behavior, mobile pinned actions, surcharge totals, independent same-dish groups and clearing optional choices. These use local synthetic catalogs and create no real orders or payments. Release/live verification is recorded separately in issue #780.

## Dish-origin upgrade correction

In V2, when a customer opens a dish and chooses “Køb som menu”, the first matching combo group retains the dish. A single-dish group is represented once by the dialog header (`<dish>-menu`) and its image, without a repeated “Din valgte ret” box or another dish selector. For a multi-dish group, the retained dish still counts toward its limits and remaining slots stay selectable.

Dish customization panels are initially closed behind “Tilpas”. Selected customization summaries remain visible; opening and closing a panel does not modify quantities or prices. Missing required choices keep submission blocked and automatically open the relevant panel when the customer presses the bottom action. Included menu groups are completed through the guided steps described below. Standalone deals retain their normal dish choices and saved-cart editing preserves the selections.

The verified Esmeralda pilot `esmeralda-v2-pizzamenu-20261030`, brand `oeypKaMyYcQjIwaa1PtV`, omits the optional drink-upsell group `D7lnGx57JS0BnSFqSzHn` from new combo customization. This is the observed “Drikke til maden” group containing larger extra drinks, while the menu already includes a 0.33 l drink. The policy uses exact catalog identities, not translated names. It applies only to this V2 pilot. Optional selected drink extras are removed with an explanatory notice, while required groups remain available. Server validation and V1 behavior remain unchanged. The dip setup is described in the separate migration documentation.

Local real-component browser coverage includes compact 320/1280 layouts, hidden/expanded customization, required-choice recovery, retained modifiers and quantity, standalone dish selection, optional drink suppression, removal of optional drink extras and preservation of required/other-brand behavior. CI and deployed verification remain separate release gates recorded in #780.

### V2 guided menu choices (30 October 2026)

V2 now shows one configured combo product group per step, followed by a compact overview. A retained single dish is shown only in the header and is excluded from the selection steps. Standalone menu selection still starts with the dish. Existing cart edits start on the overview, with `Skift` returning to the corresponding group. Back navigation preserves all choices. Product modifiers stay under `Tilpas`; invalid required modifiers open for correction and block adding to the cart. Quantity and the final cart action appear on the overview; the total and next action remain at the bottom throughout.

Optional groups retain an explicit empty selection, including `Ingen dip`. Dip prices come from the combo rather than the standalone product price. Cards use actual catalog images when available and otherwise use neutral text cards. No inferred product photos are displayed.

For the approved Esmeralda pilot menu only, the optional extra-drinks modifier group is excluded. Previously selected optional drinks are removed from outgoing modifiers and the recalculated total, with the notice “Sodavand vælges som en del af menuen.” Required rules and other brands are unchanged. Native combo selections, modifiers, validation and pricing still use the existing server contract. V1 rendering remains unchanged.

Validation: `npm run typecheck`; `CART_CHROMIUM_PATH=/tmp/chromium node --test tests/unit/combo-modifiers-browser.cjs`. Browser coverage includes 320/390 px layouts, sequential drink/dip steps, overview edits, no-dip serialization, unchanged base pricing, required-modifier rejection, retained ingredients, duplicate drink removal, and V1 behavior.
