# Linked add-ons and recommendation suppression

The public upsell request accepts optional `toppingIds` on each cart item (at most 50 IDs per item, within the existing 24KB request limit). Storefront sends stable selected topping IDs, never client-provided linked product identities or prices. Combo components retain the existing `includedProductIds` suppression; current combo selections have no nested topping representation.

The server verifies the active location belongs to the requested brand, reads only active toppings assigned to that location, resolves selected native links, and validates the linked products through the existing public catalog for the same brand/location. Missing, foreign, inactive and malformed links are ignored. Legacy carts without topping IDs require no extra reads. At most 500 selected IDs are considered per request as a defensive work bound.

Resolved linked IDs only suppress products already selected as add-ons. They do not activate promotion triggers, alter discount qualification, change prices or bypass checkout validation. The endpoint remains read-only and retains its existing origin, size, scope and response projection controls.

Validation: `node --test tests/unit/upsell-linked-options.cjs tests/unit/relevant-upsell-products.cjs`; TypeScript typecheck. Tests cover mismatched/inactive/missing location, scoped catalog queries, missing IDs, inactive/foreign links, duplicate linked IDs, canonical product availability, DTO limits and existing standalone/combo suppression.
