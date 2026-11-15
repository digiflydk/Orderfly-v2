# Website SEO titles and descriptions (2026-11-15)

## Why
PageSpeed Insights scored the homepage 100 for SEO, but it tests only the URL entered, and its SEO audit checks only that a title exists, not that it is unique or descriptive. 91 of the 104 pages (75 dish pages, 11 menu categories, 3 product pages, `/pages/menukort`, `/pages/spin-og-vind-med-esmeralda`) all had the exported generic title "Esmeralda Pizza & Restaurant" and no meta description or share image. Lighthouse SEO scored those pages 92 (missing meta description). In Google they competed with each other under one meaningless title.

## What
`scripts/website-seo-meta.cjs` builds each page's metadata only from the page's own heading, description and image, so no text is invented:

| Pages | Title | Description | Share image |
| --- | --- | --- | --- |
| Dishes | Dish name without the menu number, e.g. "Stenovnspizza Margherita (V) \| Esmeralda Pizza Amager" | The dish's own description, plus "Bestil takeaway eller book bord hos Esmeralda på Amager." when it fits within 160 characters | The dish image |
| Menu categories | "Pizza – menukort \| Esmeralda Pizza Amager" | "Se pizza på menukortet hos Esmeralda Pizza & Restaurant på Albaniensgade 6, Amager. …" | The first dish image |
| Products and pages | The page heading | The page's first content paragraph | The first content image, never a logo |

Each page gets a `<title>`, `meta description`, Open Graph title, description, type and image, and a Twitter card. The canonical links were already correct and are unchanged. Pages that already had their own title and description (home, `/menu`, `/kontakt`, `/faq`, etc.) are untouched.

## Known content issues (not metadata)
- Fixed 2026-11-15 (see `docs/website-content-fixes.md`): the duplicate "Hjemmelavet Tiramisu" card is removed and `/dishes/hjemmelavet-tiramisu-2` redirects to `/dishes/hjemmelavet-tiramisu`; the repeated word in the Pastrami Speciale heading is removed. The retired page keeps its old title in the payload, but it is never served.
- Seven pages have no content image (e.g. `/produkter/tiramisu`, `/pages/spin-og-vind-med-esmeralda`, some dishes). They share with a summary card and no image.

## How it is built
- `scripts/preview-seo-meta.cjs` applies the metadata once (`manifest.seo_meta`, exactly 91 pages). It refuses a page that already has a description or Open Graph tags, and checks that each change reverses exactly.
- Inserted tags carry `data-es-seo="v1"`. Older pinned baselines reverse the change through `tests/helpers/website-landing-baseline.cjs` (newest change first).
- `tests/unit/website-seo-meta.cjs` (in Orderfly CI) checks:
  - every page has a title of at most 70 characters and a description
  - titles are unique, apart from the known tiramisu duplicate
  - dish titles have no menu number or repeated word
  - share images exist in the payload
  - untouched pages stay untouched
