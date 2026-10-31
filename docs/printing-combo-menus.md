# Automatic kitchen printing of menu orders

Menu orders previously failed native catalog projection with `combo_requires_projection` before an original print job could be queued. A mixed basket therefore also blocked its ordinary product lines.

Native projection now validates the saved combo's brand, location, lifecycle, and every selected product/category in the caller-owned transaction. Saved menu components get stable `line-N-group-G-product-P` identities. Product/category include and exclude rules apply to each component, including drinks and dips; empty optional groups produce no line. Repeated selections remain distinct and use the menu quantity once. Ordinary product identities remain unchanged.

Kitchen snapshots reconstruct only the menu components assigned to that printer. Names and ingredient labels come from the saved order, never current prices or renamed catalog labels. Checkout stores component modifier IDs/quantities and stores their resolved display labels in menu-level toppings in component order. The bounded mapper checks counts and historical product-name prefixes before assigning these labels. Ambiguous/incomplete labels fail closed rather than being discarded or sent to another station. The manual full receipt keeps its existing whole-menu rendering and checkout-supported modifier counts.

Original manifest hashes, immutable PNG payloads, one-shot downloads, authorization, payment eligibility, acknowledgements and duplicate prevention are unchanged. A changed selection invalidates an existing manifest. Existing product-only catalog hashes are unchanged. Previously failed menu orders are not automatically replayed by this change; an authorized manual reprint is a separate operation after checking whether the kitchen already received the order.

Existing automatic routing limits still apply: 50 projected component/product lines, 8 saved modifiers per projected component/product (up to the checkout limit of 50 across a menu) and quantity 1–99. This change does not silently truncate oversized orders. Physical device acknowledgement and printed paper must be verified separately from synthetic PNG tests.

Validation covers a two-menu Margherita/Pepsi/dip basket plus a separate gluten-free pizza, native component ownership/lifecycle, no-dip choices, repeated product identities, station-specific modifier filtering, historical labels, real PNG generation and replay/mutation rejection. No real orders or physical print jobs are created by the tests.
