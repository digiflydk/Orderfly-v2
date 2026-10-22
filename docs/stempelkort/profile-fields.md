# Club profile fields (#462 / #459)

Authenticated members may add or clear an optional phone number, birth date and gender from their existing Club profile. Gender supports `male`, `female`, `other` and `prefer_not_to_say`; an unanswered value is `null`. The current design and newsletter, logout and deletion controls are retained.

## Data and API contract

`POST /api/loyalty/[brandSlug]/profile` uses the existing same-origin JSON and HttpOnly session boundary. Its strict partial body accepts only `phone`, `birthDate` and `gender`. Omitted values remain unchanged; an empty phone becomes `''`, and empty/null birth date or gender becomes `null`. Birth dates must be actual calendar dates in `YYYY-MM-DD`, from 1900 onward, and cannot exceed the current Copenhagen calendar day. Phone normalization uses the shared customer-phone contract; this does not verify ownership of a telephone or opt anyone into SMS.

`updateMemberProfile(db, brand, session, input, context)` rechecks the persisted member and session in its transaction, including brand, expiry, revocation and session epoch. The member's central `customers` record must belong to the same brand and contain the member's email identity. That record owns `phone`, `normalizedPhone`, `birthDate` and `gender`; no second copy is kept on the loyalty member.

A new phone must not belong to another customer in the same brand through its primary/normalized number, aliases or shared identity reservation. When the displayed phone changes to a different normalized identity, the transaction normalizes all same-brand customer phone fields and aliases, including unindexed formatted legacy values, before reserving the number. This uses a brand-scoped customer query, so changes to a new normalized phone read the brand's customer set; unchanged or formatting-only phone saves skip that scan while retaining the deterministic reservation ownership check; a later normalization migration/index optimization must preserve this fail-closed legacy check. Its deterministic `integrationConsumerCustomerPhoneIdentities` reservation is updated atomically with the customer. Existing aliases, email fields, marketing consent and customer aggregates are preserved. Changing or clearing the displayed phone preserves historical phone aliases/reservations for the existing customer matcher; it does not promise to erase identity history. A phone on another brand does not conflict.

The result is `{ profile: { phone, birthDate, gender } }`. `memberView` exposes the same additive `profile` projection only from the correctly owned central customer. Legacy/missing/invalid values, including future persisted birth dates, become empty fields using the current Copenhagen calendar day. No profile data is sent to analytics or automatically exported to an external provider.

## Integration boundary

This slice does not grant stamps, change campaign settings or advertise a profile bonus. The coordinator integrates the separate bonus engine in the transaction after all reads and before any writes, using the validated merged profile. No signup/verification or consent behavior changes here.

## Validation and release

`tests/unit/loyalty-profile.cjs` covers schema/date boundaries, persisted session and brand/customer ownership, partial clearing, alias preservation, identity conflicts and competing phone claims. `tests/unit/loyalty-profile-browser.cjs` runs the actual profile component at 320/390/1440 pixels and covers saving, persisted values, invalid/future input, clearing, network/conflict errors and expired sessions. Existing membership, page/layout and portal browser regressions must continue to pass.

These tests use synthetic data and isolated HTTP/Firestore fixtures. They are not production live QA. Merge/deploy remains owned by the coordinator after current-head CI, independent Codex review, documentation and release gates. Verify the deployed release, then run the issue's approved acceptance scenario before closing. No production profile writes are authorized by this implementation task.

When replacing or clearing a legacy phone, valid identities from both the displayed phone and normalizedPhone are retained as historical aliases, even if those fields disagree.

An unchanged unindexed phone does not acquire a new identity reservation when its legacy scan is skipped. Existing owned reservations remain owned; only a genuinely changed phone with a successful uniqueness scan may create a fresh reservation.
