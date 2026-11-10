# Shareable product links

Every dish on the storefront menu has its own address, so campaigns can link straight to a product instead of the menu.

## Address

`https://esmeralda.orderfly.dk/amager?produkt=1-margherita-v`

- The value is made from the product name: lower case, Danish letters spelled out (`æ`→`ae`, `ø`→`oe`, `å`→`aa`), and every other character becomes a hyphen. `1. Margherita (V)` → `1-margherita-v`, which matches the dish addresses on www.esmeraldapizza.dk (`/dishes/1-margherita-v`).
- Two different products with the same name, a product without a name, or a name that equals another product's id would be ambiguous. Those products use their product id instead, so a link never opens a different product. A product id is also accepted for any product.
- Other parameters are kept, for example `?deliveryMethod=pickup&utm_source=facebook&produkt=1-margherita-v`. With `deliveryMethod` in the link, the pickup or delivery question is skipped as on the menu.
- Combo-only products have no link. Combos are not covered.
- The long form works too: `https://orderfly.dk/esmeralda/amager?produkt=1-margherita-v`.

## Behavior

- The menu loads as usual and opens the linked product's dialog once, with the same option groups, required choices, prices and discounts as when the customer taps the dish. A product that appears in several sections (offers, a category) opens one dialog.
- While a product dialog is open, the address shows its link, so it can be copied and shared. Closing the dialog removes only `produkt`. The address is replaced, not added to the history, so Back leaves the menu as before.
- An unknown, inactive or renamed product leaves the customer on the menu and removes the stale parameter.
- A saved menu search is not restored on a product link, so the linked dish is visible.
- Products inside an upsell popup never change the address.
- Renaming a product changes its link. Links made from the old name stop opening the product and fall back to the menu. Use the product id in the link when it must survive a rename.

## Sharing preview

With `produkt`, the page metadata (`title`, description, Open Graph and Twitter card) describes the product. The image is included only when it has a fetchable address. The canonical address stays the menu, so search engines index one page per restaurant.

## Code and tests

- `src/lib/product-link.ts`: link values, ambiguity rules and address updates.
- `src/context/product-link-context.tsx`: opens the linked product once and keeps the address in sync. Used by `src/components/product/product-card.tsx` and provided by the menu (`menu-client.tsx`).
- `src/lib/storefront-seo.ts` (`storefrontProductMetadata`) and `generateMetadata` in `src/app/[brandSlug]/[locationSlug]/page.tsx`.
- Tests: `tests/unit/product-link.cjs` and `tests/unit/menu-refresh-browser.cjs` ("product link …", 390/1280 px): direct link, campaign parameters, one dialog, closing, opening from the menu, and an unknown product.
