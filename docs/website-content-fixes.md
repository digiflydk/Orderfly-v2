# Website content fixes (www.esmeraldapizza.dk)

The website has no CMS: its pages are pinned in `preview/esmeralda/payload.json.gz.part-*`. Text errors are fixed by a reviewed, reversible patch.

## Fixed 2026-11-15 (`manifest.content_fixes`, version 1)
- **Repeated word:** "15. Stenovnspizza Stenovnspizza Pastrami Speciale" → "15. Stenovnspizza Pastrami Speciale" on `/dishes/15-pastrami-speciale` (h1 and heading), `/menu` (card) and `/menu/pizza` (image alt and card title).
- **Duplicate dessert:** `/menu/desserter` listed "Hjemmelavet Tiramisu" twice. The second card (`/dishes/hjemmelavet-tiramisu-2`) is removed; that address now answers `308` to `/dishes/hjemmelavet-tiramisu` (query kept) and is left out of the sitemap (103 URLs). "Hjemmelavet Tiramisu 2 stk" is a different product and is unchanged.

## How it is built
- `scripts/website-content-fixes.cjs`: exact, unique text replacements (`applyContentFixes` / `reverseContentFixes`). The removed card leaves the marker `<!--es-content-v1:duplicate-tiramisu-removed-->`.
- `scripts/preview-content-fixes.cjs`: applies the fixes once, checks the payload hash, that exactly four pages change, and that each change reverses exactly.
- `src/lib/website-redirects.ts`: retired routes and their targets; used by the server for the redirect and the sitemap.
- Older pinned baselines reverse the fixes first through `tests/helpers/website-landing-baseline.cjs`.
- `tests/unit/website-content-fixes.cjs` (in Orderfly CI) checks the text on all 104 pages, the single tiramisu card, the redirect and the sitemap.

## Next text fix
Add a new entry (and bump the version in a new patch script); never edit the payload by hand.
