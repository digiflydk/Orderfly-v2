# Upsell form submission

The upsell editor submits React Hook Form's controlled values using `upsellFormData`, rather than relying on native form controls. Custom selects previously omitted brand and offer type, checkboxes could send `on` instead of IDs, and trigger/time arrays were absent.

The serializer preserves repeated IDs, JSON trigger/time arrays, dates and unchecked activation. Both create and edit use the same contract; the disabled brand selector on edit remains included. The existing server schema remains authoritative, including mandatory location, offer and trigger validation. This change does not create or modify production campaigns during verification.

Verification: `npm run typecheck` and `node --test tests/unit/upsell-form-data.cjs`.

Submission uses a prevented submit event and dispatches the action in a transition. A form action's automatic native reset could clear custom checkbox/select state after a returned validation error. No reset is requested now; server errors retain entered values for correction and retry. Pending state comes from the action and disables repeat submissions. Successful actions retain the existing redirect.

Persistence follow-up: optional description/image fields store explicit null, while undefined optional properties are omitted from the Firestore write. New records receive createdAt. Read paths convert database timestamps recursively to Date values before passing upsells and related catalog data to client components. Regression mocks now reject undefined writes like Firestore; edit loading covers actual Timestamp prototypes, including nested metadata. Live creation and edit still require post-deployment verification.
