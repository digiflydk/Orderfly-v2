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
