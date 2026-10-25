# Genprint from sales order receipts

The sales order kitchen receipt and customer receipt pages expose **Genprint** to platform superusers. Viewing either preview performs no print mutation. The control loads printers only for that order's authorized brand and location through the existing scoped printer-read API, and offers active CloudPRNT HTTP printers. A single eligible printer is selected automatically; multiple printers require a choice.

An explicit click posts only order/scope identifiers, receipt kind, printer revision and a generated UUID request identity to `/api/superadmin/printers/reprint`. It never submits browser-rendered content, a price, a customer record or printer credentials. The server owns authorization, authoritative receipt data and dispatch eligibility.

The physical printer must have paper and use **Live URL**. The preview page is not the browser print dialog. The UI warns when the observed printer connection is missing or still uses Test URL.

## Result and duplicate handling

- The button is guarded synchronously against repeated clicks while a request is pending.
- A queued/offered/download-started result triggers read-only status checks every five seconds. **Opdater printstatus** performs the same read without submitting another job.
- Only `confirmed` is presented as the printer having reported a successful print. Queueing and transfer are not reported as physical success.
- When an enqueue response is lost, **Prøv samme genprint igen** retains the exact request ID and target; the backend's idempotency prevents a second job. It does not create a new ID on a retry.
- Failed, expired or unknown output calls for checking the paper. The control does not silently dispatch another copy.
- After a confirmed result, **Genprint igen** is a separate, explicit extra-copy request with a new identity.
- An order/scope change aborts reads and ignores obsolete responses. Cross-scope printer lists or result metadata fail closed. Session/access errors disable further requests.

The component keeps request state only in its mounted page; it does not put receipt contents, credentials or print tokens into browser storage.

## Local verification

`tests/unit/receipt-reprint-controls-browser.cjs` runs the real component in an isolated local browser with mocked native API responses. It checks both receipt kinds, one/multiple printer selection, no automatic writes, double-click protection, queued-to-confirmed status, same-ID recovery after a lost enqueue response, a new ID for a deliberate extra copy, obsolete-scope rejection, forbidden/foreign responses, and unknown-result handling. No production order or print job is created by the test.

`tests/unit/receipt-reprint-pages.cjs` executes both server page functions with external reads replaced by fixtures. It verifies authentication happens before the order read, printer control props come from the authorized order, read-only users see only the preview, and authentication/missing-order failures never expose the control. The browser scenario also covers no eligible printers and an expired session.
