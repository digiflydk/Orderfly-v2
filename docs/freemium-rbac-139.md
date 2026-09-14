# Freemium user and role access (#139)

## Product contract

All functions are commercially available during freemium. Subscription plans and expiry do not grant or deny access. Access requires a verified identity, active company membership, the requested company/location scope and explicit function/action permission. Role names are display text. Company administrators may delegate only permissions and scope they possess; only platform superusers administer global principals and companies. The final active superuser cannot be removed.

## Current candidate

- `access/policy.ts` validates the permission catalogue, principals, companies, roles and memberships. Company bindings uniquely reference native Orderfly brands and Opsfly organizations. Null location scope means all locations in one company; an empty list never grants unrestricted access.
- `access/authority.ts` stores policy in the existing browser-denied `platformAdminControl/access-v1` document. Policy and immutable audit events commit in one Firestore transaction. Revision checks prevent lost updates. Maximums are 500 records per collection and 750 KB. Explicit initialization accepts only the runtime-configured verified Opsfly owner and never resets a populated authority; that bootstrap identity does not override later grants.
- Native identities are namespaced hashes of provider and immutable subject, including organization for Opsfly employees. `enroll` verifies an existing native account and atomically adds its central principal and company membership. It preserves create authorization on idempotent retries and rechecks current grants. Existing inactive principals cannot be reactivated through enrollment. Native login creation and linking two provider accounts to one person are not implemented.
- `/api/integrations/mpanel/access` authenticates the fixed Opsfly machine bridge and its strict actor envelope. `initialize`, `list`, `check`, `checkNative`, `session`, `nativeGrants`, `enroll` and revision/request-ID checked `change` are validated commands. Browser actor injection and unknown commands deny. Opsfly targets are verified by the authenticated bridge; Firebase targets must exist and be active in Firebase Auth.
- The paired mPanel editor creates companies/roles and enrolls or edits/deactivates existing users, using native directory selectors and mobile dialogs. Only superusers see the Firebase directory. Delegated native Opsfly directory reads require company-wide member-view permission. Listings never initialize or grant access automatically. The new screen does not contain subscriptions.
- `/admin-login` and `/api/admin/session` establish an HTTP-only session only after same-origin verification, a fresh revoked-checked Firebase ID token and current central Orderfly access. Every runtime guard verifies the session cookie with revocation checking. `getSuperadminUserContext` reads the verified Firebase account, never the first directory record.
- Legacy global `hasPermission` moved to a server-only module and now requires a current central superuser. Its shared client catalogue contains no always-allow implementation. This is a global administration guard; company operations require explicit native scope.

## Runtime integration status

| Surface | Candidate behavior |
| --- | --- |
| Orderfly order list | Queries are restricted to granted brands and native-owned locations. |
| Orderfly order detail | Checks `orderfly.orders:view` for the stored brand/location before returning the detail. |
| Orderfly order status | Checks `orderfly.orders:edit`; transaction rejects changed ownership and preserves payment requirements. |
| Orderfly brand website CMS | Config, home, menu and page operations use explicit `orderfly.website` view/create/edit/delete permissions for the brand. Internal audit/storage helpers are no longer exposed Server Actions. |
| Orderfly existing global permission checks/API helpers | Require verified central superuser instead of an always-allow placeholder. |
| Opsfly shared customer API | Uses current company-wide `opsfly.customers:view`, or `edit` for backfill, after native session and active organization verification. Native admin role alone is insufficient. |
| Orderfly products | Scoped create/edit/delete/copy/reorder and list/detail. Writes recheck current policy, old ownership and resulting ownership in the same transaction. Legacy product mutations delegate to these actions. |
| Orderfly discounts and customers | Current company/location guards on list/detail/create/edit/delete. Customer records require company-wide scope. Customer creation uses a bounded authorized brand selector with visible load/save failures. |
| Orderfly settings and payment credentials | Global settings require a current superuser. Private Stripe keys are internal server-only helpers; the public action returns only the publishable key. |
| Orderfly navigation | Sidebar entries use the verified session permission set; each server operation still performs its own check. |
| Public product lookup | The native location determines the brand. Only active, non-test menu fields for that brand/location are returned; lookup without a location requires authenticated catalogue access. |
| Opsfly booking and notifications | Every known action selects an explicit current permission before business I/O. Booking uses the native resolved location; notifications require company-wide `platform.notifications` rights. |
| Other Orderfly/Opsfly protected operations | Migration and full entrypoint audit remain incomplete. |

`nativeGrants` returns explicit native tenants and permitted location lists, never an all-tenant wildcard. Native location ownership is checked independently of catalogue mappings. Public storefront/checkout helpers and worker credentials remain separate from employee authority; mixed public/admin files must be classified at operation level before applying guards.

## Remaining release blockers

This is an **incomplete paired draft, not an activated RBAC release**. The following are required before issue completion:

1. Complete the protected API/Server Action and Opsfly operation inventory and migrate all remaining operations, query scopes, database RPCs and navigation to current authority. Menus/layouts alone do not protect direct calls.
2. Finish user onboarding and native account provisioning/binding, delegated administration UX, and the broader company/location access scenarios.
3. Review Firestore data rules and all native client write paths together. The existing protected authority collections do not imply that the legacy business database has been secured.
4. Preserve the independently released Opsfly #281 inventory notification work during branch integration.
5. Complete affected browser tests, full paired type/contract/R3 preflight, independent exact-head review and acceptance. Then perform controlled bootstrap and coordinated deployment with live allow/deny verification. No production initialization or write has been performed by this development work.

## Verification

`tests/unit/freemium-access.cjs` and `access-authority.cjs` cover scope, revocation, delegation, last-superuser invariants, namespace isolation, native mapping, concurrent revisions, explicit bootstrap, enrollment and verified cookies. `order-access.cjs` executes the actual order query/status code with external I/O replaced, including denied edits and ownership changes during a transaction. `admin-session.cjs` verifies current central authorization, caller identity, fresh login, origin rejection and HTTP-only cookies. Existing brand/location and legacy catalogue regression fixtures keep their original assertions and replace the relocated permission I/O boundary.

The paired Opsfly browser tests exercise company, role, membership and error flows on desktop/mobile. Customer handler tests use the real central decision adapter and fixture business queries. These are development tests, not deployment proof. The draft must remain unmerged until every release blocker is resolved.

## Additional implementation checkpoint (2026-09-14)

The candidate remains incomplete and must not be activated. New focused verification: 89 policy/authority/scoped-data/product/menu/discount/settings/navigation tests and 18 actual-component browser tests passed (the browser suite includes customer creation at widths 390 and 1280 and the existing product image/retry cases). The unchanged order/session/website/legacy policy group also passed, and `npm run typecheck` passed.

The broader checkout selection has 94 passes and two failures: the cart-restoration unavailable-topping-group case and the webhook atomic-retry fixture. Both failures reproduce on the untouched starting commit `d8f4ee77bee451117adcb3995fb21b759446521f`. They have not been skipped, weakened or counted as green. The Opsfly paired gate additionally cannot resolve its required npm dependency in this environment (`Connection refused` from registry.npmjs.org). Full exact-head preflight, independent review and live verification therefore have no passing evidence.

Remaining implementation is substantial: HR/PIN and employee self-service, production/inventory/procurement and privileged SQL RPCs, remaining Orderfly catalogue/loyalty/feedback/billing/analytics/legacy client write paths, native account creation/linking and full delegated navigation still require migration. This checkpoint is not evidence that the whole access module is finished.


## Continuation checkpoint, 2026-09-14 (not released)

Feedback now derives current permissions and company scope from the transactional central authority after revoked-checked Firebase authentication. Historical environment grants and the dummy-data bypass no longer authorize access. Global feedback question versions still require a platform superuser; full-company feedback aggregates deliberately reject location-only grants. The real central authority is exercised by the updated feedback fixtures: 68 tests pass. Global loyalty settings mutations now require a current platform superuser. Its nonsecret scoring reads remain available to existing checkout/integration callers.

Categories and legacy topping/group actions use native-location catalogue guards. Records without brandId are resolved through every native location; a supplied primary brand never establishes ownership. Create/edit/delete/reorder check current central policy; mutations cover stored and resulting scope in the same transaction. Group cascades authorize every child before any delete, and reducing a group scope cannot orphan its toppings. Public category/topping lookups require an active native location and return finite menu fields. Ten scoped/location-catalogue tests pass; broader browser acceptance is still required.

The permission catalogue includes separate own-time/schedule/training/checklist features and explicit deletion rights for time/production/inventory/procurement. Paired Opsfly labels these in mPanel. These additions do not assign any production user rights. TypeScript checks pass at this checkpoint.

The paired module is still incomplete. Remaining blockers include the other Orderfly catalogue/analytics/billing/legacy-client paths, complete delegated navigation, native account provisioning/linking, native Opsfly SQL and profile/document integration, full preflight and independent review. No bootstrap, production change, merge or deployment is claimed.
