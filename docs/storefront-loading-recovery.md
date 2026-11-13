# Storefront cart and option-read recovery

The observed UI-002 journey had a full-screen cart-loading layer above the cookie
controls. The deployed CartProvider awaited `restoreCartAction` without a deadline.
A pending action therefore reproduced the indefinite pointer-blocking state in a
local browser test. This establishes a code failure mode, not the exact server or
network cause of the original live incident.

Cart restoration now has a fifteen-second client deadline. A failure or deadline
keeps the cart unready, retains its saved choices and shows an explicit retry.
No client prices or empty basket are substituted. Loading/error status is a
bounded nonmodal notice: cookies, information and menu navigation remain usable,
while cart mutation and checkout retain their existing `cartReady` guards.
Expired/superseded generations cannot overwrite a retried, edited or different
restaurant/order-type basket. Malformed and wrong-brand results cannot make the
cart ready. A matching verified receipt that clears storage during hydration
starts a fresh empty-cart restoration instead of leaving readiness stuck.

CAT-001 exposed an options-read error that succeeded on a later explicit retry.
Its exact production server/network cause remains unknown. Product, combo and
cart-editor option reads now share a scoped facade with at most one automatic
retry for network failure, timeout, HTTP408 or HTTP5xx. Each attempt retains the
five-second timeout. This retries only the public catalog GET, never add-to-cart,
payment or another side effect. HTTP400/401/403, invalid JSON and malformed or
wrong-location data fail without automatic retry. Because the server can express
a logical configuration error as503, the client cannot distinguish every such
error from a transient503; it still stops after one retry and offers manual
recovery. Successful reads remain shared/cached by their brand/location URL.
Validation also runs on cache hits; malformed data is evicted for an explicit
later retry. A scope change cannot open an older option dialog or retain its busy
state. Existing product/combo selections are not reset merely for a read retry.

Verification uses real CartProvider and ProductCard in Chromium on mobile and
desktop, with loopback catalog transport. External data and the product-dialog
boundary are synthetic in the focused ProductCard test; the existing product
dialog regressions retain their own choice/pricing assertions. No production
credentials, orders or provider writes are used by these local tests.

```sh
node tests/unit/public-read-recovery.cjs
node tests/unit/cart-browser.cjs
node tests/unit/product-options-recovery-browser.cjs
node tests/unit/cart-restore.cjs
node tests/unit/tilvalg-storefront-browser.cjs
npm run typecheck
```

This change does not control Worldline's separate-origin hosted loading screen.
