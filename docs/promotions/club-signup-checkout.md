# Club signup campaigns and checkout

The `club_signup` promotion type is a personal, one-use entitlement, distinct from a manual code. Its reserved marker is `CLUB_SIGNUP`; it cannot be redeemed through ordinary code lookup. Both signup promotion types retain the existing configurable item-stacking behavior and compete with other cart promotions for the best price.

New signup acquisition is controlled by `loyaltyCampaigns/{brandId}.settings.checkoutMode`: `none`, `newsletter`, or `club`. A brand with no saved campaign document retains its existing newsletter checkout. A malformed or cross-brand saved document fails closed. Changing the acquisition mode does not invalidate a personal Club discount already earned on the standalone Club page.

The authoritative personal right is the customer's `pendingClubDiscountId`, granted by the Club signup service, not by checkout input. Redemption still checks current promotion restrictions and the existing transactional capacity counters. Club signup discounts enforce one paid/reserved use per customer even when the promotion's configured personal limit is zero. Failed checkout releases use the existing payment reservation lifecycle; duplicate requests for the same held order are idempotent.

No production campaign is activated by adding this support. The campaign mode and actual offer remain explicit administration settings. Isolated tests cover legacy mode compatibility, invalid/cross-brand configurations, entitlement checks, concurrent reservations and reserved-code rejection. Production signup, campaign activation and live acceptance remain separate release steps.

## Promotion administration

Promotion's discount form supports “Automatic on Club signup” with the reserved marker `CLUB_SIGNUP`, the existing schedule/location/order-type/minimum settings and optional item stacking. Manual codes cannot use either signup campaign's reserved marker. The campaign panel is the sole writer of the brand's checkout acquisition mode; saving a discount does not switch the active signup option or activate a production campaign implicitly.

## Checkout consent and verification

Checkout loads the authoritative acquisition mode and current Club wording. Club membership requires two independent, initially unticked newsletter/terms boxes. The customer submits both displayed versions and the optional campaign fingerprint. Refresh/focus changes to mode, wording versions or benefit fingerprint clear acceptance. The current welcome stamp count is shown when positive.

The server performs read-only eligibility before quoting. Only after the current server quote is accepted and the canonical checkout customer exists does it invoke actual Club signup. The signup service rechecks programme/mode/benefit versions and grants the same personal right used by standalone signup. Generic checkout newsletter consent recording is skipped for Club signup because the Club service records the exact Club consent. Existing earned personal rights require no new membership acceptance.

Isolated server tests verify current-order savings, stale quotes with no membership/payment writes, missing consent rejection, mode changes, signup failures and personal entitlements. Actual Chromium component tests cover desktop/mobile independent acceptance, submission of displayed versions/fingerprint and personal Club benefits alongside the sole newsletter acquisition option. These tests use isolated provider fixtures; they are not production live QA.
