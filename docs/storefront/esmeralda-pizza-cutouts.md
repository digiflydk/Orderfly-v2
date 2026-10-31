# Esmeralda pizza photo cutouts

The approved background-free presentation uses AI-assisted cutouts derived from the existing public catalog photographs. These assets preserve the recognizable products and ingredient arrangement, but image generation can re-render fine texture and colour; they are not described as pixel-identical manual extractions.

## Coverage and boundaries

The snapshot covers 13 photographed savoury pizzas and both photographed Nutella Pizza variants. The two Nutella catalog records currently have byte-identical photographs, so they share one generated source cutout. Products 8 and 8a (Salat pizza) have no source photograph and keep their existing fallback. Pizza Combo artwork, other categories and other brands are unchanged. No product data, prices, ingredients or order records are modified.

| Product | Catalog ID |
| --- | --- |
| 1. Margherita (V) | `a401ceb4-3638-4bad-9a39-0088827eade4` |
| 2. Italiana | `29438e4e-031b-4db0-a685-f00c663970be` |
| 3. Hawaii | `4421b54e-6dc6-4e03-9871-f3abe1046498` |
| 4. Pepperoni | `9e6202ff-1f3a-4ed8-81f8-1615c13be554` |
| 5. Romana | `c90c5f41-09ec-459f-8125-3cc18c44a34b` |
| 7. Rocco | `4a663f7b-4137-4f3c-b9f2-8f58485f278c` |
| 9. Pollo Speciale | `9093764d-3e09-4426-b3b6-c786a6000d26` |
| 12. Montanara Speciale | `2840ec1c-e8eb-410b-ace6-5ab1b8627204` |
| 13. Ortalana | `deb2547a-e459-4825-8185-039a7d4a77db` |
| 14. Vegetariana (V) | `cbdefe9c-c780-4d47-aeed-953314bb6562` |
| 15. Pastrami Speciale | `bd132f04-bf7d-43c7-9ed8-aa4fe6cfad21` |
| 16. Gorgonzola | `4e830bb7-fe85-43fd-95b3-ecef14097818` |
| 18. Esmeralda Speciale | `b83e124e-987c-4953-a3c1-5576daf8fb72` |
| Nutella Pizza (2 stk) | `84229e93-2f15-4497-9257-6bbd2d028278` |
| Nutella Pizza | `2f17066f-6773-4808-908a-f1e60793ed38` |

## Source-aware rendering

`esmeraldaPizzaImage` in `src/lib/esmeralda-menu-images.ts` requires V2, Esmeralda's exact brand ID, the approved product ID, its native catalog category ID and the original image origin/object path. A changed or removed catalog image automatically stops using the cutout. Download token query changes do not replace the underlying photograph, so they do not invalidate it. No name-based or category-wide substitution is performed.

`StorefrontProductImage` applies the matching local asset with `object-fit: contain` in product lists, product dialogs, combo choices and retained-product previews, cart items, checkout summaries and product upsells. Promotion thumbnails apply the same helper. An explicit different upsell image keeps its existing artwork. Catalog and cart objects retain the original image URL, including across cart restoration. Historical receipt rendering is unaffected.

Each production asset is a transparent WebP under `public/images/esmeralda-v2/menu/pizza-<product-id>.webp`, on a consistent 960px square canvas at quality 82 while preserving alpha. The full visible cutout is fitted inside an 884px area with at least 38px transparent padding on each side. Export normalization discards only near-transparent outer noise below alpha 8 and retains an extra two source pixels around the visible bounds; it does not repaint or crop food. This keeps landscape generator canvases and the square Nutella canvas comparable in list thumbnails. The helper's explicit path list also feeds the existing brand-subdomain middleware allowlist. It does not open arbitrary image routes or another brand's pages.

## Verification

The frozen public identity snapshot in `tests/fixtures/esmeralda-pizza-images.json` contains image object URLs without access-token query parameters. Tests exercise every mapped asset, correct tenant/category/source scoping, changed/removed source fallback, token rotation, missing-photo exclusions, transparent backgrounds, near-opaque food and complete asset edges.

Browser regressions use production components and local synthetic orders with the approved image identity to check list, dialog, menu upgrade, cart and checkout rendering at mobile and desktop widths. They also verify other-brand fallback and the existing menu, modifier, cart, checkout and upsell behavior. No production order, payment or catalog write is used for verification.

```sh
npm run typecheck
node --test tests/unit/esmeralda-menu-images.cjs tests/unit/brand-subdomains-12.cjs tests/unit/delivery-cart-price.cjs
CART_CHROMIUM_PATH=/tmp/menu-chromium node --test tests/unit/menu-refresh-browser.cjs tests/unit/tilvalg-storefront-browser.cjs tests/unit/combo-modifiers-browser.cjs tests/unit/checkout-browser.cjs
```
