# Location labels for pickup and delivery

The location editor (`/superadmin/locations/edit/{locationId}`) has two optional fields under **Labels ved valg af leveringsmetode**:

- **Label til afhentning** (`locations/{id}.pickupLabel`), e.g. `Spar 25%`.
- **Label til levering** (`locations/{id}.deliveryLabel`), e.g. `Gratis levering`.

These are example placeholders, not default offers. Each field accepts at most 40 characters of plain text on one line. HTML-like markup and control characters are rejected by the shared client/server schema. Text is trimmed. Empty text hides the label. An inactive delivery method never displays its promotional label.

Labels are display copy only. Saving `Gratis levering` does not create a discount or change delivery fees, minimum orders, quotes, payment, tax or checkout calculations. Operators must configure the corresponding offer separately before advertising it.

## Existing data and clearing a label

The older location field `pickupSaveTag` remains readable as a fallback when `pickupLabel` is absent. For example, a stored `25%` appears as `Spar 25%`. A legacy `Save 25%` is rendered in Danish; a complete `Spar 25%` is not prefixed twice. The editor pre-fills the new pickup field from this fallback and replaces the old **Pickup Save Tag** control, avoiding duplicate controls.

An explicitly saved empty `pickupLabel` overrides the fallback, so clearing the field reliably removes an old promotion. Historical `pickupSaveTag` data is left intact. Existing locations require no migration and no promotion values are seeded by this change.

## Data flow and boundaries

`LocationFormPage` → existing `createOrUpdateLocation` server action → location document → `publicLocationRecord` → delivery-method selection UI. The public projection supplies sanitized labels and continues to exclude private native/integration fields. Unknown or invalid stored labels render empty.

The existing platform-superuser permission checks and transaction checks for an existing selected brand and edited location remain in place. No new mutation endpoint, access grant, Firestore rule, project configuration or cross-brand query is added. Saving invalidates the existing storefront cache tag.

The same labels appear in Esmeralda's `OrderModal`, the generic `DeliveryMethodModal`, the older checkout `DeliveryMethodDialog`, and the M3 landing page's order sheet. Labels wrap inside the choice button; the Esmeralda sheet scrolls within the mobile viewport when necessary. Selection and navigation behavior stay unchanged.

## Validation

- `npm run typecheck`
- `node --test tests/unit/delivery-method-labels.cjs tests/unit/brand-location-edit.cjs`
- `CART_CHROMIUM_PATH=/tmp/menu-chromium node --test tests/unit/delivery-method-labels-browser.cjs`

The unit/server tests cover accepted/invalid text, legacy fallback, explicit clearing, public field filtering, persisted labels, unchanged fees, and permission/missing-record rejection without writes. Browser tests use the real admin form, real server action and real delivery dialogs with synthetic I/O. They verify save/reopen/clear at 320px and 390px, long text wrapping, disabled-method behavior and pickup navigation. No production data or orders are created by these tests.

Deployment acceptance: inspect both new fields in the live location editor without saving and confirm existing storefront behavior. Configured offer rendering and round-trip persistence are verified with synthetic records; no live discount claim is configured without an operator's business instruction.
