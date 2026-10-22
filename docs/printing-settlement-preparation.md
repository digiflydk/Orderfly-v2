# Private financial settlement preparation (#346)

This bounded prerequisite belongs to #343 / #303. It refactors the existing sole
financial writer in `src/lib/server/settle-checkout.ts`; it does not enqueue print
jobs, consume print-origin proofs, add a print callsite or activate output.
Both exported callers remain unchanged: verified Stripe settlement and authorized
staff cash/card collection. Native invoice, customer, discount, voucher/game,
capacity, upsell, audit and notification/marketing semantics are retained.

`settleOrder` now builds a **private** preparation inside each native transaction
attempt. Preparation completes every read and captures the actual financial
mutation operations before returning an immutable plan with `writeCount`,
`fulfilled` and single-use `apply`. No preparation function or callback is exposed
as a caller-supplied extension point. The count is checked against the shared
500-write application limit before any mutation. Missing, nonpositive or malformed component reservations
also fail before writes; a missing capacity count cannot inherit the ordinary
single-write default. A later origin-specific print adapter can reserve this
exact count at the existing private transaction boundary and finish its own reads
before either plan applies; it must not introduce a second Paid writer.

`prepareAdminCapacitySettlement` remains callable for existing consumers. The
frozen callback additionally exposes its exact `writeCount`: one customer-capacity
write without a discount, or three customer/discount/pair writes with one.
Financial preparation counts those individual writes rather than treating the
capacity callback as one operation. All other internal writes count individually.

Paid replay prepares only the existing notification/marketing repairs, preserving
financial idempotence. It still has no native seller reads in this slice. Future
print-origin validation must add its own native reads before the private repair
plan applies. A retry reruns all preparation from current stored snapshots, even
when Firestore reuses the same Transaction object. Aborted attempts leave their
queued writes uncommitted and cannot reuse a plan.

## Verified count and atomicity

`tests/unit/settlement-preparation.cjs` executes both production settlement callers
and actual capacity/invoice/authorization code with session/Admin I/O isolated.
It checks:

- Exact simple write totals: five Stripe, six staff; Paid replay zero or one repair.
- Maximum current financial fanout: **108 Stripe / 109 staff** with 97 eligible
  upsells, three capacity writes, discount usage, voucher redemption, game
  conversion, customer, order, invoice counter, confirmation, marketing and staff
  audit where applicable. A 98th upsell remains untouched, preserving the existing
  bound. These totals are not a promise about future callsites.
- All reads precede writes; retry with a reused SDK object rereads changed invoice
  counter/customer values and commits accounting once.
- Failure on the last marketing write rolls back prior order/accounting/voucher
  and audit mutations.
- Fault-injected capacity reservation makes the private total exactly 500/501:
  500 is admitted, 501 and malformed reservations reject before the first write.
  This exercises the budget boundary without generating artificial production
  mutations. Separate tests verify actual capacity write counts.

Validation: `npm run typecheck` and the dedicated test plus existing
`payment-confirmation-job.cjs`, `merchant-payment-methods.cjs`,
`promotion-review.cjs`, `stripe-lifecycle-189.cjs` and `stale-discount-holds-210.cjs`.
No browser flow changes in this internal refactor; existing affected payment
browser regression remains applicable.

## Next bounded integration slices

1. After #337 and saved routing #342 are available, add a closed origin-specific
   combined queue preparation at this private boundary. Obtain opaque verified
   Stripe/staff origin and native catalog/targets/rules inside the fresh attempt;
   reject mismatched state, scope, refund, routing and unresolved combos. Keep
   original revision-0 identities, one combined per-printer ledger delta and the
   full financial-plus-queue 500-write reservation. Default-OFF settlement must
   not require an extra Stripe provider request.
2. Wire and test actual Stripe/staff callsites with rollback/replay/retry proofs;
   accepted unpaid pickup needs its own trusted acceptance origin and separate
   checkout transaction integration. Do not treat a projected Paid DTO as already
   persisted payment, or enqueue after commit.

Printer administration remains System / superadmin only. Configuration writes
and physical output remain default-OFF. Independent current-head Codex review,
CI, root-serialized merge/deploy and relevant deployed read-only QA are separate
gates. Fixtures do not prove live authenticated settlement or physical print.

The subsequent #349 [atomic Stripe integration](printing-stripe-settlement.md)
now uses this private boundary through an intrinsic financial-plan capability.
The bounded #346 scope above remains a description of its original refactor;
staff settlement and initial unpaid pickup acceptance are still separate work.
