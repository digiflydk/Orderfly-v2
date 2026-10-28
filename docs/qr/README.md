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

`docs/qr-firestore-indexes.json` describes only new QR query requirements; do not replace the project's complete index catalogue with this fragment. Its three composites are READY in `orderfly-39325` (run 39691780053, 21 October 2026), and the retention sweep's document-name ordered collection-group queries over `qrScanEvents` and `qrRateLimits` were verified read-only in production (run 39725659082, 22 October 2026). Deployed browser rules must keep denying all QR definitions, public-index direct access, scan records, receipts and maintenance records; no client ACL is inferred from server code. Production runs with `QR_MODULE_ENABLED="true"` (RUNTIME, `apphosting.yaml`, #449/#450): public redirects, dynamic creation/import/export and the heartbeat's bounded retention are active. The code default stays OFF for any environment without the flag.

Payload/render/metric primitives and storage lifecycle have executable isolated tests. Admin component and dashboard have intercepted-browser tests. The assembled candidate now connects native administration, event recording/retention, bulk confirmation, logo/print, scoped history and scan-time attribution. Exact-head CI/review and the separately documented production/hardware prerequisites remain required. See `release-readiness.md` for the concrete release boundary. No production records, roles, rules or secrets have been changed by implementation.

See sibling documents for each slice's actual implementation and limitations. Parent #389 must remain open while acceptance or release evidence is missing.

## Activation and measurement contract

With `QR_MODULE_ENABLED` absent/false, public redirects and retention do not run, and dynamic creation, bulk import and dynamic image exports are rejected. Existing definitions remain viewable and may be paused, archived or reactivated by their independently authorized administrators; reactivation does not override the public switch. Static generation remains available. This permits preparation and incident management without producing new disabled printed links.

Detailed analytics covers at most the retained 90-day event interval and reports truncation, expired/invalid events and future intervals. A brand-wide analytics grant can read a code's former-location events; a delegated location grant can read only its current location. Catalogue campaign and placement filters select current definitions, not historical attribution. Scan-time campaign/location are recorded on events; conversion attribution, geography, and cross-code campaign reports remain separately scoped follow-up work, not accepted capabilities.

Lifetime counters are non-identifying permanent aggregates on newly created codes. Missing legacy counters are unknown, never reconstructed from a partial retained interval. Global counters must only be projected to a current brand-wide analytics grant because they can span former locations. Detailed event cleanup must preserve these aggregates.

The existing additive index workflow accepts `docs/qr-firestore-indexes.json` for its three composites only. That script does not apply `fieldOverrides`; collection-group document-name query readiness must be verified separately. This manifest is a reviewed candidate, not an instruction to run a production write.

## Compact QR links

New individual and bulk-created codes encode the same 128 random bits as 22 base64url characters instead of 32 hexadecimal characters. Resolution and thumbnails accept both formats. Existing printed URLs and stored slugs remain unchanged. Shorter links improve density but do not guarantee arbitrary physical reduction: logo, module shape, quiet zone and printer quality still matter. There is no size-specific export mode.
