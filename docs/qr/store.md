# Dynamic QR storage service, candidate #393 / #389

`src/lib/qr/store.ts` is an internal Firestore-compatible service. It is not a
public API, an authentication implementation or deployed functionality.

## Contract

Construct `createQrStore(db, {normalizeDestination, now?, newId?})` on the server.
Production must inject A1's shared `normalizeDestination`, configured to reject
the service's own redirect loops. The optional clock and ID generator exist for
deterministic tests. Production defaults use `Date.now` and independent 128-bit
cryptographic IDs for the internal ID and public slug. Do not accept these
dependencies from a request or use a predictable production ID source.

Every administrative method receives a verified native `QrScope`:
`{brandId, locationIds: null | string[], actorId}`. `null` means brand-wide
permission, an array grants only its explicit locations, and an empty array grants
nothing. The route must re-evaluate the specific action against current native
authority before calling the service. A client-selected scope is never trusted.
Read/export/analytics authorization and create/edit/archive authorization are
distinct route responsibilities. Scope is checked again against stored records,
including request receipt replay. Location-scoped access cannot read or edit
brand-wide codes. Location references must belong to the brand and be active.

Methods:

| Method | Inputs after scope | Behavior |
|---|---|---|
| `create` | input, request UUID | New active code and immutable audit/receipt |
| `update` | ID, input, expected revision, UUID | Editable destination/metadata, stable printed slug |
| `get` | ID | Explicit scoped read |
| `list` | `{locationId, limit?}` | One selected location, or brand-wide codes with `null`; max 100, explicit truncation |
| `pause` / `activate` / `archive` | ID, revision, UUID | Transactional lifecycle change |
| `duplicate` | source ID, new name, UUID | New independent paused copy; source must remain available |
| `resolve` | public slug | Active target string only; no internal record returned |
| `resolveInTransaction` | existing transaction, slug | Internal read phase; target, stored scope/revision/campaign for atomic event writing |

`QrInput` contains name, HTTPS destination, explicit location or null, optional
campaign, up to 20 tags, and optional expiry in epoch milliseconds. Name/campaign
and tags reject control characters and have length bounds. Destination validation
is shared through the required injected function, rather than reimplemented here.
The HTTP layer must validate a strict request schema and bound request body size.

## Stored paths and integrity

- `brands/{brandId}/qrCodes/{codeId}`: stored brand and location boundary,
  destination, status, metadata, revision and timestamps.
- `qrPublicCodes/{randomSlug}`: exactly `{brandId, codeId}`. It is an internal
  server lookup, not a browser-readable short-link directory.
- `brands/{brandId}/qrCodes/{codeId}/audit/{requestId}`: create-only actor,
  operation and revision event.
- `brands/{brandId}/qrRequests/{requestId}`: create-only command signature and
  result snapshot. The signature includes actor, operation, target, expected
  revision and normalized inputs. Replay of the same command returns its original
  result; reuse for a different command conflicts.

Transactions check all reads before their first write. Code, index, audit and
receipt commit together. Existing IDs or index slugs are never overwritten by
create. Updates preserve the slug and increment the revision. Stale simultaneous
edits conflict. Archive is terminal. The service never deletes or recycles codes,
indices, request receipts or audit records. Archived results may be returned for
an exact historical request replay, but replay never reactivates the code.

The public resolver atomically reads index, brand, code and optional location. It
requires known `brand.status` active or trialing, code `status === 'active'`, exact index
and record correspondence, future/no expiry, and an active matching location.
Existing brand types also include suspended and pending. Those states and unknown
states fail closed. This explicit QR policy differs from the older loyalty check
that excludes only suspended brands. It revalidates the stored destination before returning it. A malformed,
missing, expired, paused or archived slug never returns a destination.

## Remaining integration and release work

This service does not collect scan events. B2 owns atomic active-code validation
plus event recording under each code. It calls `resolveInTransaction(tx, slug)`
inside its own Firestore transaction and appends the event only after all reads.
The helper returns destination, brandId, codeId, locationId, revision, campaign and
tags; those fields are internal context, not a public JSON response. `QR_PATHS`
exports the collection names. No separate resolve-then-write sequence should
be described as atomic. Events must not store raw IP addresses, raw user agents or
referrer queries. Server routes, error mapping, canonical-host/no-cache behavior,
rate limits, current-action authorization, Firestore browser-denial rules,
analytics retention, emulator integration and real browser acceptance are separate
remaining tasks under #389. No Firestore rules/indexes or production data were
modified by #393. Rules must explicitly deny browser access to all new nested
paths and global lookup paths before activation.

## Verification

`node --test tests/unit/qr-store.cjs`: twelve executable cases against an atomic
transaction double cover success, replay, changed requests, simultaneous stale
edits, foreign brand/location, restricted scope, lifecycle, expiry, inactive
brand/location, moved-location create/duplicate receipt replay, revoked location scope,
corrupt index, in-transaction event composition, duplication, query scoping/truncation, validation
and collision rollback. The double enforces read-before-write and create-only
semantics. It does not prove behavior of a deployed Firestore service or rules.

Standalone strict TypeScript compilation passed with Node types. The full
repository `npm run typecheck`, CI, independent current-head review, actual
Firestore emulator integration and post-deployment live QA are still required.
Do not merge or label this module deployed based on the isolated unit result.
