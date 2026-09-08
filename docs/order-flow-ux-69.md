# Order flow UX, issue #69

Developed from main after merged #68. Scope is public storefront UI; payment,
reservation, eligibility and explicit newsletter consent logic stay in place.

## Changes

- Bottom purchase/cart/product/combo/landing CTAs increase from 56 to 64.4 px.
  Sticky checkout increases from 64 to 73.6 px, desktop checkout 48 to 55.2 px,
  desktop menu checkout 40 to 46 px. Landing footer/menu CTAs increase from
  44 to 50.6 px, and upsell continuation from 36 to 41.4 px. All are 15% increases. Mobile content spacers
  grow to keep the larger sticky controls clear of the last form fields.
- Terms receive a minimum 48.4 px row (44 px touch baseline +10%), 12 px vertical
  padding, relaxed line-height and a nonshrinking checkbox. Terms links retain
  their separate destination and acceptance remains required.
- The streaming landing placeholder uses the established dark landing palette
  and a skeleton, instead of flashing a white page with two bare links. Actual
  data failure still offers an actionable fallback. The small fulfillment chooser
  is imported with the landing, so its first opening does not wait for a chunk.
- Product/combo options, all current fulfillment chooser entry points and both
  cart sheets open from the bottom. They share bounded viewport height, rounded
  top corners, safe-area padding and 220 ms upward motion. Reduced-motion users
  get a near-instant transition. Existing Radix focus trapping/Escape semantics
  remain; long option lists scroll inside the panel.
- Entire topping/combo option rows are native labels associated with the existing
  checkbox/radio. Text, price and whitespace activate that same control once.
  Keyboard handling, disabled limits and single/multiple selection remain intact.
- Storefront buttons and button-styled links use the existing yellow #FFBD02,
  hover #E0A800 and black text. The CSS is scoped by a public storefront marker,
  including portal content, so Superadmin retains its existing theme. Selected
  fulfillment mode has an explicit pressed state and dark inset outline.
- Newsletter gets a clearer card and label; a currently eligible offer adds a
  yellow border/background and its actual amount to the heading. Without an
  eligible offer, it makes no discount promise. Consent remains unchecked by
  default and can be withdrawn before checkout. Checkbox borders stay visible
  on the pale yellow surface.

## Focused checks

Typecheck and six selected local Chromium cases passed: desktop/mobile landing
navigation, desktop/mobile product-option row toggling and bottom geometry/cart
placement, successful checkout, and eligible newsletter presentation/explicit
consent plus terms/CTA dimensions. Local synthetic data only, no real payments.
Screenshots were inspected for mobile options and checkout. Tests execute the
actual stylesheet/components; fixture images are synthetic, not live content.

```sh
npm run typecheck
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='P2 menu search|P2 landing order' tests/unit/commerce-p2-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='UI69|^success:' tests/unit/checkout-browser.cjs
```

No Actions or broad suite. Publish with [skip ci]. Independent review, PO
acceptance and Work Release merge/deployment remain separate. After release,
check the actual mobile Safari/desktop site, long option lists, safe-area insets,
terms link, newsletter with/without a real eligible offer and the first order
click. Do not change production payment settings for UI verification.

## App-like interaction follow-up

Public buttons now have short pressed feedback and icon buttons have at least
44px touch targets. Reduced-motion preference disables the extra motion. Options
contain overscroll, and checkout/toast spacing accounts for screen safe areas.
Product and combo additions announce a short confirmation through the existing
accessible toast; add controls wait for the cart to be ready.

Checkout fields provide autofill, keyboard and enter-key hints. Mobile fields
use 16px text to avoid focus zoom. A focused text field plus a visual viewport
contraction hides the mobile payment bar while typing, then restores it. Pinch
zoom and viewport changes without text focus do not trigger this behavior.
Payment submission and discount/reservation logic are unchanged.

Follow-up validation: typecheck and four selected local Chromium cases passed:
successful payment handoff; focused-keyboard hide/restore including pinch zoom
and unfocused resize; desktop/mobile product options and cart, including the
add confirmation. The viewport contraction is simulated; check real iOS/Android
keyboards and safe areas after deployment. No Actions or broad suite.

```sh
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='native mobile|^success:' tests/unit/checkout-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='P2 menu search' tests/unit/commerce-p2-browser.cjs
```
