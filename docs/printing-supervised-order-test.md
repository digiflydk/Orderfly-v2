# Supervised purchase printing (#549)

This release connects original kitchen print intents to CloudPRNT HTTP during an explicitly supervised test window. It does not certify unattended production operation or close the hardware-source work in #485. Target for the first physical acceptance is the PM's Star mC-Print3 with 80 mm paper, no longer used for Wolt.

## Operator flow

1. Register and activate the printer, then provision its current device credentials using the existing protected controls. Configure the physical printer with the displayed **CloudPRNT-pilotadresse** and a polling interval of at least five seconds.
2. Run the existing supervised synthetic qualification, including actual installed firmware >=3.2 and the installed paper profile. Print the synthetic testbon.
3. Use **Opdater testbonens status**. Printer acknowledgement is displayed independently of human paper inspection. An offered/downloaded/unknown job cannot be silently retried or replaced.
4. Save exactly one include-all kitchen routing rule for this printer through the existing routing editor, without delivery-type filters. The first printed purchase must contain ordinary products, not combo/menu lines. Combo orders retain normal checkout without a partial printed ticket during this supervised test. Existing unrelated original-intent policies are not overwritten by the start operation.
5. After the synthetic job is confirmed, **Test køb med automatisk køkkenprint** offers status and three explicit confirmations: inspect width/Danish characters/cut, confirm unchanged device/firmware/paper, and remain present supervising the purchases. Start within one hour of the synthetic acknowledgement. One test window is allowed per printer record, without automatic reset or renewal.
6. Change the physical printer URL to the displayed **CloudPRNT-ordreadresse**, retaining its current protected credentials. Never put credentials in the URL, a public issue, screenshot or log.
7. Complete a controlled purchase using the normal checkout/payment or pickup workflow. The existing payment/acceptance transaction prepares the original manifest and kitchen job. The printer receives immutable PNG content, with durable delivery ownership before response bytes leave the server. Inspect the physical paper separately.
8. Use **Stop ordretest** when finished. The window also expires after 60 minutes. Failed, uncertain, expired or duplicate downloads require investigation, not an automatic reprint. A failed/uncertain delivery stops the printer's ordinary queue.

## Server configuration and effects

Required runtime flags, all explicit: `ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true`, `ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED=true` for synthetic output, `ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED=true` for supervised real-order delivery, and `ORDERFLY_PRINT_INTENTS_ENABLED=true` for the existing settlement/acceptance producers. This implementation does not change hosting flags or production records. No hardware facts are prefilled as verified.

The start service requires authenticated platform-superuser access and a fresh location edit grant inside the write transaction. It checks native brand/location, active HTTP printer, current credential/config revisions, consumed synthetic qualification, canonical content digest, confirmed synthetic job and the recorded supervised firmware query. A browser checkbox alone cannot create a window. Its trust is explicitly `supervised_order_test`, with `unattendedAuthorized:false`; the operator's paper observation is recorded as an operator statement, not manufacturer attestation.

Start atomically creates `printers/{printerId}/orderTestWindows/current`, an immutable `orderTestAudit/{qualificationId}-start` record and `locations/{locationId}/printIntentPolicies/original` with `supervisedOrderTest:true` and the single kitchen target. It requires existing saved include-routing rules and rejects an existing original-intent policy. No generic production capability record is created. Stop writes its timestamp and audit; it remains available when the output gate is switched off, provided configuration writes are enabled. GET control/status never changes these records.

The intent policy checks the window and current credential/printer state before returning test targets. The start records the verified routing revision; changing routing disables new test intents. Disabled, stopped, stale or expired windows become effectively OFF for new purchases. Every CloudPRNT operation freshly checks native credentials, scope, profile, current revisions, window and its independent default-off gate. Jobs predating the window are not released. No poll can extend a window.

## HTTP and durable delivery

- Admin `GET/POST /api/superadmin/printers/order-test`: scoped status, explicit start, explicit stop; same-origin mutation and bounded JSON, no credentials returned.
- Printer `POST/GET/DELETE /api/cloudprnt/{brandId}/{locationId}/{printerId}`: ready offer, one download, exact protocol result. POST retains the original authenticated no-job behavior with the order-test flag off. HEAD never delivers bytes.
- Offer stores immutable raster content and current qualification/revisions, with a one-minute delivery deadline.
- Download atomically transfers the queued job to a delivery envelope, writes terminal original identity and updates queue metadata. A second GET is rejected, including after an uncertain/lost response.
- An authenticated exact success confirmation updates recorded print usage and releases the current pointer. Repeated identical confirmation is idempotent; incompatible results fail. Failure/unknown preserves the stopping pointer.
- Settlement replay checks terminal original identity as well as pending jobs, so a transferred original is not queued again.

PNG rendering and simulated protocol results do not prove physical compatibility. Delivery uncertainty may mean paper printed despite no confirmation. This implementation favors manual investigation over duplicate food production. Initial product-only projection rejects unsupported combinations rather than silently dropping their components.

The initial physical PNG uses the existing basic kitchen raster layout, including order reference, fulfillment/time, product quantities, literal modifiers and saved kitchen instructions. It does not yet reproduce the configurable online kitchen-preview layout, category bars, customer header or combo groups. Product selection is checked against the accepted manifest; fulfillment time and kitchen instructions are captured from the saved order when the immutable offer is created. Subsequent downloads never re-render from a changed order.

## Verification and outstanding acceptance

Run `npm run typecheck` and the relevant printing native/HTTP/outbox/settlement tests. Browser coverage includes pilot recovery/status, both nonsecret URLs and the supervised-window control. CI and independent code review are release gates. Physical acceptance remains open until real setup, synthetic paper inspection and a controlled purchase succeed on the installed device.
