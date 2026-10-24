# Personal discount card in Club

Issues #575 and #576, parent #566. This read-only presentation reuses the approved Club layout and the existing member identity and QR mechanism.

## Owner-only projection

`memberDiscountCard` reads a minimal projection in a Firestore transaction. It rechecks the current session, active member, customer email binding, exactly one active brand/company mapping, typed feature/group/assignment documents and assignment-to-member binding. Inactive/deleted brands and customers are rejected. Selected locations must belong to the mapped brand, matching the admin/checkout contract; the company-level location list is not a second eligibility condition. Only active selected locations are listed, and a card with no active selected locations is inactive. Missing or conflicting data yields no discount projection. Returned fields contain the group name, percentage, status, validity and location display names, not customer IDs, assignment IDs, policy records, recipient addresses or invitation/login secrets. The projection is informational, never a credential used to authorize checkout pricing.

Both server-side `loadMember` and the authenticated `/api/loyalty/{brandSlug}/me` endpoint attach this projection. Existing stamps, rewards, history and campaign projections are retained. An invitation-created member marked `membershipOrigin: discount_invitation` with no existing stamp card does not receive an empty stamp grid. Existing cards and rewards remain visible. A stamp program does not need to be active to display the personal discount card.

Blocked, pending, inactive, future and expired assignments have explicit status text and no purchase CTA. Active cards link to the matching storefront path. The displayed rules describe qualifying full-price merchandise, no stacking, no delivery/fees and no simultaneous purchase stamps for an order using the card discount. Checkout independently revalidates the actual entitlement and price.

## Shared membership QR

The same `MemberQr` component is rendered once. It retains the existing 60-second, random, server-issued membership token, rotation, expiry hiding and one-use counter lookup. No discount percentage or entitlement is encoded in a QR. The explanatory text for cardholders makes clear that the QR identifies Club membership and the discount is calculated in Orderfly when signed in. There is no POS/NemPOS integration and no QR-based checkout authorization.

Issuing a QR requires an active member, not an active stamp program, so invitation-created members can use the existing membership identification. It creates no stamps or discounts. The checkout integration owns the applied order discount snapshot. Current online checkout has no automatic purchase-stamp producer; this slice does not invent one or disable unrelated ordinary/manual purchases for all cardholders. Existing manual counter rules and permission checks are unchanged.

## Verification and boundaries

`tests/unit/discount-card-portal.cjs` exercises the actual projection and QR services with synthetic database fixtures, including fresh session/member/customer/company ownership, selected locations, invalid amounts, all inactive states, and no writes from projection. Existing counter/rule tests cover QR replay, expiry and brand binding plus stamp behavior.

`tests/unit/discount-card-portal-browser.cjs` renders the actual MemberCard, DiscountCard and MemberQr components in isolated Chromium at 390/1440px. It checks retained stamps, inactive CTAs, invitation-only display, escaped names, localized percentages, location/date text, path-prefix navigation and membership-only QR behavior. These fixtures are not production/live mail/order acceptance.

### Returning from Club login to checkout

Checkout may pass `returnTo` to Club login. Only a relative location checkout path under the current portal's brand prefix is accepted; origins, queries, fragments, encoded segments and foreign brand prefixes are rejected. The browser stores this navigation intent (path plus expiry only) under a brand-specific localStorage key for at most 30 minutes. This lets a login email opened in a new tab of the same browser return to the existing same-origin cart after successful verification. The target is revalidated and removed on success. No credentials, tokens or customer data are stored. Unavailable storage, expired intent, another browser or invalid target falls back to the Club card. Auth cookies retain their existing host-only boundary; this does not implement custom-domain login or transfer carts between hosts. Exceptional apex checkout uses the coordinated checkout canonical-site explanation.

Validation uses actual Chromium login components: request link, open simulated email in a second tab, verify token, observe return URL and removed intent; unsafe origins/foreign brand targets fall back to Club. API/email delivery is mocked in this local test, so this is browser integration evidence, not real production mailbox delivery.
