# Orderfly Work engineering rules

## Repository and release boundaries

- GitHub issues and accepted repository documentation are the source of truth.
- Work feature branches start from `main` and open pull requests into `main`.
- Classify every change from its concrete diff and failure consequence using the R0-R4 model below.
- R0 and R1 are the normal flow. R2-R4 are exceptions and require an objective trigger plus an explanation of why R1 is insufficient.
- The implementation agent must not merge its own pull request without explicit PM/PO fast-track acceptance recorded on the issue or pull request and an authorized repository owner, maintainer or operator performing the merge.
- PM/PO may approve fast-track before implementation. When the accepted scope, exact head and required checks still match that approval, no additional routine PO waiting gate is required.
- Production deployment is separate from merge. A commit on `main` is not deployment evidence.
- Runtime changes require focused live verification before the issue is Done.

## Risk classes

Risk follows the actual change. A commercially important page is not automatically high risk when the diff is small and isolated.

| Class | Use | Required control |
|---|---|---|
| R0 | Documentation, metadata, issue/governance text and other changes with no runtime effect | Local validation and focused diff review. Normally 0 GitHub Actions minutes |
| R1 | Default for small, isolated code or UI changes with a known boundary, including text, color, icons, layout, routing and focused bug fixes | Local typecheck and only the directly relevant test. At most one short targeted release-candidate CI run when needed |
| R2 | Business logic that changes behavior across multiple directly connected components and cannot be isolated as R1 | Targeted tests for changed components, direct callers and direct regressions |
| R3 | Concrete changes to authentication, authorization, payments, Firebase security rules, migrations, destructive actions, tenant/brand boundaries or sensitive production data | Focused security, data-integrity and rollback review of the affected domain |
| R4 | Exceptional cross-system change with credible risk of broad security breach, irreversible data loss or outage across multiple domains | A separate PM/PO-approved release and rollback plan |

Examples that normally remain R1:

- changing or restoring one button, link, route or form action;
- an isolated frontend redirect;
- a focused UI or responsive-layout correction;
- a small bug fix with a known cause and direct regression test;
- an isolated CRUD rule using an existing authorization pattern.

Do not raise a task to R2-R4 merely because the module is important. Record the exact trigger when a higher class is required. If investigation reveals a higher risk than approved, stop, document the finding and request a scope/risk decision instead of silently expanding the work.

## Efficient development and GitHub Actions

- Develop and iterate locally. Draft commits and ordinary PR updates should not require repeated broad GitHub Actions runs.
- Run only checks that can fail because of the changed files or directly affected flow.
- Before requesting the release-candidate gate, consolidate known fixes, run the local checks and review the complete diff.
- Use no more than one targeted GitHub Actions release-candidate run for an unchanged exact head unless a documented infrastructure failure requires a retry.
- Do not run a full application, browser or cross-module suite for an R0/R1 change unless the diff directly affects those flows.
- If the head changes after evidence, rerun only the relevant candidate gate after all known findings have been resolved locally.
- Do not create serial review loops where every small finding causes an immediate commit and full rerun.
- R0 normally uses no Actions. R1 should normally fit within 5 minutes, R2 within 10 minutes, R3 within 20 minutes and R4 within a separately approved budget normally capped at 30 minutes.
- Never bypass validation, authorization, assertions or meaningful rejection coverage merely to reduce runtime.

## Fast-track approval and merge

PM/PO may record an explicit fast-track approval on the authoritative issue or pull request. The approval must identify the scope and risk class.

After approval, an authorized repository owner, maintainer or operator may merge without another routine PO gate when all of the following are true:

1. the implementation remains within the approved scope and risk class;
2. the PR targets `main` and is mergeable;
3. the exact head matches the reviewed/tested candidate;
4. the risk-appropriate local checks and any required single targeted CI run are green;
5. blocking review findings are resolved;
6. no undocumented auth, payment, tenant, secret, migration or production-data impact was introduced.

Fast-track does not permit bypassing GitHub permissions, branch protection, security boundaries or required deployment verification. If any condition no longer holds, stop and request a new decision.

## Firebase project separation

- Firebase App Hosting project: `orderfly-v21-10334086-b3076`.
- Production data project: `orderfly-39325`.
- Do not point public/server Firebase data configuration at the hosting project unless an explicit architecture migration issue requires it.
- Never expose or commit Firebase service-account JSON, API secrets, payment secrets or session credentials.

## Product and security integrity

- Implement the linked GitHub issue and its acceptance criteria, not adjacent speculative work.
- Preserve authentication, tenant/brand boundaries and server-side authorization.
- Flag any query or mutation that could read or modify another customer/brand's records without an explicit ownership boundary.
- Do not weaken input validation, authorization or audit behavior to make a test pass.
- Never use real customer, order, payment or employee data as unattended test data.
- Any controlled write verification must be explicitly authorized, reversible and cleaned up exactly.

## Testing

- TypeScript runtime changes require `npm run typecheck`.
- Run only the relevant Playwright tests for changed user flows.
- R0 documentation/governance changes require no application Playwright test.
- Keep browser tests meaningful. Do not skip, loosen or delete assertions merely to make CI green.
- A changed critical business flow needs successful behavior plus only the important directly related rejection or edge case.
- Post-merge live verification is read-only unless an issue defines an explicitly controlled and reversible write test.
- Unattended tests must not mutate production data.

## Documentation

- Update the relevant files under `docs/` in the same pull request whenever behavior, architecture, APIs, data flow, deployment, operations or testing changes.
- A small code change does not require unrelated documentation rewrites.
- Keep risk class, local evidence, exact-head review, merge, deployment and live-verification status accurate.
- Do not describe merge as deployment or a planned capability as live.

## Work agent boundary

The Work implementation agent may edit the checked-out repository, add focused tests and update relevant documentation. It must not change GitHub secrets, expose credentials or mutate production data.

The implementation agent does not gain merge or deployment authority merely by completing code. Merge requires either the normal accepted process or recorded PM/PO fast-track acceptance plus an authorized repository owner, maintainer or operator. Deployment remains a separate authorized operation with focused live verification.
