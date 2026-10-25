# Wolt Drive transport and quotes

Issues: #678, #679, #680. Provider-only building blocks; the shared delivery coordinator owns checkout, quote persistence and customer pricing. No route distance is inferred. `requestWoltQuote` receives the venue from server-resolved scope. The provider facade must never accept a browser-selected venue or credential.

The server-only transport restricts hosts to Wolt's published sandbox/production API hosts, forbids arbitrary URLs and redirects, bounds request/response sizes and timeout, and exposes no raw provider reasons or network exception strings. Errors distinguish authentication, configuration, unavailable service area, validation, throttling and provider failures. Only a known shipment-promise endpoint or GET can retry, at most twice by explicit configuration. A mutating timeout/5xx/duplicate order is unknown and requires reconciliation; it cannot trigger an automatic repeat booking. Upstream request correlation belongs to the persisted attempt/quote reference, never a customer address or secret.

Quote input includes street and separate house number, postcode, city, optional verified coordinates, preparation and known parcel details. Unknown dimensions/value are omitted. Response extras are tolerated; essential money, venue, coordinates, binding status and timestamps are validated. Currency is uppercase ISO shape; values use safe integer minor units. Native response location is retained privately for later create. Do not expose `native` to a browser or use it without scope/fingerprint revalidation.

Wolt documentation explicitly identifies prices as VAT-inclusive; rate and tax amount remain unknown. Quotes can include additional fees through supplied parcel details. Customer delivery pricing stays separate. Binding means usable for creation, not a guarantee of availability or ETA. Pickup ETA remains preliminary until the later verified pickup-ETA event.

Scheduled orders require an explicit offset instant between one hour and seven days away; preparation is retained. Convert local Copenhagen wall times in the owning schedule UI/service with explicit daylight-saving disambiguation. The adapter refuses timezone-free strings. Recheck scheduling bounds at create, since a previously valid scheduled quote can become too near. Missing provider expiry is null; `isWoltQuoteFresh` requires an explicit local maximum age (at most five minutes), and quote expiry/fingerprint checks remain mandatory in orchestration. Changed address, cart, time or configuration needs a new quote; changed customer price requires fresh customer acceptance.

Internal checks: `npm run typecheck` and `node --test tests/unit/wolt-quotes.cjs`. The suite uses controlled HTTP and synthetic data, not Wolt sandbox evidence. No GitHub Actions. Live sandbox lifecycle and integrated browser acceptance remain #690/#691. No production dispatch is enabled by these utilities.

Official references read 2026-10-26:
- https://developer.wolt.com/docs/wolt-drive/endpoints
- https://developer.wolt.com/docs/wolt-drive
- https://developer.wolt.com/docs/wolt-drive/error-handling
