# mPanel platform administration — issue #130

Draft implementation paired with digiflydk/esmeralda-restaurant-operations#273. Not deployed.

## Behavior

mPanel owns the new users, roles and subscription-plan editing UI. The server-only POST `/api/integrations/mpanel/platform-admin` retains the existing Firestore collections and native IDs. It exposes strict list/save/delete commands with bounded fields, known Orderfly permissions, revision conflicts, request-ID idempotency, reference checks and audit events. Edits preserve unrelated fields, including plan feature IDs.

Set `MPANEL_PLATFORM_ADMIN_ENABLED=true` only during the coordinated cutover. This enables the bridge, redirects legacy users/roles/subscriptions pages and nested editors to `https://www.esmeraldapizza.dk/mpanel#platform`, removes their menu entries and rejects their old server writes. Billing stays available. Brand creation then requires an existing mPanel-managed owner, and brand owner/plan references are validated within a transaction sharing the catalogue lock. Disabled is the default. With activation preparation #137, legacy catalogue writes remain retired even while the bridge is disabled.

This does not create authentication accounts, replace the current Orderfly login, implement shared Opsfly permissions, assign customer subscriptions or enforce subscription entitlements. Moving the administration is phase one of the shared platform architecture.

## Server configuration and authorization

The staged secret binding and rules preparation are documented in
[`mpanel-activation-137.md`](mpanel-activation-137.md). That follow-up requires
current published-rule comparison, emulator tests and live verification before
activation; secret creation alone is not a completed release.

Both runtimes must have the same dedicated `MPANEL_PLATFORM_ADMIN_SECRET` (at least 32 random characters), verified `MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID` and `MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID`. Never expose these as public/browser variables or reuse notification secrets. The mPanel function authenticates the exact active configured owner session; Orderfly authenticates the machine secret using a timing-safe comparison and independently verifies the actor and organization envelope. This is intentionally global platform-owner access to all catalogue records, not per-brand customer access. Unknown admin identities must not receive this scope.

## Data and rollout

New server-only collections: `platformAdminAudit` (immutable request result and actor/action metadata) and `platformAdminControl` (catalogue transaction lock). Existing `users`, `roles` and `subscription_plans` are not migrated. The list currently refuses catalogues over 500 records per collection.

Deploy the coordinated pair disabled; configure secrets out of band. Before enabling, verify Firestore rules deny direct browser reads/writes to the two new internal collections and direct browser writes to users/roles/plans. Rules are not checked in by this change. Audit other writers of brand owner/subscription and subscription plan references against the shared transaction lock; fixture tests cannot prove their concurrency safety. Finish exact-head checks and independent review in both repositories, then activate and verify a selected dummy-record lifecycle, legacy redirects/write rejection and normal billing. No runtime configuration has been changed as part of this draft.

With activation preparation #137, rollback disables the feature flag and closes the bridge while retaining records, edits and audit events. Catalogue editing stays closed during rollback; it does not reopen legacy server writers. See the activation runbook.

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

Preview rechecks native Orderfly brand and user existence inside the same read transaction before returning an allow decision; legacy deletion cannot leave an apparently valid product link. User deletion checks membership dependencies within the Orderfly namespace only, so a coincident Opsfly employee UUID is unrelated. Opsfly directory/reference reads additionally require the bridge operator organization allowlist, defaulting to the configured owner organization.

Every catalogue managed by this service enforces its 500-record capacity during creation, inside the shared lock transaction and after the replay check. Creating record 501 fails without a data/audit mutation; existing records can still be listed, edited and deleted, and retries of an already successful create remain idempotent at capacity. External/native imports must also respect the documented bounded-directory limits.

## Orderfly module launch (#165, candidate)

mPanel now has an Orderfly module entry paired with Opsfly #319. It opens a separate Orderfly window without asking for another PIN. The existing native Opsfly session is verified twice: when issuing the handoff and when redeeming it. Current central authority selects a permitted Orderfly landing page; product handlers still enforce their own native brand/location scope.

The receiving `/admin-login/mpanel` page starts an exact-origin JSON request to `POST /api/admin/mpanel` (`action: start`). A Secure, HttpOnly, SameSite=Strict, host-only challenge cookie binds the exchange to this browser. Only an allowlisted Esmeralda opener can receive the random challenge or supply the code; both origins and window references are checked. There is no credential in the URL. Successful redemption detaches the opener and navigates to a fixed permission-derived path.

Opsfly `platform-admin` accepts `orderfly_launch` with mode `check` or `issue`. It validates the active, unrevoked native session, employee, organization and operator allowlist, then sends the native token over a fixed authenticated server-to-server HTTPS path to `POST /api/integrations/mpanel/launch`. The browser receives only a random 60-second code. The raw token is never sent by browser navigation/postMessage or returned in a response. This is not the obsolete owner-only SSO in PR #27.

`platformAdminControl/mpanel-launch-<identity SHA-256>` holds at most one pending grant per verified native identity, with hashed code/challenge, numeric expiry and an AES-256-GCM encrypted native token. A domain-separated key is derived from the existing server-only bridge secret. The control collection is already denied to all browser clients by the platform Firestore rules. The grant expires after 60 seconds even without TTL configuration, and successful consumption deletes it transactionally. Another launch replaces the pending grant. Concurrent redemption, wrong browser, replay, expiry, native revocation and permission removal all fail closed. A failed authorization after consumption requires a fresh launch; it never restores the code. An unredeemed expired encrypted slot may remain until that identity launches again; it grants no access.

Orderfly creates its existing signed HttpOnly `__session` cookie, never a new owner bypass or broader role. Native logout/PIN reset/deactivation therefore invalidate both products through existing live native-session verification. The paired release uses the existing `MPANEL_PLATFORM_ADMIN_ENABLED`, bridge secret and native auth endpoint; no new provider or credential is required. Disabling the bridge also disables start/redemption.

Release Orderfly first, then Opsfly `platform-admin` and `mpanel-ui` from their accepted commits. No database migration or business-data backfill. Verify deployed protected control-collection rules and matching provider source/commit before post-deploy probes. Read-only probes reject anonymous/malformed exchanges and check receiving-page availability. The final signed-in launch uses the operator's existing account and creates only a short-lived authentication grant/cookie, no business record. Rollback the mPanel launcher first, then the Orderfly handoff routes; existing native login remains available.

Tests: `tests/unit/mpanel-launch.cjs` covers production issuance/redemption, encryption, atomic replay and request boundaries. `tests/unit/mpanel-launch-browser.cjs` renders the real receiving page at 390/1440px with fully intercepted transport. No production credential or real business transaction is used.
