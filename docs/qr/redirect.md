# Public QR redirect, candidate #396 / #389

`GET /q/{32-character-lowercase-hex-slug}` opens a dynamic QR link on
`https://orderfly.dk`. `HEAD` resolves the same link without creating an event or
changing the quota. These are temporary `302` redirects, never permanent cached
redirects. All handler responses include `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` and nosniff.
HEAD responses have no body, including errors.

The route requires `QR_MODULE_ENABLED=true`, a non-secret operator flag. It is
OFF when absent or any other value. Do not activate it before the complete #389
release prerequisites and Firestore rules/retention acceptance are verified.
The request URL and direct Host header must agree. Only the canonical HTTPS apex
is accepted in production; brand subdomains, alternate ports and spoofed Host
headers fail before Firebase access. Development additionally accepts HTTP on
localhost/loopback. Forwarded headers do not grant host authority, visitor identity
or location information.

## Atomic recording and limits

The internal handler calls `store.resolveInTransaction(tx, slug)` from #393. That
read phase validates index, current brand, current code status/expiry/destination
and optional active brand-owned location. It then reads a persistent per-code
minute counter before writing the counter and the event in the same transaction.
Firestore transaction retries re-evaluate the active code and current time. A
concurrent pause, archive or location/status change cannot commit an event from a
stale record version. A generated event UUID is stable across transaction retries.
Distinct HTTP requests are distinct recorded openings, including browser reloads.

Each code permits 500 GET openings per epoch minute, including bots/prefetch.
The 501st gets `429` with Retry-After through the next minute and no event.
HEAD never consumes quota. Quota is persistent rather than per-process memory;
it is a bounded safety limit, not a guarantee against distributed abuse or all
database costs. Invalid slugs fail before reads. A syntactically valid unknown
slug requires one internal lookup and records nothing.

The resolver returns `404` without internal details for unavailable targets,
inactive/foreign locations, malformed slugs, unsafe stored destinations and
noncanonical/disabled requests. Persistence failures return sanitized `503` with
Retry-After rather than a false success redirect. A record is an opening accepted
by the redirect service. It does not prove the client received the response,
loaded the destination, used a camera, completed a booking or placed an order.

## Storage and retention prerequisites

| Path | Stored fields |
|---|---|
| `brands/{brandId}/qrCodes/{codeId}/qrScanEvents/{UUID}` | `timestamp` epoch milliseconds, `qrId`, classified device/browser/OS/referrer-origin/exclusion, `brandId`, `locationId`, campaign, tags, `expiresAt` Date |
| `brands/{brandId}/qrCodes/{codeId}/qrRateLimits/{epochMinute}` | `brandId`, `qrId`, count and `expiresAt` Date |

Events are `QrMetricEvent` plus explicit brand/location/campaign/tags and a Date
expiry 90 days after recording. Limiter expiry is 24 hours after the minute ends.
The root integration owns deployed TTL/retention configuration; writing an expiry
field alone does not delete data. Firestore TTL can delete asynchronously, so
analytics must still filter the selected valid retention interval. Browser read
and write denial must cover both nested collections and the public slug lookup.
This change neither deploys rules/indexes/TTL nor modifies production data.

The event is explicitly projected. It contains no raw IP, raw user agent, cookies,
full referrer paths/queries, GPS coordinates, customer identity or visitor key.
Only a sanitized referrer origin and A3's coarse classification are retained.
Known bots and prefetch are recorded but excluded from probable scans. Unique
visitors remain unknown when probable scans have no separately approved identity
source. No fingerprint or cookie is created by the redirect.

## Verification and remaining release work

`tests/unit/qr-redirect.cjs` executes the actual service with the actual payload,
metrics and store modules against a transaction double, plus the actual Next route
wrapper with injected Firebase. Nine tests cover GET/HEAD, bot/prefetch, concurrent
quota boundary, minute rollover, paused/archived/expired/invalid targets, host
spoofing, module OFF, DB failures with atomic rollback, unsafe stored destinations,
header minimization and schema projection. These are isolated automated tests,
not Firestore emulator integration, deployed live QA or physical device scanning.

Full `npm run typecheck` passed with the real Firebase Admin types after the #393
Query interface correction. Current-head CI, independent code review, Firestore
emulator/rules/TTL acceptance and the deployment-gated read-only live checks remain
required. Do not label #396 deployed or close it on the unit result alone.
