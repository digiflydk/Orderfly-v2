# Authenticated CloudPRNT no-job poll adapter

Issue #489; prerequisite #370 / PR371. This is an internal server-only adapter,
not a published endpoint or a physical printer integration. Root coordinates
publication and release; Claude owns final QA. Output remains disabled.

`handleCloudPrntPollHttp(request, scope)` composes the existing protocol parser,
the actual Basic HTTP authentication adapter and the actual native identity
verifier. Its only successful response is HTTP 200 with `{"jobReady":false}`.
It has no job argument, queue reader, content loader or callback capable of
selecting print work. Enabling a flag elsewhere does not change this response.

## Request and native operation

The future trusted route supplies exactly `brandId`, `locationId` and
`printerId`. These are bounded selectors, not authority: the native verifier
still establishes current brand/location ownership before loading private
printer/credential records. Poll JSON and URL query cannot select the native
scope, provide revisions or grant permission. A claimed MAC, UID, status,
progress or job token is never promoted into native identity or capability.

The adapter accepts HTTPS POST without query, fragment or URL credentials.
Missing, combined, oversized or malformed Basic envelopes return a fixed 401
challenge before body consumption. Full canonical Base64, username, secret
and native digest verification remain in the existing authentication modules.
JSON content type is required (optional UTF-8 charset); compressed content and
combined/invalid content-length values are rejected. An optional content length
must match the actual bytes, but does not replace the streamed 8192-byte bound.
The UTF-8 decoder rejects malformed or truncated sequences. The stream is
cancelled on overflow without waiting for a producer-controlled cancellation
promise. Parse/read failures do not start native I/O.

The existing pure parser owns supported status, MAC, UID, token and progress
syntax, and deliberately ignores peripheral/extension payloads. This adapter
does not introduce a second protocol parser or a raw observation store.

After bounded parsing, the native Admin SDK runs one **read-only** transaction.
The callback invokes the actual Basic/native verifier on every SDK attempt;
no identity snapshot is cached across attempts or requests. The HTTP response
waits for the native operation to finish. Reassignment, suspension, rotation,
revocation, stale printer revisions, missing credentials and provider errors
are rejected by current native checks. A discarded successful callback cannot
become HTTP success when a later attempt or transaction completion fails.

## Response and privacy

| Condition | HTTP status | Fixed JSON body |
| --- | --- | --- |
| Authenticated valid poll | 200 | `{"jobReady":false}` |
| Invalid request/body/media/scope | 400 | `{"error":"invalid_poll_request"}` |
| Missing/invalid/revoked/unverified credentials | 401 | `{"error":"device_unverified"}` |
| Method other than POST | 405 | `{"error":"invalid_poll_request"}` |
| Native storage/transaction unavailable | 503 | `{"error":"poll_unavailable"}` |

All responses use `Cache-Control: no-store` and `Vary: Authorization`; 401
adds the fixed Basic challenge, and 405 advertises POST. No raw error,
credential/header, private record, digest, status, MAC/UID or job token is
returned or logged. No cookie/admin-session fallback exists in this adapter.

There are no writes: no observation/audit persistence, claim, queue decrement,
payload access, dispatch, result confirmation or last-used update. Identity
success is not exact model/firmware proof and does not unblock #485/#461.
Physical printing and Wolt coexistence are untested.

## Follow-up integration boundary

Before installing a route, root must approve its exact path and scope mapping,
verify PR371 is actually released, reconcile current main and complete fresh
current-head CI/Codex review. A minimal later route may invoke this adapter
with validated native path selectors; it must not accept body/query revisions
or credentials in the URL. Deploy-level HTTPS, request/body timeout/rate limits
and credential-safe access-log policy must be established for that public
boundary. This internal slice installs no route, probing job or enrollment URL.
Future job-serving work requires independently reviewed capability, immutable
delivery ownership and output policy; it cannot change this adapter into an
implicit dispatch grant.

## Verification

`node --test tests/unit/printing-cloudprnt-poll-http.cjs` executes the actual
handler, parser, Basic/native verifier and real credential digest code with
only native Admin I/O isolated. Cases cover byte/UTF-8/header/request bounds,
no-job responses across status/state/token variants, native scope/read frontier,
credential/revision changes on retry, delayed completion, late failure and
absence of writes/private reflection. `npm run typecheck` and the related
protocol/Basic/native/device suites are required. These fixtures are software
proof, not emulator, browser, deployed-authentication or physical acceptance.

Official Star primary references read 2026-10-22:
- [Polling POST](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/index.html)
- [JSON request](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-request.html)
- [JSON response](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-response.html)

The vendor specifies polling as POST, requires `statusCode` while allowing
other request fields to be absent/null, and supplies `jobReady:false` for a
response without print work. Missing progress is not print completion.
