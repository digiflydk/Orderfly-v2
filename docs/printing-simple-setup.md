# Simple printer connections (#555)

## Operator flow

Superadmin → System → Printere opens a responsive printer table (#615). Each row shows the printer, brand,
location, model, configuration/connection status and latest contact. **Edit**,
**Deactivate** and **Delete** open dedicated scoped pages under
`/superadmin/printers/{brandId}/{locationId}/{printerId}/{action}`. Navigation
never writes configuration or sends print jobs. Changes require an explicit
form submit and retain existing permissions, revision checks and audit behavior.
Editing an active printer requires deactivation first; deletion preserves history
through the existing soft-delete operation. Connection information remains available.
Choose **Opret ny printerforbindelse**, then brand, location, printer name, optional
description, printer manufacturer, model and receipt width. Star Micronics
mC-Print2 (58 mm) and mC-Print3 (58/80 mm) are the supported choices. Click **Opret**.
HTTP CloudPRNT and a random technical ID are selected by the server.

One transaction creates the new printer in active configuration state, a verified
empty queue, activation metadata, a private credential digest and both audits.
This fresh-identity path does not resume an existing printer or bypass its queue
review. It rejects surviving private records at the generated ID. Existing printer activation and queue maintenance remain in
**Avanceret administration**; editing, deactivation and deletion are also directly
accessible from the main table.
No existing printer is migrated or rekeyed by deployment.

The success view supplies username `orderfly`, a masked password with **Vis/Skjul
adgangskode** and **Kopiér adgangskode**, **Test URL** and **Live URL** with copy buttons.
Copy the password into the printer before closing. It is returned once after commit,
never persisted in browser storage, logs or plaintext server storage. Reopening a
printer's **Forbindelsesoplysninger** shows its addresses and the option to explicitly
replace a lost password; it cannot recover the original password. Permission/session
loss or closing discards the in-memory secret. A pending submit cannot be repeated;
an ambiguous response requires checking the overview before any new attempt.

Use Test URL first. Live URL is available for configuration but **does not mean
permanent automatic printing is enabled**. Permanent automatic printing is enabled separately under brand **Print
indstillinger**; see [automatic printing](printing-automatic-print.md). The legacy
supervised test flow remains available when no explicit brand setting exists. Test controls are grouped under **Testprint**. Output flags are unchanged.
See [supervised purchase guide](printing-supervised-order-test.md).

## Connection status

Both CloudPRNT POST routes authenticate the current native brand, location,
printer revision and Basic credential on every request/transaction retry. After
successful authentication they record only scoped connection metadata at
`locations/{locationId}/printers/{printerId}/connection/current`. The record contains
schema version, scope, printer/credential revisions, server `lastSeenAt` and endpoint
`test` or `live`. Same-generation writes are throttled to once per 30 seconds; a
changed revision/endpoint is recorded immediately. No job or queue is touched by
this contact transaction. Incorrect or revoked credentials cannot update it.

Contact recording runs even when the corresponding output flag is off. Such an
authenticated POST returns HTTP 200 `{jobReady:false}`. When output is enabled,
existing dispatch checks run afterwards with fresh native authentication and the
same request admission slot. GET/DELETE one-shot delivery/ack semantics are unchanged.

The scoped overview reads configuration, contact and current private credential in
one read-only Firestore snapshot, returning only `connected`, `lastSeenAt`, endpoint
and server `checkedAt`. A contact within 90 seconds is **Forbundet** only while its
printer and credential revisions are current and the credential is not revoked.
Old contacts show **Ikke forbundet** while retaining the last contact timestamp.
Missing, corrupt, foreign or future contact cannot produce connected status.
A valid contact from a paused/disabled printer still means connected, not permission
to print, healthy hardware, paper present or successful physical output.

The overview refreshes every 30 seconds (paused while configuring/accessing a printer).
It also ages displayed connection evidence without relying on matching browser/server
clocks. Dates use Europe/Copenhagen. No historical contact is inferred or backfilled:
a printer initially shows no recorded contact until its next authenticated poll.

## API and authorization

`POST /api/superadmin/printers/connections` accepts a strict 4 KiB bounded JSON body:
`brandId`, `locationId`, `name`, optional `description`, `manufacturer`, `model`,
`paperWidthMm`. It requires a platform superuser, exact same-origin request and
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true`. The transaction rereads current
superuser and catalog create/edit authorization, native ownership and tenant lifecycle.
Success is 201 with `{item:{configuration,revision},username,secret}` and no-store.
Other errors are fixed private responses without input or provider details.

Optional descriptions are bounded to 160 characters in the shared configuration
schema; old records remain valid. There are no new indexes, rules, secrets, output
flag changes or production data migrations in this delivery.

## Validation and release

Run `node --test tests/unit/printing-action-*.cjs tests/unit/printing-ui-browser.cjs`,
`npm run typecheck` and `npm run build`; connection setup/service/HTTP/status tests; scoped reads,
credential, poll route and supervised synthetic/ordinary regressions; and actual
React/Playwright overview, credential, activation, pilot and order-test controls.
Browser tests exercise desktop/mobile setup, reveal/copy, both HTTPS addresses,
unknown outcomes, pending submit, permission loss and connection expiry. Existing
advanced workflow tests still run through the explicit advanced navigation. The
real isolated Firebase/browser smoke also checks the primary table before
entering Advanced administration for its existing edit/cancel and tenant tests.

PM issue #555 → feature PR → CI/Playwright → independent Codex review → PO acceptance
or AGENTS automatic merge gates → merge → deployed `/api/health` release verification
and read-only live UI verification → Done. Software test success is not physical
printer/firmware/first-print evidence. No production printer write is an unattended test.


## Firmware polling timestamp compatibility (#557)

On 2026-10-24 around 13:45–13:47 Europe/Copenhagen, App Hosting runtime logs
showed Esm-02 (mC-Print3 firmware 5.4, verified from the owner's device screen)
polling the test endpoint every five seconds with `?t=<unix seconds>` and
receiving HTTP 400. The configured URL had no query. All-query rejection ran
before authentication/contact recording. This proves server reachability,
not credential validity or a successful physical print.

POST now permits a single bounded numeric `t` cache-buster in contact, test
and order handlers. Authentication, scope, rate limits and output gates remain
required. An authenticated paper-error poll still records connection and
returns no job. No output flag is enabled by this fix. Regression coverage
includes malformed/duplicate/extra queries, revoked credentials, contact with
output disabled, and both enabled job lifecycles. Release verification must
observe actual device POST success and recent contact after deployment;
software tests alone do not establish a connected printer.
