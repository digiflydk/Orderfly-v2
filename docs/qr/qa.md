# QR isolated QA0 acceptance (#429, #401, #389)

This harness uses the existing fixed **demo-orderfly-qa0** environment and unchanged `scripts/local-qa/environment.cjs`, `network-guard.cjs`, deny-all client rules and emulator configuration. It does not run the printer seed or change printer acceptance assertions. It adds only QR-specific fixtures and orchestration under `tests/local-qa/qr-*`.

## Verified prerequisites

On 21 October 2026 the local machine already had Firebase CLI 15.30.0 at `/tmp/orderfly-qa0-tools/node_modules/.bin/firebase`, Firestore emulator 1.22.0, and Temurin Java 21.0.12.1 at `/tmp/orderfly-qa0-jre/jdk-21.0.12.1+1-jre/bin/java`. The JRE archive SHA-256 matches `2413149700df0f7d440500a84a8f764c535f21e5a5e87d38328b64eec2c5b500`. Global Java 17 is insufficient; the runner requires the explicit Java 21 path. A locally provisioned Chromium 153 at `/tmp/qr-chromium-153` has independently passed component browser suites. No tool install or new repository dependency was needed for this harness.

The checkout must have normal locked dependencies installed and no development dotenv files. Ports 3100, 8088, 9099, 4400, 4500 and 9150 must all be unused. The runner refuses existing listeners, never reuses or kills them, and never reads cloud credentials. Its child environment is the existing allowlist plus `QR_MODULE_ENABLED=true`; printer configuration writes are removed. This local feature flag is not production activation.

```sh
QA0_FIREBASE_BIN=/tmp/orderfly-qa0-tools/node_modules/.bin/firebase \
QA0_JAVA_BIN=/tmp/orderfly-qa0-jre/jdk-21.0.12.1+1-jre/bin/java \
CART_CHROMIUM_PATH=/tmp/qr-chromium-153 \
node tests/local-qa/qr-run.cjs
```

`--api-only` runs the actual native API/redirect/analytics portion without claiming browser acceptance. The complete runner executes two successful seed/acceptance/cleanup passes inside the **same** emulator/app lifetime before reporting repeatability. A failing pass stops that lifetime; it cannot be reported as a successful acceptance run.

## Fixture and network boundaries

`qr-fixture.cjs` atomically creates only `qa0-qr-*` brands/locations and its explicitly owned `platformAdminControl/access-v1` policy, refusing any existing seed paths. Real emulator Auth users have in-memory random passwords and real ID tokens. A scoped manager has the six QR permissions only for its own native location. A separate viewer has view/analytics and no create/edit/archive/export grants. The foreign brand/location has no membership for either user. No production identity, fake session cookie or mocked Firestore is used.

The native session API verifies real emulator ID tokens. Full browser mode also uses the real `/admin-login` Firebase form and real session cookies, then the assembled `/superadmin/qr-codes` page. It requires the page/API adapter from #416; the independent component fixtures do not substitute for that route.

App and fixture processes run under the unchanged loopback guard. Browser contexts block service workers and every HTTP request outside fixed loopback app/Auth/Firestore ports. WebSockets are restricted to the loopback app port. Chromium additionally disables background networking and external DNS resolution. This is a bounded local acceptance harness, not a general OS sandbox. No QR destination is followed to the internet: redirect assertions use `redirect:manual` and inspect the response locally.

Cleanup runs in `finally` and deletes only the fixture's created Auth user IDs, explicit seeded paths, owned QR brand subcollections and public indices whose stored brand matches those newly seeded fixture brands. It verifies documents and Auth users are absent before the second pass. No broad emulator/project wipe is used. Failure tears down only child processes started by this runner. Logs are private 0600 files in a 0700 temporary directory; safe output contains fixed phase codes/check names, never passwords, cookies, tokens, raw requests or arbitrary browser errors.

## Acceptance contract

| Area | Required evidence |
|---|---|
| Native create/replay | One persisted QR record after the same create request ID is replayed |
| Native edit/conflict | Persisted changed destination/name and revision; stale revision rejected |
| Access/CSRF | Anonymous, foreign brand, foreign native location and wrong origin rejected |
| Public resolver | Active local QR redirects with no-store; HEAD creates no event; mobile/bot GETs create exactly two native events |
| Analytics | Actual API totals equal native stored events; probable scan excludes bot; unique identity remains unknown |
| Export authorization | Viewer export rejected on the server, not merely hidden in the UI |
| Pause | Public redirect unavailable after pause, with no new event |
| Actual browser | Real visible login, assembled QR create/edit and native readback; downloaded PNG decodes to the permanent public URL; mobile viewer sees persisted analytics without mutation/export controls or overflow |
| Cleanup/reuse | Two successful passes within one app/emulator lifetime, with verified cleanup after each |

## Current evidence and concrete blockers

The first guarded actual-Next run on local integration source `620904a4` reached successful native create/replay, persisted edit, stale-revision rejection, anonymous/foreign-brand/foreign-location/CSRF rejection and real session verification. It then failed: an active freshly persisted QR with verified public index returned **404 to HEAD** on `http://127.0.0.1:3100/q/{code}`. No successful redirect/event/analytics/browser acceptance is claimed from that failed run. Follow-up probes verified the native record is active, unexpired and index-consistent, and the real scoped store resolves the same destination against the same emulator. Actual Next HEAD and GET both return 404; a fixed localhost Host-alias diagnostic also returns 404. This isolates the failure to the public request boundary/feature activation path, but does not prove which internal Next URL/Host value caused it. Host overrides are diagnostics only and never acceptance or policy bypasses.

The coordinator authorized a temporary local-only four-field diagnostic: actual Next constructed request origin `http://localhost:3100`, direct Host `127.0.0.1:3100`, environment `development`, flag enabled `true`. No path, query, cookie, token or other headers were logged. The diagnostic source was restored byte-for-byte (SHA-256 `b38e42417b8c8868d7ef25b01cfb8efefc080c22dab6a8b39b88aef7e03af51d`) before acceptance was rerun. The coordinator's product fix permits only development HTTP same-port loopback aliases; production strict HTTPS host policy is unchanged.

**Actual native API acceptance now passes** on clean local `2690e16d` (integration `620904a4` plus the coordinator's loopback fix and this QR harness), with no instrumentation. Two complete passes inside one emulator/app lifetime prove real Auth sessions; one native code after create replay; persisted edit/stale-revision rejection; anonymous/foreign-brand/foreign-location/CSRF denial; actual redirect with two persisted GET events (one probable mobile scan, one excluded bot); HEAD without counting; native analytics matching those events; viewer CSV denial; paused-code rejection without extra events; and native document/Auth cleanup between passes. The safe summary explicitly states `browserAcceptance:false`, `productionAcceptance:false` and `physicalScanVerified:false`.

**Full actual browser and native acceptance now passes** against the assembled committed product snapshot `8aefac3d`, merged into local QA source `055e82bb`, with the strengthened QR smoke harness. Two complete cycles inside the same emulator/app lifetime succeeded, without instrumentation or application API/database mocks. The manager logs in through the actual Firebase form, creates a second independent QR through the assembled page, edits the original QR and verifies both native records. A real PNG download decodes to the original permanent QR public URL. A separate viewer logs in at 390px, sees the actual two-event statistics, has no mutation/download/CSV controls, and has no page overflow. The native authorization, replay, stale revision, HEAD/GET classification, pause and cleanup assertions above also pass. Browser errors and blocked external requests are both zero.

The full safe summary reports `browserAcceptance:true`, `cleanupVerified:true` and `sameEmulatorPasses:2`, while preserving `productionAcceptance:false` and `physicalScanVerified:false`. Full typecheck and the 18 existing environment/network guard tests passed on the named merged source. This evidence supersedes the earlier API-only result for that product snapshot.

Later assembled product changes require a fresh run against their exact committed source. This remains isolated server-backed browser evidence, not production acceptance, deployed-index proof or physical print/phone scanning. Component fixtures, emulator server integration, production live QA and physical scanning remain distinct categories. Final release acceptance and independent review remain coordinator-owned.

## Final assembled local rerun

The committed product snapshot `427b66064d91be7e5166dd88faeff6872c6ac860` (including manager state preservation, scan-time attribution and immutable history) was merged into QA source `bed763340b16022e2fbe5320a6e118bf921f192a`. The strengthened harness passed **two complete actual native/browser/cleanup cycles in the same emulator/app lifetime** on 21 October 2026 after the coordinator's concurrent production build finished. Both preliminary attempts during that build reached successful native checks but timed out at the separate-account login form; neither failed attempt is counted as acceptance. The successful uncontended run retains all original assertions/timeouts and needs no product instrumentation or guard change.

Additional actual persistence evidence: a newly created record starts with an exact zero lifetime; HEAD writes neither event nor count; mobile and bot GETs produce two openings, one probable and one excluded, without changing business revision or updatedAt. Business edit and pause preserve those counts. Native analytics groups both events by their stored campaign and location. Native history contains immutable before/after snapshots, returns the actual name difference, omits lifetime from audit snapshots and rejects the foreign brand. The actual browser displays revision3 history and the persisted new name. A valid scoped CSV row reaches the actual server preview, leaves creation disabled until explicit confirmation and creates no additional record. Analytics uses the composite brand/code selector. The390px viewer sees two native events without CSV controls or horizontal overflow.

The final safe summary reports all16checks passing, `browserAcceptance:true`, `browserErrors:0`, `blockedExternalRequests:0`, `cleanupVerified:true`, `sameEmulatorPasses:2`, `productionAcceptance:false`, and `physicalScanVerified:false`. Full typecheck passed on the prior assembled436 merge (the coordinator separately owns final427 build/typecheck); the unchanged8environment and10client guard regressions passed during this QA run. Final427 browser evidence is independent of the coordinator's build/unit results. Bulk commit/retry behavior is covered separately by component/service regressions; this local acceptance explicitly exercises preview without committing it. Production live QA, deployed index readiness and physical scanning remain outstanding release categories.
