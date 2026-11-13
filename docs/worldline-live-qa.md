# Worldline live sandbox QA

The PM explicitly authorized browser tests on the deployed platform and confirmed
that Orderfly is in test mode, including delivery tests at opening time.
Local mocked tests and deployed-provider evidence are separate.

## Completed pickup scenario

- Release: `c978d8e20d8f4ebd896a8d4dafc04b6209840153`.
- Date: 13 November 2026 UTC.
- Scope: Esmeralda Amager, existing Borgergade 10 sandbox configuration.
- Order: `ORD-717710`, DKK 24 (one water and bag), pickup 19 November at 11:30.
- Customer was clearly marked TEST with a reserved `.invalid` email; marketing
  and Club enrollment remained unchecked.
- Used Worldline's built-in Visa test card and its test 3D Secure simulator.
  The simulator displayed merchant `T516019301` and the original order reference.
- After test 3DS approval, browser navigation returned automatically from Worldline
  to the native confirmation route. No Back-to-shop button was clicked.
- Own-receipt `status_only=true` returned `Paid`, `Received`, `Worldline`, DKK 24.
  This endpoint reads native status without triggering reconciliation.
- Native confirmation showed invoice `INV-2026-000058`. Reloading preserved the
  same order and invoice and did not create another checkout.

The instrumented browser recorded one native checkout. There were two card-button
clicks: the first was rejected by Worldline's client-side expiry input validation.
Before continuing, resource timing showed zero payment-network requests and no
navigation after that click; the corrected field reported valid. The second click
entered the test 3DS flow. No uncertain payment was blindly retried.

The native Paid transition requires server-to-server transaction verification,
full capture and the shared authoritative settlement path. This is evidence of
the deployed checkout/receipt flow; the test agent did not independently access
the merchant portal's transaction ledger. The future pickup defers physical print
eligibility; actual printer output is not claimed.

Only sanitized navigation/status evidence and receipt screenshots are shareable.
API keys, callback hashes, 3DS payloads and receipt capabilities must never be
included in source, logs or PR evidence. The private receipt URL stays outside Git.

## Remaining scenarios

Managed delivery at opening time is being tested using the established sandbox
dropoff Borgergade 12, 1300 København K. Booking/tracking/compensation results must
be recorded before claiming delivery acceptance. Native admin refund/void, direct
provider-ledger checks and physical printing are not established by the pickup test.

## Confirmation loading follow-up

The first confirmation render now defers only Worldline provider reconciliation
and includes a visible waiting message. Capability/scope validation remains on the
server; default API reconciliation and durable recovery remain enabled. Actual
timing of this improvement must be observed after that follow-up is deployed.
