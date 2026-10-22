# Isolated pilot native transaction proof (#516/#517)

Run from a clean committed checkout with Firebase CLI 15.30.0 and Java 21:

```
QA0_FIREBASE_BIN=/absolute/firebase QA0_JAVA_BIN=/absolute/java node tests/local-qa/pilot-native-transaction.cjs --run
```

The fixed runner creates Auth and Firestore emulators for `demo-orderfly-qa0` on
loopback ports 9099/8088. Its child uses the existing loopback network preload,
sanitized environment, synthetic pilot gates, and explicit unusable credentials.
It refuses existing fixed seed roots and does not read dotenv or provider keys.
Two passes share one emulator lifetime and must independently prove cleanup.

The child creates a real emulator identity and Firebase session cookie. Installed
Next request AsyncLocalStorage supplies that cookie to the actual application
session and superadmin authorization code. The fixture binds Admin construction
to the actual isolated SDK database and app. It does not mock session identity,
native policy, authorization, credential verification or pilot service logic.
The request context and configured Admin binding are fixtures, so this is not a
product initialization, HTTP route, browser or authenticated production proof.

Actual qualification issuance and consumption race two native transactions; only
one can consume the nonce. The resulting qualification, canonical immutable job,
current pointer and audit must share the same native Firestore commit time.
Actual device-authenticated polling and download return the PNG only once; an
`unknown` terminal result may never become print success or automatically resend.
Assertions check plaintext nonce, device credential, delivery token and session
cookie do not enter persisted records.

The submitted physical identification and firmware capture are explicitly
synthetic fixture inputs. They are not hardware or operator qualification.
No printer connection is attempted. `physicalPrintVerified` and
`productionAcceptance` remain false in every output. The only enabled flags live
inside the disposable loopback child, never the application/production runtime.

Preflight checks both absent documents and absent descendant collections for
every fixed root before taking ownership. The native run creates its own orphan
probe under a missing parent and verifies rejection preserves it, then removes
only that exact probe version. Cleanup deletes only registered documents in one
native transaction with each recorded version checked before any deletion. It
never recursively deletes a namespace. Changed policy/brand versions abort the
cleanup; unregistered foreign descendants are preserved and prevent a clean PASS.
The native roots and descendant collections, plus real created Auth user, must
be absent before success. All tracked source/helper/launcher/guard and package
changes reject source-commit evidence. Source and unit checks alone do not establish
native execution; only the actual runner output may claim it.
