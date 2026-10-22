# QR acceptance in GitHub Actions (#389 / #449)

`QR native acceptance` reuses `tests/local-qa/qr-run.cjs` and its existing
fixture, unchanged. It runs the real Next application, Auth and Firestore
emulators, native session verification, scoped manager/viewer users, API and
browser login, persisted QR create/edit/replay/conflict, mobile and bot GETs,
no-write HEAD, analytics/history, downloaded PNG decode, pause and cleanup.
Two complete cycles share one emulator/app lifetime. The existing loopback
network guard and fixed `demo-orderfly-qa0` project remain mandatory.
The job receives no production credentials. Its output explicitly separates
native/browser acceptance from production and physical scanning acceptance.

The workflow runs on the relevant PR and main changes, and can subsequently be
started with Run workflow on main. No new GitHub permission or secret is added.
Java 21, the pinned Firebase CLI 15.30.0 and the repository's locked Playwright
are provisioned on the runner. Protected emulator/application logs are not
uploaded; they can contain test session material. Safe checks and fixed failure
phase codes remain in the job output.

## Production checkpoint, read only

Only main push/manual runs use the already configured
`FIREBASE_SERVICE_ACCOUNT_JSON`, in a separate job. The script issues one
authenticated GET to `orderfly-39325` document `qrMaintenance/retention-v1`
with a field mask. It never requests the internal cursor or prints lease
tokens, credentials, raw provider errors or arbitrary document data.

Acceptance requires schema version 1, a released lease, null last error,
safe nonnegative counters with zero errors, and a completion within the last
hour. One hour is this diagnostic's freshness threshold, not a change to the
existing heartbeat schedule. Missing/stale/busy/error/denied evidence fails
the check with a sanitized blocker, and must not be reported as verified.
The script does not call the heartbeat, run cleanup, create indexes, change
rules/grants, or write any production document. It does not prove deletion of
expired production rows or provide the heartbeat caller's response log.

## Remaining production acceptance

The repository currently has no documented configured native-user login
credential for an unattended production QR test. A service-account read cannot
replace the product's native authorization. Do not mint or impersonate a user,
create users/grants, export browser cookies, retry the rejected anonymous admin
probe, or treat emulator results as actual production scan totals.

The approved single Esmeralda QR scenario in `activation-plan.md` still needs
a usable authorized native production session, deployed release verification,
existing-record/audit search before creation, exactly the approved requests,
analytics/history and preserved paused record. No production write test is
included in this workflow. Physical camera/print acceptance remains separate.
