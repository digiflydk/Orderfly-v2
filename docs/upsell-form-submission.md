# Upsell form submission

The upsell editor submits React Hook Form's controlled values using `upsellFormData`, rather than relying on native form controls. Custom selects previously omitted brand and offer type, checkboxes could send `on` instead of IDs, and trigger/time arrays were absent.

The serializer preserves repeated IDs, JSON trigger/time arrays, dates and unchecked activation. Both create and edit use the same contract; the disabled brand selector on edit remains included. The existing server schema remains authoritative, including mandatory location, offer and trigger validation. This change does not create or modify production campaigns during verification.

Verification: `npm run typecheck` and `node --test tests/unit/upsell-form-data.cjs`.
