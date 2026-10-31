# Esmeralda mobile navigation

The Esmeralda ordering storefront omits the mobile `Menu` toggle on the brand's
restaurant selector. Its only item was `Bestil`, which linked back to the same
selector. The logo remains a link to the brand's ordering entry page and the
desktop `Bestil` link is unchanged. Other brands keep their existing mobile menu.

The V2 location menu also hides the hamburger shortcut below 768px. Customers
continue to use the visible food-category tabs and search directly. The
restaurant-information button remains available, as do the desktop category
shortcut, fulfilment choices, product dialogs and cart actions.

This change does not remove burger products, meal menus or category tabs and does
not change any route, brand resolution, authentication or stored settings.

## Verification

- Run `npm run typecheck`.
- Run the `brand selector navigation stays in its brand` cases in
  `tests/unit/commerce-p2-browser.cjs` to cover unchanged other-brand navigation
  on mobile and desktop.
- Run the V2 cases in `tests/unit/menu-refresh-browser.cjs` to cover the location
  menu, category/search access, restaurant information and cart interactions at
  320px, 390px and 1280px.
- Confirm on the Esmeralda brand root that no mobile `Menu` toggle appears. On
  its location menu, confirm the hamburger is absent on mobile while category
  tabs and restaurant information remain usable. Desktop navigation is retained.

Live verification is read-only; it must not create an order, payment or print.
