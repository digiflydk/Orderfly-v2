# Wolt Drive contract review

Issue #674, coordinated by #657/#672. Reviewer: `/root/contract`.
Reviewed shared contract commit `98acf97ef6d7b70e61504e83fdb461562c4eb96c`, `docs/delivery/provider-contract-v1.md`, on 2026-10-26.

## Decision

The proposed provider-neutral boundary supports the initial venueful adapter. Integration acceptance requires the shared owner to make two additive clarifications:

1. Preserve provider dispatch time separately from nullable business occurrence time. A dispatch timestamp cannot silently become an occurrence timestamp.
2. Expose pickup estimate provenance/reliability. Creation estimates remain preliminary; kitchen/print timing requires a verified pickup-ETA update. A timer alone is insufficient evidence.

The existing unknown-result, durable intent, scoped binding, immutable economics and event-inbox boundaries are appropriate. This review approves adapter internals against these constraints, not the implementation, sandbox behavior or production launch.

## Provider mapping decisions

- Initial mode is venueful. Fee tax basis is inclusive, while actual tax amount/rate stays unknown unless supplied. Route distance and expiry remain nullable. Address geocoding is not validation.
- Scheduled delivery uses a point dropoff request within the documented 60-minute to seven-day window; do not silently accept an arbitrary interval. Preparation time remains relevant.
- Native create pickup estimates are preliminary. Reliability begins with verified `order.pickup_eta_updated` evidence.
- No generic order lookup or cancellation-fee preview is established by the endpoint list. Mark those capabilities unsupported. Stable merchant reference is correlation, not proof of provider-enforced idempotency. Unknown create remains unresolved until authenticated event/provider support evidence.
- Cancel uses `PATCH /order/{wolt_order_reference_id}/status/cancel`; successful `REJECTED` is cancellation in this context. Default cancellation stops after pickup starts; late cancellation requires an agreement, and fee remains unknown without evidence.
- Webhook signature is HS256 over the JWT envelope. `details.id` is the documented event ID; order reference identifies the delivery. `dispatched_at` identifies sending time. No native courier-assigned event is listed. Preserve raw event types; handle `order.not_delivered`, duplicate delivery/dropoff completion and unordered events. Subscription location and handshake events are optional capabilities.
- The generic retry guidance for server errors cannot authorize blind retries of courier creation; the shared unknown-result rule takes precedence in our integration.

## Documentation discrepancy

The overview says order edits are unavailable, whereas the June 2026 changelog introduces item/instruction updates. These are outside initial scope; do not invent endpoint shapes. The October addition of failed-delivery events must be supported. Unknown optional response fields must remain compatible.

## Sources

- https://developer.wolt.com/docs/wolt-drive
- https://developer.wolt.com/docs/wolt-drive/endpoints
- https://developer.wolt.com/docs/wolt-drive/webhooks
- https://developer.wolt.com/docs/wolt-drive/error-handling
- https://developer.wolt.com/docs/wolt-drive/changelog

## Remaining acceptance

Shared owner records the two additions and exact contract revision. Adapter conformance and sandbox tests verify actual behavior. Current-head independent implementation review, internal checks, deployed SHA, browser integration and any physical pilot remain distinct gates. No credentials appear in this document.

## TypeScript implementation follow-up

Read-only review of the shared coordinator's local `src/lib/delivery/provider-contract.ts` identified additional required corrections, recorded in #657 comment 6404446786:

- ETA-only events need nullable status or a discriminator; they must not fabricate fulfillment transitions.
- Cancellation requests need a bounded operator reason, currently absent.
- Binding resolution needs enforceable active/environment/scope guarantees before credential access.

The shared owner must publish the corrected TypeScript commit before adapters import it. No shared files were changed by this reviewer.
