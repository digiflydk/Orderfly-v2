# Linked option pricing in administration

Product-linked options always use the source product's current pickup or delivery price. The product override table displays “Følger produktets pris” instead of an amount field. Saving a product removes stale price overrides for known linked options before validation and serialization, preserving defaults, quantities and availability. Empty override records are omitted. Standalone options retain inheritance and explicit zero prices.

The option form shows the selected source's pickup and delivery prices (delivery falls back to pickup). Changing the source updates this disclosure. An unavailable source cannot expose an editable price. Choosing a standalone option restores price editing. Contextual guidance explains how to configure free default selections without automatically selecting options.

Validation: `npm run typecheck`; `CART_CHROMIUM_PATH=<chromium> node --test tests/unit/product-topping-editor-browser.cjs`. Browser tests render the actual forms with compiled application CSS at 390px and 1280px. They cover stale linked override cleanup, retained unrelated fields after rejected saves, independent zero/inherited prices, source switching, delivery fallback, and group detachment. Fixtures use synthetic catalog records and local intercepted saves only.

Release follows independent CI and code review, PO acceptance or the repository automatic merge rule, merge, then read-only live verification. No GitHub Actions or production data writes are used by this work.
