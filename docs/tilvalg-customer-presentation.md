# Customer option presentation

ProductDialog keeps the shared catalog resolver, quantity reconciler and checkout contract. Presentation now puts required groups first, retaining product order within required and optional groups. Required groups stay expanded; submitting incomplete choices focuses the first unmet group. The footer shows incomplete required-group progress and the current total. Completed progress remains accessible to screen readers without repeating it visually.

Single-choice groups use native radios and keyboard arrow navigation. Optional single-choice groups include an explicit `Ingen` choice. The first optional group starts expanded so customers see the choices immediately; subsequent optional groups initially collapse. Collapsed groups retain a readable selection summary when choices exist, without redundant empty-state lines. Expanding, collapsing and searching never changes selections or introduces defaults.

Groups with more than six options initially show six plus any selected options. `Vis alle` / `Vis færre` adjusts the list. Groups with more than ten options also offer search; selected options remain visible even outside the search results. Quantity controls are at least 44 × 44 pixels. Existing group conditions, removals, product-specific prices/defaults, edit restoration and global quantity limits remain authoritative.

Validation: `npm run typecheck`; `CART_CHROMIUM_PATH=<chromium> node --test tests/unit/tilvalg-storefront-browser.cjs`. The browser harness compiles production Tailwind and commerce CSS, uses synthetic data and renders the actual ProductDialog at 390 and 1280 pixels. It covers required-first order, newly activated required groups and error focus, radio keyboard navigation, optional clearing, search/shortening without hidden selections, dependent choice removal, quantity/default/removal/edit regressions, 44px controls, modal overflow and reachable submit footer. Set `TILVALG_SCREENSHOT_DIR` for screenshots. No production mutations or GitHub Actions are used. Independent review and coordinator acceptance precede merge/deployment; live verification remains a separate read-only gate.


## Compact product modal

The product modal uses its content height, capped at 90dvh. Desktop centers the modal; mobile keeps a bottom sheet. Only `data-product-options` receives this sizing, leaving combo builders and cart sheets unchanged. A native scroll area contains the options below an independent product header, with a non-scrolling compact footer combining quantity controls and a two-line action/total. Required progress remains accessible above that row. Standard option rows are 44px high; long labels may wrap. The selected fill is subtle; only keyboard focus outlines the row. Search text stays 16px on mobile to avoid input zoom. See `tilvalg-experience-program.md` and its component documents for subsequent discovery, cart, offers and measurement improvements.

Styled tests additionally cover 320×568 and 390×480, full modal/submit bounds, actual scrolling to the last option, collapsed content height, 44–48px normal rows, long labels and quantity 100/high totals. Optional `TILVALG_FONT_DIR` points to locally downloaded `heading.woff2` and `body.ttf` from the existing brand asset URLs; screenshots can then use the actual Bourton/Brandon fonts without making tests depend on network availability. Synthetic pizza artwork avoids external image requests. The screenshots and fonts are local review artifacts, not repository assets.

Name and price are both associated labels for the same option control. The option retains its exact accessible name, with price exposed as its description. The product modal close button also has a 44px target. Narrow-screen tests activate the option through its price and dismiss through the close button.

The broader commerce browser harness now checks the intended centered desktop
modal and bottom-aligned mobile modal, compact reachable CTA, and explicit
opening of optional groups before inspecting their controls. Exact option names
are asserted independently of price descriptions. The existing price-click,
50-option cap, conditional-price totals, saved identities, cache/retry, cart and
combo-upgrade behavior assertions remain in place.

The product header sits outside the option scroller, reserving the close target permanently even when lists scroll. The header itself is bounded to 35dvh and scrollable for unusually long names/descriptions on short screens. Keyboard focus on quantity minus/plus buttons highlights the individual button; choice controls retain the row highlight. Regression checks verify the visible price area never intersects the fixed close target after scrolling and that keyboard focus identifies the exact stepper button.
