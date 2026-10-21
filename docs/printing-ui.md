# Printer overview (P4.1a, #310; superadmin pilot #325)

PO scope correction 2026-10-21: printer administration is currently available
only to platform superusers at `/superadmin/printers`. The superadmin dashboard
and sidebar link here; merchant dashboards have no printer entry. The former
`/merchant/printers` page returns not-found, including for superusers.
The page checks `session.superuser` through navigation policy before loading
native catalog metadata. Delegated catalog grants alone do not grant access.
Existing `/api/merchant/printers` administration endpoints (GET/POST/PATCH,
lifecycle, queue summary and queue review) retain their URLs for compatibility
but now require `requirePlatformSuperuser` before parsing input or calling any
printer service. Existing native brand/location and transactional authorization
remain in force. Writes and physical output remain default-off. Future #318 UI
must use the superadmin workspace and preserve this pilot restriction.

After the user chooses one brand and one location, the overview calls
`GET /api/merchant/printers?brandId=…&locationId=…&limit=20`. Reads use the current
same-origin session and `cache: no-store`. There are no mutations or new backend
read semantics. Pagination follows the API's bounded ID cursor, replaces the
current page, and offers return to the first page. Refresh returns to the first
page. Brand/location changes reset pagination and clear the previous display
immediately. Aborted/late requests cannot replace a new scope's data. Foreign,
malformed or oversized response pages are rejected before displaying any row.

The cards show name, operational state, model, configured transport, paper width
and revision. **Operational state is not proof of connectivity or output.** The
read API has no verified connection-status DTO, so the overview explicitly shows
`Ikke verificeret` and explains that it cannot establish online state or a printed
receipt. Transport is configuration, not verified firmware capability. No testprint,
queue receipt, resume, configuration edit, credentials or output activation is
included. All feature gates remain unchanged.

Loading, no authorized locations, no selected scope, empty successful page,
expired session, forbidden response and unavailable/malformed response each have
an explicit state. Raw provider errors and payloads are never displayed.

## Verification and release

- `node --test tests/unit/printing-ui-page.cjs tests/unit/access-navigation.cjs tests/unit/merchant-admin-portal.cjs`
  exercises actual page rendering, permission denial, native catalog permission,
  selector projection and unavailable/forbidden handling.
- `node --test tests/unit/printing-ui-browser.cjs` bundles the actual client and
  production CSS, with synthetic authorized selectors/API responses. It verifies
  desktop and 375px mobile rendering, no horizontal overflow, scoped GET and
  pagination, status separation, loading/errors/retry, empty/malformed/foreign
  pages and late response protection. Screenshots are written under `test-results`.
  These are fixture browser tests, not a real authenticated production session.
- `npm run typecheck`; run existing printing read/navigation regressions.
- CI runs the server/page tests and the Chromium browser test. Exact-head CI and
  independent Codex review are required before the coordinator serializes merge
  and deploy under AGENTS.md. Public release smoke does not prove authenticated
  UI acceptance. After verifying the deployed commit, check the live
  `/superadmin/printers` login boundary read-only. Success/forbidden scope UI QA
  remains blocked until a safe authorized session is available. No unattended
  production data writes are required. Physical printer QA remains separate.
