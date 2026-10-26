# Managed delivery customer UI

The quote panel and tracking component are explicitly enabled by their parent. Disabled components render nothing; existing pickup/legacy checkout behavior remains unchanged until the coordinator wires the server-provided managed-flow flag and authoritative actions.

`useManagedDeliveryQuote` receives the actual quote action as an injected function, a complete request-identity string and current input. It creates a stable random 32-byte draft capability key in memory, suppresses duplicate requests, invalidates consent on address/cart/time/scope changes, and rejects late responses for older input generations. No private provider quote or economics are displayed. Opaque quote tokens remain in memory and are not placed in URLs, logs or browser storage.

The panel displays the server customer delivery fee, full total, estimated delivery interval and quote expiry. Every quote requires explicit customer consent; a higher fee is highlighted. Expiry revokes consent. Pickup fallback delegates to the existing cart selection and does not clear basket contents. The parent must append the capability key to the accepted quote tuple, recheck validity at submission and use the server total consistently in every checkout display. Client consent never replaces final server quote/payment validation.

Tracking requires a matching order identity from an ownership-authorized server projection. Unknown booking is never presented as confirmed delivery even when payment is paid. HTTPS tracking links reject userinfo and unsafe schemes. Refresh is injected; no unauthenticated order endpoint is invented.

Internal Chromium acceptance covers explicit consent, higher-price reconfirmation, expiry, address-race rejection, stable capability, pickup cart preservation, disabled rendering and foreign/unsafe tracking projection. These are component fixtures, not proof of a live courier or production checkout.

## Checkout integration

`CheckoutClient.managedDeliveryEnabled` defaults false and is supplied only by the server page. Managed delivery uses `requestManagedDeliveryQuoteAction`, invalidates quotes for contact/address/cart/time/discount changes, displays authoritative quote fee/total in both summary layouts and the payment button, and appends the exact accepted proof plus in-memory draft key as the final checkout argument. Pending quote prices are shown as pending, never as zero. Legacy pickup sends the original eleven arguments. Quote retrieval requires contact/address fields but does not require purchase terms acceptance; final checkout still does.

The full actual CheckoutClient browser harness passed 59 existing scenarios. Two added managed scenarios passed after correcting the delivery fixture's missing legacy delivery fee: exact proof/fee submission and unavailable-delivery fallback preserving pickup/cart. These are successful fixture flows only; the production server intentionally rejects managed quote/checkout until an approved route and provider path are enabled.

## Existing secure surfaces

Guest confirmation, authenticated Club history and Merchant order detail consume the existing authorized projections' `managedDeliveryTracking` field. No new public order lookup is introduced. Customer refresh reloads the current receipt/portal page through its existing authorization; Merchant refresh delegates to the existing scoped board refresh. Missing update timestamps remain “ikke oplyst”. History uses unique accessible heading IDs per order. Managed Ready orders expose kitchen readiness but no manual “Markér leveret” action; the server independently enforces this boundary.

Paid guest confirmation with an unknown booking now explicitly says delivery is not confirmed. Internal actual-component tests cover that state, null timestamp, two history entries, managed Merchant readiness and retained legacy paid-pickup progression/tablet layout. These fixtures do not establish live courier acceptance.
