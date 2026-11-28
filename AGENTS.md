# Orderfly Work engineering rules

## Work process (owner decision 2026-11-28, applies to every task)

These rules apply to every task in this repository and override older wording elsewhere.

1. **Local tests; GitHub Actions only deploys.** Work runs every test in its own environment (`npm run ci`). GitHub Actions is used only for deployment, never to run tests or to gate a merge.
2. **Automatic merge and deploy.** When the local tests are green on the exact head and the independent review has no unresolved blocking finding, Work merges, deploys and verifies live itself. Nobody approves a green release.
3. **Database changes without manual approval.** Supabase schema and data changes ship as reviewed migrations (or idempotent scripts) in a release and are applied automatically after the merge with the PO's standing Supabase API token. The token is a network secret for `api.supabase.com` on the Claude cloud environment and never goes into GitHub, files, PR/issue text, logs or chat. No change needs a manual approval. Production data is not changed outside a release: a one-off data fix is a reviewed script in a release.
4. **Release note to the owner.** When a task is live and verified, Work emails a short, non-technical release note to okh@digifly.dk. Subject `Release: <short title>`; 3–6 plain-language lines on what customers, staff or the business can now do, what changed for them and anything they must do. No code, file names, commit SHAs or test jargon. Send it with the Microsoft 365 mail connector (`outlook_send_mail`). If the session has no mail connector, post the note on the issue and tell the owner in chat that the mail was not sent.
5. **Parallel agents when they make the task faster.** At the start of every task Work assesses, and states in its plan, whether independent parts (for example backend and UI, or separate modules) can be built by parallel agents (subagents or worktrees). Use them when the parts are independent and the task is big enough to gain; work alone when the task is small or the parts depend on each other. Parallel work lands in one branch and one candidate.
6. **As few releases as possible.** Bundle a task, and related tasks queued at the same time, into one release so the full test run, review, deployment and live verification run once. Do not release sub-parts separately unless a part is urgent or blocks other work. While developing, run only the relevant tests; the full run is for the final head.
7. **Lean code.** Every change is optimized before review: no unnecessary code, no duplicated helpers or logic, no dead paths (a replaced path is deleted in the same change), no new libraries without need and no speculative work outside the issue. Reuse existing helpers. Review treats duplication and dead code as findings to fix before merge.

## Repository and release boundaries

- GitHub is the source of truth.
- Work feature branches start from `main` and open pull requests into `main`.
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
