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

## Kitchen ticket (issue #537)

System → Kvitteringer has separate **Kundekvittering** and **Køkkenbon**
views. `/superadmin/receipts?type=kitchen&brandId=…` edits the kitchen layout;
printer rows link to it. Sales list/detail actions open **Vis køkkenbon** at
`/superadmin/sales/orders/[orderId]/kitchen-receipt` using the same native order
access checks as the customer receipt. Switching type uses native navigation so
unsaved-change protection remains effective.

The kitchen ticket has no prices, fiscal totals or payment identifiers. It uses
recorded order lines, toppings and combo selections, not immutable invoice lines
(which intentionally omit production selections). Quantities, fulfillment type,
Copenhagen fulfillment time, status, notes and modifiers cannot be hidden. A
canceled order carries an explicit do-not-prepare banner. Missing time/quantity
is marked unknown rather than invented. Combo children show total component
quantities across all ordered menus, labeled **Menuindhold i alt**. Separate order
lines with different customizations are never merged. Strings remain React text.

Current category headings are resolved through a bounded, read-only native-scope
transaction. Product and category must belong to the authorized brand/location;
missing, inactive or foreign catalog rows do not remove saved food lines. Their
headings fall back to Varer (or Menuer for explicit combos). Optional catalog
lookup failures after successful scope authorization also use that fallback;
authorization failures (including a failed retry) still reject. Category labels are
current presentation metadata, not historical invoice facts. No channel or
station is guessed from analytics, product names or printer configuration.

New checkout orders snapshot the already validated customer phone in
`customerDetails.phone`. Kitchen preview reads only that saved field, only shows
it when enabled, and does not consult mutable customer profiles. Older orders
without the snapshot show no phone. The explicit guest receipt projection remains
unchanged and does not expose this new field. Only recorded delivery instructions
are shown as notes; no inferred allergens or cooking instructions are generated.

Both 58 and 80 mm layouts support normal/large text, category grouping and optional
brand/location/customer/phone. The example contains fictional data. Real CSS and
Chromium tests verify widths and wrapping on a 375px viewport, including long
unbroken item names/notes. `receipt-kitchen-*.cjs` covers auth/CAS isolation, category
scope, actual checkout phone snapshots/guest exclusion, route denial and editor
save/conflict/stale responses. All run in the existing `receipt-*.cjs` CI gate.
Local browser tests may select an installed Chromium via `CART_CHROMIUM_PATH`;
CI uses the pinned Playwright installation and does not skip any assertions.

This adds online kitchen layout and preview, not physical print dispatch. Existing
fixed synthetic testbon output, Wolt printer configuration and output activation
flags remain unchanged. Physical fit and normal-order kitchen printing must be
qualified separately before claiming end-to-end printing is ready.


### Automatic customer receipt company details (#542)
Customer preview reads `brands/{brandId}` within the existing freshly authorized receipt-settings transaction. Only companyName (fallback name), companyRegNo, street/zipCode/city/country and a valid HTTPS logoUrl are projected. Editor GET and successful PUT return this read-only `brandIdentity`, never persisting it in settings/audit. The selected-brand editor uses it with fictional order lines; brand switches and stale responses use the existing generation guards. Company details are edited at their brand source, not duplicated in receipt address settings. Existing legacy address values remain stored for compatibility but do not override or duplicate authoritative company addresses.

Actual orders without an invoice use this authorized company identity. Issued invoices retain their immutable seller name/CVR/address; the current brand logo is presentational. Missing company name/address/CVR are explicitly marked; missing or non-HTTPS logos are omitted. No physical output, fiscal snapshot, production data or access policy is changed. Verification: receipt-settings projection/scope tests, receipt-preview invoice preservation and actual Chromium editor brand-switch/save/recovery regression.
