# PM / PO / Work development workflow

Last reviewed: 2026-08-23

## Principle

Orderfly uses the same development process as Esmeralda. The repositories may run different technical test commands because their stacks differ, but the product workflow, issue states, Work responsibilities, PO gate and definition of Done are the same.

## Roles

- **PM:** defines business goal, priority and product decisions.
- **PO:** converts requests and bugs into GitHub issues with scope, priority, acceptance criteria, dependencies, test requirements and documentation impact. PO accepts or rejects completed implementation.
- **Work:** automated implementation agent. It writes code, tests and documentation on a feature branch but cannot merge or declare the product Done.

GitHub issues, pull requests, CI evidence and repository documentation are the operational source of truth.

## Shared Esmeralda / Orderfly state machine

`[READY FOR DEV] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR PO] -> [AWAITING LIVE VERIFY] -> [DONE]`

`[BLOCKED]` is used when credentials, repeated CI/review failures, deployment problems or another external dependency requires intervention.

## Automated sequence

1. PO creates a trusted, complete issue and prefixes it `[READY FOR DEV]`.
2. `.github/workflows/work-developer.yml` checks out `main`, creates or resumes `work-issue-<number>` and runs the Work coding agent using the official OpenAI Codex GitHub Action.
3. Work implements only the issue scope and acceptance criteria, adds or updates tests, runs local verification and updates relevant documentation. Work may not deploy, merge, change secrets or mutate production data.
4. Work pushes its branch and creates or updates one PR into `main` with `Work-Managed-Issue: #<number>` in the PR body.
5. `.github/workflows/ui-tests.yml` (`Orderfly CI`) runs typecheck, builds the application through Playwright's CI web server and executes the Playwright suite.
6. CI or Playwright failure records evidence, returns the issue to `[READY FOR DEV]` and explicitly dispatches Work again for the same issue. Automatic retries are capped; repeated failures become `[BLOCKED]`.
7. Green CI triggers `.github/workflows/work-quality-gate.yml`, which runs a separate read-only Codex code review against the issue acceptance criteria and the diff to `main`.
8. Blocking review findings are written back to the issue and Work is dispatched for a repair iteration. A clean review changes the issue to `[READY FOR PO]`.
9. PO inspects the issue, PR, diff, CI, Playwright evidence, review findings, documentation and unresolved risks. If acceptance criteria are not proven, PO sends the task back to `[READY FOR DEV]` with concrete findings.
10. When PO accepts the implementation, the PR is merged to `main` and the issue becomes `[AWAITING LIVE VERIFY]`.
11. Production/live deployment is verified with read-only Playwright through `.github/workflows/work-live-verification.yml`. Feature-specific issues may additionally require controlled write verification if explicitly defined in their acceptance criteria.
12. Only after live verification is green is the issue closed as `[DONE]` and the PM is notified.

Only issue comments from repository owners/members/collaborators and `github-actions[bot]` are included in coding/review agent context. This prevents arbitrary issue comments from becoming agent instructions while preserving automated CI and review feedback.

## Required repository configuration

### Secret

`OPENAI_API_KEY`

Used only by `openai/codex-action` for implementation and independent review. Never put the value in files, issues, PRs or logs.

### Optional live URL variable

`ORDERFLY_LIVE_URL`

If present, post-merge live verification uses this URL. Otherwise the workflow defaults to `https://orderfly.dk`.

## Test gates

Before `[READY FOR PO]`:

- TypeScript typecheck
- Next.js build as part of Playwright CI
- Playwright against the PR build
- Independent code review
- Required documentation changes

Before `[DONE]`:

- PO acceptance
- Merge to `main`
- Live endpoint healthy
- Read-only Playwright live verification
- Mobile overflow/regression smoke
- Any additional controlled live scenario explicitly required by the issue

## Failure handling

- **Implementation failure:** `[BLOCKED]` with Actions run link.
- **CI/Playwright failure:** return to `[READY FOR DEV]` with failed evidence and automatic repair dispatch, capped after repeated failures.
- **Code-review failure:** return to `[READY FOR DEV]` with findings and automatic repair dispatch, capped after repeated failures.
- **Missing OpenAI secret:** `[BLOCKED]`.
- **PO rejection:** `[READY FOR DEV]` with PO findings.
- **Live verification failure after merge:** `[BLOCKED]`; the issue is not Done until live verification is green.

Work never weakens tests or acceptance criteria to escape a failure.
