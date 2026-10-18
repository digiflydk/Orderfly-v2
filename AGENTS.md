# Orderfly Work engineering rules

## Repository and release boundaries

- GitHub is the source of truth.
- Work feature branches start from `main` and open pull requests into `main`, matching the Esmeralda development process.
- Work must never merge its own pull request or bypass PO acceptance, except under the automatic merge rule below.
- Production deployment is a separate post-merge step and must be followed by live verification before an issue is Done.

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

## Testing

- Run `npm run typecheck` for TypeScript changes.
- Run the relevant Playwright tests for changed user flows.
- Keep browser tests meaningful. Do not skip, loosen or delete assertions merely to make CI green.
- A changed critical business flow needs both successful behavior and important rejection/edge-case coverage.
- Post-merge live verification is read-only unless an issue defines an explicitly controlled and reversible write test.
- Unattended tests must not mutate production data.

## Documentation

- Update the relevant files under `docs/` in the same pull request whenever behavior, architecture, APIs, data flow, deployment, operations or testing changes.
- Keep the PM -> PO -> Work -> CI/Playwright -> code review -> PO acceptance (or automatic merge) -> merge -> live verification -> Done workflow accurate.

## Work agent boundary

The Work implementation agent may edit the checked-out repository, add tests and update documentation. It must not change GitHub secrets or mutate production data. It must not merge its own pull request or deploy production, except under the automatic merge rule below. Independent CI/code review, PO acceptance (or the automatic merge rule) and live verification are separate gates.

## Automatic merge and deploy

Approved by PO/PM on 2026-10-18. Work may merge its own pull request into `main` without separate PO/PM acceptance when all of the following are true on the PR's current head commit:

1. Every CI check is completed and green. None is failing, pending or cancelled.
2. The Codex code review has completed on the head commit with no unresolved findings, and every review thread is resolved.
3. No human reviewer has requested changes or asked to hold the PR.
4. There is no merge conflict with `main`.
5. Work has run the typecheck and the relevant tests itself, and the documentation is updated.

The rule does not cover a PR that changes this rule, GitHub secrets or workflow permissions, or that requires a production data write (Firestore rules, indexes or data migrations through the `production` environment). Those still need PO acceptance.

After the merge, Firebase App Hosting deploys `main`. Work waits until the new build is live, then performs the issue's live verification (read-only, or the controlled and reversible scenario the issue defines) and reports the result. If live verification fails, Work opens a revert PR at once and reports it. The merge commit states that it was merged under this rule.
