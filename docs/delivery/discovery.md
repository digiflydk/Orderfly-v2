# Levering discovery checkpoint

Inspected base: `dfae7f58260060cac2404a33eea6833bfa3d55f1`; branch `feature/657-architecture`. This is source evidence, not runtime validation.

## Verified source facts

- `AGENTS.md`: Firebase App Hosting project is `orderfly-v21-10334086-b3076`; data project is `orderfly-39325`. They must remain separate. Actual deployed configuration/SHA and branch protection have not been independently verified by this checkpoint.
- User instruction in #657 supersedes historical Actions wording: tests and deployment internal; do not bypass repository protection. Coordinator owns release.
- `src/app/checkout/actions.ts`: existing delivery/pickup pricing; location `minOrder` checks catalog subtotal before promotions, while requested new behavior requires item subtotal after discounts. `location.deliveryFee` supplies a fixed fee; standard free_delivery discounts are already applied. New pricing must integrate these policies once, not stack duplicate engines.
- Same module creates hosted Stripe sessions with card payment mode, order-ID idempotency key, and no `capture_method` override. Existing completion/async success enters signed settlement. A reservation/capture flow is not an existing verified capability.
- `docs/stripe-lifecycle-189.md`: Pending orders excluded from paid revenue; signed paid completion settles idempotently; failed/expired sessions release promotion capacity and retain audit. Late expiration cannot downgrade paid orders.
- `src/lib/server/settle-checkout.ts` and `docs/printing-stripe-settlement.md`: sole financial settlement integrates atomic print intent logic. Delivery dispatch must not be called from a retried Firestore transaction or repeat financial/print effects.
- `src/lib/locations.server.ts`: existing locations collection is scoped by brandId. Reuse existing brand/location and authorization model; no parallel organization model.
- `docs/order-terminal.md` and `src/lib/orders/terminal-*`: existing terminal provides scoped reads, status progression, history, preorders and reprint. Delivery state must remain distinct from kitchen and payment status. Check latest main before modifying terminal because another workstream owns merchant app changes.
- Source search for geocoding, route matrices, haversine, Mapbox and Google routes found only a Google Maps display link in `src/components/layout/menu-header.tsx`. This does not establish a route API. No new paid service is authorized. Require a real route provider and credentials before route-based live quotes; test fixtures cannot masquerade as live route evidence.

## Wolt coordination

Latest inspected #657 comment `6404355386` links #672 and children #673–694. This expands .40–.43, not a competing project. #674 reviews shared contract; #677 consumes binding storage; #682 consumes durable intent; #686 consumes event inbox. Wolt currently reports planning only. Coordinator must publish contract commit and obtain review; do not claim cross-chat agreement without evidence.

Wolt replaces original 2–4 hours with 11–22 active agent-hours: aggregate preliminary scope is 30.5–61 active agent-hours (39 delivery tasks plus 22 Wolt tasks), excluding wait and avoiding double-counting joint QA/release. Calendar critical path must be recalculated by coordinator.

## Compatibility and blockers

| Existing surface | Required treatment |
|---|---|
| Legacy fixed fee/minimum | Keep old checkout unchanged while new module disabled; explicit adoption and versioned rules |
| Promotions/club discounts | One authoritative after-discount item subtotal and one free-delivery decision |
| Stripe settlement | Preserve paid accounting writer and idempotency; design durable compensation before live dispatch |
| Kitchen/print | No repeated original print from delivery events; reliable ETA separate from readiness |
| Customer order access | Reuse existing authorized access, never public sequential order ID alone |
| Location settings | Explicit inherited/local revision, conflicts and audit |
| Routing | No verified live provider; block live route quotes until configured |
| Wolt | Contract review and sandbox evidence pending; no real dispatch enabled |

No runtime environments, sandbox credentials, branch protection, actual production release, provider service, physical print or courier delivery have been validated in this checkpoint. These are separate acceptance tasks, not implied by source inspection. No migrations, production data changes, secrets, tests, implementation or deployment were performed by this documentation task.
