# Brand automatic printing

Issue #613 adds **Brands → edit brand → Print indstillinger → Automatisk print**
for platform superadmins. Save is separate from the brand form. The setting
applies to new supported orders across the brand's locations using their saved
kitchen-printer routing. Enabled automatic printing has no 60-minute window.
It requires active Star CloudPRNT HTTP printers and current device credentials.
Ordinary products are supported; unsupported menus/combinations still require
an explicit manual kitchen reprint. A completed checkout does not guarantee
that an automatic job was eligible or physically printed.

## Activation and access

`GET /api/superadmin/printers/automatic-print?brandId=…` reads the setting.
`POST` takes `{ brandId, enabled, expectedRevision }`. Both require a verified
platform superuser, rechecked transactionally. Writes use revision comparison
and an audit record. Responses expose only brandId, enabled, revision and
enabledAt; no device credentials. Stale tabs must reload before overwriting.

Configuration lives at `brands/{brandId}/printSettings/automatic`, with audit
records in `printSettingsAudit`. No saved record means permanent printing is off
and existing supervised test behavior remains available. The UI calls this
**Ikke indstillet** and permits an explicit OFF save. Saved OFF overrides old
supervised settings. Saved ON uses current saved routing independently of the
old test window. Existing global feature gates remain required.

Each activation receives a random generation ID, propagated through the
original intent and queued job. Production and fresh delivery recheck the
current setting. Switching OFF prevents new automatic output. An already
started download cannot be recalled; verified acknowledgements can still be
recorded. Switching ON does not replay old orders or prior-generation jobs.
Manual reprints remain explicit and independent of this setting.

## Queue and print log

The existing delivery lease and unknown-outcome duplicate protection remain.
Unsent jobs older than five minutes, or from a previous activation, are archived
on authorized permanent-printer polling. Archival is bounded to 50 jobs per
transaction and updates the queue ledger atomically. Any claim, dispatch,
history or active pointer prevents this unsent-only archival path. Archived
metadata appears as expired in Print log without retaining receipt contents.

A separate cleanup path clears an expired offer only when its matching claim,
queue job and ledger prove that download never started, with no delivery,
result or original-history evidence. It preserves claim/dispatch/token evidence
and archives the job without retrying it. Downloaded or ambiguous work remains
protected against automatic replay. Archived original identities also prevent
checkout retries from recreating the expired job.

Print log remains a job log: an order suppressed before job creation has no row.
Enabling the setting does not backfill ORD-668367 or other historical orders.

## Validation and release

Run the automatic-print, unsent-expiry, print-log, original-intent, settlement,
ordinary transport and result regressions, the real Playwright settings test,
`npm run typecheck` and `npm run build`. Include isolation, authorization,
revision conflicts, activation changes and ambiguous-delivery cases.

Follow AGENTS.md exact-head CI and completed Codex review before merge. Verify
merge CI, Firebase rollout, active `/api/health` release and the authenticated
brand settings page. Release checks are read-only: do not enable the setting,
replay an order or send a print job as a test. Physical printing is not proven
by software tests or printer connection status.
