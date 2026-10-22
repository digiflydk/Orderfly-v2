# Atomic staff pickup settlement (#350)

The existing exported `settlePaidPickupOrder(orderId, cash|card)` remains the sole
staff financial writer. With `ORDERFLY_PRINT_INTENTS_ENABLED=true` and an eligible
native target policy, it composes the existing #337 opaque staff origin,
current transaction grants, native catalog, saved routing and a strict check of
already accepted canonical originals inside its own native financial transaction. No PSP
request or client-supplied actor, amount, grant or order projection is introduced.

Each SDK attempt creates a fresh context, checks the current server actor against
the financial actor, rereads `orders:edit`, and prepares the opaque native pickup
transition. Only the private financial plan mints a process-local pickup settlement
capability. Its fixed outbox adapter checks current proof lifetime, context,
reserved financial writes and financial apply state. Origins, serialized objects
and arbitrary projections cannot authorize this adapter. All reads complete before
any financial, manifest, job or ledger mutation. The exact shared 500-write budget
includes all financial writes, the optional manifest and all printers together.
A failure at any point rolls back invoice, collection, audit, reservations,
customer statistics, confirmation and printing together.

## Missing history safety boundary (#492)

This is a bounded safety correction to the first #350 candidate, not completion
of the full staff-printing feature. A collection happens after unpaid acceptance.
When print intents and the native policy are ON, a missing canonical original
manifest now rejects with `job_conflict` before any financial or print write.
This includes apparently fresh/no-history orders: the current legacy order
record provides no immutable proof that originals were never produced. Current
targets or a scan of existing printer documents cannot prove history absence,
because older originals can exist under another or an orphan printer path.
No timestamp cutoff, `held` state, caller marker or configured model is authority.

Revision-0 job identities deduplicate repeated/concurrent collection. Existing
canonical accepted-unpaid originals with the same immutable manifest require every
original job and printer revision to match; financial collection then changes no
manifest, job or queue ledger. Conflicting manifests or missing originals reject
rather than repairing print history. Persisted jobs without a manifest are
rejected even when they happen to match all current targets; the collection
cannot adopt them into invented immutable history. The same check repeats after
every SDK retry. A separate trusted unpaid-acceptance producer must create its
canonical manifest, jobs and queue ledgers in the same acceptance transaction.
The separate #506 producer and real checkout integration are now included as a
dependency from PR #513. The common outbox retains three fixed authority readers:
Stripe settlement, unpaid acceptance and staff settlement. Acceptance creates
originals only for a fresh native event; staff collection reuses their immutable
history and can never adopt or backfill missing history.

The process flag defaults OFF. OFF installations preserve the existing financial
path without printer reads/writes. Native policy OFF also suppresses print writes.
Terminal Paid repairs retain the prior financial notification behavior without
backfilling originals. A legacy nonterminal Paid order without a manifest cannot
acquire print jobs by turning the feature ON later. Ordinary OFF payment behavior
is unchanged; this safety slice does not activate any flag or change production.

The combined source test now starts from a held Pending order, calls the actual
#491/#506 acceptance writer and original producer, then collects cash/card using
the real staff writer. It verifies one canonical job set, unchanged ledgers and
duplicate collection safety. This resolves the former missing-source dependency,
but #350 and #343 remain open for current-head release, native integration and
applicable final QA. Source fixtures are not production or physical acceptance.

## Validation and acceptance

Run `npm run typecheck` and the actual-callsite suite:

```
node --test tests/unit/printing-pickup-settlement-integration.cjs tests/unit/printing-stripe-settlement-integration.cjs tests/unit/printing-pickup-transition-proof.cjs tests/unit/settlement-preparation.cjs tests/unit/merchant-payment-methods.cjs
node --test tests/unit/printing-outbox.cjs tests/unit/printing-outbox-batch.cjs tests/unit/printing-routing.cjs tests/unit/access-authority.cjs
node --test tests/unit/merchant-payment-browser.cjs
```

The dedicated tests execute the real exported staff writer, existing financial
plan, native authorization, policy/catalog/saved-routing and outbox. Session,
Admin storage and provider I/O are isolated. The 500/501 boundary alone injects
capacity reservation metadata around the actual capacity callback, matching the
existing financial boundary test. Retry cases reuse the SDK transaction object
and check that pending mutations are discarded. Successful ON tests invoke the
actual native acceptance and original producer in isolated storage, rather than
seeding an invented manifest. Missing/legacy/orphan histories must
reject instead. The prior fresh-mint success and late new-queue-write scenarios
are no longer advertised as valid staff behavior under this safety contract;
unchanged Stripe/outbox suites still cover fresh combined financial/queue
atomicity, while staff tests cover canonical history reuse and late financial
rollback. Existing ordinary merchant payment tests remain unchanged. This is software transaction
coverage, not evidence of physical printing or live payment acceptance.

Root #309 controls CI registration, current-commit independent review and serial
release. Claude's authenticated QA remains necessary. Existing QA0 prohibits the
print-intents ON flag; an explicitly reviewed dedicated ON variant is required
before claiming native emulator integration acceptance. No production flag,
credential, payment, data, configuration, output or Wolt change is part of this
slice. The original issue remains open until all acceptance evidence is supplied.
