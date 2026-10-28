# Product option discovery and clarity

Explicit option sort ranks retain priority and tied ranks retain catalog order. Unranked options show configured defaults first, then Danish alphabetical order. This is deterministic presentation, not a claim of popularity or a change to pricing/default selection. Group ordering and conditional activation remain unchanged.

Search prioritizes exact and prefix name matches; selected nonmatches remain visible and editable. A result count and clear-search action make recovery explicit. Selecting the maximum quantity explains why more choices cannot be added and how to replace them. Single-choice groups omit redundant selected counts. Completed required-group progress remains available to assistive technology without taking visual space in the footer.

The ProductDialog passes upsell attribution into the existing cart API, including options-based product additions. Consent-aware option interaction events use one random interaction ID per dialog opening; automatic defaults do not count as customer changes. Events do not include option names, free-text search, or customer identity.

Verification: option-presentation unit tests cover configured ranking, Danish fallback, search relevance, selected-item retention and complete-list recovery. Existing styled storefront browser coverage must remain green for defaults, native limits, mobile scrolling, price clicks, focus and cart persistence. Coordinator review, local gates (no GitHub Actions per PM), merge and read-only live acceptance remain separate release gates.
