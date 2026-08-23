# PM / PO / Work development workflow

Last reviewed: 2026-08-23

## Roles

- **PM:** defines business goal, priority and product decisions.
- **PO:** converts requests and bugs into GitHub issues with scope, priority, acceptance criteria, dependencies, test requirements and documentation impact. PO accepts or rejects completed implementation.
- **Work:** automated implementation agent. It writes code/tests/docs on a feature branch but cannot merge or deploy production.

GitHub issues, pull requests, CI evidence and repository documentation are the operational source of truth.

## Issue state machine

`[READY FOR DEV] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR PO] -> [STAGING VERIFY] -> [DONE]`

`[BLOCKED]` is used when human intervention, credentials, repeated failures or staging/deployment problems prevent safe continuation.

## Automated sequence

1. PO creates a trusted, complete issue and prefixes it `[READY FOR DEV]`.
2. `.github/workflows/work-developer.yml` runs from the default branch, checks out current `develop`, creates/resumes `work-issue-<number>` and runs the Work coding agent using the official OpenAI Codex GitHub Action.
3. Work implements only the issue scope, adds/updates tests, runs typecheck and updates relevant documentation. It may not deploy, merge, change secrets or mutate production data.
4. Work pushes its branch and creates/updates a PR into `develop` with `Work-Managed-Issue: #<number>` in the PR body.
5. `.github/workflows/ui-tests.yml` (`Orderfly CI`) runs typecheck, builds the application through Playwright's CI web server and executes the local Playwright suite.
6. CI failure records failed-job evidence, returns the issue to `[READY FOR DEV]` and explicitly dispatches `Work Developer` again for the same issue. This explicit dispatch is required because a normal bot-authored issue edit made with the workflow token does not recursively start another ordinary event workflow. Repeated automatic failures eventually become `[BLOCKED]`.
7. Green CI triggers `.github/workflows/work-quality-gate.yml`, which runs a separate read-only Codex code review against the issue acceptance criteria and diff to `develop`.
8. Blocking review findings are written back to the issue and the quality gate explicitly dispatches Work for a repair iteration. A clean review changes the issue to `[READY FOR PO]`.
9. PO checks the linked issue, PR, diff, CI, review findings and documentation. If accepted, PO merges the PR into `develop`.
10. The merge triggers `.github/workflows/work-staging-live.yml`. It waits for the configured staging endpoint and runs read-only Playwright live checks.
11. Green live verification closes the issue as `[DONE]`. A live failure changes it to `[BLOCKED]` and prevents production promotion.
12. Promotion from `develop` to `main` is a separate production release decision under `docs/deployment-flow.md`.

Only issue comments from repository owners/members/collaborators and `github-actions[bot]` are included in coding/review agent context. This prevents arbitrary issue comments from becoming agent instructions while preserving automated CI and review feedback.

## Required repository configuration

### Secret

`OPENAI_API_KEY`

Used only by `openai/codex-action` for implementation and independent review. Never put the value in files, issues, PRs or logs.

### Variable

`ORDERFLY_STAGING_URL`

Must point to the live environment that represents merged `develop` code, such as the dedicated Firebase App Hosting staging/preview URL. It must not point to production for unattended feature verification.

If either required value is missing, automation records the missing configuration and moves the issue to `[BLOCKED]` rather than reporting false success.

## Test gates

Before `[READY FOR PO]`:

- TypeScript typecheck
- Next.js build as part of the Playwright CI web server
- Local Playwright suite against the PR merge candidate
- Independent code review
- Required documentation changes

Before `[DONE]`:

- PO acceptance
- Merge to `develop`
- Live staging endpoint healthy
- Read-only Playwright live smoke on desktop/public surface
- Mobile horizontal-overflow check on the public brand surface

Feature-specific issues may require additional API, authentication, database, mobile or end-to-end scenarios beyond this baseline.

## Failure handling

- **Implementation failure:** `[BLOCKED]` with Actions run link.
- **CI failure:** return to `[READY FOR DEV]` with failed log excerpt and explicit Work dispatch; automatic retry is capped.
- **Code-review failure:** return to `[READY FOR DEV]` with concrete findings and explicit Work dispatch; automatic retry is capped.
- **Missing OpenAI secret:** `[BLOCKED]`.
- **Missing staging URL:** `[BLOCKED]`.
- **Live staging failure after merge:** `[BLOCKED]`; do not promote to `main`.

Work never weakens tests or acceptance criteria to escape a failure.
