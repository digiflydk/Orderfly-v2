# Superadmin printer credential panel

Issue #488, dependent on POST #368 and metadata GET #375. The existing superadmin overview mounts the panel from a fourth **Printeradgang** row action under its actual edit-location grant. The root-authorized integration preserves Edit/Deactivate/Delete, the default table, filters and scrolling. A changed filter/page/revision, revoked grant or lost session unmounts the panel immediately; another editor cannot open alongside it. No merchant page exposes the panel. This software integration is not proof of completed native provisioning or physical printing.

## Existing API boundary

`PrinterCredentialsPanel` accepts the selected printer's actual `brandId`, `locationId`, `printerId` and `printerRevision`, a current row edit permission, and session-loss/close callbacks. Client permission prevents accidental operations; the existing platform-superuser API and native same-transaction policy remain the authority. No service or endpoint is duplicated.

Opening the panel performs only the existing no-store GET `/api/superadmin/printers/device-credentials` with the three scope IDs. The returned printer revision must match the selected row; credential revision, state and false authority flags must match the strict API contract before any action appears. Changed row revisions require a refreshed overview. No credential metadata or secret is added to the public printer DTO.

Missing metadata offers **Opret printeradgang**. Current/stale metadata offers explicit rotation or revocation. Revoked metadata offers rotation. Every operation first enters a confirmation view, then makes exactly one POST with the selected row revision and the freshly read credential revision. A synchronous request lock prevents duplicate confirmations; cancellation only cancels the confirmation before a write. No mount, read, retry, or failed response initiates a write.

POST success must have the exact expected status, scope, printer revision, next credential revision, revoked state and literal false dispatch/activation flags. Issue/rotation requires a canonical 43-character secret; revocation must contain none. Extra fields, foreign scope or malformed results fail closed. Responses are bounded to 8192 bytes before JSON parsing; provider body/error text is never rendered.

## One-time delivery and recovery

Only a valid committed issue/rotation response displays username `orderfly` and its secret. They live in the mounted panel's local controller state. No local/session storage, URL, automatic clipboard, log, screenshot, download, or secret recovery feature is used. The visible secret is selectable for the operator's explicit manual copy. Hiding it, closing/unmounting, changing scope/revision, or losing the row permission clears the controller reference and prevents obsolete responses from displaying it. This is reference disposal, not a promise to zero immutable JavaScript strings or erase a copy the operator already made.

A pending write displays no secret. The close button is disabled while its response is pending. Unmount still aborts the local request and discards its response; abort does not prove that a server transaction failed. A failed/lost/unknown response therefore requires a metadata read and a fresh explicit confirmation. If the operation committed but its response was lost, metadata shows the current revision and offers rotation, never retrieval. A 409 also discards the old metadata so it cannot be blindly resubmitted. Default-off configuration writes receive an honest disabled message.

Each panel instance owns its requests. The next scope or permission state gets a fresh controller immediately, preventing a one-frame render of an old row's secret. React StrictMode cleanup/setup starts a fresh empty lifetime; an old aborted request cannot match the new request. No global secret cache exists.

## Tests and release boundary

`tests/unit/printing-device-credentials-ui.cjs` exercises the actual controller: scoped GET, required confirmation, missing/current/stale/revoked operations, auth/permission denial, exact response validation, pending lock, secret disposal, old-request isolation, strict revision CAS, unknown outcome and explicit recovery, oversized/invalid UTF-8 bodies. Its browser case bundles and renders the actual React panel and overview under StrictMode, exercises real clicks with synthetic API fixtures, checks the existing nine table headers and three actions, row scope without selected filters, filter/permission secret removal, and empty browser storage. It is component proof, not real login/native persistence/production QA.

The metadata dependency is also exercised through the actual exported route `GET`, its HTTP adapter, the native read-only metadata service and the actual credential controller in one test. Only session and Admin database I/O are fixtures; no successful metadata response is fabricated. The route must export `GET` before this test can run, so a POST-only route cannot pass merely because the browser fixture supplies metadata. Native missing/current/revoked/stale records must enable the corresponding explicit confirmation; a stale row revision, rejected session or foreign native location must leave the controller unable to proceed. The test also asserts no writes, native scope-before-private-read behavior, no-store/Cookie headers and no plaintext exposure. This software test is distinct from a real Firestore emulator run and authenticated production QA.

Commands:

```sh
npm run typecheck
node --test tests/unit/printing-device-credentials-ui.cjs
```

The browser test requires the repository's official pinned Playwright Chromium. Missing local Chromium is a blocked browser run, not a skipped acceptance or a reason to loosen assertions. Root registers the dedicated test in the existing browser-enabled CI only after inspection; this lane does not edit workflow permissions or install an alternative browser.

Current-main ancestry, exact-head CI, independent completed Codex review, root's serialized merge/deploy with actual `/api/health` SHA, and Claude's applicable acceptance remain separate. POST/GET dependencies must actually be released first. The candidate now genuinely includes the existing #375 GET implementation instead of introducing a second endpoint; release remains blocked until #375 is on actual main and the combined head is refreshed and reviewed. All configuration/output gates stay OFF; no production writes, real provisioning, activation, printer requests, firmware changes, physical print or Wolt changes are performed by this implementation.
