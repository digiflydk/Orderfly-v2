# Esmeralda V2 product presentation (#780)

The server-derived V2 context opts the product sheet into a full-width catalogue
photo and product description in its scrolling content. Its quantity control and
primary **Læg i kurv** action stay in the bottom footer, including the device safe
area. Required modifier groups remain visible and use the existing min/max,
conditional-group and quantity validation. An invalid add focuses the incomplete
group without writing to the cart.

Optional groups live in the **Tilpas ingredienser** panel. Closing the panel
preserves choices and shows their summary; reopening exposes the same selections.
Both the product and per-option quantities use the existing money/cart logic.
Catalogue menu upgrades retain the selected product modifier IDs and quantities
in the combo builder. Required options are also validated there. Menu prices
include the retained modifiers; the upgrade delta compares the same choices.
V1 retains its existing compact image, inline option layout, and button labels.

Verification uses synthetic data only:

- `npm run typecheck`
- `node --test tests/unit/commerce-p2-browser.cjs`

The #780 cases cover mobile and desktop hero proportions, required-option
rejection, optional max-selection limits, collapsed-panel selection retention,
quantity updates, the persistent footer, and exact cart totals.
