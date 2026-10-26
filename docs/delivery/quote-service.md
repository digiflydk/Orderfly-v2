# Quote orchestration (657.16)

`quoteDelivery` in `src/lib/delivery/quotes/service.ts` composes effective settings, opening hours, resolved routing, area eligibility, provider availability, pricing and immutable quote binding. It is an internal service, not a public endpoint or production activation.

Callers must authenticate the tenant/location and read authoritative settings, cart and revisions. Inject only server-owned provider/routing adapters and area predicates. Fulfillment addresses have no coordinate input: both are geocoded by the route adapter, whose verified coordinates overwrite any extra input before the provider request. `quoteAddressBinding` gives a deterministic postal representation of both endpoints; mismatched scope, addresses or ready time reject before provider calls. Binding's fulfillment instant denotes ready/pickup time for schedule evaluation. The caller owns preparation and desired-delivery timing validation.

Closed/paused settings, missing routing, area/route limits, provider rejection, unknown tax basis and impossible subsidies reject explicitly. Existing pricing keeps the stricter result when settings and tariff distance limits differ. The provider adapter must report total payable `cost`; surcharge entries describe its breakdown and are never added twice. Provider distance does not override verified routing distance.

Route freshness is checked before and after the provider call. Quote expiry is the earlier of local bounded policy and provider expiry. The stored quote includes validated fulfillment, native quote, content digest and economic snapshot via the canonical `buildQuote`; acceptance uses its canonical fingerprint, expiry and exact fee checks. Changed addresses/cart/revisions/time invalidate acceptance. Caller must persist the quote server-side and reread current data before booking/payment; neither a browser quote nor this helper grants dispatch authority.

All exceptions are reduced to safe `quote_unavailable`; provider secret-bearing errors are not reflected. Dependencies need provider timeouts, scoped configuration and capability validation. Production dispatch remains OFF until these external integrations and acceptance are complete.

Internal tests: `node --test tests/unit/delivery-quote-service.cjs`. Covers successful composition, fee acceptance and invalidated cart, expiry, closed/paused, unconfigured routing, foreign scope/address, area denial, provider rejection/identity, unknown taxes, expired quotes, caps and staleness after provider latency. No real external requests or production data writes.
