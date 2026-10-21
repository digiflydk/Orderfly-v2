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
