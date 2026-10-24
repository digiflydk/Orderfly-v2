# Personal discount card in Club

Issues #575 and #576, parent #566. This read-only presentation reuses the approved Club layout and the existing member identity and QR mechanism.

## Owner-only projection

`memberDiscountCard` reads a minimal projection in a Firestore transaction. It rechecks the current session, active member, customer email binding, brand/company mapping, typed feature/group/assignment documents and assignment-to-member binding. Selected locations must belong to both the brand and mapped company. Missing or conflicting data yields no discount projection. Returned fields contain the group name, percentage, status, validity and location display names, not customer IDs, assignment IDs, policy records, recipient addresses or invitation/login secrets. The projection is informational, never a credential used to authorize checkout pricing.

Both server-side `loadMember` and the authenticated `/api/loyalty/{brandSlug}/me` endpoint attach this projection. Existing stamps, rewards, history and campaign projections are retained. An invitation-created member marked `membershipOrigin: discount_invitation` with no existing stamp card does not receive an empty stamp grid. Existing cards and rewards remain visible. A stamp program does not need to be active to display the personal discount card.

Blocked, pending, inactive, future and expired assignments have explicit status text and no purchase CTA. Active cards link to the matching storefront path. The displayed rules describe qualifying full-price merchandise, no stacking, no delivery/fees and no simultaneous purchase stamps for an order using the card discount. Checkout independently revalidates the actual entitlement and price.

## Shared membership QR

The same `MemberQr` component is rendered once. It retains the existing 60-second, random, server-issued membership token, rotation, expiry hiding and one-use counter lookup. No discount percentage or entitlement is encoded in a QR. The explanatory text for cardholders makes clear that the QR identifies Club membership and the discount is calculated in Orderfly when signed in. There is no POS/NemPOS integration and no QR-based checkout authorization.

Issuing a QR requires an active member, not an active stamp program, so invitation-created members can use the existing membership identification. It creates no stamps or discounts. The checkout integration owns the applied order discount snapshot. Current online checkout has no automatic purchase-stamp producer; this slice does not invent one or disable unrelated ordinary/manual purchases for all cardholders. Existing manual counter rules and permission checks are unchanged.

## Verification and boundaries

`tests/unit/discount-card-portal.cjs` exercises the actual projection and QR services with synthetic database fixtures, including fresh session/member/customer/company ownership, selected locations, invalid amounts, all inactive states, and no writes from projection. Existing counter/rule tests cover QR replay, expiry and brand binding plus stamp behavior.

`tests/unit/discount-card-portal-browser.cjs` renders the actual MemberCard, DiscountCard and MemberQr components in isolated Chromium at 390/1440px. It checks retained stamps, inactive CTAs, invitation-only display, escaped names, localized percentages, location/date text, path-prefix navigation and membership-only QR behavior. These fixtures are not production/live mail/order acceptance.
