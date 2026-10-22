# Native credential metadata acceptance proof

Issue #504 strengthens #375 software acceptance with the actual Next route,
Firebase Auth sessions and native Firestore emulator persistence. It does not
provision a real device or assert authenticated production acceptance.

Run from a clean checkout with the existing official QA0 tools:

```sh
QA0_FIREBASE_BIN=/tmp/orderfly-qa0-tools/node_modules/.bin/firebase \
QA0_JAVA_BIN=/tmp/orderfly-qa0-jre/jdk-21.0.12.1+1-jre/bin/java \
QA0_CREDENTIAL_METADATA_PROOF=true node scripts/local-qa/run-backend.cjs
```

The existing launcher owns one fixed `demo-orderfly-qa0` Auth/Firestore/app
lifetime, sanitized child environment, loopback network guard and two passes.
Only the exact opt-in flag selects metadata proof; ordinary QA0 is unchanged.
The selected child environment explicitly sets configuration writes false;
print intent/output declarations remain absent and disabled. No Chromium is
needed for these real HTTP/session/persistence tests.

The authoritative backend seed owner supplies its real ephemeral admin and
merchant cookies, native client and fixed fixture IDs. The proof registers the
single credential document before any fixture write; the owner recursively
cleans only its created locations and explicitly verifies the credential path
is absent, then verifies created Auth users are removed. Cookies and native
private values are never logged or stored in evidence.

The real GET covers missing/current/revoked/stale states, revoked precedence,
current printer revisions, anonymous and merchant denial, foreign native scope,
duplicate/unknown fields, malformed/future/foreign credential rejection,
no-store/Cookie Vary and exact bounded DTOs without digest/secret/timestamps.
Every GET is bracketed by native snapshots of printer/credential data and
update times; either changing makes the proof fail. Fixture seeding and revision
changes happen only through the explicit isolated seed owner, never via a
production endpoint or enabled configuration gate. The original disabled
printer revision is restored before returning to the owner.

`tests/unit/local-qa-credential-metadata.cjs` checks fail-closed resource/runtime
and response boundaries. Those source checks are separate from the actual
two-pass native result. A passing preflight or mocked resource test is not a
passing native proof. Final safe evidence reports software-only outcomes,
read-only request count, two passes and cleanup; no production or physical-print
acceptance is inferred.

## Recorded execution

The first actual run passed two same-lifetime passes, each with 16 read-only GETs
and seven state cases, plus verified native and Auth cleanup. Final hardening adds
invalid-cookie and malformed-digest rejection, bringing each final pass to 18
GETs. The exact final candidate is rerun after commit; its issue checkpoint
records the commit and final result. Unit/source checks remain separately labeled.
