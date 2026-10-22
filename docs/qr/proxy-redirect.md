# QR canonical redirects behind App Hosting (#450)

The public QR resolver used to require the URL that Next.js receives and its
direct Host header to both equal `https://orderfly.dk`. That rejects App Hosting's
internal request URL before the native QR lookup, including a valid HEAD.

Firebase documents `X-Forwarded-Host` as the original public hostname:
https://firebase.blog/posts/2024/07/app-hosting-updates/#wildcard-subdomains
The repository's earlier observed proxy URL behavior is recorded in
`docs/funnel-tracking-repair.md`. Cloud Run's server-owned `K_SERVICE` and `PORT`
are described in https://cloud.google.com/run/docs/container-contract#env-vars.

## Routing boundary

- A direct canonical HTTPS URL remains valid only with an absent or canonical
  direct Host. Conflicting forwarded host/protocol values fail closed.
- The internal representation is available only in production when the route
  supplies Cloud Run's server-owned service and listener port. A request header
  cannot opt in. The origin must be the local listener on that exact port, or
  a Cloud Run service URL for that service (including a revision-tagged URL).
- The proxy request must carry exactly one `X-Forwarded-Host: orderfly.dk` and
  `X-Forwarded-Proto: https`. Its direct Host must agree with the internal URL or
  be `orderfly.dk`. Lists, foreign domains/subdomains, explicit public ports,
  trailing dots, non-HTTPS forwarded protocol and conflicting hosts are rejected.
- Forwarded headers in an arbitrary external URL cannot enable the resolver.
  Public host routing is not authentication or proof of proxy ingress. The QR
  slug and current native brand/location/status/destination reads remain the
  data authority, on every request and transaction retry. No host/header grants
  administration, analytics access, tenant ownership or conversion identity.
- No forwarded IP, geography or visitor identity is introduced. Event, quota,
  lifetime, rate-limit and HEAD transaction behavior is unchanged.

## Verification and release

`node --test tests/unit/qr-redirect.cjs` executes the real resolver and route with
isolated persistence. It covers direct canonical requests, loopback/Cloud Run
proxy forms with preserved or internal direct Host, no-write HEAD, one atomic
GET event/quota, foreign/forged/list/port/protocol rejection before database
access, and a missing/invalid deployment context. Relevant native scope,
lifetime and worker suites remain separate; `npm run typecheck` is required.

The existing #450 current-head CI and independent Codex review must pass again.
Before accepting activation, verify the actual deployed SHA and the approved
single Esmeralda test QR's HEAD, mobile GET, bot GET, analytics/history and
pause. Local request construction is not live proxy or physical-camera proof.
Keep the existing normal-heartbeat retention acceptance in the activation
runbook. No diagnostic endpoint, production record, secret, IAM change, new
runtime flag or workflow permission is added by this correction.
