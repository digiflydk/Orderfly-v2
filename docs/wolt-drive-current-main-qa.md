# Wolt current-main quote composition regression

Scope: #678–#680 and refreshed #689 evidence. Run owner `/root/quotes`, 2026-10-26. This supersedes neither genuine sandbox lifecycle acceptance nor delivery-coordinator checkout/browser acceptance.

## Frozen assembly

- Main base: `6f0032b1e918316870451132b48779483daedcee`.
- Shared contract: already on that main, blob `d2da8a2ec58375463aaa8b39957b5d95b6c3cab2`. No overlay or shared-file edit.
- Initial Wolt source and existing tests: pinned delivery integration `a9687676683aa7a125dc0cce27403e4604ea0eb2`, paths `src/lib/delivery/providers/wolt/**`, `tests/unit/wolt-*`, and `tests/integration/wolt-drive-contract.cjs` only.
- Provider dispatch-authority recheck: local source commit `25636a1`, published PR704 head `3346f1f2ac184643ec8a7f108e04f9f73c05a921`.
- Webhook ETA and two-venue regressions: local source commits `07a1948` and `509a52a`, published PR698 head `d38405b2a01fd8792861336e2ad9ad624b7b304b`.
- Frozen tested assembly commit: `52e33128accda3f27faf9a1dd95428250c4fede5`.
- Frozen tested tree: `07d1103c0ded9cd63deee1c6f85c55253e4e6b90`.
- Isolated workspace: `/workspace/scratch/eaddffe657e4/wolt-quote-compatibility`, branch `feature/wolt-678-compatibility`.

The QA-only publication contains this report and the new composer test, not a duplicate runtime assembly. The underlying Wolt implementations remain their original PRs. Reproduce by using the listed main and copying only the listed Wolt module/test paths from the pinned initial assembly, then applying the three listed Wolt fixes and new test. The runtime assembly already contains the shared main contract. This report is added after the frozen runtime test tree.

## Checks

```sh
node --test tests/unit/wolt-*.cjs tests/integration/wolt-drive-contract.cjs tests/integration/wolt-quote-composer.cjs tests/unit/delivery-quote-service.cjs
npm run typecheck
npm run build
```

74 tests PASS, zero skips; full typecheck PASS; full Next production build PASS (compiled, type validation, static pages and trace collection completed, exit0). The initial baseline before the latest provider/webhook fixes and new tests passed 66 tests on current main. No repeated sandbox calls, production data, Actions or deployment used. Runtime network/storage are controlled fixtures.

The new composer tests execute the actual shared quote service and actual Wolt facade/HTTP parser together. They verify:

- Source-labelled routing coordinates, complete address and preparation pass to Wolt without replacing route evidence with unqualified native distance.
- Provider payable cost remains distinct from the customer delivery fee; mismatching currencies fail rather than being silently converted.
- A scheduled point reaches Wolt unchanged; a broad window is explicitly unavailable.
- Invalid native phone/preparation or unsupported requirements cannot trigger a provider request.

The first new fixture failed because its synthetic key was shorter than the real resolver's minimum; correcting the fixture to a valid synthetic format resolved that test-setup error. No production guard was weakened.

## Shared findings and ownership

Read-only findings were posted to #657 at comment6409800398 with pinned `a968767` source. Customer checkout accepted domestic phone strings while the Wolt adapter correctly required E.164; native controller bypassed Levering preparation settings; and scheduled selection was converted to ASAP. Follow-up comment6409812250 records that the moving delivery worktree had already corrected scheduled request construction at `44b383e`. These are delivery-owner changes, not Wolt-owned model/pricing patches. Re-evaluate their final commit before release; do not carry old findings forward as new-code claims.

The module remains gated by the actual routing/runtime configuration, integrated delivery-store/payment/checkout verification, safe sandbox delivery/cancel/callback evidence, and the release coordinator's current-head/current-main gates. Isolated fixture concurrency is not production datastore proof. No live launch or physical acceptance is implied.
