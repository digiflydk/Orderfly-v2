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
- Run `npm run ci` before merging (see the automatic merge rule); GitHub Actions does not run tests.
- Keep browser tests meaningful. Do not skip, loosen or delete assertions merely to make CI green.
- A changed critical business flow needs both successful behavior and important rejection/edge-case coverage.
- Post-merge live verification is read-only unless an issue defines an explicitly controlled and reversible write test.
- Unattended tests must not mutate production data.

## Documentation

- Update the relevant files under `docs/` in the same pull request whenever behavior, architecture, APIs, data flow, deployment, operations or testing changes.
- Keep the PM -> PO -> Work -> CI/Playwright -> code review -> PO acceptance (or automatic merge) -> merge -> live verification -> Done workflow accurate.

## Work agent boundary

The Work implementation agent may edit the checked-out repository, add tests and update documentation. It must not change GitHub secrets or write production data directly. Production data changes reach production only as reviewed, merged Firestore rules, indexes or migrations that the deployment workflows apply. It must not merge its own pull request or deploy production, except under the automatic merge rule below. Local CI (`npm run ci`), independent code review, the automatic merge rule (or PO acceptance) and live verification are separate gates.

## Automatic merge and deploy

Approved by PO/PM on 2026-10-18; review fallback approved on 2026-11-20; tests moved out of GitHub Actions and Firestore deployment automated on 2026-11-22 (#934) so that development never waits for a person. GitHub Actions is used **only for deployment**, never to run tests. Work may merge its own pull request into `main` without separate PO/PM acceptance when all of the following are true on the PR's current head commit:

1. `npm run ci` has passed in full on that exact head commit with a clean working tree. It runs every test step the former test workflows ran (`scripts/ci/steps.mjs`) and stops at the first failure. Work posts its summary (`.cache/ci-summary.md`: commit, steps, result) on the PR. A later commit needs a new full run. Do not add `[skip ci]` to code changes, and never merge on a failed run.
2. An independent code review has completed on the head commit with no unresolved **blocking** findings, and every review thread is resolved:
   - normally the Codex code review;
   - when Codex is unavailable on that head (it reports a usage limit or a failed review, or has posted no result 30 minutes after the PR was opened or updated), an independent review by a separate Claude review agent that Work starts on the exact head SHA. Work posts the agent's report on the PR, with each finding labelled `BLOCKING` (acceptance, security, tenant/privacy, data correctness, regression) or `NON_BLOCKING`.
   - `NON_BLOCKING` findings do not stop the merge; Work states in the PR which ones it fixed and which it left. A later commit needs a new review of the new head.
3. No human reviewer has requested changes or asked to hold the PR.
4. The PR branch contains the current `main`. If `main` has moved since `npm run ci` and the review ran, Work merges `main` into the branch and runs both again on the new head before merging. Work merges with the head SHA it verified, so a later push cannot slip in. Right after merging Work checks that the merge commit's parent is the `main` it verified; if `main` moved in between, Work runs `npm run ci` on the new `main` before live verification and reverts at once if it fails.
5. The documentation is updated.

**Firestore rules, indexes and data migrations** are merged under the same rule and deployed automatically by their GitHub workflows after the merge (`firestore-rules.yml`, `firestore-indexes.yml`, `firestore-migration.yml`, see `docs/firestore-operations.md`). Merging is deploying: a rules PR publishes the whole `firestore.access.rules` file, so it must state that the complete file is ready to be live and be covered by the emulator tests in `tests/firestore`; a migration must follow `scripts/migrations/README.md` (idempotent, scoped, tested against a fake database).

Only a PR that changes this rule or GitHub secrets still needs explicit PO/PM acceptance. An explicit PO/PM instruction to merge is that acceptance.

After the merge, Firebase App Hosting deploys `main`. Work waits until `/api/health` reports the merge commit (or a later `main` that contains it) as `release`, and until any Firestore deployment workflow the merge started has succeeded, then performs the issue's live verification (read-only, or the controlled and reversible scenario the issue defines) and reports the result. If a deployment or the live verification fails, Work opens a revert PR at once and reports it. The merge commit states that it was merged under this rule.
