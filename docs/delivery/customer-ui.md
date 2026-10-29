# Managed delivery customer UI

The quote panel and tracking component are explicitly enabled by their parent. Disabled components render nothing; the server-provided managed-flow flag selects the managed checkout while pickup and legacy delivery retain their existing flow.

`useManagedDeliveryQuote` receives the actual quote action as an injected function, a complete request-identity string and current input. It creates a stable random 32-byte draft capability key in memory, suppresses duplicate requests, invalidates the current quote on address/cart/time/scope changes, and rejects late responses for older input generations. No private provider quote or economics are displayed. Opaque quote tokens remain in memory and are not placed in URLs, logs or browser storage.

The delivery price is requested automatically after a 700 ms pause once the required address/contact and checkout inputs are valid and checkout is not locked. Requests are serialized; edits during a request queue the latest identity and stale responses are discarded. The panel displays the server delivery fee, full total and available estimated delivery interval. It has no separate calculate-price button, delivery-price acceptance checkbox or switch-to-pickup button. The customer accepts the displayed valid total through the normal payment action, alongside the existing purchase terms.

Changing quote-bound inputs immediately makes the previous quote unusable. While a replacement is pending, the delivery fee and total are pending rather than zero, and payment remains unavailable. A changed price must be displayed before the customer can submit again; quote retrieval never submits payment automatically. Quotes with 60 seconds or less remaining, expired quotes, unavailable prices and mismatched quotes block payment. Failure or insufficient remaining lifetime exposes “Prøv igen” for a deliberate retry; there is no automatic retry loop. Errors preserve the customer's form and basket and explain the next action in Danish.

The final payment request still carries the exact displayed quote tuple and in-memory draft capability. The server revalidates the token, expiry, scope, cart fingerprint, revision, currency and total before consuming the quote. Removing a separate checkbox does not remove these checks or authorize payment from a background price refresh.

Tracking requires a matching order identity from an ownership-authorized server projection. Unknown booking is never presented as confirmed delivery even when payment is paid. HTTPS tracking links reject userinfo and unsafe schemes. Refresh is injected; no unauthenticated order endpoint is invented.

Internal browser acceptance for this UX must cover automatic pricing after valid input, no request for incomplete input, immediate invalidation on edits, stale-response rejection, expiry, visible updated totals before submission, stable capability, preserved form/cart and the absence of extra quote controls. Tracking retains foreign-identity and unsafe-link rejection coverage. Component fixtures do not prove live provider or payment behavior.

## Checkout integration

`CheckoutClient.managedDeliveryEnabled` defaults false and is supplied only by the server page. Managed delivery uses `requestManagedDeliveryQuoteAction`, invalidates quotes for contact/address/cart/time/discount changes, displays authoritative quote fee/total in both summary layouts and the payment button, and appends the exact accepted proof plus in-memory draft key as the final checkout argument. Pending quote prices are shown as pending, never as zero. Legacy pickup sends the original eleven arguments. Quote retrieval requires contact/address fields but does not require purchase terms acceptance; final checkout still does.

Earlier Chromium runs covered the previous explicit quote controls and are historical evidence, not acceptance of the automatic-pricing UX. Current-head regression must verify the actual CheckoutClient, exact proof/fee submission and unavailable-price payment blocking. Existing live sandbox milestones are recorded in `native-browser-qa.md`; this UI change does not establish full courier lifecycle or production activation acceptance.

## Existing secure surfaces

Guest confirmation, authenticated Club history and Merchant order detail consume the existing authorized projections' `managedDeliveryTracking` field. No new public order lookup is introduced. Customer refresh reloads the current receipt/portal page through its existing authorization; Merchant refresh delegates to the existing scoped board refresh. Missing update timestamps remain “ikke oplyst”. History uses unique accessible heading IDs per order. Managed Ready orders expose kitchen readiness but no manual “Markér leveret” action; the server independently enforces this boundary.

Paid guest confirmation with an unknown booking now explicitly says delivery is not confirmed. Internal actual-component tests cover that state, null timestamp, two history entries, managed Merchant readiness and retained legacy paid-pickup progression/tablet layout. These fixtures do not establish live courier acceptance.
