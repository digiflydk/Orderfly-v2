# Online receipt preview

Sales/order rows and the order detail header expose **Vis kvittering** at
`/superadmin/sales/orders/[orderId]/receipt`. The server authenticates before
lookup, reuses `getOrderDetails` native brand/location `orderfly.orders:view`
authorization, and reads receipt settings with the same permission. An order
preview never creates a print job or consumes a device download/session.

`projectReceipt` constructs an explicit display-only object. PSP identifiers,
payment references, analytics, customer IDs and customer addresses are not passed
to the component. Optional customer name/contact and delivery instructions are
displayed only when the corresponding saved setting is enabled. React renders
all strings as text.

When an immutable invoice exists, its seller, invoice number, currency, lines,
discounts, fees, VAT and total take precedence over current order fields. Invoice
seller identity remains visible regardless of decorative brand/location toggles.
Historical invoice lines do not acquire potentially changed modifiers from the
current order. Current order status, payment status and refunds remain visible.
Without an invoice the page explicitly identifies the information as registered
order details; it does not imply payment occurred. Unknown VAT is not invented.

The page uses the currently saved presentation settings, so it is not an archived
copy of an earlier paper receipt. Physical printer rendering remains separately
verified through the fixed synthetic testbon. The editor's synthetic example is
clearly separate from both real order information and device output.

System → Kvitteringer at `/superadmin/receipts` edits brand-scoped optional
presentation fields with a live synthetic example. Saving explicitly persists the
layout for subsequent online order previews; this does not implement or activate
ordinary order printing. Printer setup links here and individual printer rows
preselect their model and paper width. The fixed testbon panel uses authenticated
`GET /api/superadmin/receipts/testbon?model=mc-print3&paperWidthMm=80`.
It returns the exact canonical PNG from `createSyntheticTestBonContent`, using
synthetic preview bindings that do not appear in the pixels. It does not look up
devices, create jobs, consume downloads, start pilot sessions or require output
flags. All three supported model/width profiles are tested. Authentication runs
before strict query validation and responses prohibit caching.

Validation: `node --test tests/unit/receipt-preview.cjs` exercises immutable
invoice precedence, unpaid/refund states, missing timestamps/VAT and the data
allowlist. `tests/unit/receipt-editor-browser.cjs` exercises the rendered shared
preview and optional fields alongside editor save/conflict behavior. Release
requires the repository's typecheck, applicable CI/browser tests, independent
review and post-deploy read-only verification. No production writes are needed
to inspect an order preview.

The CI receipt suite is `node --test tests/unit/receipt-*.cjs`, including real
Playwright editor and fixed-testbon component tests. Failed browser installation
is an environment blocker, never a reason to skip the browser gate.
