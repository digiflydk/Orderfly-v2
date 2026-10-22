# Isolated print-intent ON proof contract

Issue #490, parent #376, coordination #309. Source baseline `88587bedba3ac42908b272e66d977ebfdd9c63c4`.

## Status and scope

This is a separate **proof module**, not a launcher or an enabled QA0 environment. `scripts/local-qa/intent-proof.cjs` supplies one finite Stripe settlement/immutable replay case. Its contract tests isolate settlement and database I/O and are **not native integration evidence**.

The existing `src/lib/local-qa-environment.ts` remains unchanged and continues rejecting `ORDERFLY_PRINT_INTENTS_ENABLED`, including false or empty values. Calling the ordinary QA0 launcher with ON remains invalid. No product flag, database binding, provider setting or network guard is changed by this module. The original QA3 module concerns queue/resume/receipt proof; this module specifically concerns the actual financial writer's atomic ON print-intent commit.

Actual execution remains **WAITING_RUNTIME_BINDING** until the authoritative QA0 owner provides a separately reviewed explicit variant. The module does not import arbitrary application paths, replace Firebase modules, create another emulator or permit production fallback. A callback is a code handoff from that trusted owner, never a caller-provided authority or proof that the callback actually invokes the product implementation.

## Exact runtime and resource handoff

The resource owner must supply the existing allowlisted `environment()` runtime, with these explicit differences:

- `ORDERFLY_LOCAL_QA_INTENT_PROOF=true` and `ORDERFLY_PRINT_INTENTS_ENABLED=true`.
- `ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=false`. Output and dispatch flags must be absent, even values `false` or empty are rejected.
- Existing fixed demo project, loopback Auth/Firestore/app URLs, bootstrap IDs, public-only Firebase configuration and `NODE_OPTIONS` network preload remain exact. The loopback guard marker must already be installed. ADC, cloud/provider credentials, provider environment variables and proxies are rejected.

The module reads the runtime but never changes it. The owner must use a new reviewed binding for this variant, retaining ordinary QA0's ON rejection. Merely setting the marker or the two ON variables does not implement that binding.

`describeIntentProof(resources)` returns a frozen plan after pre-I/O validation. `runIntentProof(resources)` validates the same contract, registers created documents, runs the finite case and returns bounded evidence. The exact resource keys are:

| Key | Required value / source |
| --- | --- |
| `projectId` | `demo-orderfly-qa0` |
| `sourceCommit` | Actual checked-out product source SHA, 40 lowercase hex digits; owner verifies it against the loaded implementation |
| `db` | Real installed `@google-cloud/firestore` `Firestore`, default database, project above, native settings `servicePath:127.0.0.1`, `port:8088`, `ssl:false` |
| `scope` | Exact `{brandId,locationId,orderId,printerIds}`; exactly two distinct printer IDs; every ID matches `qa0-intent-[A-Za-z0-9_-]{1,64}` |
| `registry` | Exact `{has(path,recursive),register({documents,recursiveRoots})}` from the one authoritative fixture/cleanup owner |
| `settle` | Fixed owner closure invoking the **actual exported** `settlePaidCheckoutSession` with its in-memory verified local Stripe session, not a paid-state writer, projection or mock |

No session, provider key, raw transaction record or customer data is returned by the module. The Stripe fixture and real SDK loopback server are owned by the variant runner. Production provider keys must not be present. Staff settlement is not this first case; the #350 adapter and staff authority need their own explicit case after its implementation is reviewed.

## Fixture ownership and seed

The owner creates one isolated fixture and registers **all** created financial/catalog/policy/routing/auth/provider resources before I/O. It refuses to overwrite existing data and guarantees no competing worker uses these IDs. These specific documents must already be registered with `has(path,false)` before the module is called:

- Own brand, own location, own order.
- Both own printers and their `queue/state` documents.

The order and both printers must also have pre-existing recursive cleanup ownership (`has(path,true)`). This includes unexpected descendants after a failing settlement. The module registers only the exact new original manifest and two deterministic original-job document paths before its first native read; registration must complete and remain stable. Registration failure cannot invoke settlement. It does not grant ownership of arbitrary roots or take over cleanup.

Required fresh seed:

- Brand status `active` or `trialing`, active own location.
- Stripe order with `paymentStatus:Pending`, `status:Pending` and valid native seller/customer/amount/currency/invoice prerequisites for actual settlement.
- Exactly two own paused printers at revision 1, `deletedAt:null`. Paused printers allow intent preparation and do not authorize output.
- Valid empty queue ledgers at revision 0, count 0 and null oldest time; no existing printer jobs or original manifest.
- Valid native ON intent policy, native catalog/products, saved routing and verified local Stripe session producing exactly one kitchen original per printer. The owner must seed/register those resources, ordinary financial counters/audits/notification records and any local provider fixture before invoking this module.

The existing two-principal Auth/Firestore environment is reused; this webhook settlement case itself does not authenticate a browser principal. The module does not claim it has observed Auth login. A future staff case must use the real native staff identity and `orders:edit` path, not substitute the Stripe callback.

## Evidence actually checked

1. Fixed runtime, native SDK settings, source/scope shape and existing cleanup ownership pass before database or settlement callbacks. Register exact created paths, then revalidate unchanged resources.
2. Read native seed documents in a read-only transaction. Reject paid, foreign, active-output, nonempty or pre-existing-original seed. Bounded queries check empty job collections.
3. Invoke the actual settlement adapter once; it must return `true`.
4. Read order, original manifest, both jobs and both ledgers through the supplied native Firestore client. All six native `updateTime` values must match **exact seconds and nanoseconds**, not rounded milliseconds. Require Paid/Received order with invoice, manifest with both original targets, revision-0 queued kitchen jobs with attempts 0 and printer revision 1, and revision-1 ledgers with count 1 and oldest time matching each job. Bounded native job queries reject extra or foreign job IDs.
5. Replay through the same actual adapter; it must return `false`. All six native update times remain unchanged and each printer still has exactly the expected one job.

The safe result includes the source SHA, compared-record/job counts and boolean commit/replay outcomes. It deliberately returns `cleanupVerified:false`, `cleanupOwnedByCaller:true`, `productionAcceptance:false` and `physicalPrintVerified:false`. It does not expose timestamps, IDs, invoices or raw records.

The module catches foreign reflection/storage/provider/callback errors and exposes fixed error codes only. It neither reports an error as success nor cleans up behind the owner's back. **The owner must always run its finally cleanup and verify native documents plus ephemeral Auth users are removed**, even if registration, seed validation, settlement, reads or assertions fail. A successful result is incomplete evidence until the owner separately verifies cleanup and the actual loaded callback/source binding.

## Remaining integration and limits

The next runtime-owner slice must provide a reviewed explicit native Firebase binding and isolated runner variant, reuse one emulator/cleanup lifetime, enforce the same environment before loading product code, and supply the fixed actual settlement closure. The normal QA0 guard and launcher remain strict. No arbitrary module-path loader or production credentials may be introduced. Root coordinates any minimal shared-file edit and CI registration after inspecting coherent candidates.

Only then can CI/Claude execute this case against native emulators and publish SHA/version/case/cleanup evidence. Source tests here do not prove transaction commit, provider SDK use, same native update time, Auth availability, cleanup execution or any original product acceptance. The finite case also does not prove every financial counter, every provider guard, rollback under a natural SDK retry, staff cash/card, initial unpaid acceptance or physical printing. Existing #349 QA evidence and original negative matrices remain relevant; they are not replaced by this smaller reusable case.

One preparation sprint was scoped at 35–60 active minutes. Actual native execution, runtime-owner implementation, independent code review, CI, deployment and Claude acceptance remain separate. No close of #350/#343/#303/#376 follows from a contract-test pass.

Run source checks with:

```sh
node --test tests/unit/local-qa-intent-proof.cjs tests/unit/local-qa-environment.cjs
npm run typecheck
```

Root remains the sole publication/release coordinator. Current-main ancestry, exact-head green CI, completed independent Codex review, no unresolved findings/human holds, serial merge/deploy, actual release verification and Claude acceptance remain required. Production data/configuration/flags/output/hardware/firmware/Wolt are untouched.
