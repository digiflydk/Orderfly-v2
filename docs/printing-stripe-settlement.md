# Atomic routed Stripe print intent (#349)

`settlePaidCheckoutSession` now has an explicit default-OFF path that can commit
routed original print intents in the **same native transaction** as the existing
sole financial writer. It does not dispatch jobs, connect a printer or establish
physical readiness. Staff payment collection and initial unpaid pickup acceptance
are separate integrations (#350 and the remaining #303 checkout work).

## Gates and source authority

Unless `ORDERFLY_PRINT_INTENTS_ENABLED` is exactly `true`, the original financial
flow runs without print policy/catalog/queue reads or an extra Stripe request.
This intent gate is separate from configuration writes and physical output.
Nothing in this change enables any environment flag or production policy.

When enabled, a read-only native policy preflight avoids an extra provider request
for an absent/OFF location policy. An ON policy obtains the existing opaque #327
server-retrieved Stripe proof outside the write transaction. Each write callback
creates a fresh native context and rereads the current native target policy.
An OFF-to-ON policy change without a retrieved proof aborts, rather than inventing
payment evidence. An ON-to-OFF change proceeds through the original financial
flow without new print intents. Current transaction reads, not preflight state,
are authoritative. Expired, refunded, foreign or inconsistent payment fails closed.

The private financial preparation remains the only Paid/invoice/accounting writer.
After it has prepared its actual native order mutation and exact financial count,
it alone can mint a frozen capability in its private WeakMap. The capability binds
that callback context, verified Stripe transition, native order and write count.
No mint function, arbitrary nextOrder/loader/callback or transaction proxy is
exported. The fixed read/assert accessor cannot mint a handle. A valid provider
proof by itself, serialized objects or a fabricated context are insufficient.

The outbox's closed Stripe adapter lazily imports this fixed accessor, preserving
real module identity without an eager circular dependency. The existing public
persisted-order outbox helper retains its original eligibility checks. Its private
batch implementation admits a proposed Paid state only through the capability
minted by the actual writer. Financial apply marks the capability applied only
after **all actual financial mutations** have been queued successfully. Queue apply
synchronously requires that stage and rechecks the origin's irreversible lifetime.
Applied means writes staged in this same transaction, not a separate commit.

## Routing, manifest and replay

The callback obtains native product/category projection (#336), current saved
routing (#345) and explicit enabled printer/kind/revision policy (#335). It runs
the existing routing planner over those native preparations. Unresolved combos,
unrouted lines, missing routing, foreign references or included printers outside
the enabled policy reject the whole transition. Paused printers may accept intent;
this never grants dispatch. There is no fallback to every printer.

One combined batch is prepared for all targets/kinds. Every financial, policy,
proof, catalog, routing, manifest and canonical queue read finishes before either
plan applies. Original job identity stays revision 0, independent of webhook ID.
The queue reserves the exact private financial count **plus one manifest create**
for a fresh transition, then its job and per-printer ledger writes within the
shared 500-write application budget. The supported current Stripe maximum is 108
financial + 1 manifest + 32 jobs + 16 ledgers = 157 writes; the general combined
budget guard remains enforced and is separately exercised at 500/501 by the
existing financial/batch regressions.

`orders/{orderId}/printIntents/original` is created atomically only for the actual
Pending-to-Paid transition. Its strict bounded identity records native scope,
original revision 0, policy/routing revisions, catalog/rule hashes and the exact
printer IDs, configuration hashes/revisions, kinds and routed line IDs. It contains
no provider credentials or customer data and has no update/backfill API.

Paid replay requires an existing matching manifest and every existing original
job. Each stored job printer revision must match its corresponding immutable
manifest target and the current native printer configuration. It never creates a manifest for an older/default-OFF Paid order, expands a
previous order to newly configured printers, or recreates a deleted original job.
Changed rules, policy, catalog, configuration or target set fail closed. Manual
reprint and historical repair are not implied. A later transport must preserve
original job/history identity while evolving this currently queued-only schema.

## Scope of the result

This delivers **atomic routed intent**, not an immutable printable receipt.
The manifest binds route identities and a catalog digest, while queued job records
still have no immutable receipt/PNG payload. Before physical dispatch, transport
work must persist and verify the selected line content, payload/schema version,
printer format and original identity. Credentials, durable CloudPRNT endpoints,
claim/token/download/acknowledgment/retry and controlled activation/testprint are
still required. Simulator success is not a physical printer test.

## Validation and release

`printing-stripe-settlement-integration.cjs` loads the actual exported settlement,
origin, policy, native projection, saved routing, planner and outbox modules through
a cached TypeScript module graph. Existing `loadTs` is unchanged. Only external
Admin/session/provider/settings/analytics I/O is isolated. Tests cover successful
payment + manifest + multi-printer jobs/ledgers, concurrent/repeated events,
combined multiline routing, default-OFF paths, policy changes, provenance/native
rejection, canonical full queue, late multi-printer rollback, reused-SDK-object
retry, immutable replay/no backfill, valid-origin capability forgery and expiry
after financial apply causing rollback before queue output. Existing financial,
source, routing, outbox and bridge regressions remain unchanged and applicable.

Root alone serializes releases after the reviewed dependencies, current-main sync,
current-head CI and actual independent Codex review. Deployment and live QA are
separate gates. No unattended production data, rules, secrets, hardware or Wolt
changes are performed. Printer administration remains System / superadmin only;
configuration writes and physical output stay OFF. Authenticated live payment or
physical output is not proven by these fixtures.

## Canonical brand lifecycle correction (#363)

Print eligibility additionally follows the fresh native `Brand.status` through
`preparePrintIntentTargetPolicy`: only `active` or `trialing` may expose explicit
ON targets; pending, suspended, absent or unknown lifecycle is effective OFF after
all stored-policy and native-target validation. No saved policy is rewritten.
This leaves received-money financial settlement intact and does not change
superadmin draft administration. The existing global OFF path still performs
zero additional print reads/provider requests.

Actual exported-callsite regressions cover suspension before preflight (no print
proof retrieval), between preflight and the financial transaction, and during a
retry with the reused SDK transaction object. Financial effects commit once with
no manifest/jobs/ledgers. Reactivation after an OFF preflight cannot invent proof;
Paid replay preserves previously created originals, and no late Paid backfill is
permitted. The tests first failed on the old production module, then passed with
the policy correction. Configuration/intent/output remain OFF in production.


## Terminal Paid webhook replay

An already Paid order in Completed, Delivered, Error or Canceled uses the existing
status-agnostic financial replay path. It does not request a new print proof,
project production-state print transitions, load routing/catalog data or change
any manifest, job or queue ledger. Missing notification jobs retain the original
repair behavior, including no confirmation/marketing repair for Canceled orders.
Session identity, native payment scope, currency and amount checks still run.

The terminal decision is read again inside each settlement transaction attempt.
A terminal preflight cannot authorize printing if the order changes to a
production state before that attempt. Active production-state Paid replays keep
the existing strict immutable manifest/revision checks and no-backfill policy.
