# Freemium user and role access (#139)

## Product contract

All functions are commercially available during freemium. Subscriptions, plan
status and commercial expiry do not grant or deny user access. An active identity,
active company membership, the requested company/location scope and explicit
function/action permission are required. Superusers have platform authority;
company administrators can delegate only within their own authority. Role names
are editable display text and never confer authority.

## Implemented in this branch

`src/lib/access/policy.ts` defines the version-one policy vocabulary and pure
decisions for access, membership changes and role changes. It validates records,
rejects unknown permissions and references across companies, supports distinct
memberships in multiple companies, checks revocation, prevents delegation beyond
the administrator's permissions/scope and protects the last active superuser.
Company administrators need explicit member/role management permissions. Company
users do not gain delegation authority by receiving similarly named permissions.

Location IDs are canonical platform location IDs; the runtime adapter must resolve
the product's brand/location/organization record to this ID server-side. A null
location list means all locations in one company. An empty list means no location
access, never unrestricted access. A location-limited grant cannot authorize a
company-wide query. An edited role affects every assignee, so company-wide
administration authority is required to change a company role definition.

The caller must use one transactionally consistent snapshot for authorization and
the resulting mutation. `before` must come from that transaction, not from an
untrusted request. Platform records must remain inaccessible to client writes.
Snapshot validation failure denies the operation; it is not a reason to replace
live policy with a default or a superuser fallback.

## Not implemented / release blockers

This branch is a policy foundation, **not an activated RBAC release**. No deployed
handler calls this policy yet. Existing preview schemas are a separate legacy
format and are not silently migrated. No authentication or runtime protection is
claimed from unit tests. The following remain required for issue completion:

1. A canonical identity registry binding verified Opsfly employee sessions and
   verified Orderfly identities. Never select the first user or trust an email,
   browser-supplied actor, role or company as proof of identity.
2. Transactional policy storage and scoped CRUD endpoints, native identity and
   location reference validation, revision checks and immutable audit events.
   Deactivation of a principal/company must preserve the last-superuser invariant
   too; the current change only implements role/membership mutations.
3. mPanel forms for superusers, company admins/users and dynamic roles, with
   company/location choices, filtered directory reads, mobile dialogs and visible
   errors. Regular users must be able to authenticate, not just legacy admins.
4. Runtime adapters for every protected Orderfly API/Server Action and Opsfly
   operation, enforcing resource scope in queries. The feature list here is a
   vocabulary, not a completed endpoint inventory. Mixed public/admin handlers
   must be split or classified by operation; public checkout and trusted workers
   retain their separate identity rules.
5. Replace the always-true `hasPermission` mock and the first-user context only
   with a working authenticated login path, avoiding an incomplete lockout.
6. Controlled bootstrap/migration from the approved operator to explicit
   superusers, paired product deployment, live allowed/denied verification and
   full mobile create/edit/deactivate tests. The unverified earlier activation
   rollout is not proof of these capabilities.

## Verification

`node --test tests/unit/freemium-access.cjs` exercises the policy with permitted
access and rejection cases, including immediate deactivation, cross-company and
location escape attempts, excessive delegation, last-superuser protection and
stale mutation records. It runs in the existing CI regression step.

`npm run typecheck` checks the complete application. Independent review and PO
acceptance remain separate from implementation. This draft must not be merged
or deployed as the completed access-control solution.


## Authority and native identity adapter (2026-09-14 candidate)

The candidate now includes `src/lib/access/authority.ts` and a machine-authenticated `/api/integrations/mpanel/access` endpoint. Policy lives in the existing browser-denied `platformAdminControl/access-v1` document; writes and audit events share a Firestore transaction. Initialization is explicit, allowed only for the runtime-configured verified Opsfly owner, and rejected once initialized. That bootstrap identity does not override stored grants afterward. Policy is bounded to 500 records per collection and 750 KB.

`list`, `check`, `checkNative` and revision-checked `change` commands use current stored policy. Company administrators may delegate permitted roles/memberships within their current scope. Global principal/company changes require an active superuser; removing the last superuser through principal deactivation is rejected. Reads return only administrable memberships and company-wide administrable roles to company administrators. Company records bind native Orderfly brands and an Opsfly organization uniquely; subscriptions are not evaluated.

Canonical principal IDs are hashes of provider plus immutable subject, including the organization for Opsfly employees. The API only accepts the authenticated Opsfly bridge envelope. `orderfly-session.ts` separately verifies a Firebase session cookie with revocation checks and resolves current native brand/location access. Its guard is prepared but not yet called by existing business handlers.

New tests cover bootstrap rejection/reset prevention, competing revisions, tenant-filtered catalogues, global principal deactivation, current-policy authorization on retries, native namespace isolation, native tenant mapping and rejected/revoked cookies. These are fixture tests, not a production rollout or a completed security cutover.

Remaining blockers: mPanel needs the new authority editor and verified native account provisioning/binding. Existing business handlers and Server Actions still require migration to the new guard. Opsfly booking RPCs currently receive actor IDs and several retain native legacy authorization, so changing just the HTTP guard is insufficient; their authorization and exact tenant/location boundaries must be reviewed with the handler changes. Existing always-allow Orderfly helpers remain a release blocker. No initialization request or production write was performed.
