# Isolated Wolt callback acceptance harness

Issue #690. This harness is for sandbox acceptance only. It is not an Orderfly route, Firestore inbox, customer-facing service or production deployment. Delivery coordinator #657 owns the actual shared callback/inbox integration.

## Current evidence and blocker

ASAP and scheduled quote/create/immediate-cancel already passed against genuine Wolt sandbox; see `wolt-drive-sandbox-qa.md`. Genuine callback reception remains unverified.

On 2026-10-26, no exposed-port tool or preinstalled tunnel was available. Official Cloudflare Quick Tunnel documentation was checked, and official `cloudflared` version 2026.10.3 was downloaded to private scratch. Starting a temporary account-free HTTP2 tunnel failed before obtaining a public URL:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel":
dial tcp: lookup api.trycloudflare.com on 168.63.129.16:53:
dial udp 168.63.129.16:53: connect: network is unreachable
```

No Wolt webhook registration, new delivery or provider mutation occurred in this callback attempt. No alternate tunnel was used to work around the environment restriction. The tunnel process exited with failure and no public receiver remains running. A separate random signing secret was generated privately and never reused from the merchant key.

## Required next input from the delivery runtime owner

Provide permitted **nonproduction reachable HTTPS ingress** for the isolated receiver, or a separately approved test deployment endpoint owned by Orderfly. The endpoint must forward only this test receiver, not expose the workspace/application/admin services. Do not use production routing or a third-party payload collector. Confirm environment and ownership before registration.

## Receiver

`tests/integration/wolt-drive-callback-receiver.cjs` binds only `127.0.0.1`, exposes a fixed non-sensitive health response and one opaque callback path, bounds request bodies, verifies the actual Drive HS256 adapter, and stores receipts in a private local journal. Acknowledgement follows file fsync, rename and directory fsync. Duplicate event identities remain single receipts across restart. It does not mutate payment, kitchen, print or production storage. Full signed envelopes are retained only in the private journal for independent test evidence, never in application/GitHub logs.

Use private mode-0600 files outside the repository. The callback config needs `environment: sandbox`, `merchantId`, a separately generated random `secret`, an opaque `callbackKey` (24–128 URL-safe characters), `port` and the verified `callbackUrl` ending `/callback/<callbackKey>`. Never commit its values. The registration tool additionally loads the existing separate sandbox credential file.

```sh
WOLT_CALLBACK_QA=sandbox-receiver \
WOLT_CALLBACK_CONFIG_FILE=/absolute/private/callback-config.json \
WOLT_CALLBACK_JOURNAL_FILE=/absolute/private/callback-receipts.json \
node tests/integration/wolt-drive-callback-receiver.cjs
```

Start permitted HTTPS ingress separately and verify `/health` from outside before any provider mutation. Never treat local fixture requests as evidence that Wolt can reach the endpoint.

## Registration and cleanup

`scripts/wolt-sandbox-webhooks.cjs` supports `status`, `register` and `cleanup` only, against the fixed development host with redirects rejected. It lists existing subscriptions first, refuses duplicate/unknown registration, persists its own intent before POST and preserves unrelated merchant subscriptions. Cleanup deletes only the exact callback/ID associated with its private registration record, then lists again to verify absence. A lost registration response requires reconciliation or cleanup of that one matching callback, never blind registration retry.

```sh
WOLT_CALLBACK_QA=sandbox-manage \
WOLT_SANDBOX_CREDENTIAL_FILE=/absolute/private/sandbox.json \
WOLT_CALLBACK_CONFIG_FILE=/absolute/private/callback-config.json \
WOLT_WEBHOOK_REGISTRATION_FILE=/absolute/private/registration.json \
node scripts/wolt-sandbox-webhooks.cjs status
```

Replace only the final action with `register` after reachable ingress is verified. Then perform one approved synthetic sandbox order with a persisted stable intent, correlate received native order IDs privately, and cancel that identified test order. Do not retry unknown creation. Verify genuine signed receipt and replay handling separately. Always run `cleanup`, confirm removal and cancellation, and stop receiver/ingress. Preserve sanitized evidence; keep all keys/contact/native payloads private.

## Internal checks

```sh
node --test tests/integration/wolt-drive-callback-receiver.test.cjs tests/integration/wolt-sandbox-webhooks.test.cjs
```

The receiver harness depends on the actual webhook adapter in PR #698, tested here at head `d38405b2a01fd8792861336e2ad9ad624b7b304b` (including missing-ETA reliability and two-venue regressions). This QA-only PR does not duplicate the adapter implementation; assemble that dependency before running.

Four internal tests pass: signed synthetic HTTP receipt and fsync-before-ack; restart/replay dedupe; signature/body/path/storage rejection; list-before-register/owned cleanup/unknown-outcome and environment guards. These are controlled local tests with fake provider HTTP for registration, not genuine Wolt callback acceptance. No GitHub Actions or paid integration is used.

References: https://developer.wolt.com/docs/wolt-drive/webhooks and https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ .
