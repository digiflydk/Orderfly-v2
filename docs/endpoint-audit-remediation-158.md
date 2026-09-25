# OF #158: endpoint audit remediation

## Implemented behavior
- Internal documentation list/download/bundle require central platform superuser before filesystem access. Whitelist/path protections remain.
- Legacy order helpers are server-only; both menu import wrappers and the AI entry require central superuser.
- Browser upsell increments fail closed. Checkout validates optional selected offer IDs against native catalog, brand/location, active dates and actual basket triggers. Invalid attribution IDs are ignored, while discounted prices still must pass the authoritative floor. Order records contain server-derived verifiedUpsellIds. Paid settlement reads matching native offers and increments once per offer in the same transaction as Paid/accounting. Duplicate webhooks do not increment. Click telemetry remains separate. Deleted/moved offers do not block payment or acquire a counter.
- Anonymous consent changes require a host-bound HttpOnly capability stored as a hash. A known UUID alone cannot claim an existing document. Old browsers receive a new server identity, leaving legacy/customer-linked records untouched. Schema, bounded body, same-origin and active brand checks precede writes. The legacy action cannot write. Token hashes are omitted from administrator list projections. Browser retry storage is cleared only after HTTP acknowledgement, not merely sendBeacon acceptance.
- Full general website settings now require platform-superuser. Public pages use an explicit allowlist excluding provider/model/system prompts and unknown future fields; public cache version is bumped. No data migration is required.
- Loyalty and webhook tests now model Admin SDK references and real central scope rather than obsolete client-SDK assumptions.

## Tests and release
Run `npm run typecheck`, `node --test tests/unit/*.cjs` and focused browser regressions. New endpoint-audit tests cover document denial before I/O, consent ownership/origin/brand rejection, stale upsell clients, offer eligibility and public projection. Paid-settlement tests cover duplicate/concurrent delivery and foreign scope. No real mail, payment or production write is used.

Build/deploy must preserve Firebase data project orderfly-39325 and hosting project orderfly-v21-10334086-b3076. Changes are proposed in a PR, not deployed by the implementation agent. Independent review, PO acceptance, merge and live verification are separate release gates. No claim of universally error-free production follows from unit tests.

## Implementation verification (2026-09-25)
- TypeScript typecheck: passed.
- Complete non-browser unit inventory: 555 passed, zero skipped/failed.
- Real Chromium cart/checkout/commerce browser regressions: 83 passed, zero skipped/failed.
- Additional baseline fixture repairs preserve real scoped product readers and RSC serialization, load the public location projection, and explicitly distinguish optional empty topping groups from mandatory groups that must reject restoration.
- The normal Playwright browser download returned invalid archives in this workspace. Browser regressions ran using isolated npm-distributed Chromium 153; no project dependency or browser gate was changed.
- These results do not include deployed production verification.
