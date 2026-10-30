# Esmeralda V2 menu image assets

The approved pizza menu uses repository-owned transparent WebP assets only in Storefront V2, scoped to brand `oeypKaMyYcQjIwaa1PtV` and combo `esmeralda-v2-pizzamenu-20261030`. V1, other brands, other menus and unknown products retain catalog images.

The four 0.33 l beverage cutouts and Hvidløgsbæger cutout were derived with ImageGen background removal from the existing public catalog product photos on 2026-10-30. Source product IDs are recorded in `src/lib/esmeralda-menu-images.ts`. ImageGen is generative, so these are source-based edited assets, not pixel-exact masks. The PNG outputs were converted to WebP without further image edits. All assets preserve an alpha channel.

Chili, Dressing and Pesto had no dedicated photo in the public catalog. Their `*-illustration.webp` files are newly generated painted dip illustrations, not restaurant photography or promises about serving size. Their image alternative text explicitly says “illustration”. Replace these with actual catalog photography when supplied. The Chili mayo catalog photo was not substituted for Chili because those are different products.

Assets are under `public/images/esmeralda-v2/menu/`. No production catalog records were changed. Beverage canvases have transparent side margins; the 96 px square display crops only those empty margins. Dip images use the same display size.

The exact eight public image paths bypass brand-subdomain rewriting. This is required on `esmeralda2.orderfly.dk`; otherwise middleware prefixes `/esmeralda` and the images return 404. Adjacent image paths and other brand routes remain scoped. Middleware regression coverage includes the public hostname and App Hosting's forwarded-host header.

Production packaging must explicitly trace `public/images/esmeralda-v2/menu/*.webp` in `next.config.js`, as with the self-hosted fonts. Verify all eight files exist in the standalone build and are served byte-for-byte under the V2 host without copying public files into the bundle manually. A development server alone does not verify App Hosting packaging.

Validation: TypeScript typecheck; scoped mapping and asset-presence tests (`tests/unit/esmeralda-menu-images.cjs`); relevant combo builder browser suite. Source-based cuts and illustrations were visually inspected, including a second Pepsi Max pass to remove a halo.
