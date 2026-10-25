# Wolt sandbox acceptance evidence

Issue #690. This record covers quote connectivity only. It is not full lifecycle or production acceptance.

## Genuine provider evidence

On 2026-10-25, authenticated merchant webhook listing returned HTTP 200 and zero subscriptions. A direct shipment promise returned HTTP 201, binding=true, price 8625 minor DKK. Request IDs: `65414b43-d1bb-4a4b-9df4-7bd998c4b8f3` (list), `91782270-6f72-476b-b15e-a854db2098a1` (quote).

Running the actual quote adapter initially rejected valid HTTP 201 responses because native timestamps contain six fractional digits. The fix and native-shape regression are in PR #700, head `981a0164a77a43eb79a5dec4e686f3b4ae36fcee`. The actual `requestWoltQuote` and HTTP transport were then rerun successfully for ASAP and scheduled (+12 hours) quotes. Both returned available, 8625 minor DKK, VAT-inclusive, with actual expiration retained. The amount is observed sandbox output, not a production tariff or customer price.

## Reproduction

Run internally from repository root:

```sh
WOLT_SANDBOX_QA=quote-only WOLT_SANDBOX_CREDENTIAL_FILE=/absolute/private/sandbox.json node tests/integration/wolt-drive-sandbox.cjs
```

The separately supplied file must be mode 0600, with `environment: sandbox`, `merchantKey` and `venueId`. Never commit it. The runner uses the documented fixed development host and actual adapter. It sends only two shipment-promise requests for the configured Copenhagen test venue and nearby test address. It does not create deliveries, send recipient contact details or change webhooks. Output contains only scenario, cost and timestamp. Failure does not dump credentials or raw responses.

## Remaining acceptance

- Genuine create/cancel is pending a documented safe synthetic recipient contact and confirmation of Drive sandbox dispatch/contact behavior. No guessed real phone number is used. Public Marketplace test behavior is not treated as Drive evidence.
- No webhook subscription exists. Genuine callback receipt requires a reachable scoped HTTPS handler, durable shared inbox and configured signing secret. Do not register a placeholder or unverified callback.
- Full adapter fixture suite, shared checkout/payment/browser acceptance, deployment SHA verification and physical courier/device acceptance are separate records.

No production API, paid courier, real customer contact, secret provisioning or GitHub Actions was used.
