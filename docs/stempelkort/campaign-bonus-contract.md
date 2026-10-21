# Club campaign and bonus contract (#459 / #463)

This change supplies an internal server contract only. It does not activate a campaign, change production data, expose new endpoints or call signup/profile hooks. Promotion retains ownership of percentage discounts. The coordinator integrates these helpers after the related profile, checkout and administration changes.

## Settings

`loyaltyCampaigns/{brandId}` stores `{ brandId, version, updatedAt, settings }`. `settings` has:

- `checkoutMode`: `none`, `newsletter` or `club`, one value only.
- `welcome`: `enabled`, `stamps` (0–8), `startsAt` and `endsAt` (epoch milliseconds or null).
- `profile`: `enabled`, `stamps` (1–8), `requiredFields` (a nonempty unique subset of `phone`, `birthDate`, `gender`), and the same date fields.

Defaults are disabled bonuses, one stamp, all three profile fields and `checkoutMode: none`. Missing, foreign or corrupt settings read as a disabled configuration with version zero. A missing version-zero configuration is distinguishable from an explicit `none`; the checkout integration must preserve the pre-existing newsletter behavior for a brand that has never saved these settings. An explicit setting controls later selection.

Campaign periods include their start and exclude their end. The date range must be increasing. Deployment never creates a settings document.

`loadCampaign(db, brandId)` reads the brand configuration. `stageCampaignSettings({ db, tx, brandId, settings, expectedVersion, now })` reads it in a transaction and returns `{ campaign, apply }`. It rejects stale versions and corrupt existing documents. The caller must authorize the administrator for the exact brand in the same transaction before calling `apply`. The helper is not a public authorization boundary. Additional actor/audit metadata belongs in a separate event, not the strict configuration document.

## Bonus staging

`stageBonusGrant({ db, tx, brand, memberId, member, kind, now, profile?, welcomeEligible? })` returns `{ eligible, alreadyGranted, reason, apply }`.

- `brand` is `{ brandId, companyId }`; `member` is a trusted active `MemberDoc` snapshot supplied by authenticated member code or validated signup code.
- `kind` is `welcome` or `profile`. Only trusted **new-member signup** code may pass `welcomeEligible: true`; the default is false. Do not derive it from an old member, a client flag or a later campaign toggle.
- Profile fields must come from the validated central customer profile. `prefer_not_to_say` counts as an answered gender. Incomplete/invalid selected fields do not qualify.
- The stage only reads. Finish all other transaction reads before calling `apply`. A new signup can create its member after staging and then call `apply`, which updates the new member's current card. Stage at most one bonus kind in a transaction to avoid applying two independent stale card snapshots.
- The caller retains all authentication/session/brand checks. This helper additionally checks the supplied member's brand, company, active state and current-card ownership.

Both a brand/email/kind guard and a brand/customer/kind guard are read and created in `loyaltyBonusGrants`. These deterministic hashed keys prevent retries, concurrent requests, profile edits, aliases on the same customer, campaign toggles and deletion/recreation from repeating a bonus. The ledger contains hashes and a campaign receipt, not a plaintext email. Membership deletion must not delete the anti-replay ledger.

The existing `addStampsToCard` engine is exported for this internal use. It retains card snapshots, expiry, reward creation and overflow behavior. A null campaign location preserves an existing location binding and leaves a new bonus-only card unbound until a purchase. Overflow with stamps preserves the resolved binding. Bonus stamps never increment purchase-day counters or pretend to be a qualifying discounted purchase.

The existing `stamp_added` event records `source: portal`, `channel: bonus_welcome` or `bonus_profile` and a readable reason. Portal integration should map the channel to its customer-facing campaign label; staff identities/reasons must remain private in member history.

## Validation and release boundary

`tests/unit/loyalty-campaign-bonus.cjs` runs the actual TypeScript helpers with an atomic in-memory Firestore contract that rejects reads after the first write. Coverage includes settings leases, periods, concurrency, independent grants, profile validation, opt-out gender, inactive programs, historical welcome rejection, identity aliases and recreation, brand/card rejection, frozen rewards, overflow/location and expiry. Existing counter regressions verify the shared engine's original purchase/correction behavior.

These are isolated integration tests, not production acceptance or physical hardware tests. The coordinator retains current-main CI, independent current-head review, serial merge/deploy, actual release verification and applicable live QA before closing the task.
