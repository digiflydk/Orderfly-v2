# Dully in Feedback administration

`/superadmin/feedback/dully` is a tenant-protected feature within Orderfly's existing Feedback module. Navigation is available from Feedback's sidebar and settings page. The server page uses the authenticated feedback scope and lists the supported Esmeralda brand and its active locations. Other brands see an explicit unavailable message; the fixed test recipient must not be reused for another tenant.

The screen separates source setup, import, test approval and customer sending:

- Source setup binds a stable operator-chosen Dully account reference and restaurant reference to the selected brand/location. These are explicit mapping references, not claimed to be provider API identifiers. The operator must verify the Dully account/restaurant and use the same restaurant reference in every import. A saved mapping is not editable through this screen.
- Imports accept bounded normalized JSON, at most100 rows and500,000 characters, with client-side read-only preview before submission. Backend schema and identity validation remains authoritative. Editing the pasted input invalidates preview. Import never creates a sales order or directly sends customer mail.
- The test action has no recipient field: the backend controls the fixed `ok@esmeraldapizza.dk` recipient. Reusing an existing test is idempotent, and UI wording does not imply a new mail was sent. Provider acceptance is explicitly distinguished from delivery.
- User confirmation that the test was received and the form checked is separate from enabling daily customer sending. The confirmation checkbox cannot be selected until the server reports the test accepted. Backend authorization and approval remain authoritative even if a client is modified.
- The existing brand-level customer feedback email switch remains authoritative. When it is off, the view explains that customer sending is stopped and links to Feedback settings without changing that setting. Daily activation is disabled, while a deliberate test to the fixed test address and pausing remain available.
- The schedule displays21:00 Europe/Copenhagen every day. Pause preserves pending orders. The page states clearly that Dully data must be imported: it does not claim an automatic provider API connection or unattended login is operational.
- Status refresh follows mutations. A successful write remains reported successful if a follow-up read fails, with further writes disabled until status is refreshed. Transport failures preserve pasted input and never automatically retry potentially consequential mutations.
- Switching tenant/location clears local drafts, mapping and confirmation. Request generations prevent an earlier read from populating another selection.
- Counts cover the displayed latest500 source rows, not all historical activity. Older history is disclosed when the server returns `hasMore`. Test mail counts are excluded. Uncertain acceptance requires reconciliation instead of blind resend.
- History separates the last verified Dully import time from worker status updates and shows the stable external Dully order ID. A closed set of safe waiting reasons explains paused, unapproved, master-disabled, stale, ineligible, pending or uncertain/failed sending without exposing raw infrastructure errors. Pending customer source records must be refreshed from Dully when their last verification is over24hours old.

Dully responses use `dully_order` in the inbox, detail view and quality report. They have a separate filter and count and do not count as online sales orders. Their details do not link to an Orderfly sales record or try to resolve a fabricated commerce customer. Test responses are stored separately by the backend and do not enter report counts.

## Verification

`CART_CHROMIUM_PATH=<chromium> node --test tests/unit/dully-feedback-browser.cjs` bundles the production React view, with synthetic action transport and no production I/O. It checks the complete approval/enable/pause interaction at320px, preview-before-import, no side effects on initial load, pending/accepted test states, preserved JSON after transport failure, no automatic retry, tenant reset, read-only permissions and desktop/mobile overflow. This is not proof of live provider delivery or Dully data acquisition.

`node --test tests/unit/feedback-report-public.cjs` includes Dully versus commerce source isolation alongside existing access, metrics and report regressions. Run the TypeScript check and backend suite as part of integrated release verification.

Production customer sending stays paused until the controlled test is actually sent and the user explicitly approves it. Deployment alone is not test acceptance.
