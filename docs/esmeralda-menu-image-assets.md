# Esmeralda V2 menu image assets

The approved pizza menu uses repository-owned transparent WebP assets only in Storefront V2. Beverage/dip assets are scoped to brand `oeypKaMyYcQjIwaa1PtV` and combo `esmeralda-v2-pizzamenu-20261030`. A separate source-aware mapping now covers photographed Esmeralda pizza products across lists, dialogs, menus, carts and checkout; see [Pizza photo cutouts](storefront/esmeralda-pizza-cutouts.md). V1, other brands, unmapped products and replaced source photographs retain catalog images.

The four 0.33 l beverage cutouts and Hvidløgsbæger cutout were derived with ImageGen background removal from the existing public catalog product photos on 2026-10-30. Source product IDs are recorded in `src/lib/esmeralda-menu-images.ts`. ImageGen is generative, so these are source-based edited assets, not pixel-exact masks. The PNG outputs were converted to WebP without further image edits. All assets preserve an alpha channel.

Chili, Dressing and Pesto had no dedicated photo in the public catalog. Their `*-illustration.webp` files are newly generated painted dip illustrations, not restaurant photography or promises about serving size. Their image alternative text explicitly says “illustration”. Replace these with actual catalog photography when supplied. The Chili mayo catalog photo was not substituted for Chili because those are different products.

Assets are under `public/images/esmeralda-v2/menu/`. No production catalog records were changed. Beverage canvases have transparent side margins; the 96 px square display crops only those empty margins. Dip images use the same display size.

The explicit registered public image paths bypass brand-subdomain rewriting, including the original eight beverage/dip assets and the pizza cutouts. This is required on Esmeralda's normal subdomain and `esmeralda2.orderfly.dk`; otherwise middleware prefixes `/esmeralda` and the images return 404. Adjacent image paths and other brand routes remain scoped. Middleware regression coverage includes the public hostname and App Hosting's forwarded-host header.

Production packaging must explicitly trace `public/images/esmeralda-v2/menu/*.webp` in `next.config.js`, as with the self-hosted fonts. Verify every registered file exists in the standalone build and is served byte-for-byte under the storefront host without copying public files into the bundle manually. A development server alone does not verify App Hosting packaging.

Validation: TypeScript typecheck; scoped mapping and asset-presence tests (`tests/unit/esmeralda-menu-images.cjs`); relevant combo builder browser suite. Source-based cuts and illustrations were visually inspected, including a second Pepsi Max pass to remove a halo.
