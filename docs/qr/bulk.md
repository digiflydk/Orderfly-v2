# QR bulk preview (#399, coordination #389)

Candidate preparation only, stacked on payload PR #403. No database write, API, bulk creation UI or production acceptance is implemented by this slice.

`previewQrCsv(csv, {allowedScopes, blockedOrigins?})` parses strict comma/quote CSV (UTF-8 BOM, LF/CRLF, escaped quotes and quoted newlines). Limit: 128 KiB UTF-8, 100 data records, 11 columns. A malformed quote, over-limit file or invalid header rejects the file; field/scope/column errors carry a record row number (header is row 1, multiline cells still count as one record). No rows are silently truncated. Final newline is allowed; blank data records are errors.

Required headers: `name,destination,brand_id`. Optional: `location_id,campaign,tags,utm_source,utm_medium,utm_campaign,utm_term,utm_content`. Header order is arbitrary; unknown/duplicate headers are rejected. Tags are separated by `|` inside the cell, at most 10 tags of 40 characters each. Names max 120; campaign max 100. IDs use letters, digits, `_`, `-`, max 128. `destination` uses the shared HTTPS/UTM payload policy, preserving existing unrelated query/hash.

Every row must match a server-supplied `allowedScopes` brand and one of its location IDs. Empty `location_id` requires explicit `allowBrandWide:true`; an empty location is not interpreted as automatic access to every location. Use current authenticated create permissions when deriving this list. Preview is not authorization at commit time.

Returned `rows` permit a UI to display valid and invalid entries, but `plan` is **null if any error exists**. A valid plan contains normalized entries and deterministic `canonical` JSON with schemaVersion 1. The server adapter must hash that canonical string using SHA-256, bind it to the authenticated actor and request ID, revalidate current per-row authorization, and compare the hash on retry. Same request ID plus different content must conflict. Canonical content is not itself a secret, authorization token or collision-resistant hash. Row order is intentionally significant. Duplicate names inside the same brand/location in one file are rejected; detecting conflicts with existing persisted codes belongs to the server transaction.

## Required remaining integration

1. UI uploads only to an authenticated preview endpoint, displays every row/error and offers an explicit confirmation only for a complete valid plan.
2. Confirmation submits the original CSV/canonical plan and a unique request ID to the server. Server recomputes preview using current permissions; never trust browser-provided `allowedScopes`.
3. Persist all entries and idempotency record atomically or expose an explicit durable job state with exactly known committed rows and recoverable retries. Never report complete success after partial writes. Existing-record conflicts need a documented reject/rename policy before writes.
4. Apply brand/campaign/tag filters and duplication through the main CRUD adapter. This pure slice does not implement duplication or list organization.
5. Verify successful import, cross-brand/location rejection, permission revocation between preview/commit, same-key conflict, network retry and transaction failure in an isolated testbrand. No unattended production mutation is authorized.

`tests/unit/qr-bulk.cjs` exercises the actual TypeScript via the existing loadTs helper. Unit tests do not constitute browser, Firestore integration, full repository typecheck, independent review or live acceptance.
