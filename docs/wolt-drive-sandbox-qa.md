# Wolt sandbox acceptance evidence

Issue #690. This record contains quote-only evidence and a separate controlled ASAP create/cancel test. Callback, scheduled-booking and production acceptance remain open.

## Genuine provider evidence

On 2026-10-25, authenticated merchant webhook listing returned HTTP 200 and zero subscriptions. A direct shipment promise returned HTTP 201, binding=true, price 8625 minor DKK. Request IDs: `65414b43-d1bb-4a4b-9df4-7bd998c4b8f3` (list), `91782270-6f72-476b-b15e-a854db2098a1` (quote).

Running the actual quote adapter initially rejected valid HTTP 201 responses because native timestamps contain six fractional digits. The fix and native-shape regression are in PR #700, head `981a0164a77a43eb79a5dec4e686f3b4ae36fcee`. The actual `requestWoltQuote` and HTTP transport were then rerun successfully for ASAP and scheduled (+12 hours) quotes. Both returned available, 8625 minor DKK, VAT-inclusive, with actual expiration retained. The amount is observed sandbox output, not a production tariff or customer price.

## Reproduction

Run internally from repository root:

```sh
WOLT_SANDBOX_QA=quote-only WOLT_SANDBOX_CREDENTIAL_FILE=/absolute/private/sandbox.json node tests/integration/wolt-drive-sandbox.cjs
```

The separately supplied file must be mode 0600, with `environment: sandbox`, `merchantKey` and `venueId`. Never commit it. The runner uses the documented fixed development host and actual adapter. It sends only two shipment-promise requests for the configured Copenhagen test venue and nearby test address. It does not create deliveries, send recipient contact details or change webhooks. Output contains only scenario, cost and timestamp. Failure does not dump credentials or raw responses.

## Controlled ASAP creation and immediate cancellation, 2026-10-26

The PO supplied approved test recipient details privately. Using the reviewed actual `requestWoltQuote`, `createWoltDelivery` and `cancelWoltDelivery` modules, a separate private runner executed exactly three requests against the fixed development host. The quote-only runner above was not used for booking and remains quote-only.

| Operation | Time UTC | Native evidence | Adapter result |
|---|---|---|---|
| Fresh quote | 05:59:01 | HTTP 201; binding quote, 8625 minor DKK | available; VAT-inclusive |
| One creation | 05:59:08 | HTTP 201; `INFO_RECEIVED`; delivery ID and native order reference both present | accepted |
| Immediate cancellation | 05:59:14 | HTTP 200; `REJECTED` | cancelled; fee remains unknown/null |

Request IDs in operation order: `4d42397d-c9aa-4e33-b09b-eaf28cfe0b35`, `8abb59ad-196e-45ce-825d-c3a2a052cb53`, `142daec8-f6e8-4601-8680-b58e61cf3f77`. Test-attempt fingerprint: `536ef027e10bdd9e42c6c429`. Pickup/dropoff ETA and HTTPS tracking were present; their private values are omitted.

Source pins: quote/HTTP/timing PR #700 head `981a0164a77a43eb79a5dec4e686f3b4ae36fcee`; creation/cancellation PR #702 head `c416dfb05c15512564bd5f39d33cbad919e1c452`, both with current-head independent review PASS before the run. Execution used their identical files in the isolated combined QA worktree. No implementation change was needed for these actual responses.

Before the create call, the private journal persisted one stable attempt reference, request digest and submitting state. It refuses rerunning an existing attempt. It saved raw provider responses privately before mapping; no blind create retry occurred. Cancellation addressed only the identified test delivery. No SMS or handshake option was sent. Recipient details, credentials, tracking links, native delivery IDs and raw payloads are excluded from this report. The private runner and journal remain available to the coordinator and independent reviewer, outside the repository, mode 0600. This proves a controlled sandbox API creation/cancellation sequence, not shared Orderfly datastore/checkout integration or webhook processing.

## Remaining acceptance

- The approved-contact blocker is resolved for the controlled ASAP test above. A scheduled quote passed earlier, but a scheduled delivery creation/cancellation has not been run. No inference from Marketplace test behavior is used.
- No webhook subscription exists. Genuine callback receipt requires a reachable scoped HTTPS handler, durable shared inbox and configured signing secret. Do not register a placeholder or unverified callback.
- Full adapter fixture suite, shared checkout/payment/browser acceptance, deployment SHA verification and physical courier/device acceptance are separate records.

No production API, paid courier, SMS/handshake option, secret provisioning or GitHub Actions was used. Approved test contact data was sent only as required for the isolated sandbox creation.
