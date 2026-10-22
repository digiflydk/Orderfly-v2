# Explicit local intent runtime: #494 / #490

This preparation supplies a strict runtime binding for the proposed QA490 intent
variant. It does not run a native settlement, launch emulators, supply a fixture,
or complete #490/#350 acceptance. Ordinary QA0 is unchanged and still rejects any
`ORDERFLY_PRINT_INTENTS_ENABLED` declaration.

## Runtime boundary

`localQaRuntimeEnvironment()` selects the variant only when the
`ORDERFLY_LOCAL_QA_INTENT_PROOF` key is declared. An empty, false, undefined,
partial or malformed variant fails before Firebase SDK access, including when
ordinary local-QA mode is missing. There is no production fallback.

The explicit variant requires development mode, intent proof and intents exactly
`true`, and printer configuration writes exactly `false`. Browser proof modes,
proxies, output and dispatch declarations are rejected, even when empty/false.
The original QA0 guard checks the complete fixed demo project, emulator hosts,
origin, public identifiers, bootstrap identifiers, provider/ADC exclusions and
actual loopback-network preload marker on a **copy** after removing only the two
validated intent keys. The original function and caller environment are never
modified. Firebase Admin's existing initialization, current-scope/cache checks,
unusable emulator credential and native database construction remain intact;
only its three guard calls use the explicit selector.

`intentEnvironment()` constructs a sanitized child environment from the existing
allowlist builder and changes only the two intent declarations and configuration
write gate. It does not inherit provider credentials, proxies or output flags.
The original QA0 environment, runner and seed are not changed.

## Available command

```sh
node scripts/local-qa/run-intents.cjs --preflight
```

This read-only preflight refuses development dotenv files without reading them
and emits bounded evidence with `status: preflight-only`, `nativeExecution:false`,
`runtimeBindingAvailable:false`, `productionAcceptance:false` and
`physicalPrintVerified:false`. It starts no child, network request, emulator or
seed. Omitting `--preflight`, adding an arbitrary module path or requesting a
native run fails. There is deliberately no generic callback loader or success
fallback while the fixed native resource owner is missing.

## Remaining native integration

The next bounded owner slice must compose the existing fixed-demo Auth/Firestore
launcher lifecycle with registered disposable intent fixtures, actual source
binding to the settlement module and a real Stripe SDK loopback provider fixture.
It must invoke #490's fixed `runIntentProof(resources)` contract, register every
created financial/policy/catalog/routing path before I/O, and own verified cleanup
on success, callback failure, timeout and process failure. The proof requires a
valid pending order, two configured paused kitchen printers and empty ledgers,
then checks exact same native commit time for payment, manifest, jobs and ledgers
and unchanged replay. The complete seed/provider/cleanup owner is not supplied
here; no injected callback or unit fixture is native acceptance evidence.

That integration needs its own reviewed issue/scope before code. It must reuse
the same environment lifecycle rather than launch a competing second stack or
relax ordinary QA0. Intent creation is software-only: output/dispatch remain OFF,
no printer connection is made, and production data/configuration/credentials and
Wolt are untouched. Browser/staff-payment cases remain separate acceptance work.

## Verification and release

Run typecheck and `node --test tests/unit/local-qa-intent-runtime.cjs
tests/unit/local-qa-environment.cjs tests/unit/local-qa-client.cjs`. The dedicated
tests execute real guard/Admin source with only external SDK I/O isolated, prove
strict rejection before SDK access, fixed emulator construction/cache rechecks,
unchanged ordinary ON rejection, sanitized environment and explicit preflight
failure semantics. They are source checks, not a native/emulator/browser proof.

Root publishes after source review, requests independent Codex review and current
CI, and serializes merge/deploy with actual release-SHA/live verification. Claude
owns final QA against each issue's criteria; this document is not a closure claim.
