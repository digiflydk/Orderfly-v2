# Tilvalg catalog administration (#719)

Catalog actions persist group display names, addition/removal kind, distinct-choice mode and sort order; options persist maximum quantity and optional native product references. Single mode limits distinct options independently of total quantity. Blank display names use the existing group name in consumers; a blank product reference clears the link.

Product writes preserve group order and strict JSON overrides (`price`, `isDefault`, `defaultQuantity`, `isAvailable`). An omitted price inherits and explicit zero means free. Overrides must reference an attached option covering the product locations. Options and groups are re-read within the product transaction so deletion cannot race association creation. Legacy forms preserve stored overrides unless a replacement map is submitted.

Group and option deletion is conservative: any attached product blocks deletion, covering override and conditional trigger references. Native products referenced by options cannot be deleted. Group copying allocates independent group/option identifiers in one transaction after current authorization of the source and every child. Mutation reads fail closed beyond 100 children or 500 attached products.

The admin usage API returns scoped product names and identifiers for product edit links. Native product candidates are active, nonsynthetic, and have no nested option groups. Linked product saves validate current brand, location and eligibility rather than trusting client names/prices. Menu projections carry eligibility and override fields. Checkout and cart restoration load referenced native products from attached groups, capped at 500 IDs, for shared authoritative validation.

Validation: `node --test tests/unit/tilvalg-catalog-719.cjs tests/unit/product-save.cjs tests/unit/menu-products.cjs tests/unit/location-catalog-access.cjs` covers malformed counts/prices, explicit zero, scopes and current permissions, safe deletion, copying, linked products and override persistence/order. Typecheck uses the accompanying core type changes. All validation is local; no GitHub Actions or production writes are part of this change.
