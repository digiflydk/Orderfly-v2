# Fixed native intent proof launcher (#511)

`node scripts/local-qa/run-native-intents.cjs` starts the existing fixed
`demo-orderfly-qa0` Auth/Firestore emulator lifecycle and invokes only
`native-intent-smoke.cjs` twice in that same lifetime. It does not start Next.
The fixed child owns a synthetic Stripe loopback provider on port 3100, actual
source settlement and registered fixture cleanup. The launcher takes no module,
callback, environment, port or command arguments. Browser/metadata proof modes
are rejected before loading the existing runner.

The reused launcher requires explicit installed Firebase CLI 15.30.0 and Java 21
paths, unused fixed ports and a checkout without development dotenv files. Child
environments come from the reviewed intent environment builder, retain the
network preload. The guarded source bridge consumes the compile-time server-only marker and uses Next's installed bundled React.
No provider key, production credential, proxy, output or dispatch flag is inherited.

Every pass must exit successfully and return bounded JSON with actual native
execution and verified cleanup, while production and physical acceptance remain
false. A failed or stalled child, oversized output, malformed evidence or second
pass contamination rejects the whole run. Emulator/child teardown runs on every
path. Ordinary QA0/backend and browser commands retain their existing behavior.

Dedicated tests exercise actual launcher code with external process/network I/O
isolated. These lifecycle tests are not native evidence. The combined #511 tree
must run the real fixed child twice against real emulators, pass current CI and
independent review before release. No production data or printer output is touched.
