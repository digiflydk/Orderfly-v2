# Tilvalg QA (#722)

QA uses local synthetic orders/catalogs and the actual React components. It does
not write production data, send customer messages, print, or use GitHub Actions.

## Downstream option snapshots

Canonical labels (`2 × Ost`, `Uden løg`) carry per-item option meaning. Parent
quantity remains separate. Order detail, kitchen receipts, customer receipts
without invoices, and native print routing must retain these labels verbatim.
The merchant terminal previously prepended `+` to every modifier, including
removals. It now renders the saved label directly.

Regression coverage checks exact labels in the actual terminal dialog, unchanged
parent quantity, no payment/status mutations, native scope validation and print
routing without dispatch permission, and unchanged saved customer totals.

Fiscal customer receipts with immutable invoices still use invoice descriptions
and amounts; those existing invoice lines do not contain separate modifier
metadata. Kitchen receipts use order selections independently. Native print
routing retains its existing eight-modifier bound and fails closed beyond it;
this QA change does not widen printer contracts.

## Local validation

- `npm run typecheck` — passed.
- `node --test tests/unit/printing-catalog-projection.cjs tests/unit/receipt-preview.cjs`
  — 26/26 passed, including cross-scope rejection and malformed-input coverage.
- `CART_CHROMIUM_PATH=<chromium> node --test tests/unit/order-terminal-browser.cjs`
  — 20/20 passed, including the new exact-label regression and existing access,
  payment, status-conflict and tablet-layout cases.

Chromium 153.0.8010.0 was supplied by an isolated `@sparticuz/chromium@153.0.0`
runtime outside the repository. The standard Playwright download returned a
truncated archive in this environment. No project dependency was changed.

Baseline `tests/unit/product-page-browser.cjs` independently reproduced 1/4
passing before feature integration: two assertions expect `kr.84.00` although
the current UI renders Danish `84,00 kr.`, and one times out waiting for `Product Name` because its synthetic topping
fixture lacks the required `locationIds` array and causes the form to throw. These are recorded as baseline failures, not silently skipped.
Feature-specific admin, product override and storefront acceptance suites are
owned by their respective implementation agents; integration validation is a
separate coordinator gate on the assembled head.


## Baseline harness repair

The existing product browser harness now asserts the exact Danish price text
and supplies a valid scoped synthetic topping. The exact `Product Name` locator
is retained. React uncaught render errors are forwarded to the existing page
error assertion so a component crash cannot be hidden behind a locator timeout.
The corrected suite passes 4/4, preserving list filtering, canonical edit/new
navigation, option/category initialization and duplication-dialog coverage.

Independent acceptance on assembled commit
`08e015349fe8963572a21fc10596cb52a9139f23`: typecheck passed; 98/98 focused unit
checks passed; 29/29 terminal, product override, admin and storefront browser
checks passed. No tests were skipped or cancelled. The baseline harness repair
is a separate subsequent commit and requires its affected suites on integration.
