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
  be `orderfly.dk`. When Next constructs a local-listener URL, the direct Host
  may also be a validated Cloud Run service URL for the deployment's `K_SERVICE`.
  Both representations are checked independently against the deployment context.
  Lists, foreign domains/subdomains, explicit public ports,
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

## Mixed listener / Cloud Run Host correction (#449)

Read-only production inspection on 22 October established that the reported
Pepperoni slug has an existing consistent public index and active, unexpired
Esmeralda record with no location restriction. The brand is active; lifetime
openings are zero. Cloud Run request logs show the reported HEAD returning 404
on `studio-434157933685.us-central1.run.app`; startup logs show port 8080.
Next 15.5.9 constructs its initial request URL from `fetchHostname` and `port`,
independently of the incoming Host (`next-server.js`, `attachRequestMeta`).

The previous tests paired an internal URL with the same Host, or a canonical
Host. They missed a local-listener URL paired with the Cloud Run Host. The new
regression fails with 404 before the correction and requires a read-only HEAD
redirect, one atomic GET event, and unchanged rejection of a paused record.
Malformed hosts, explicit ports, other services and lookalike suffixes remain
rejected before database access. Canonical forwarded host/protocol, production
context and the exact listener port remain mandatory.

The production Next header tuple is inferred from provider logs and framework
source, not directly logged. Therefore this regression is not live acceptance:
verify the deployed SHA and the original public HEAD after release before
claiming that the user's scan issue is resolved. No QR record or printed link
is replaced, and no production database write is part of this fix.
