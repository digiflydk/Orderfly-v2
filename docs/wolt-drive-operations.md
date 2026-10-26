# Wolt Drive operations and acceptance

Owner: Wolt operations/QA, issues #687–#691; parent #672; release coordinator #657.
All administration is under Levering. These utilities are server-only integration seams, not a mounted UI, active subscription or proof of a working production delivery.

## Health and configuration

`getWoltConnectionHealth` authorizes the brand/location before reading server-owned evidence. Evidence for another scope fails closed. The output is an explicit allowlist with no merchant key, webhook secret, callback URL or customer data. A check older than five minutes is stale. Configured means recent authentication/configuration evidence only; it never means live delivery acceptance. The binding owner must produce evidence from authorized storage and a genuine provider check, not from browser input.

`planWoltWebhookConfiguration` is a pure reconciliation plan, never a provider mutation. Fetch the merchant's existing subscriptions first. One merchant-level endpoint receives events for all its venues. Reuse the owned subscription; duplicate matches and unresolved existing merchant endpoints require operator review. Do not automatically delete or replace another endpoint. Explicitly review any mutation with the merchant-level owner. A new registration needs a server-held signing secret and reachable HTTPS callback. Creation and subscription updates are separate documented API operations; re-read after mutation before recording success.

Required events are declared in `WOLT_REQUIRED_EVENTS`. Optional customer-no-show/location events are not automatically enabled. Existing optional subscriptions are preserved; high-volume location events need explicit capacity planning. Initial retry proposal: exponent base 5, maximum three retries (documented request example), to be confirmed against callback capacity during sandbox QA. Retry delivery does not replace a durable inbox: acknowledge only after verified event acceptance is persisted. Never register a callback before the webhook handler and durable store are ready.

## Recovery

| Signal | Owner/action | Unsafe action to prevent |
|---|---|---|
| Authentication rejected | Operations verifies environment, scoped binding and server secret availability; pause new dispatch until verified | Replacing credentials in browser or logging headers |
| Signature rejected / repeated callback failure | Inspect merchant binding, signing-secret generation, bounded verifier and inbox persistence; use sanitized event fingerprints | Accepting unsigned payloads or acknowledging before persistence |
| Booking unknown | Keep the original intent/reference, reconcile verified events or documented lookup; escalate unresolved delivery to Wolt support | Blind rebooking or interpreting timeout as non-creation |
| Not delivered | Review verified failure reason and actual delivery with support; financial compensation remains coordinator-owned | Automatically refunding from an unverified raw event |
| Cancellation rejected/unknown | Preserve original delivery state and seek authoritative outcome; disclose unknown fees | Claiming cancellation or refund eligibility merely because request was sent |
| No optimized pickup ETA | Display waiting/preliminary state; require accepted `order.pickup_eta_updated` evidence | Treating 90 elapsed seconds as proof of reliable ETA |

`woltDiagnostic` emits only fixed codes and hashed opaque references; arbitrary provider errors, addresses, phone numbers, payloads and headers are excluded. The caller must authorize before supplying references. Alerts should be generated from persisted state transitions, deduplicated by intent/event, and routed through the existing operator workflow. This module does not send notifications itself.

Pickup ETA reliability consumes only verified, durably accepted, correctly ordered webhook state. The initial response is preliminary. The first pickup ETA update allows timing use, while subsequent updates remain estimates. UI/print owners must not repeat original print jobs when the ETA changes. This module supplies the reliability signal and does not schedule kitchen actions.

## Acceptance layers

1. Internal focused tests: permission denials, foreign scope, stale/future evidence, redaction, webhook drift/duplicates/ownership, reliable ETA only after verified update.
2. Internal integrated adapter suite (#689): real adapter code with controlled HTTP and isolated stores; success/rejection, malformed provider payloads, timeout, create replay/concurrency, stale/conflicting events, cancel races. Record exact tested SHA and commands. Fixtures are not sandbox evidence.
3. Genuine Wolt sandbox (#690): authenticated merchant/venue check, ASAP and scheduled quotes/bookings, callback receipt and cancellation where allowed. Capture sanitized response status, identifiers and timestamps. No secrets or recipient personal information. If callback/secret is unavailable, list precisely which event acceptance remains blocked.
4. Joint browser acceptance (#691, delivery owner): Levering health display and denials, checkout expiry/price changes, payment failure compensation, tracking, reliable merchant ETA, no duplicate print; mobile/iPad/desktop and keyboard/focus/Danish errors. Do not claim physical device testing from viewport emulation.
5. Release (#693–#694): delivery coordinator alone merges/deploys after independent current-head review and internal checks; record deployed SHA and live read-only QA. Paid courier/hardware pilot requires separate authorization and evidence.

## Primary references

- https://developer.wolt.com/docs/wolt-drive (ETA guidance and merchant-level webhooks)
- https://developer.wolt.com/docs/wolt-drive/webhooks (CRUD, subscriptions, HS256 and retry policy)
- https://developer.wolt.com/docs/wolt-drive/endpoints (development host and API operations)

No GitHub Actions, production writes, secret changes, automatic real webhook mutations or paid dispatch are performed by these utilities.
