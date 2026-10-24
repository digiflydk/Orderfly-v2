# Personal discount card contract

Issues #566, #567, #568. First phase is platform-superuser administration only. Brand and location administrators cannot read or mutate the management API. Existing stamp membership, cards and rewards are never rewritten by this backend.

## Server records

All collections are server-only under the existing deny-all Firestore rules. No rules or index deployment is required for this contract. Epoch milliseconds are used for timestamps; percentages support two decimal places. Money helpers accept integer øre.

- `discountCardFeatures/{brandId}`: brandId, companyId, version, enabled, locationScope, updatedAt. Absent is disabled, version 0. `all` has no location IDs and includes future same-brand locations; `selected` has a unique nonempty ID list. The UI must explain this distinction.
- `discountCardGroups/{id}`: id, brandId, companyId, version, name, percentage, active, updatedAt. Percentage is greater than zero and no greater than 100. Changing the group affects future eligibility, not historical order amounts.
- `discountCardAssignments/{assignmentId}`: id, brandId, companyId, customerId, memberId (nullable), groupId, version, status (`pending`, `active`, `blocked`), startsAt/expiresAt (nullable), updatedAt. ID is SHA-256 of JSON `["discount-card",brandId,customerId]`. One assignment per brand/customer. Pending supports invitations; active requires a valid bound loyalty member when assigned through admin. An invitation may activate its pending assignment only after its own verified identity flow.
- `discountCardAudit/{hash}`: deterministic kind/record/version event containing before, after, actorId/name, companyId, brandId and timestamp. Saved atomically with mutations. Records are deactivated/blocked rather than physically deleted.

Strict schemas in `rules.ts` reject additional authority fields, invalid percentages, duplicate scopes and invalid dates. Identifiers are trimmed, 1–200 characters, with no slash or dot-only path values. Readers reject malformed or mismatched saved records instead of replacing them with enabled defaults.

## APIs and shared interfaces

Types live in `types.ts`; schemas and pure rules in `rules.ts`; collection names and `discountCardAssignmentId` (alias `assignmentId`) in `model.ts`.

Actor is `{identity: VerifiedIdentity, name: string}` obtained from a verified native session, never client payload. `admin.ts` exports:

- `requireDiscountCardSuperuserBrand(db, tx, identity, brandId)`: fresh transaction policy/brand checks; returns `{companyId, brand}`. Exactly one active company mapping and an existing nonsuspended/noninactive brand are required.
- `readDiscountCardAdmin(db, actor, brandId, customerQuery?)`: feature, groups, assignments, locations, customers, customersTruncated and assignmentsTruncated. Customer search is an exact normalized email (legacy primary email fallback), not a general substring search. Initial customer and assignment lists are capped at 200/500 with explicit flags. Exact-email search fetches matching assignment documents directly, including those beyond the initial 500. More than 500 groups/locations is an explicit catalog error, never silent scope truncation.
- `saveDiscountCardFeature(db, actor, {brandId,version,enabled,locationScope}, now?)`
- `saveDiscountCardGroup(db, actor, {brandId,id,version,name,percentage,active}, now?)`
- `saveDiscountCardAssignment(db, actor, {brandId,customerId,memberId,groupId,version,status,startsAt,expiresAt}, now?)`

Mutations return the saved strict record, recheck policy within the transaction, require expected version, and increment it. Group creation uses a caller-generated opaque ID and expected version 0. Customer must exist under the exact brand and not be inactive. Supplied member must be active and match company/brand/customer. Selected locations must exist, be active and belong to the brand. All reads precede writes. Audit failure rolls back the mutation. New customer creation and token mail/activation belong to the separate invitation contract, not these admin CRUD methods.

## Eligibility boundary

`discountCardEligible(feature, group, assignment, {brandId,companyId,customerId,locationId,now})` tests feature/group/assignment activity, exact tenant/customer/group bindings, location scope and validity (`startsAt <= now`, `expiresAt > now`). It is a pure function over authoritative already-parsed records, not authentication. Calling checkout/portal code must verify the session/customer identity, live member, company mapping and actual location ownership/status before using it. Server revalidation is required at order creation/payment. A browser percentage or email is never authority.

`discountCardAmountOre(eligibleSubtotalOre, percentage)` rounds half-up once on the eligible merchandise subtotal using integer arithmetic; delivery/fees and discounted merchandise must be excluded by the checkout integration. Existing better offers must not be degraded, and no stacking is introduced. Historical orders store the actual applicable rule/amount, not a mutable lookup.

## Validation and release

`node --test tests/unit/discount-card-backend.cjs` executes production services with a strict transactional in-memory Firestore: superuser revocation, company/location/customer/member isolation, duplicate writes/CAS, rollback, default-off, validity, schema rejection and bounded search. This is isolated functional coverage, not production live acceptance. Typecheck is required. Cross-module/browser tests and independent review are separate gates under #577/#578. Root owns serial merge/deployment, current-head CI and actual release/live checks; #567/#568 remain open until the relevant acceptance and release evidence exists. No production activation or invitation is performed by this implementation.
