# Native transaction context for legacy checkout callers

`src/lib/server/firestore-compat.ts` preserves its modular-style server API and
existing one-argument transaction callbacks. A server callback may now opt in to
a second argument: `context: NativeTransactionContext`, containing the captured
Admin `db` and the exact native `transaction` for that callback attempt.

```ts
await runTransaction(db, async (compat, context) => {
  const order = await compat.get(orderRef);
  const rows = await context.transaction.get(
    context.db.collection('exampleInternalJobs').limit(10),
  );
  // Complete ALL compatibility and native reads before staging any writes.
  context.transaction.create(context.db.collection('exampleInternalJobs').doc('example'), {
    // Synthetic illustration only; not an actual printer/order integration.
    count: rows.size,
  });
  compat.update(order.ref, { exampleState: 'prepared' });
});
```

The example is conceptual server code, not a production endpoint or authorization
pattern. Native context is infrastructure access only. It does **not** establish
actor permission, tenant ownership, payment status or a trusted order transition.
Every future consumer must enforce those requirements inside the appropriate
server boundary and transaction. #303's trusted adapter remains separately required.

The bridge captures `getAdminDb()` once before `runTransaction`. Both native context
and compatibility reference conversion use that same db throughout all attempts.
No secondary transaction, outside-transaction read, independent write or early
commit is introduced. Native query/document reads and create operations participate
in the same atomic attempt as compatibility set/update/delete. The SDK enforces
read-before-write order across both APIs; errors propagate to abort the attempt.
Existing reference conversion, `exists()` snapshots, query constraints and merge
semantics remain unchanged for existing callers.

The context object is frozen and newly constructed for each SDK callback attempt;
the SDK may reuse the same native Transaction object after resetting its internal
attempt state. Native object identity is not an attempt or authority token. Build
every prepared plan again from that attempt's current reads. Do not retain context/handles/plans for
another attempt, use them after callback completion, serialize them, return them
as application data or expose them to browser code. A TypeScript context type is
not a security capability. No new global context registry or user-supplied handle
constructor exists.

## Verification and scope

`node --test tests/unit/firestore-compat-transaction.cjs` loads the **real bridge**
with isolated Admin SDK I/O. It verifies exact native db/transaction identity, one
Admin transaction call and db acquisition, fresh context/current snapshots on retry
while reusing the native Transaction object, native
query/create plus compatibility mutations, merge/snapshot/ref behavior, rollback
on create/update/commit/callback failure, and read-after-write rejection across
both APIs. The fixture uses an in-memory transaction contract; it does not prove
live Firestore contention or production checkout-to-printer integration.

Run `npm run typecheck` and relevant checkout/reservation/payment regressions.
Current-head CI and actual independent Codex review are separate required gates;
root serializes merge/deploy and then verifies deployed health/release/read-only
smoke. There is no new live endpoint in this delivery. Actual acceptance and
settlement callsites, authentication/payment checks, printing/routing/outbox logic,
feature flags, credentials, data/rules/indexes and hardware remain unchanged.
No unattended production writes or physical-output claims are authorized here.
