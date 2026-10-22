# Native intent settlement proof

Issue #511 integrates the preparation contracts #490/#494 with actual installed
Firebase Admin and Stripe SDKs and the actual exported settlement function.
It is backend-only: Auth/Firestore emulators share one fixed demo lifetime, while
the synthetic Stripe HTTP server exclusively uses loopback port 3100. No Next
server, customer payment, credentials or physical printer is involved.

The fixed source bridge transpiles committed actual TypeScript under `src`,
resolves the repository's fixed `@/` alias and Next's actual bundled React,
and consumes only literal compile-time `server-only` side-effect imports as
Next's bundler does. The strict isolated runtime is checked before this happens.
There is no application module mock map,
caller module path or alternate financial writer. It rejects tracked source
changes and reports the actual commit. The fixed source-resolution hooks remain for the lifetime of actual lazy imports
and are restored during teardown; all SDK/native references come from the same
module graph.

The sole product hook is `localQaStripeOptions`: absent the explicit intent key,
the existing native payment-secret lookup and Stripe production SDK options are
preserved. A declared key requires the complete existing intent runtime guard,
fixed emulators/demo project, development mode, output/configuration OFF and the
installed loopback network guard. Partial, remote, provider/ADC/proxy or output
declarations throw without falling back to production. The only local result is
a fixed synthetic key and HTTP 127.0.0.1:3100. Callers cannot supply a URL or key.

The fixture creates only registered vacant synthetic order, seller, catalog,
customer, routing, policy and two paused printers with empty queues. Deterministic
financial paths are registered before settlement; new manifest/job paths are
registered by #490 before its reads. A pre-existing document or descendants reject
without taking cleanup ownership. Batch creation uses native create semantics.
Both the seed year's invoice counter and the following year's counter are
checked for collisions and registered before seeding. A settlement crossing
January 1 UTC therefore cannot leave its new counter behind during cleanup.
Every post-acquisition failure enters cleanup, and recursive roots are limited
to the fixture's exact order and location; every registered path and recursive
descendant collection is verified absent. No Auth user is created by this
webhook settlement case. Auth emulator lifetime is supplied by the launcher.

The actual Stripe SDK makes exactly two validated GET requests for the fixed
session, once per settlement call. The actual native settlement creates Paid
order/invoice, original manifest, two queued jobs and two queue ledgers in one
commit. #490 compares exact native seconds/nanoseconds, then requires replay to
return false and leave all six updateTimes and exact jobs unchanged. Only after
native cleanup and provider/Admin teardown can the child emit nativeExecution
and cleanupVerified. The launcher repeats the case in the same emulator lifetime.

Run with the explicit pinned Firebase 15.30.0 and Java21 paths documented in
`printing-native-intent-launcher.md`. The command requires a clean committed
checkout; unit contract tests do not establish a native result. CI, independent
review, deployment, Claude acceptance and physical output remain separate.
Production data, secrets, rules, flags, output, hardware and Wolt are untouched.

## Recorded native result

Actual local source `c7565407cfa2498ed4dbcddb6af2647885f40d90` passed twice in one Auth/Firestore emulator lifetime. Each pass used two installed Stripe SDK loopback requests, compared six native updateTimes, observed two original jobs and unchanged replay, and verified registered native cleanup. This is actual native software integration evidence, separate from unit tests. No Auth user was created by this webhook case, and authenticated browser/staff-payment and physical print are not claimed.

The first actual attempt correctly rejected the old proof fixture's persisted queue revision 0. Canonical stored queues require positive revisions; #490 was corrected to seed revision 1 and require the settlement delta to revision 2. Production validation was preserved. Fresh current-head CI/review remains required after that correction.
