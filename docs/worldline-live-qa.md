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

## Completed managed-delivery scenario

- Release: `44b791fb420b6a61ba068c574cdffa31fe2baa01`.
- Order: `ORD-241710`, DKK 201 (two Margheritas, bag and DKK 39 delivery).
- Synthetic TEST customer, dropoff Borgergade 12, 1300 København K.
- Selected offered opening-time slot 13 November 11:50 Copenhagen time.
- One checkout, one card-button submission, built-in Worldline Visa and test 3DS.
- Automatic return with no Back-to-shop click. Native receipt reached `Paid`,
  `Received`, booking `accepted`, delivery `booked`, with invoice
  `INV-2026-000059`. Reload preserved the order and invoice.
- Tracking opened on `daas-track.development.dev.woltapi.com`, confirming the Wolt
  development environment. This establishes booking and tracking, not physical
  delivery. The later dynamic receipt ETA was 12:26; on-time fulfillment of the
  selected 11:50 slot is not claimed.
- The first native payment-wait heading appeared 1,778 ms after navigation commit.
  This exposed the extra payment-status page subsequently rejected by the PM.

## Completed unpaid cancellation scenario

- Same `44b791f` release. Order `ORD-862702`, DKK 24, pickup.
- No card entered and no payment submitted.
- Closed the hosted window using its visible Afbryd control. Native cancellation
  finished with “Betalingen er annulleret” and the cart-preserved message.

## Direct confirmed-return follow-up

The proposed follow-up retains the existing authorization-only session and locked
server capture. Its server-only accept endpoint waits for native financial Paid
before redirecting to the actual receipt, with no HTML waiting page. The separate
confirmation loading page is removed. An unresolved order is never rendered as a
confirmed receipt. Local tests and independent review must complete before release;
actual provider verification of this new path is recorded separately below once
deployed and exercised.

Native admin refund/void, direct provider-ledger checks and physical printing are
not established by these browser scenarios. Sandbox booking is not proof of a
physical courier delivery. Protected receipt URLs, callback values, card/3DS
payloads and credentials remain outside Git and shareable evidence.
