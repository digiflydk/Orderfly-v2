# Delivery pricing (657.13–657.15)

Pure module: `src/lib/delivery/pricing/calculate.ts`. No database writes, live routing or checkout behavior changes. Integration must provide authenticated, server-calculated after-discount item subtotal, validated provider quote and route provenance. Fees for bags/admin/delivery are excluded from the minimum. Existing legacy decimal-DKK fields require deliberate conversion at integration boundaries.

All amounts are nonnegative safe integer minor units. Currency and tax basis must match exactly; no inferred VAT conversion. Distances are integer route meters, not straight-line distance. The module checks provenance shape; a trusted route adapter must establish its truth, freshness and address binding.

Bands are contiguous from zero, `[fromMeters,toMeters)`, except the final band includes `maxDistanceMeters`. The last upper bound equals that maximum. A boundary belongs to the next band; gaps, overlaps and unsorted bands reject. Kilometer pricing is base plus prorated extra meters, rounded half-up once using integer arithmetic. Overflow rejects.

Order: validate input/rules/route and money basis; reject outside area; enforce maximum of global and band minimum; calculate tariff; apply eligible free delivery; otherwise raise customer fee to the provider-cost-minus-subsidy floor; reject any customer-cap or subsidy-cap conflict. Free delivery is either actually free or unavailable: never quietly replaced with a paid fee. Existing promotions must be mapped by an authorized integration and must not bypass these caps.

Successful results deep-copy rules, route and amounts into an order snapshot. Persist that snapshot immutably in orchestration. Local estimated cost is separate from actual provider quote; actual billed cost remains null until reconciliation. This pure function does not authenticate tenants, confirm provider availability, reserve a quote, or claim to provide a route service.

Validation: `node --test tests/unit/delivery-pricing.cjs`, `npm run typecheck`. Boundary, rounding, after-discount minimum, free/cap combinations, overflow, invalid provenance, currency/tax mismatch and snapshot isolation are covered. No Actions, real courier or production effects.

## Routing and coverage boundary

`routing/service.ts` accepts postal addresses only, projects their fields, resolves both through an injected server-owned adapter and validates returned coordinates/distance/duration. It never uses client coordinates. Missing adapter, ambiguous address, no route and provider errors are explicit failures; no 0 km fallback. The adapter is an interface, not a claim that a live routing service is configured. No paid service is added. A live adapter must impose provider request deadlines and bounded server caching keyed to both verified address identities and routing profile; this generic interface introduces no cross-request cache.

`coverage/check.ts` composes the server-owned result of `deliveryScheduleAt` with effective settings, route age/provenance, area eligibility and provider availability. Maximum route meters and duration are inclusive. Future/stale route observations reject. Orchestration must bind route address references to its quote and derive the area/provider/schedule decisions on the server; they are not client permissions. Current area predicate is supplied by orchestration, so this unit does not claim polygon storage or map editing exists.

The settings schedule API is structural: `{open,reason}` with `open|disabled|paused|closed`. Effective settings supply `maxDistanceMeters` and `maxTransportMinutes`. Unit fixtures cover exact maxima, each denial layer, bad schedule decisions, future/stale routes, address projection, unconfigured/ambiguous/error/no-route cases. Run `node --test tests/unit/delivery-routing-coverage.cjs` alongside pricing tests.
