# Purchase stamp celebration

The paid checkout confirmation requests GET `/api/loyalty/{brandSlug}/order-stamp?orderId=…`. The existing portal wrapper requires an active brand-scoped member session and returns no-store responses. The read-only endpoint verifies the committed deterministic order-stamp event, member/company/brand/customer ownership and the current paid, non-canceled/non-refunded order. No stamp issuance, payment or production data logic changes.

Only recent awards (24 hours) are eligible. Missing/nonqualifying awards and guest/expired sessions silently omit the optional UI. Settlement already commits payment and award together, so no polling is required. Reads time out after 12 seconds and abort on unmount. Receipt functionality remains available if loyalty reads fail.

The popup shows earned quantity, progress after this purchase, and a separate full-card/reward celebration including overflow stamps. Gold stamp landing and confetti finish within two seconds; reduced-motion disables animation. Radix provides keyboard/focus handling, Escape and close controls. Closing returns focus to the receipt title. Links use existing brand-aware storefront routes.

A localStorage marker keyed by the opaque award ID prevents repeated display in the same browser, including reloads and React effect replays. If storage is blocked, omit the popup. This does not promise cross-device deduplication; clearing browser storage resets display history. The marker does not contain customer or order details. Progress is the committed purchase snapshot, not a live balance after later purchases.

Validation: targeted server ownership/eligibility regressions and browser checks for animation, mobile layout, reduced motion, full card, dismissal, reload deduplication and failed/guest reads. Typecheck and production build locally. No GitHub Actions. Independent code review and live verification remain release gates; no real purchases are created by tests.
