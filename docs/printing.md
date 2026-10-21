# Orderfly printing

## Current delivery: domain foundations (#291)

`src/lib/printing/domain.ts` defines scoped printers, print jobs, stable job identity
and production eligibility. It does not create database records, expose endpoints,
change checkout, connect to a broker or print. No browser/iPad is needed by the
planned server-to-printer architecture. Physical QA belongs to the final pilot.

Initial printers are Star mC-Print2 and mC-Print3. HTTP CloudPRNT is the compatibility
path. MQTT requires checking the exact mC-Print3 variant and firmware against
[Star's compatibility table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html).
Do not infer MQTT support from the mC-Print3 family name or overwrite Wolt settings.

## Trigger integration points (not wired yet)

- `src/app/api/stripe/webhook/route.ts` verifies Stripe's signature and calls
  `settlePaidCheckoutSession` in `src/lib/server/settle-checkout.ts`.
- Settlement atomically transitions payment to `Paid` and a `Pending` order to
  `Received`. It already writes `orderNotificationJobs` in the transaction.
- `src/app/checkout/actions.ts` accepts pay-at-pickup orders in a transaction only
  after the capacity reservation is `held`; it writes `Received`, `acceptedAt`
  and the `pickupReceived` notification job together.
- A future print outbox must be committed with those accepted transitions, with
  all transaction reads before writes. Do not rely on a browser success page.
- Later payment of a pickup order must reuse the original kitchen job identity.
  Receipt/payment events must not start another kitchen production.

Eligibility currently allows `Received`, `In Progress` and `Ready` orders only.
Stripe requires persisted `Paid`. Pay-at-pickup requires pickup fulfillment, no
PSP record and either an accepted unpaid `held` reservation or paid state.
Pending, canceled, error, completed and delivered orders fail closed. This is a
production gate, not authorization: callers must load authoritative server data,
authorize the actor and validate brand/location membership before invoking it.
Paused/disabled printers and mismatched brand/location fail closed.

Job keys hash a versioned JSON array of brand, location, order, printer, bon kind
and explicit revision. Original production uses revision 0. Keys do not depend on
payment provider events or payment state. The future transactional create/claim
must enforce uniqueness; the pure key function alone does not guarantee delivery
or exactly-once physical output. Unknown print outcomes must not be blindly retried.

## Following bounded deliveries

### Validated setup and capabilities (#293)

`src/lib/printing/configuration.ts` is server-only. It validates credential-free
configuration DTOs, not authentication or database ownership. Callers must first
authorize an actor, load an authoritative location, and project it to `{id, brandId}`.
`validatePrinterConfiguration` checks that the location, authorized scope and
submitted configuration all agree. Names accept Danish characters, trim outer
spaces and have an 80-character limit; controls and malformed identifiers are
rejected. Unknown fields (including credentials or claimed capabilities) are
rejected. Return only the fixed error code, never raw input/Zod errors to logs or
clients. Printer credentials require a separate private server store later.

Transport selection is a request, not proof of device compatibility or readiness.
Both models can be prepared without a printer. `printerTransportCapability` stays
pending until separately trusted, scoped device evidence is supplied by a server
verification workflow. Never pass evidence from the configuration request. HTTP
needs firmware >=1.2; MQTT is disallowed for mC-Print2 and requires mC-Print3 variant
MCP31CBI or MCP31CI with firmware >=5.1. Unknown variant remains pending; other
verified variants are unsupported. Evidence is bound to printer ID, brand,
location and model; device replacement/reconfiguration must invalidate evidence.
Verified means transport compatibility only, not a connection, successful print,
Wolt coexistence or physical pilot. Future dispatch must also check operational
state, capability verification and the production feature flag; eligibility alone
does not authorize dispatch.

Paper widths are 58 mm for mC-Print2 and 58/80 mm for mC-Print3. Using 58 mm on
mC-Print3 requires the physical guide and device print-width setting.
Sources checked 2026-10-21:
- [Star CloudPRNT supported printers and firmware](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html)
- [mC-Print2 paper specifications](https://www.star-m.jp/products/s_print/mcprint2/manual/en/basicOperations/installingPaper.htm)
- [mC-Print3 paper guide and width setting](https://www.star-m.jp/products/s_print/mcprint3/manual/en/installing/installingAccessories.htm)

Lifecycle policy is defined without persistence in this delivery:

| State | Accept new jobs | Dispatch | Setup visibility | History |
| --- | --- | --- | --- | --- |
| Active | Yes | Subject to dispatch gates | Visible | Retained |
| Paused | Hold in queue | No | Visible | Retained |
| Disabled | No | No | Visible | Retained |
| Soft-deleted | No | No | Hidden | Retained |

Resume requires queue-age review before releasing held jobs. The earlier kitchen
eligibility helper deliberately rejects paused printers; future outbox integration
must distinguish order production eligibility/held-job creation from permission
to dispatch. Neither helper currently enqueues or sends anything. Soft-delete is
a lifecycle policy, not a new configurable device state or physical deletion.
Job history/audit references must survive future deletion; queued jobs must be
reviewed/canceled/rerouted explicitly, not silently purged or replayed.

No API, database write, UI or printer connection is introduced in #293. Unit tests
are not live API or hardware evidence. Follow-up persistence/API reads and writes
must each have their own <=60-minute task, server authorization, tenant boundaries,
tests and release/QA evidence.

Each work item has at most 60 minutes of active work, its own issue/PR, explicit
acceptance criteria and handover. Split before expanding scope.

1. Validated printer configuration and authenticated scoped persistence/API.
2. Transactional print-intent outbox and tests for payment/pickup idempotency.
3. Printer management UI with overview, add/edit/pause/deactivate and test preview.
4. Category/product routing and per-station bon data/preview.
5. CloudPRNT HTTP adapter and protocol simulator.
6. MQTT adapter, status and reconnection (compatible hardware only).
7. Deployment and feature-specific live QA for each exposed capability.
8. Physical pilot with both printers, Wolt coexistence and failure recovery.

Actual production printing remains disabled until the pilot. Code/UI deployment
does not depend on physical printer availability.

## Verification and release

Run `node --test tests/unit/printing-domain.cjs tests/unit/printing-configuration.cjs`
and `npm run typecheck`.
There is no changed browser flow in this delivery.
Follow `AGENTS.md` for current-head CI, independent Codex review, merge and release
verification. PO/PM has authorized qualifying merge/deploy without another prompt.
After deployment verify `/api/health` release and run issue-specific live QA for
exposed features. For these unconnected internal foundations, record that there
is no live domain endpoint yet; local tests are not live end-to-end evidence.
Do not mark final print acceptance as passed until actual printer output is proven.
