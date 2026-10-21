# Printer QA0 local environment

Issue: #376. QA0a is backend preparation. QA0b was split before implementation
into #379 (b1: guarded browser client emulator wiring) and future b2 (actual
browser login/acceptance proof, not started). These THREE preparation slices are
separate from the provisional 22 feature-sprint budget and the conditional
acceptance packages #372, #373 and #374. This supersedes the earlier two-slice
setup estimate; it is not a calendar promise.
Local evidence does not establish production acceptance or physical printing.

## Runtime and start

Use a clean development checkout with its normal locked dependencies installed.
No `.env`, `.env.local`, `.env.development` or `.env.development.local` files may
exist: the launcher refuses them without reading their contents. Node 24,
Firebase CLI **15.30.0**, Java **21**, and the CLI's Firestore emulator **1.22.0**
were used for the evidence below. CLI 15.30.0 itself requires Java 21; the
machine's preinstalled Java 17 is insufficient. The launcher checks CLI and Java
versions before starting services.

Install isolated tools outside the repository (no Firebase login or credentials):

```sh
npm install --prefix /tmp/orderfly-qa0-tools --no-audit --no-fund firebase-tools@15.30.0
```

Provide a Java 21 binary. The verified Linux x64 Temurin JRE archive was
`OpenJDK21U-jre_x64_linux_hotspot_21.0.12.1_1.tar.gz`, from the official
[Temurin release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1).
Verify the published archive checksum before extraction. The tested archive's
SHA-256 was `2413149700df0f7d440500a84a8f764c535f21e5a5e87d38328b64eec2c5b500`.
Download the pinned Firestore emulator using the installed CLI with Java 21 on
PATH: `firebase setup:emulators:firestore`. Tool download is a separate setup
operation; app and seed processes have no external network access.

Run, substituting the actual extracted JRE path:

```sh
QA0_FIREBASE_BIN=/tmp/orderfly-qa0-tools/node_modules/.bin/firebase \
QA0_JAVA_BIN=/tmp/orderfly-qa0-jre/jdk-21.0.12.1+1-jre/bin/java \
node scripts/local-qa/run-backend.cjs
```

The named environment is **QA0a-local-backend**, project **demo-orderfly-qa0**.
It requires unused loopback ports 3100 (Next), 8088 (Firestore), 9099 (Auth),
4400 (emulator hub), 4500 (emulator logging) and 9150 (Firestore websocket). It starts actual Next in
development mode and actual Auth/Firestore emulators, runs the smoke twice against the SAME live emulator/app and then stops
its processes. Existing listeners are never reused or killed. Client Firestore
rules deny all; actual native Admin persistence is used by server services.

## Data, authentication and safety boundaries

Child environments are built from an allowlist and never inherit service
accounts, ADC, provider keys, proxy settings or cloud login configuration. The
local Admin branch requires every project/host/public configuration value to
match the fixed demo environment, plus an active network preload guard. Partial,
remote, non-demo, production-mode or credential-bearing local configuration
rejects before SDK initialization or credential parsing. Cached Admin apps may
not cross project/runtime boundaries. Without explicit local mode the existing
production initialization path remains separate; unqualified emulator variables
are rejected.

App and seed processes restrict outgoing sockets/fetch/HTTP2/DNS to loopback and
require explicit loopback server bindings. No system DNS lookup is needed for
localhost. The fixed emulator configuration also binds only to 127.0.0.1. This
is a process-level safety guard for this harness, not a general OS sandbox.
Never run arbitrary additional code inside these processes. Firebase CLI starts
only the two emulators for a `demo-` project with sanitized credentials and
telemetry disabled. No cloud resource or paid service is created.

The seed atomically creates only fixed `qa0-*` brands, locations, one disabled
printer, a valid empty queue ledger and a local access policy. It refuses to
overwrite existing records. Two actual emulator Auth users receive randomly
generated passwords held only in memory. Their real Firebase ID tokens go to
the unchanged `/api/admin/session`; its real session cookies authorize actual
native API reads. No fake session cookie, mocked auth or mocked database is used.
The ordinary merchant has catalog read/edit and order read within its own scope;
printer administration still requires the platform superuser.

Finally cleanup deletes only created user IDs and the explicit seeded document
paths, including their printer subcollections. Cleanup is enabled only after the
atomic seed succeeds. No broad project wipe is performed. After each smoke, native document reads and an Auth lookup verify every seeded
document and created user is absent. A second successful smoke against the SAME
emulator/app lifetime verifies seed reuse before teardown. An interrupted process can leave data in
its temporary emulator lifetime; stop that harness and restart the in-memory
emulators, rather than applying this cleanup to another environment.

Each smoke has a fixed 60-second deadline; a stalled child is killed and the
harness fails with a fixed error. Native Firestore termination runs in a nested
`finally` even if cleanup deletion or verification rejects. Failure and stalled
child regressions preserve these resource boundaries.

Only local printer configuration writes are enabled inside the isolated child
environment. Print intent/output/dispatch flags and all payment/provider
configuration are absent. No real orders, payments, printer credentials,
customer notifications, printer connection, hardware change or Wolt operation
are performed.

## Evidence and remaining work

On 21 October 2026, the corrected runner passed two consecutive real smokes
inside ONE emulator/app lifetime. Earlier separate launcher runs used fresh
in-memory emulators and did not prove repeatability after cleanup; that claim
is superseded by this same-lifetime proof (review finding4340624141).

| Scenario | Actual result |
| --- | --- |
| Native Firestore atomic seed and readback | Created and read the disabled printer and empty ledger |
| Two real Auth users through actual session API | Both session POSTs returned 200 |
| Superadmin printer overview | 200, exactly the seeded printer and count 1 |
| Ordinary merchant printer administration | 403 |
| Own brand with foreign native location | 403 |
| Anonymous printer administration | 401 |
| Actual native queue API | 200, `resumeAuthorized:false`; printer remained disabled |
| Native cleanup readback after each smoke | All seeded native documents absent; created Auth user lookup empty |
| Repeated fixed seed before emulator teardown | Both complete smokes passed in the same live environment |

The runner emits only a safe JSON summary and stores protected process logs in
0600 temporary files inside a private 0700 directory. Emulator debug files also stay in that private directory. Tokens, session cookies and passwords are never printed.
Failing smoke output is a fixed message, not an arbitrary error/payload dump.

Guard regression tests run with
`node --test tests/unit/local-qa-environment.cjs`; they isolate SDK access only to
prove failure occurs before credential access. That unit isolation is separate
from the real emulator evidence above. Run `npm run typecheck` and relevant
session/authority/identity tests for changes to the binding.

QA0b1 #379 remains required for browser Firebase emulator wiring; its owner works
in a separate branch. Future QA0b2 is not started and must prove real interactive
login and app UI flows, reusable acceptance fixtures and browser diagnostics. This
backend smoke does not implement all race/TTL/mutation acceptance scenarios.
Neither QA0a nor QA0b constitutes authenticated production live QA or physical
printer readiness. Keep #376 open until all THREE preparation criteria are verified.

## QA0b1 browser client binding (issue #379)

Preparation was split before implementation into **three** slices: QA0a backend,
QA0b1 client binding, and future QA0b2 actual browser runtime/login proof. This
supersedes the earlier provisional two-slice setup because client safety wiring
plus missing browser provisioning and end-to-end proof could not fit one bounded
60-active-minute slice. These are preparation tasks, separate from the provisional
22 feature-sprint budget and conditional QA packages #372/#373/#374.

QA0b1 adds `NEXT_PUBLIC_ORDERFLY_LOCAL_QA=true` only to the sanitized fixed-demo
child environment. The server guard requires the public and private opt-ins to
agree. The client validates that public opt-in, development mode, exact
`http://127.0.0.1:3100` origin, fixed project/API key/auth domain/app ID, and absent
storage/messaging configuration **before Firebase SDK initialization**. In a
browser it checks the actual window origin, rather than trusting SITE_URL. An
ordinary production configuration without opt-in retains the existing path;
partial QA configuration, demo configuration without opt-in, wrong cached app,
or production mode with opt-in fails closed.

The actual app's existing Firebase import connects its singleton Auth to
`http://127.0.0.1:9099` before the existing login form gets Auth or signs in, and
connects client Firestore to `127.0.0.1:8088` before exposing the database. No login,
ID-token, session-cookie or native authorization policy is replaced. A per-app
WeakMap survives module hot reload, connects each emulator once, and rejects
changed Firestore instances. Connection failures propagate; the QA client never
falls through to an unbound SDK. This binding provides no native authorization,
write grant, dispatch or physical-print authority. The deny-all client Firestore
rules remain unchanged.

`node --test tests/unit/local-qa-client.cjs` executes the production client module
with only SDK boundaries observed to prove ordering, guard frontiers, exact
emulator addresses, normal production behavior, cache/HMR behavior and failure
handling. The malformed project regression first failed against the old module
because it initialized the SDK without rejecting the claimed QA mode. These
adapter tests are **not** actual browser login or authenticated UI acceptance.
QA0b2 still owns official browser provisioning, browser-specific loopback network
restrictions, shared in-memory seed/cleanup, real visible login and real app UI
proof. No browser process, installer or server is started by QA0b1; parent #376
remains open.

## QA0b2 real browser proof (#381)

This is the already planned THIRD preparation slice, using the single existing
QA0a seed/cleanup and #379 client binding. No second environment or copied seed
is created. The backend smoke retains all native/session/denial/cleanup checks
and optionally calls the browser proof while its same ephemeral data is alive.
The passwords are non-enumerable, memory-only callback values. A callback failure
still enters the original verified cleanup and guaranteed native termination.

With the same explicit tool paths shown above, run
`node scripts/local-qa/run-browser.cjs`. It uses the existing launcher and fixed
60-second smoke deadline twice before ONE emulator/app teardown. Browser smoke has its own process group so
the deadline kills Chromium descendants as well as the smoke, and teardown tries
every context and the browser even if one close rejects. Each pass uses
the visible separate Orderfly-account login form for two actual Firebase users,
then tests the real superadmin table (nine exact headers, unfiltered initial
state, persisted Danish row), native edit-form load/cancel, desktop1348/mobile375
containment and table scrolling, ordinary merchant UI/API denial, anonymous401,
foreign native scope403 and retired merchant route404. Native disabled-printer
and empty-ledger readback and output-off checks remain in the shared backend
proof. Broad mutation/race/TTL acceptance stays in #372/#373/#374.

Browser contexts block service workers and downloads. HTTP allows ONLY the three
fixed `http://127.0.0.1` app3100/Auth9099/Firestore8088 origins; WebSocket allows
ONLY app3100's exact Next HMR path. Both routes are installed before any page or
credentials. External requests are aborted without logging URL/query/body. The
Node guard remains active separately. No HAR, trace, storageState, cookie dump,
video or credential-screen screenshot is recorded. Screenshots are taken only
of the authenticated synthetic printer table at desktop/mobile sizes. A failed scenario writes only a fixed stage label in `local-qa-browser-failure.json`;
no raw error, request or credential data is stored. Browser
errors become a fixed failure message and never expose Playwright's credential
call log.

Safe screenshots are `test-results/local-qa-*-desktop.png` and `*-mobile.png`.
Only after BOTH passes and all cleanup checks succeed does the launcher write
`test-results/local-qa-summary.json` (0600), including checked-out source SHA,
Next/Playwright versions, environment name, scenario results,
`sameEmulatorPasses:2`, `cleanupVerified:true`, `productionAcceptance:false` and
`physicalPrintVerified:false`. These are local isolated test artifacts, never
production screenshots or physical-printer evidence.

The ONE authorized local official Playwright1.62 Chromium1234 installation
attempt on21October2026 FAILED: the official CDN archive was truncated/invalid
ZIP. No alternate binary or second install command was attempted. Therefore
local browser execution is BLOCKED and no browser pass is claimed from source
or unit fixtures. CI reuses its existing successful official Chromium install,
adds Java21 and pinned FirebaseCLI15.30.0 with sanitized tool-install env, then
runs this actual emulator/Next/browser proof. The existing artifact upload gains
only the safe screenshot/JSON paths. CI success must mean the actual proof step
ran and passed; skipped/pending checks do not establish browser readiness.
Parent #376 stays open until that real evidence is inspected and accepted.
