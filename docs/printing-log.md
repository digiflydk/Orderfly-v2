# Superadmin Print log

Issue #611 adds **System → Print log** at `/superadmin/print-log`.
Only a verified platform superuser can open the page or read its API.
Select a brand to browse automatic print jobs and manual reprints across its
locations and printers. The sole brand is selected automatically. Order links
open the relevant receipt view. Browsing and refresh never create print jobs.

## Status and scope

The log reads existing `jobs`, `ordinaryDispatches`, `expiredPrintJobs` and `manualPrintRequests`
under brand-owned location printers. A dispatch supersedes its queued record.
Disabled and soft-deleted printers remain included while their configuration
exists. The permanent automatic-print policy additionally archives proven unsent stale jobs
as metadata-only `expiredPrintJobs`, visible as expired. No index migration is needed.

Statuses distinguish queued, offered, download started, protocol-confirmed,
reported failure, unknown outcome and expired offers. Confirmation means that
the printer acknowledged the job; it is not independent observation of paper.
A download without timely confirmation becomes unknown. Generic failure text
does not invent hardware diagnostics that were never recorded.

This is a print-job log, not an audit of every checkout: orders suppressed before
a job was created and synthetic pilot test receipts are outside this view.
Historical records already deleted cannot be reconstructed. The read endpoint
does not change automatic-print activation or menu policy. See
[brand automatic printing](printing-automatic-print.md) for permanent activation.

## API and bounded reads

`GET /api/superadmin/print-log?brandId=…&limit=25&cursor=…` returns
`{ items, nextCursor }`. Rows contain order, brand, location/printer names and IDs,
receipt type, automatic/manual source, status, creation/update times and safe
error text. Credentials, receipt payloads, customer information and actor IDs
are excluded through database field selection and explicit response projection.
All responses are non-cacheable. Brand ownership is validated independently
for locations, printer configurations and job records.

The reader merges descending per-printer collection queries with deterministic
document-path tie breaks. Automatic dispatches use offer time; queued/manual
jobs use creation time. The cursor advances over scanned records, including
hidden queue duplicates, so a page may have fewer than 25 visible rows.
Refresh restarts at the newest page. This is a live view rather than a frozen
snapshot: concurrent dispatch or configuration changes may alter later pages.

Reads are bounded to 50 locations and 50 printers per selected brand. Exceeding
the scope returns an explicit error rather than silently presenting an incomplete
log. Each source query reads at most page size plus one, without receipt images.
The UI displays timestamps in Europe/Copenhagen and contains table scrolling
within the page on mobile.

## Validation and release

Run `node --test tests/unit/printing-print-log*.cjs`, `npm run typecheck` and
`npm run build`. Browser regressions exercise selection, pagination, status
labels, errors, stale-response isolation, brand isolation and mobile overflow.
The same focused tests are included in CI.

Release follows AGENTS.md: local checks and independent review, exact-head CI
and completed Codex review, current-main merge, green merge CI, active release
verified through `/api/health`, then authenticated read-only live verification.
Do not create a print job as part of this release check.
