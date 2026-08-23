# PM / PO / Work development workflow

Last reviewed: 2026-08-23

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
2. `.github/workflows/work-developer.yml` checks out current `develop`, creates/resumes `work-issue-<number>` and runs the Work coding agent using the official OpenAI Codex GitHub Action.
3. Work implements only the issue scope and acceptance criteria, adds/updates tests, runs local verification and updates relevant documentation. Work may not deploy, merge, change secrets or mutate production data.
4. Work pushes its branch and creates/updates a PR into `develop` with `Work-Managed-Issue: #<number>` in the PR body.
5. Work explicitly dispatches `.github/workflows/ui-tests.yml` (`Orderfly CI`) on the Work branch. This avoids relying on recursive GitHub events created with `GITHUB_TOKEN`.
6. Orderfly CI runs typecheck, builds the application through Playwright's CI web server and executes the Playwright suite.
7. CI/Playwright failure records evidence, returns the issue to `[READY FOR DEV]` and explicitly dispatches Work again. Automatic retries are capped; repeated failures become `[BLOCKED]`.
8. Green dispatched CI is consumed by `.github/workflows/work-quality-gate.yml`, which resolves the linked PR and performs a separate read-only Codex review against the issue acceptance criteria and diff to `develop`.
9. Blocking review findings are written back to the issue and Work is explicitly dispatched for repair. A clean review changes the issue to `[READY FOR PO]`.
10. PO checks the issue, PR, diff, CI, Playwright evidence, independent review, documentation and unresolved risks. If the acceptance criteria are not proven, the issue returns to `[READY FOR DEV]` with concrete PO findings.
11. When PO accepts the implementation, the PR is merged to `develop`.
12. `.github/workflows/work-staging-live.yml` changes the issue to `[STAGING VERIFY]` and runs read-only Playwright against the configured live `develop` staging environment.
13. Only after staging verification is green is the issue closed as `[DONE]` and the PM notified. Promotion from `develop` to `main` remains a separate production release decision.

Only issue comments from repository owners/members/collaborators and `github-actions[bot]` are included in coding/review agent context. This prevents arbitrary issue comments from becoming agent instructions while preserving automated CI/review feedback.

## Required repository configuration

### Secret: `OPENAI_API_KEY`
Used only by `openai/codex-action` for implementation and independent review. Never put the value in files, issues, PRs or logs.

### Variable: `ORDERFLY_STAGING_URL`
Must point to the live environment representing merged `develop` code, such as a dedicated Firebase App Hosting staging/preview URL. It must not point to production for unattended feature verification.

If either value is missing, automation records the missing configuration and moves the issue to `[BLOCKED]` instead of reporting false success.

## Gates before Ready for PO

- TypeScript typecheck
- Next.js build as part of Playwright CI
- Playwright against the Work branch
- Independent code review against `develop`
- Required documentation changes

## Gates before Done

- PO acceptance
- Merge to `develop`
- Staging endpoint healthy
- Read-only staging Playwright
- Mobile overflow/regression smoke
- Any additional controlled staging scenario required by the issue

## Failure handling

- **Implementation failure:** `[BLOCKED]` with Actions run link.
- **CI/Playwright failure:** automatic repair iteration, capped after repeated failures.
- **Code-review failure:** automatic repair iteration, capped after repeated failures.
- **Missing OpenAI secret:** `[BLOCKED]`.
- **Missing staging URL:** `[BLOCKED]`.
- **PO rejection:** `[READY FOR DEV]` with PO findings.
- **Staging verification failure:** `[BLOCKED]`; do not promote the change to `main` until resolved.

Work never weakens tests or acceptance criteria to escape a failure.
