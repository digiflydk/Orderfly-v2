# Routing preview foundation (#328)

`previewPrinterRouting` in `src/lib/printing/routing-preview.ts` is a pure,
bounded planner for **explicit normalized snapshots**. Nothing calls it in
production yet. It does not load a catalog/order, authenticate a caller, save
rules, create print jobs, choose a default printer, render a receipt or dispatch
output. Every result and target has `dispatchAuthorized: false`.

## Input and native projection boundary

The strict input contains one brand/location scope, the existing `Pickup` or
`Delivery` order type, candidate printer configurations with an explicit
normalized `deleted` flag, rules, and line snapshots. Canonical printer
configuration validation is reused, including mC-Print2 width/transport limits.
Every printer, rule and line must match the supplied scope. Duplicate identities,
deleted printers and rules pointing to an absent printer reject the whole input.
Disabled candidates are explainable but never selected; paused candidates may
appear as intent targets and still do not authorize dispatch.

The actual models inspected were `Product` (`brandId`, `locationIds`,
`categoryId`), `MinimalCartItem` (`id`, name, quantity, toppings and combo
selections), `OrderDetail.productItems` and the existing kitchen-only receipt
snapshot. Persisted minimal items do **not** carry an authoritative category.
This task therefore deliberately provides no `OrderDetail` or cart adapter.
A future server projection must independently load scoped native product/category
ownership and build stable per-order line IDs and display text. Copying the scope
onto arbitrary client product IDs is not authorization. These DTOs are preview
inputs, not evidence that catalog ownership, order eligibility, payment or
printer capability has been verified.

Product lines require explicit product/category IDs, line ID, scope, name and
quantity. Modifiers and kitchen note remain with that specific line. Distinct
lines for the same product remain separate. No prices, customer/contact fields,
credentials or arbitrary order objects are accepted. Returned target lines are
independent copies, so a caller cannot mutate its input or a sibling target by
editing a result.

Unexpanded combo lines use `itemType: 'combo'` without invented component IDs or
categories. They are always reported as `combo_requires_projection`, including
on all-product packing candidates. They are never silently omitted or treated
as one kitchen component. Verified combo expansion/multiplicity and catalog
projection are separate work before production integration.

## Rules and explanation

Each rule names one printer and one selector: a product ID, category ID, or all
products. It includes/excludes matches and can filter `Pickup`/`Delivery`.
Only explicitly supplied rules participate; no production default is invented.

For each line/printer:

1. Filter by printer, selector and fulfillment type.
2. Select the highest matching specificity: **product > category > all**.
3. At that specificity, **any exclusion wins**. Otherwise include once.
4. A disabled printer is not selected even if an include rule matches.

A more specific product include therefore overrides a category exclusion;
this is intentional rule precedence, not an absolute-exclusion system. Equal
specificity excludes win regardless of input ordering. The explanation records
all selected rule IDs and shadowed lower-specificity IDs, plus included,
excluded, no-match, disabled or unresolved-combo outcome. A line may reach
multiple printers, but overlapping rules cannot duplicate it on one printer.
Targets are sorted by printer ID; rule explanation IDs are sorted; original line
order, quantities, modifiers and notes remain unchanged.

`unrouted` includes every line that reaches no printer, with an explicit reason.
No-match, excluded and disabled details are available in the decision matrix.
No printers/rules is a valid preview yielding only unrouted lines, not a default
routing decision. The maximum decision matrix is 16 printers × 50 lines.

## Bounds and verification

Upper bounds are 16 printers, 256 rules, 50 lines and 32,768 serialized input code
units. Each product has at most eight modifiers. The aggregate budget may reject
an input below individual collection maxima. Overflow fails without truncation
or a partial plan. Names/notes reject printer controls, newlines, format/bidi
controls and lone surrogates. Errors use fixed codes without input values.

Run:

```
npm run typecheck
node --test tests/unit/printing-routing.cjs tests/unit/printing-domain.cjs tests/unit/printing-configuration.cjs tests/unit/printing-receipts.cjs
```

The dedicated tests exercise pizza/pasta/drink fan-out, precedence and tie
exclusions, overlap deduplication, distinct cart lines/modifiers, fulfillment
filters, paused/disabled candidates, no defaults, unresolved combos,
foreign/deleted/orphan rejection, strict DTOs and collection/text limits.
This is fixture coverage of the pure planner, not authenticated API, production
order routing or physical printing. There is no browser flow or live endpoint
for this internal slice. The coordinator adds the test command to shared CI,
serializes release after exact-head CI/independent Codex review, verifies the
deployed release and records the absence of a production invocation honestly.
Existing administration remains superadmin-only; configuration writes and
physical output remain off.
