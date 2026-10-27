# Tilvalg in the customer dialog and saved cart (#720)

The product dialog resolves the current product's effective options through the same quantity/default policy used by server validation. It follows the product's configured group order and shows the group display name. A selected option with a quantity limit greater than one has labelled increment/decrement buttons; group minimum/maximum counts total quantities and single-choice mode restricts the selected option type. A required group still blocks Add to cart until satisfied.

Removal groups show explicit `Uden …` choices, a short explanation and no surcharge. Removing an ingredient is persisted as the selected removal option's native identity, not inferred from deselecting a default addition. Prices/defaults/availability resolve from the current product overrides, including an explicit zero price. Changes to another visible group do not re-add a deliberately deselected default.

`CartItemTopping.price` remains the extended amount for that option per parent product. `quantity` identifies how many units of the option were chosen. Printable option names include `2 × …` or `Uden …` and downstream UI continues displaying the canonical name. Checkout prices remain subject to current native-catalog validation by #717.

Saved version-1 carts gain an optional `toppingQuantities` array parallel to stable `toppingIds`. Missing quantities remain legacy quantity one. Quantities require IDs, matching lengths, positive integers and a maximum total of 50. No saved prices are trusted. Cart merge keys and price signatures include option quantities, so free one-unit and two-unit selections cannot merge or silently retain a payment attempt. Stale edits compare the serialized choices and reject an intervening quantity change.

## Validation

- `tests/unit/tilvalg-cart-choices.cjs`: snapshot roundtrip, legacy compatibility, invalid arrays/counts, free-option merge identity, stale-editor rejection, explicit removal identity.
- `tests/unit/tilvalg-storefront-browser.cjs`: production ProductDialog in synthetic 390px/1280px Chromium fixtures; product override/default quantity, required group rejection, maximum enforcement, single-type replacement, explicit removal, canonical saved labels, editing quantity preservation and explicit default deselection.
- Browser tests do not create orders, contact a payment provider, change real catalog data or print physical tickets.
- Full typecheck requires #717 types/helper and #719 public menu projection. Coordinator records integration validation and release separately.

No GitHub Actions or production writes are part of these tests. Local/browser verification is not production live acceptance.
