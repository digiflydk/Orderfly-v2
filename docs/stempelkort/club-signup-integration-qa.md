# Club signup integration regression evidence (#475)

Run with `node --test tests/unit/loyalty-club-signup-integration.cjs`.

The test executes the actual membership, Club checkout signup, discount eligibility,
profile update and bonus implementations. It uses synthetic memoryDb records;
only request headers and outbound mail configuration are isolated. A separate
transaction guard rejects all reads after a staged write. No production data,
credentials, browser login or external mail are used.

Coverage includes read-only quote snapshots, explicit independent consents, current
terms and brand boundaries, checkout-mode races, welcome stamps and personal
pending discounts, repeated/concurrent entry, historical identity aliases,
delete/recreate, current and frozen-card reward thresholds, profile completion,
invalid promotion rules, and advertised campaign version changes.

Initial regression run exposed three accepted invalid promotion configurations:
string discount amount, malformed location array and unsupported order type.
Coordinator fix d2f2628b makes those cases pass. The expanded run exposed another
regression: crossing the welcome campaign end time changed the advertised stamp
count without changing its fingerprint. Coordinator fix fcf0ee9d now changes the
fingerprint and the unchanged test proves stale signup rejects with zero writes.
Final run: all 29 cases pass (0 failures), including preflight/commit configuration
races, expired advertised offers and dotted valid phone profile completion. The
worktree also includes profile review fix 90d826bf. This QA task changes tests/docs
only; source corrections remain owned by their respective implementation tasks.

This evidence is isolated service integration QA. It does not prove production
Firebase transaction contention, checkout UI, payment-provider behavior, deployment
or production live acceptance. Those remain separate coordinator release gates.

Independent review added a two-offer regression: checkout selects `d2` while the
standalone page advertises stable first offer `d1`. Changing `d2` must invalidate
the campaign fingerprint both before preflight and between preflight and the
signup transaction, with no customer, membership, consent, bonus or mail writes.
The new case failed with “Missing expected rejection” on `5852c71d`; coordinator
fix `d4c9dbb2` makes all 30 integration cases pass. This check used synthetic
memory records only.

## Existing member checkout resubscription follow-up (#481 review)

An additional actual-service lifecycle signs up a member, marks their old personal
signup offer used (no pending offer), withdraws consent through
`setNewsletterConsent`, and calls `prepareClubCheckoutSignup` without a discount.
It requires current versioned explicit consent, the central customer subscription,
a pending marketing job/contact and the member's subscribed state. Existing cards,
bonus ledgers and discount claims must remain unchanged. Separate cases reject
false newsletter/terms consent and stale text versions with a full zero-write
snapshot.

RED was confirmed against pre-fix `73115e3b`: checkout returned while member consent
remained `withdrawn`. Coordinator fixes `9b5ddcc1` and `7cfdef2b` make the same
assertions pass and preserve existing concurrent retry idempotence assertions.
Final command:
`node --test tests/unit/loyalty-club-signup-integration.cjs tests/unit/loyalty-membership.cjs`
Result: **47 tests passed, 0 failures** (31 integration + 16 membership).
This follow-up remains isolated synthetic service QA, with the live/release limits
above unchanged. The QA-owned commit contains only this evidence and test file.
