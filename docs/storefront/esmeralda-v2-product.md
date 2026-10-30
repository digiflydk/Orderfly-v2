# Esmeralda V2 product presentation (#780)

The server-derived V2 context opts the product sheet into a full-width catalogue
photo and product description in its scrolling content. A compact Esmeralda/back bar sits above the landscape image. The rectangular
quantity control sits below customization and allergen disclosure, while the
full-width **Læg i kurv · total** action stays in the bottom footer, including the
device safe area. Mobile uses the full viewport, with only its content scrolling. Required modifier groups remain visible and use the existing min/max,
conditional-group and quantity validation. An invalid add focuses the incomplete
group without writing to the cart.

Optional groups live behind the gold-outlined **Tilpas ingredienser** button.
Allergen labels are available in a separate disclosure; errors remain visible.
Only catalog-configured menu upgrades are shown, never mockup example offers. Closing the panel
preserves choices and shows their summary; reopening exposes the same selections.
Both the product and per-option quantities use the existing money/cart logic.
Catalogue menu upgrades retain the selected product modifier IDs and quantities
in the combo builder. Required options are also validated there. Menu prices
include the retained modifiers; the upgrade delta compares the same choices.
V1 retains its existing compact image, inline option layout, and button labels.

Verification uses synthetic data only:

- `npm run typecheck`
- `CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/tilvalg-storefront-browser.cjs`

The #780 cases cover mobile and desktop hero proportions, required-option
rejection, optional max-selection limits, collapsed-panel selection retention,
quantity updates, the persistent footer, and exact cart totals.

The design correction compares the actual full-flow and pasta/burger/sandwich
mockups, with the later user changes (rectangular controls and external payment).
The browser harness also checks full-width 16:9 hero geometry, heading below the
photo, accessible back action, gold-bordered customization, allergen disclosure,
and full-width visible purchase action at 320px, 390px and desktop. Harness
screenshots use a synthetic pizza illustration, not the real catalog photography.
Functional tests alone do not establish visual acceptance.

Short single-choice groups use selectable tiles with a visible gold selection;
longer lists and quantity-bearing groups retain rows. Narrow screens use one
column to keep labels readable. Synthetic à la carte coverage rejects missing
mandatory choices and verifies doneness, side and sauce reach the cart unchanged.
