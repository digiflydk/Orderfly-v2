# Levering provider contract v1

Coordination: #657. Wolt implementation: #672, contract review #674.
Status: proposed normative v1; Wolt conformance review and actual sandbox evidence remain required. This document defines the shared boundary, not a claim that any API/provider has been implemented. Breaking changes require a new major version and coordinated consumers.

## Ownership and isolation

The delivery coordinator owns all shared persistence, schemas, checkout, customer pricing and migrations. Wolt owns its adapter, server-only credentials, native venue mapping, verified webhook decoding and native status translation. All administration lives under **Levering**. Adapters never write financial, kitchen or print states directly.

Every call contains a server-validated scope `(brandId, locationId)` and an opaque internal reference. Resolve provider account/venue from scoped server storage, never caller-selected credentials. Verify location belongs to brand before private data or provider access. No credential, full webhook body or customer address goes to generic application logs.

## Common values

- `version`: literal `1`; unknown versions rejected.
- IDs: nonempty bounded opaque strings; never interpreted as storage paths. Limits and validation are enforced by implementation schema, including nested arrays and notes.
- Time: UTC ISO-8601 instant with explicit timezone; local opening-hours evaluation uses location timezone. Preserve missing provider times as null, never invented values.
- Money: nonnegative safe integer minor units, ISO currency, explicit `taxBasis` (`inclusive`, `exclusive`, `unknown`), nullable known tax amount/rate. Unknown tax basis cannot be used for margin/subsidy comparisons. Never infer VAT from a country's default.
- Distance: nonnegative integer meters, method (`route` or `straight_line`), source, route profile, calculation instant. Only route distance is eligible for kilometer customer pricing.
- Coordinates: finite latitude [-90,90], longitude [-180,180], verified source. Address includes country, postcode, city, street, building and optional unit; customer instructions are a separate bounded field.
- Time interval: `earliest <= latest`; a provider point estimate is represented with equal endpoints and labeled estimate.
- Provider error: stable shared code, safe display message/key, retry class (`never`, `read_only`, `after_reconciliation`), optional safe native code. HTTP 5xx/timeout is not proof that a write failed.

## Capabilities

Each adapter reports supported operation modes explicitly: quote; create; read-by-provider-ID; lookup-by-internal-reference; provider-enforced create idempotency; cancellation; cancellation-price preview; scheduled deliveries; ready-for-pickup signal; tracking links; webhook authentication; sequence numbers. `false` means unsupported, not a no-op success. Quote and create are mandatory for an active delivery provider; reconciliation requires a documented supported strategy before production enablement. Lack of lookup/idempotency requires manual reconciliation of unknown creates, not blind retry.

## Quote request and result

Request: scope, checkout reference, requested provider, pickup and dropoff address/coordinates, pickup contact and delivery contact as needed, preparation-ready instant, ASAP or scheduled desired delivery interval, bounded items/bag counts and applicable delivery requirements. Include item dimensions/value only when actually known/required; do not invent them.

Result is discriminated:

- `available`: provider and quote reference, authoritative provider cost/currency/tax and known surcharges, nullable expiry, pickup/delivery estimate intervals, nullable provider distance/provenance, capability snapshot and native quote reference kept server-side.
- `unavailable`: stable reason (outside area, closed, unsupported schedule/requirements, capacity, invalid address).
- `error`: authenticated/configuration/service failure; distinguish operational failure from confirmed lack of coverage.

The shared quote service independently checks restaurant availability/area, derives customer price and stores immutable rule version, distance and economic components. The provider quote must not become the customer fee by accident. A missing expiry is not indefinite validity: use an explicit local bounded freshness policy and revalidation. Fingerprint scope, normalized address, cart economics, timing and configuration revision. A quote from a different fingerprint cannot be reused. A new higher customer fee requires renewed customer acceptance before charging.

## Create, reconcile and cancellation

Create request: validated quote binding, authoritative order reference, stable attempt reference/idempotency key, scope and ready/delivery windows. The coordinator persists the intent and immutable request digest BEFORE any network call. Provider calls occur outside datastore transactions. Retrying a transaction must never invoke create.

Create result:

- `accepted`: provider delivery ID, native reference, nullable HTTPS tracking URL, confirmed estimate intervals and authoritative cost if changed.
- `rejected`: definitive non-creation with safe reason, only when provider evidence supports that conclusion.
- `unknown`: timeout/transport loss/ambiguous native response, attempt reference and reconciliation instructions. Persist unknown; do not create a second intent/key.

A scoped read/reconcile accepts provider delivery ID or the same internal attempt reference and returns `found`, `confirmed_absent`, `unknown`, or `unsupported`. `confirmed_absent` requires authoritative evidence, not a single eventually consistent empty search. Only coordinator policy can permit another create following sufficient absence evidence. Same idempotency key always binds same payload digest; changed payload requires deliberate new business attempt after previous outcome is resolved.

Cancel request binds scope/provider delivery ID and operator intent. If known fees require acceptance, bind quoted fee and quote revision. Return `cancelled`, `not_cancellable`, `unknown`, or `unsupported`, with nullable confirmed fee. A request sent or HTTP 202 is not confirmation of cancellation. Unknown cancellation blocks compensation decisions requiring confirmed cancellation. Reconcile before retrying a mutating call.

## Durable shared storage interfaces

Physical collection names are coordinator-owned implementation details. Wolt receives narrow server interfaces, not arbitrary DB handles:

1. `resolveBinding(scope, provider)` returns active revision, native merchant/venue references and secret reference usable only server-side. Do not return secret values to browser DTOs.
2. `claimAttempt(scope, orderRef, quoteRef, requestDigest)` atomically establishes a unique intent and returns existing state on replay. Scope/quote/order are reread authoritatively. Stale/conflicting request digests fail.
3. `recordAttemptResult(attemptRef, expectedRevision, result)` compares revision, preserves original intent and provider identity, and accepts idempotent same-result replay. It must not overwrite accepted with unknown or terminal state with stale active state.
4. `appendVerifiedEvent(scope, provider, event)` creates a unique inbox identity and applies permitted state change in one transaction. Raw verified provider delivery identity must resolve to the same scoped binding/attempt before mutation.
5. `getReconciliationWork(cursor, limit)` is bounded and permission-checked; lease claims prevent simultaneous workers from dispatching the same operation. Expired lease permits reconciliation, not speculative redispatch.

Record attempt state separately from fulfillment state. Financial state, kitchen state, provider delivery state and compensation state remain separate. Actual billed cost is an append/audit source with provenance, not an overwrite of original quote history. Retention and authorized support access must be defined before activation.

## Verified events and status mapping

Adapters verify authenticity BEFORE returning an event. Event includes provider, unique native event ID if present, dedupe identity, provider delivery ID, scope resolved server-side, event occurrence and reception timestamps, optional sequence/version, normalized status, original native status, updated intervals and safe native error code. If no native ID exists, define/document a deterministic dedupe key from verified immutable fields; do not assume timestamps alone unique.

Normalized fulfillment states: `booked`, `courier_assigned`, `courier_to_pickup`, `picked_up`, `delivered`, `cancelled`, `failed`. Native intermediate statuses may map to current state without inventing progress. Missing native equivalents remain unsupported. Reassignments and exception recovery require explicit transition policy; do not assume a simple numeric rank handles all events.

Duplicate inbox events have no repeated side effects. Out-of-order events are retained for audit but cannot regress materialized state. Where sequence ordering is unavailable or conflicting terminal events occur, reconcile authoritative provider state. Delivered cannot become cancelled from a stale event. Native failures do not automatically refund or cancel financial state. Updated ETA events may update estimates without changing fulfillment status. Events must not enqueue original print jobs again.

## Payment and operational integration

Existing checkout uses Stripe hosted payment sessions with card mode, order-ID idempotency, and no explicit manual capture. Do not silently convert the existing settlement path into reservation/capture. The coordinator must record and test a concrete payment/dispatch/compensation decision before activating new delivery. Until then preserve legacy checkout and keep new dispatch OFF.

For any adopted sequence: no provider-confirmed-delivery display before create accepted; charge and booking failures have durable compensation records; unknown create must be reconciled before cancellation/refund logic assumes absence; payment webhook replay cannot create another courier. A paid order can remain delivery-pending or delivery-failed and must clearly show the next action. Kitchen ready and courier pickup are distinct events.

## Required conformance evidence

Per adapter: valid/invalid scope, unavailable quote, expiry, changed quote price, unsupported capabilities, create success/rejection/lost response, duplicate create, same-key changed payload, lookup uncertainty, cancel fee/race/unknown, authentication failure, duplicate/out-of-order/conflicting events, native status retention, no secrets in public DTO/logs. Test-provider evidence, actual sandbox results and production courier acceptance are separate records. Wolt #674 must review this version and identify unsupported fields/capabilities before Wolt implementation consumes it.
