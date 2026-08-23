# PM / PO / Work development workflow

Last reviewed: 2026-08-23

## Principle

Esmeralda and Orderfly use the same product-development responsibilities and quality standard. Their branch/release topology is different: Orderfly feature work integrates through `develop` before any later production promotion to `main`.

## Roles

- **PM:** defines business goal, priority and product decisions.
- **PO:** converts requests and bugs into GitHub issues with scope, priority, acceptance criteria, dependencies, test requirements and documentation impact. PO accepts or rejects completed implementation.
- **Work:** automated implementation agent. It writes code, tests and documentation on a feature branch but cannot merge, deploy production or declare the product Done.

GitHub issues, pull requests, CI evidence and repository documentation are the operational source of truth.

## Orderfly state machine

`[READY FOR DEV] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR PO] -> [STAGING VERIFY] -> [DONE]`

`[BLOCKED]` is used when credentials, repeated CI/review failures, staging/deployment problems or another external dependency requires intervention.

## Automated sequence

1. PO creates a trusted, complete issue and prefixes it `[READY FOR DEV]`.
2. `.github/workflows/work-developer.yml` checks out current `develop`, creates or resumes `work-issue-<number>` and runs the Work coding agent using the official OpenAI Codex GitHub Action.
3. Work implements only the issue scope and acceptance criteria, adds or updates tests, runs local verification and updates relevant documentation. Work may not deploy, merge, change secrets or mutate production data.
4. Work pushes its branch and creates or updates one PR into `develop` with `Work-Managed-Issue: #<number>` in the PR body.
5. Because GitHub does not recursively trigger ordinary workflows from changes made with the workflow `GITHUB_TOKEN`, Work explicitly dispatches `.github/workflows/ui-tests.yml` (`Orderfly CI`) on the `work-issue-<number>` branch.
6. The dispatched Orderfly CI runs typecheck, builds the application through Playwright's CI web server and executes the Playwright suite.
7. CI or Playwright failure records evidence, returns the issue to `[READY FOR DEV]` and explicitly dispatches Work again for the same issue. Automatic retries are capped; repeated failures become `[BLOCKED]`.
8. Green dispatched CI is consumed by `.github/workflows/work-quality-gate.yml`, which resolves the PR from the `work-issue-<number>` branch and runs a separate read-only Codex code review against the issue acceptance criteria and the diff to `develop`.
9. Blocking review findings are written back to the issue and Work is explicitly dispatched for a repair iteration. A clean review changes the issue to `[READY FOR PO]`.
10. PO inspects the issue, PR, diff, CI, Playwright evidence, review findings, documentation and unresolved risks. If acceptance criteria are not proven, PO sends the task back to `[READY FOR DEV]` with concrete findings.
11. When PO accepts the implementation, the PR is merged to `develop`.
12. The merge triggers `.github/workflows/work-live-verification.yml`, which changes the issue to `[STAGING VERIFY]` and runs read-only Playwright against the configured live `develop` staging environment.
13. Only after staging verification is green is the issue closed as `[DONE]` and the PM is notified. Promotion from `develop` to `main` remains a separate production release decision under `docs/deployment-flow.md`.

Only issue comments from repository owners/members/collaborators and `github-actions[bot]` are included in coding/review agent context. This prevents arbitrary issue comments from becoming agent instructions while preserving automated CI and review feedback.

## Required repository configuration

### Secret

`OPENAI_API_KEY`

Used only by `openai/codex-action` for implementation and independent review. Never put the value in files, issues, PRs or logs.

### Staging URL variable

`ORDERFLY_STAGING_URL`

Must point to the live environment that represents merged `develop` code, such as the dedicated Firebase App Hosting staging/preview URL. It must not point to `https://orderfly.dk` for unattended feature verification.

If either required value is missing, automation records the missing configuration and moves the issue to `[BLOCKED]` rather than reporting false success.

## Test gates

Before `[READY FOR PO]`:

- TypeScript typecheck
- Next.js build as part of Playwright CI
- Playwright against the Work branch
- Independent code review against `develop`
- Required documentation changes

Before `[DONE]`:

- PO acceptance
- Merge to `develop`
- Staging endpoint healthy
- Read-only Playwright staging verification
- Mobile overflow/regression smoke
- Any additional controlled staging scenario explicitly required by the issue

## Failure handling

- **Implementation failure:** `[BLOCKED]` with Actions run link.
- **CI/Playwright failure:** return to `[READY FOR DEV]` with failed evidence and automatic repair dispatch, capped after repeated failures.
- **Code-review failure:** return to `[READY FOR DEV]` with findings and automatic repair dispatch, capped after repeated failures.
- **Missing OpenAI secret:** `[BLOCKED]`.
- **Missing Orderfly staging URL:** `[BLOCKED]`.
- **PO rejection:** `[READY FOR DEV]` with PO findings.
- **Staging verification failure after merge to develop:** `[BLOCKED]`; do not promote the change to `main` until resolved.

Work never weakens tests or acceptance criteria to escape a failure.
