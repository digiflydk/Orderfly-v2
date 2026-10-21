# QR module candidate (#389)

Orderfly owns the QR generator and dynamic-link resolver. mPanel opens the existing Orderfly application; no parallel identities or databases are added.

This directory describes implementation candidates, not a deployed capability. The coordination issue #389 and integration PR #411 carry the current exact-head test/review/release evidence. Child PR reviews do not approve later integration changes.

## Runtime boundaries

- Planned administration: `/superadmin/qr-codes`; same-origin JSON POST `/api/qr/admin`.
- Planned public redirect: apex `https://orderfly.dk/q/{random128bitSlug}`. The permanent URL is encoded; destination changes preserve printed images.
- Current native session and `orderfly.qr_codes:{view,create,edit,archive,export,analytics}` permission are independently required for each action and stored brand/location.
- Only a verified platform superuser may enumerate every brand. Other directory reads use current native grants and explicit brand/location document boundaries. Every data operation remains independently scoped.
- Static WiFi/contact/text payloads are generated for immediate export, never saved to the QR catalogue.
- `brands/{brandId}/qrCodes/{id}` stores dynamic definitions, status, revision and bounded design options. Public index `qrPublicCodes` contains only brandId/codeId. Immutable audit and request receipts are separate scoped subcollections. No raw visitor IP, complete user agent or referrer path is saved.
- `qrScanEvents` is a unique collection group for scan records, avoiding generic `events` retention collisions. Expired events require the bounded retention worker before a retention guarantee is made.

## Measurement

An HTTP opening cannot establish use of a camera. Reports distinguish recorded GET openings from probable scans after bot/prefetch filtering. Uniqueness remains unknown without an independently reviewed identity source. No location or conversion data is invented. Requested and actual measurement interval, incomplete results and retention limitations must remain visible.

## Candidate validation and remaining integration

Payload/render/metric primitives and storage lifecycle have executable isolated tests. Admin component and dashboard have intercepted-browser tests. Full authenticated application integration, event recording/retention, bulk confirmation, CI inventories, exact-head independent review, deployed SHA and live acceptance remain required. No production records, roles, rules or secrets have been changed by implementation.

See sibling documents for each slice's actual implementation and limitations. Parent #389 must remain open while acceptance or release evidence is missing.
