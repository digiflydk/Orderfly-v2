# Public product option projection

The lazy-loaded `/api/public/product-options` response now includes group `displayName`, `kind` and `selectionMode`, and option `maxQuantity` and `productId`. These fields already form part of the saved catalog and storefront contract; dropping them in this projection made customer headings fall back to internal group names and suppressed option behavior.

The endpoint continues to use an explicit public field allowlist, validate the active restaurant's brand before reading options, and project only the requested location. Its cache key changes to `public-options-v2` so an older cached projection cannot survive this release.

The endpoint regression in `tests/unit/commerce-p2.cjs` checks the returned JSON fields, private-field exclusion and foreign-brand rejection. No production records are changed.
