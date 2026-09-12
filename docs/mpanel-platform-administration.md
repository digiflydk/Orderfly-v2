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

Canonical identity audit after re-review: user list/detail, plan list, and both role list/detail readers now apply the Firestore document ID after stored fields. Imported/stale embedded IDs cannot redirect a selection to another existing record. The bridge already builds IDs exclusively from document references; brand/location readers already canonicalize them. Regression tests exercise real catalogue readers through a new-brand transaction with colliding embedded owner/plan IDs.

## Shared company configuration (#133)

Phase 2 adds saved configuration and owner-only access preview for **both** products. It does not yet enforce access in product business endpoints, provision identities, perform SSO, invoice customers, or replace billing plans. Credential activation from #130 remains deferred. `accessMode: preview` identifies this contract; the UI must explicitly show that product access has not changed.

Firestore is the single configuration store behind the existing authenticated mPanel bridge. New collections: `platformCompanies` (explicit brand IDs, optional Opsfly organization UUID, access plan, active/suspended state and optional ISO expiry); `platformAccessPlans` (active flag and module entitlements); `platformAccessRoles` (active flag and explicit module:view/manage permissions); `platformMemberships` (one company + product + native principal ID, optional Opsfly organization UUID, role IDs and active flag). Native document IDs always override embedded IDs. No linking by email or coincident IDs, no assumption that an Orderfly brand equals an Opsfly organization. One native brand/organization can link to at most one company. Global role templates gain scope only through company membership. Existing Orderfly global roles and pricing plans remain separate, clearly labelled catalogues.

The fixed vocabulary currently covers Orderfly orders/catalog/billing and Opsfly production/HR/training. It is configuration vocabulary, **not** an adapter to legacy permissions. `manage` does not imply `view`; select both where needed. All other module/permission strings are rejected. The product selected by a membership must match the requested module.

CRUD uses the existing catalogue lock, transaction, optimistic revision and audited idempotency key. References and duplicate memberships are checked under that lock. Referenced records cannot be deleted. An Opsfly organization cannot be changed while Opsfly memberships exist. mPanel validates organization/employee existence in Supabase before forwarding; Orderfly validates native brand/user existence and same-company organization binding. These cross-database checks are not atomic with later employee deactivation: preview reports saved policy only. Future enforcement must revalidate the live authenticated principal and its organization, never trust these directory checks as authentication.

`preview` takes companyId, product, principalId, module and permission. It reads a transactionally consistent, bounded catalogue and denies inactive company, expired subscription (expiry <= server time), missing product link, inactive/missing plan or module, missing/inactive/duplicate membership, wrong organization and absent/inactive role permission. There is no implicit owner/admin bypass. Returns `{ok, allowed, reason, mode:'preview'}`. It is accessible only to the existing exact configured platform owner. Directory reads expose only selection fields, bounded to 500 per catalogue; Opsfly employee directory is scoped to linked companies and bounded to 500 overall.

### Activation prerequisites (separate follow-up)

Keep cutover off until dedicated credentials and read-only live verification succeed. Before any activation, lock down direct Firestore client access to **all four new platform collections**, the audit/control collections, and legacy catalogue writes; current permissive test rules are not an enforcement boundary. Audit native references after imports/deletions, define verified product session-to-principal adapters, enforce company/resource scope in every affected business endpoint, map the existing permission systems explicitly, and test expired subscriptions, employee revocation, outages and cross-company denial end to end. Enabling mPanel catalogue administration alone does not activate shared product authorization.

Tests: `node --test tests/unit/mpanel-platform-admin.cjs` executes real service/schema/evaluator with transactional fixture I/O, including CRUD/audit/retry, native identity, duplicates, scope, both-product entitlement matrix, suspension/expiry and deletion dependencies. `npm run typecheck` remains required. No tests write production data.
