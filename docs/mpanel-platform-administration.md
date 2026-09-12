# mPanel platform administration — issue #130

Draft implementation paired with digiflydk/esmeralda-restaurant-operations#273. Not deployed.

## Behavior

mPanel owns the new users, roles and subscription-plan editing UI. The server-only POST `/api/integrations/mpanel/platform-admin` retains the existing Firestore collections and native IDs. It exposes strict list/save/delete commands with bounded fields, known Orderfly permissions, revision conflicts, request-ID idempotency, reference checks and audit events. Edits preserve unrelated fields, including plan feature IDs.

Set `MPANEL_PLATFORM_ADMIN_ENABLED=true` only during the coordinated cutover. This enables the bridge, redirects legacy users/roles/subscriptions pages and nested editors to `https://www.esmeraldapizza.dk/mpanel#platform`, removes their menu entries and rejects their old server writes. Billing stays available. Brand creation then requires an existing mPanel-managed owner, and brand owner/plan references are validated within a transaction sharing the catalogue lock. Disabled is the default and preserves legacy behavior.

This does not create authentication accounts, replace the current Orderfly login, implement shared Opsfly permissions, assign customer subscriptions or enforce subscription entitlements. Moving the administration is phase one of the shared platform architecture.

## Server configuration and authorization

Both runtimes must have the same dedicated `MPANEL_PLATFORM_ADMIN_SECRET` (at least 32 random characters), verified `MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID` and `MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID`. Never expose these as public/browser variables or reuse notification secrets. The mPanel function authenticates the exact active configured owner session; Orderfly authenticates the machine secret using a timing-safe comparison and independently verifies the actor and organization envelope. This is intentionally global platform-owner access to all catalogue records, not per-brand customer access. Unknown admin identities must not receive this scope.

## Data and rollout

New server-only collections: `platformAdminAudit` (immutable request result and actor/action metadata) and `platformAdminControl` (catalogue transaction lock). Existing `users`, `roles` and `subscription_plans` are not migrated. The list currently refuses catalogues over 500 records per collection.

Deploy the coordinated pair disabled; configure secrets out of band. Before enabling, verify Firestore rules deny direct browser reads/writes to the two new internal collections and direct browser writes to users/roles/plans. Rules are not checked in by this change. Audit other writers of brand owner/subscription and subscription plan references against the shared transaction lock; fixture tests cannot prove their concurrency safety. Finish exact-head checks and independent review in both repositories, then activate and verify a selected dummy-record lifecycle, legacy redirects/write rejection and normal billing. No runtime configuration has been changed as part of this draft.

Rollback disables the feature flag, restoring legacy administration and closing the bridge while retaining records, edits and audit events. It needs no destructive reverse migration.

## Tests and release limits

`node --test tests/unit/mpanel-platform-admin.cjs tests/unit/brand-location-edit.cjs` exercises the actual service, route and cutover guard plus existing brand/location regressions. In-memory transaction fixtures do not substitute for Firestore emulator/live concurrency tests. `npm run typecheck` checks the affected application types. The companion repository includes owner-boundary contracts and fully intercepted mobile/desktop CRUD browser tests. Full release preflight, deployment configuration, Firestore-rule verification and live checks are still required before enabling.

## Review hardening

The HTTP route stops and cancels requests beyond 20 KB while reading, before decoding JSON. Regression coverage includes request-ID reuse with changed content and runs in Orderfly CI alongside the brand reference tests. The companion tests now execute the shared language and theme scripts, cover English at 390/768/1440 px, and reject stale catalogue replies after logout. Local fixture results remain separate from independent review and runtime verification.

Independent review correction: new-brand cutover selects an existing native user ID, never an email lookup. The server validates that document within the reference transaction. Mixed-case or duplicate emails cannot make the selected owner ambiguous. Existing brand ownership remains fixed on edit.
