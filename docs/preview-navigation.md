# Preview navigation (#61)

The reviewed v8 website is an immutable input. The preview packager first validates the pinned source manifest, all 104 page hashes and all 269 asset hashes. It then applies two explicit HTML patches for the test host:

- Only anchor `href` values addressed to `esmeraldapizza.dk` or `www.esmeraldapizza.dk` and a known public page become relative URLs. The query and fragment remain intact. External order/Club links, `mailto:`, `tel:`, unknown/private paths, lookalike hosts, scripts, JSON-LD and canonical/meta tags are unchanged.
- `/kontakt` gains `id="kontaktformular"` on its unique existing `section.contact-form-section-dark`. This fixes the existing "Skriv til os" link without replacing the Webflow form or field IDs.

The parser edits only start-tag text ranges in the original UTF-8 text; it does not serialize or rebuild the document. Duplicate hrefs or an ambiguous contact section fail the build. Each output page records its input hash and patch counts in `manifest.json.page_patches`, with `navigation_patch_version: 1`; normal route hashes describe the emitted bytes. No source page, canonical production domain or integration endpoint is changed. The payload remains outside `public` and keeps the existing preview response isolation.

Regeneration:

```sh
python scripts/package-web-preview.py /path/to/sites-preview /path/to/pinned/asset-manifest.json
python -m unittest discover -s tests/unit -p test_preview_navigation.py -v
```

Current v8 input produces 184 localized anchor occurrences across 104 pages and one contact-section ID. The prior live audit counted 181 old-domain links using its narrower href selection; the packaging report is the authoritative count for this transformation. All 269 assets and `robots.txt` remain byte-identical. Source manifest SHA256 remains `d4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc`. This changes preview navigation only; forms, booking and other integrations retain their separately tested policy and release requirements. Browser/live QA and coordinator deployment remain separate gates.

## Validation of this candidate

Six focused Python test groups cover known hosts, query/fragment preservation, URL lookalikes/private paths, quoted/unquoted values, attribute injection, script/comment/RCDATA preservation and fail-closed contact IDs. All passed. The existing 27 preview/brand checks, production build with typecheck and the real standalone Next HTTP suite over all 374 routes plus denial cases passed. Comparing every transformed page with the verified input confirmed unchanged script/link/meta bytes on all 104 pages; 269 assets and robots were byte-identical. The emitted aggregate payload SHA256 is `2e9e8060907c47ae0cf47c35ca8f0f5aa9e67ccc50d2f6eb9ac983fdad6927fa`.

These are local package/runtime checks, not live browser or service acceptance. The coordinator still verifies the deployed commit, product-card navigation, contact scrolling and preserved external links after release.
