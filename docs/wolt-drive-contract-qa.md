# Wolt combined isolated conformance QA

Issue #689; QA agent `/root/qa_ops`; checked 2026-10-26T05:37Z. This is internal adapter QA with controlled HTTP and in-memory storage interfaces, not deployed Firestore, a live callback, checkout/browser or production acceptance.

## Reproducible source pins

The isolated worktree `/workspace/scratch/eaddffe657e4/wolt-assembly-qa`, branch `feature/wolt-672-assembly-qa`, assembled the reviewed provider components without editing other agents' worktrees:

| Component | Published revision / source |
|---|---|
| Scoped provider facade | PR #704 `174cd5416e4a29badd73523e3107daf5f9c60bc9`; local equivalent facade amendment `c6206f2` |
| Configuration/binding | PR #697 `1a9d7d8624803bf87c2169be436b0f14d86c6624` |
| Quotes/HTTP/timing | PR #700 `981a0164a77a43eb79a5dec4e686f3b4ae36fcee` |
| Booking/cancellation, including timestamp regression | PR #702 `c416dfb05c15512564bd5f39d33cbad919e1c452`; local final amendment `deabad8` |
| Health and diagnostics | PR #699 `23cf9abb3a62ec3c46d59a3feae13246f160e6ea`; local equivalent `100a266` plus `734e56d` |
| Webhook verification/normalization/intake | PR #698 `408d02f7e3199bfb8395f0d5be5bc838a8a6246e`; local equivalent `1bdd694` |
| Shared contract dependency overlay | Exact blob `d2da8a2ec58375463aaa8b39957b5d95b6c3cab2`, from delivery-owner commit `04f9a512247ae03be0b855ef36ab753e57203c10`; not modified or published by this QA task |
| Frozen final assembly | Local commit `dac7557`, tracked tree `74b5254558f1c82d2b1c75ff1c66dd6a2cc60aa7`; with exact shared-contract overlay the effective tested tree is `4715ab01d40357694ba51d9fafa0604e7f9a995b` |
| Additional independent conformance test | `tests/integration/wolt-drive-contract.cjs`, blob `f98386c0f17aedf35c1dcf471bbc12a2ba197b13` |

The QA-only PR does not contain the provider implementation or owner contract and is not standalone executable on main. Reproduce by assembling the exact reviewed component commits above, then adding the QA-only test. Restore only `src/lib/delivery/provider-contract.ts` from owner commit `04f9a512247ae03be0b855ef36ab753e57203c10` and verify `git hash-object` equals `d2da8a2ec58375463aaa8b39957b5d95b6c3cab2` before running. Do not use a moving branch or silently copy a different schema. The final tested tree includes the prior evidence text; the subsequent report-only update changes no runtime source or tests.

## Results

```sh
node --test tests/unit/wolt-*.cjs tests/integration/wolt-drive-contract.cjs
npm run typecheck
```

**62 tests PASS; full typecheck PASS.** No skips, no external provider calls, no production writes and no GitHub Actions. The initial run was blocked by a disappeared dependency symlink; it failed before tests could load TypeScript. The dependency owner restored the locked install in `wolt-integration/node_modules`; QA reused that installation and reran the complete commands successfully. Dependency restoration was wait time, not functional progress.

The component suites verify scope denial before credentials/I/O, immutable identity across asynchronous callbacks, configuration/secret redaction, bounded transport/retries, native microsecond timestamp compatibility, malformed/expired/nonbinding quotes, stable booking intents/concurrency, unknown writes, cancellation races, signed event authenticity, size bounds, merchant/venue isolation, durable-ack ordering, replay identities and health/recovery projection.

Three independent cross-module scenarios exercise real production module code together:

1. Native six-digit timestamps pass through HTTP/quote/facade and the shared result schema; provider-only references remain private and unqualified provider distance is not presented as route distance.
2. Create-incompatible quantity/comment/phone bounds reject before secrets, provider requests or quote persistence.
3. A genuinely signed synthetic native pickup-ETA payload passes verification and duplicate-safe fixture inbox, then feeds operations reliability using `dispatchedAt`, while `occurredAt` remains null and raw phone/PIN fields are stripped.

## Finding correction

An earlier report attributed missing quote quantity/comment guards to facade commit `c85c6e0`. That attribution was wrong: the observation came from an earlier uncommitted source snapshot. Inspection and independent regressions confirm `c85c6e0` already rejects those quote bounds. The later amendment additionally validates create preflight and distinguishes known local non-dispatch from unknown provider writes. There is no remaining reproduced bounds failure on the pinned revised facade.

## Open release gates and ownership

- Delivery coordinator: provide actual shared durable binding, immutable quote, atomic dispatch claim, inbox and webhook route implementations and wire the adapter. Fixture stores do not prove datastore concurrency or production integration.
- Wolt coordinator: genuine sandbox create/cancel and callback acceptance still need safe documented test contact behavior, reachable scoped callback and signing-secret configuration. Existing quote-only sandbox evidence is in `wolt-drive-sandbox-qa.md`; it is not lifecycle acceptance.
- Delivery coordinator plus Wolt QA: combined checkout/payment/Levering/browser acceptance, tenant rejection, device layouts, keyboard/focus, tracking and print behavior (#691). The delivery workstream has stopped with an inactive foundation; these are external unresolved integration gates.
- Release coordinator: current-main/current-head review and internal checks on the final assembled release, serial merge/deploy, actual release SHA and live QA. No deployment is implied here. Paid courier or physical-device acceptance requires separately authorized evidence.

This QA result supports adapter readiness only. It does not close the full Wolt epic or authorize customer-facing activation by itself.
