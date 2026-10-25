# Explicit manual receipt copies

The two Sales/order preview pages can request a new physical kitchen or customer receipt on a same-location Star CloudPRNT printer. This is an explicit new copy, not a replay of the original purchase event. The originals, original manifest, queue history and synthetic test records are not changed.

## Administration contract

`/api/superadmin/printers/reprint` accepts POST JSON or GET query parameters:

- `orderId`, `brandId`, `locationId`, `printerId`
- `printerRevision` (positive integer)
- `kind`: `kitchen` or `customer`
- `requestId`: UUID retained by the client through an ambiguous request retry

The endpoint requires a platform superuser and native scoped `orderfly.orders:edit` authorization. The server re-reads the order and verifies exact native brand/location ownership. Printer configuration and current unrevoked credential revisions must match. Client-provided text, prices, order status, receipt bytes and credentials are not accepted. POST requires the configured same origin and bounded JSON.

A preflight transaction checks authorization and order/printer state. The shared receipt renderer runs outside a retryable Firestore transaction. A final transaction rechecks authorization, order update time/data, printer configuration and credential revision before atomically creating the immutable PNG job, operator audit and transport pointer. A lost creation response retried with the same UUID returns the original job metadata without rendering or queuing another copy. Reusing a UUID with another receipt kind or binding conflicts.

Receipt settings are the render-time settings, like the visible preview. This is not a claim that a new copy reproduces a previously frozen physical receipt. A completed historical order is permitted for an explicitly authorized copy; it is never reintroduced into automatic kitchen-production eligibility.

## Storage and delivery

The printer's private `manualPrintRequests/{requestId}` document stores frozen PNG bytes, digest, size, actor, native binding, creation/expiry and transport status. `manualPrintAudit/{requestId}` contains the scoped request and actor without receipt content or credentials. `manualState/current` owns transport occupancy; ordinary dispatch and manual enqueue/dispatch read both transport pointers to prevent simultaneous offers. Manual requests do not enter the original queue.

Manual print uses the printer's **Live URL**. It is independent of the automatic-purchase 60-minute window: explicit per-request authority expires after ten minutes; an offer/download/acknowledgement is bounded to sixty seconds from offer. Existing `ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED` and `ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED` gates control creation; output still authenticates current native device credentials. This does not extend or renew automatic-print permission.

The public result echoes the requested binding with `jobId`, `state`, `createdAt` and `expiresAt`. It never returns PNG content, actor details or device credentials. States distinguish queued/offered, transfer started, confirmed, failed, unknown and expired. No job creation response claims physical success.

Downloaded but unacknowledged work becomes unknown and blocks a fresh copy; it is never retried automatically. Undownloaded expired work may be replaced by a distinct explicit request. A successful new copy cannot retroactively confirm an older uncertain receipt.

## Local validation

`node --test tests/unit/printing-manual-request.cjs` verifies both receipt types, server authorization and tenant binding, immutable audited enqueue, request idempotency, native changes during rendering, audit rollback, original/manual transport occupancy, uncertainty projection and HTTP/CSRF validation. Delivery and UI regressions are tested separately. Run `npm run typecheck` after all renderer and transport files are present.

Physical acceptance requires an operator's new request followed by a device acknowledgement and paper inspection. No unattended local test may mutate production or send a physical print.
