# Discount card acceptance and release evidence

Parent #566; F1 #577; F2 #578. This is an acceptance inventory, not a PASS receipt.

## Required evidence

| Area | Positive case | Required rejection/regression | Evidence owner |
| --- | --- | --- | --- |
| Superadmin | Current superuser enables one brand and creates group/card | Company admin, staff, missing/revoked identity cannot read or mutate; stale version cannot overwrite | A/B + F integration |
| Location scope | Selected location works; all includes new same-brand locations | Foreign, inactive, deleted and unselected locations fail even with old checkout | A/D + F integration |
| Personal assignment | Authoritative customer and active group resolve a card | Foreign customer/member, blocked/pending/expired/future card and inactive group fail | A/D/E + F integration |
| Invitation | Intended recipient accepts one valid invitation | Expiry, replay, revocation, wrong identity/brand and arbitrary client percentages fail; no implicit newsletter consent | C + F integration |
| Price | Repeat qualified orders receive the configured percentage | No discount on delivery/fees; no stacking on discounted/combo merchandise; a better offer wins; exact ore rounding | D + F integration |
| Order integrity | Server revalidates and stores applied immutable snapshot | Feature/group/card changed since quote cannot retain old entitlement; retries do not double-discount; refund uses captured amount | D + F integration |
| Existing Club | Existing stamps/rewards remain visible and usable under their own rules | Card purchase creates no purchase stamps; assigning/revoking a card does not erase historical stamps/rewards | D/E |
| Customer privacy | Authenticated owner sees own percentage/group/scope/validity | Other customer/brand/session cannot inspect card or use QR to change identity | C/E + F integration |
| Admin browser | Actual components at 390px and 1440px save settings/group/assignment | Invalid input, server denial, conflict and transport failure are visible; no success on rejection; no horizontal overflow | B |
| Portal browser | Actual components show active/inactive cards at 390px and 1440px | Preserved stamp UI, accessible QR controls, no secrets in serialized payload | E |

## Safe test environment

Service tests execute production TypeScript through `tests/helpers/load-ts.cjs`. External Firestore and mail transport are replaced with synthetic fixtures. Transaction fixtures enforce reads before staged writes and discard writes on rejection. No test fixture may mock the authorization decision or the discount computation that it claims to validate.

Actual-component Chromium tests may replace server actions with synthetic responses for UI state tests. These prove rendering, input handling, error states and responsiveness; they do **not** alone prove route authorization, production persistence or an end-to-end checkout. Cross-module service tests provide complementary business-flow evidence. Record these evidence types separately.

All identities use reserved `example.com` addresses. No production signup, invite, activation, customer assignment, payment or order creation is part of unattended QA. A real inbox-delivery assertion requires an explicitly authorized recipient and controlled scenario. Provider acceptance must never be reported as inbox delivery.

## Release checklist

1. Record the exact candidate SHA, current-main ancestry, test commands/counts and any genuine limitations.
2. Run own typecheck, targeted service/browser tests and relevant existing Club/checkout regressions.
3. Independent reviewer inspects the current integrated candidate. Another agent reviews F1's own test changes. New code invalidates the relevant prior review evidence.
4. Wait for all required CI on the current candidate, resolve blocking findings and human holds, and keep ownership PR history when consolidating.
5. Coordinator alone merges and deploys serially. Verify actual production release contains the accepted merge.
6. Authenticated production read-only checks: superadmin route loads, feature remains default-off where unconfigured, no public/company-admin administration, ordinary Club flow preserved. Record real browser evidence and no production writes.
7. Only close each issue after its own acceptance and release requirements are evidenced. A missing external test remains explicit with owner and next action; never relabel it as PASS or 100%.

## Current readiness

Base inspected: `4012d2d3`. Existing actual-module and actual-component fixtures support isolated QA without new services or credentials. New modules are being implemented by A–E. No new functional test or live acceptance has passed merely because this inventory exists. F1 must add its final command/result receipt after integration.

## Cross-module service inventory

`node --test tests/unit/discount-card-integration.cjs` executes real admin, invitation and checkout modules against one strict transactional synthetic database. Its 13 cases cover admin-to-entitlement repeat use, selected/all/foreign location transitions, verified identity, session revocation, assignment validity, stale snapshots, best-price competition, company-admin rejection, CAS rollback, tenant remapping, forged assignments, invitation-to-session-to-checkout, and invitation terms/expiry/replay/configuration invalidation. The fixture never sends mail or uses production credentials.

An initial composed-source run passed all 13 cases during development. This is preliminary integration evidence only. The coordinator must repeat this suite on the exact integrated candidate and record that SHA before release. Component browser results belong to B/E; provider/inbox and production browser acceptance remain separate.
