# Controlled synthetic CloudPRNT HTTP boundary

Issue #518 wires the actual #517 one-job lifecycle to a separate Node endpoint:

`https://orderfly.dk/api/cloudprnt-pilot/{brandId}/{locationId}/{printerId}`

The ordinary connectivity endpoint remains identity-only/no-job. This pilot endpoint does not create or activate jobs. It serves only an already consumed, server-bound, unexpired supervised qualification and its exact immutable synthetic payload under both exact default-OFF configuration and pilot-output gates. Physical printer contact and gate activation are separate controlled operations.

All methods reuse bounded process-local admission before parameters, body or native I/O. Native lifecycle code verifies Basic authentication freshly on each transaction attempt using the existing parser/verifier, without returning plaintext credentials. URL scope selects native identity; MAC and optional UID from Star queries remain syntactic protocol fields and never grant identity or permission. Authorization values, tokens and native provider errors must never be logged. Responses are no-store and vary by Authorization.

- POST accepts only bounded HTTPS JSON polls, streamed up to 8192 bytes with exact declared lengths and strict UTF-8. Existing protocol parsing determines readiness. Busy/error/progress/old-token states only withhold an offer, after native authentication. A ready poll may return exactly PNG media, the server delivery token and DELETE method, only after durable offer commit.
- GET parses the existing strict MAC/token/media query. Only PNG or omitted media is accepted. Lifecycle commits download-start before exposing the exact validated PNG bytes. Repeat GET is409, including after unknown/lost delivery. HTTP retries cannot create an automatic duplicate print.
- DELETE parses existing strict Star status/token/retry fields. Code200/OK becomes confirmed, reported failure becomes failed, other known statuses become unknown. It cannot accept a caller JSON success flag, timestamp or physical-compatibility assertion. Identical terminal reports are idempotent; conflicting outcomes fail409.
- HEAD is explicitly405. Next's automatic HEAD-through-GET behavior must not consume a one-shot job. Unsupported methods do no native I/O.

Malformed input is400, absent/invalid/revoked identity401 with Basic challenge, stale/conflicting job state409, excess admission429 with Retry-After5, and disabled/unknown/native failures503. Error bodies expose only fixed public codes. No token appears in error responses. No output flags, native production data or Wolt settings are changed by deploying the boundary.

Verification runs actual exported routes, HTTP adapter, native lifecycle, credential auth and canonical PNG through a shared source module graph, replacing only Admin I/O. Tests cover full poll/download/result, busy withholding, HEAD no consumption, strict input rejection before native I/O, auth/gates, failed/unknown outcomes, duplicate result, uncertain commit no-resend and admission. `npm run typecheck` plus dedicated node tests are required. Isolated native tests and deployment are not evidence of physical output or paper fit.
