# Club campaign benefit presentation (#459 / #474)

`src/app/[brandSlug]/club/club-benefits.tsx` renders server-filtered campaign information. It does not determine eligibility, grant stamps, create discount codes or make an API call.

## Data contract

The public program optionally includes `campaigns`:

```ts
{
  welcomeStamps: number;
  profile: { stamps: number; requiredFields: string[] } | null;
  discount: ClubDiscountSummary | null;
}
```

The authenticated member optionally includes:

```ts
{
  profile: { stamps: number; requiredFields: string[] } | null;
  profileBonusGranted: boolean;
  discount: ClubDiscountSummary | null;
}
```

The discount summary has `id`, `discountType` (`percentage` or `fixed_amount`), `discountValue`, optional `description`/`minOrderValue`, `allowStacking`, optional epoch `endsAt`, `locationIds`, `orderTypes`, `activeDays` and `activeTimeSlots`. Root integration owns the server projections and excludes unavailable campaigns or consumed entitlements. Until that integration is present, the optional missing data renders no promotional content or empty layout spacer.

## Customer experience

- Public Club and signup show the welcome stamp and personal next-purchase discount only as a new-member offer. A profile campaign can explain the additional one-time stamp.
- Authenticated cards show an earned personal discount only when the server supplies its pending entitlement. They do not repeat the new-member welcome claim.
- Discount information includes minimum purchase, merchandise/stacking restrictions, excluded fees, order types, selected-location restriction, weekday/time restrictions, expiry in Copenhagen time and one-time/non-combination terms.
- There is no invented discount code. The customer is told to use the membership email in checkout, where the server checks the offer against the order. The shop link uses the existing brand root: `/club` links to `/`, and `/esmeralda/club` links to `/esmeralda`.
- `ProfileBonusHint({ campaign, claimed, profileHref? })` is a standalone export for profile-form integration. Claimed or absent campaigns render nothing. `prefer_not_to_say` gender is explained as a valid answer.
- Merchant descriptions are React text, not HTML. Existing form consent, login, QR and member actions remain unchanged. Existing Esmeralda CSS and layout are reused without modifying their design.

## Verification

`tests/unit/loyalty-benefits-browser.cjs` compiles the actual benefit, signup and member-card components with the production portal frame and CSS. It verifies absent campaigns, truthful signup/earned copy, all restrictions, claimed profile hiding, non-HTML merchant text, prefixed shop links and no overflow at320/390/1440px. Viewing benefit text does not make a bonus/profile/signup write. The existing portal-browser suite remains unchanged and verifies the original flows.

This is isolated browser QA with synthetic server data. Coordinator integration, independent review/current-main CI, serial deployment, verified release and applicable live acceptance remain separate gates. No campaign is activated by this presentation-only change.
