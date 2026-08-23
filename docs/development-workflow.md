# PM / PO / Work development workflow

Last reviewed: 2026-08-23

## Principle

Orderfly uses the same product-development lifecycle as Esmeralda. The repositories may run different technical test commands because their stacks differ, but the issue states, ownership, Work responsibilities, PO gate and definition of Done are the same.

## Roles

- **PM:** defines business goal, priority and product decisions.
- **PO:** converts requests and bugs into GitHub issues with scope, priority, acceptance criteria, dependencies, test requirements and documentation impact. PO accepts or rejects completed implementation.
- **Work:** automated implementation agent. It writes code, tests and documentation on a feature branch but cannot merge or declare the issue Done.

GitHub issues, pull requests, CI evidence and repository documentation are the operational source of truth.

## Shared state machine

`[READY FOR DEV] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR PO] -> [AWAITING LIVE VERIFY] -> [DONE]`

`[BLOCKED]` is used when credentials, repeated CI/review failures, deployment problems or another external dependency requires intervention.

## Automated sequence

1. PO creates a trusted, complete issue and prefixes it `[READY FOR DEV]`.
2. `.github/workflows/work-developer.yml` checks out `main`, creates or resumes `work-issue-<number>` and runs the Work coding agent.
3. Work implements only the issue scope and acceptance criteria, adds or updates tests, runs local verification and updates relevant documentation. Work may not deploy, merge, change secrets or mutate production data.
4. Work pushes its branch and creates or updates one PR into `main` with `Work-Managed-Issue: #<number>` in the PR body.
5. Work explicitly dispatches the existing `.github/workflows/ui-tests.yml` Playwright workflow on the Work branch. Explicit dispatch is used because bot-authored GitHub events do not recursively start ordinary workflows with the same `GITHUB_TOKEN`.
6. Playwright CI failure records evidence, returns the issue to `[READY FOR DEV]` and explicitly dispatches Work again. Automatic retries are capped; repeated failures become `[BLOCKED]`.
7. Green Playwright CI triggers `.github/workflows/work-quality-gate.yml`, which resolves the linked Work PR and runs a separate read-only Codex code review against the issue acceptance criteria and the diff to `main`.
8. Blocking review findings are written back to the issue and Work is explicitly dispatched for a repair iteration. A clean review changes the issue to `[READY FOR PO]`.
9. PO inspects the issue, PR, diff, Playwright evidence, review findings, documentation and unresolved risks. If acceptance criteria are not proven, PO sends the task back to `[READY FOR DEV]` with concrete findings.
10. When PO accepts the implementation, the PR is merged to `main` and the issue becomes `[AWAITING LIVE VERIFY]`.
11. `.github/workflows/work-live-verification.yml` runs read-only Playwright against the live Orderfly environment and records evidence on the issue.
12. PO marks `[DONE]` only when the approved change is live and all issue-specific live acceptance criteria are satisfied. A green generic smoke test is evidence, not automatic permission for Work to close the issue.

Only issue comments from repository owners/members/collaborators and `github-actions[bot]` are included in coding/review context. This prevents arbitrary comments from becoming agent instructions while preserving CI and review feedback.

## Required repository configuration

### Secret

`OPENAI_API_KEY`

Used by the official OpenAI Codex GitHub Action for Work implementation and independent review. Never place the value in files, issues, pull requests or logs.

### Optional live URL variable

`ORDERFLY_LIVE_URL`

If present, post-merge live verification uses this URL. Otherwise the workflow defaults to `https://orderfly.dk`.

## Test gates

Before `[READY FOR PO]`:

- TypeScript typecheck in the Work implementation run
- Existing Orderfly Playwright workflow on the Work branch
- Independent code review against `main`
- Required documentation changes

Before `[DONE]`:

- PO acceptance
- Merge to `main`
- Deployment evidence for the approved change
- Read-only Playwright live verification
- Any additional controlled live scenario explicitly required by the issue

## Failure handling

- **Implementation failure:** `[BLOCKED]` with Actions run link.
- **Playwright failure:** return to `[READY FOR DEV]` with failed evidence and automatic repair dispatch, capped after repeated failures.
- **Code-review failure:** return to `[READY FOR DEV]` with findings and automatic repair dispatch, capped after repeated failures.
- **Missing OpenAI secret:** `[BLOCKED]`.
- **PO rejection:** `[READY FOR DEV]` with PO findings.
- **Live verification failure after merge:** `[BLOCKED]`; the issue is not Done until live verification is green.

Work never weakens tests or acceptance criteria to escape a failure.
