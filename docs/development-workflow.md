# PM / PO / Work development workflow

Last reviewed: 2026-08-25

## Principle

Orderfly uses the same engineering/release lifecycle as Esmeralda. Product requirements are defined before implementation; green engineering work does not stop for routine PO acceptance.

Canonical lifecycle:

`[READY FOR MANUAL WORK] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR RELEASE] -> [DEPLOYING] -> [LIVE VERIFY] -> [DONE]`

`[BLOCKED]` is reserved for genuine CI, review, merge, deployment or live-verification failures.

## Roles

- **PM:** defines the business goal and priority.
- **PO:** turns the goal into complete acceptance criteria and resolves product ambiguity or conflicting evidence.
- **Manual Work:** implements code, tests and documentation on a branch from current `main`.
- **CI / independent review:** prove the current PR head is technically ready.
- **Trusted release workflows:** revalidate evidence, merge, validate App Hosting deployment evidence, run live verification and finalize.

No OpenAI API credits or API-based implementation/review runner is required for this process.

## Sequence

1. PO creates a trusted issue with complete scope, acceptance criteria, tests and documentation impact, marked `[READY FOR MANUAL WORK]`.
2. Manual Work branches from current `main`, sets `[IN DEVELOPMENT]`, implements the issue and updates relevant documentation.
3. The PR targets `main` and contains exactly one `Manual-Work-Issue: #N` marker plus `Controlled-Live-Verification: none|required`.
4. `Orderfly CI` runs the release contract, TypeScript typecheck, production build through Playwright web-server startup and browser tests against the current PR head.
5. Independent/manual review records on the PR:

   `MANUAL_CODE_REVIEW: CLEAN`

   `Reviewed-Head: <40-character SHA>`

6. Any blocking finding requires a new commit, new CI and new clean review evidence for the new head.
7. When engineering evidence is green, Work sets `[READY FOR RELEASE]`. This is an engineering handoff, not PO approval.
8. `.github/workflows/work-quality-gate.yml` revalidates current `main`, the exact PR head, successful CI and the latest exact-head review marker immediately before squash merge.
9. The gate refuses another merge while any other issue is `[DEPLOYING]` or `[LIVE VERIFY]`, preserving a persistent release lock across the App Hosting handoff.
10. A successful merge records the exact merge SHA and sets `[DEPLOYING]`.
11. Firebase App Hosting automatically rolls out the commit from the configured live `main` branch. Merge alone is never deployment proof.
12. A trusted `APP_HOSTING_ROLLOUT_CONFIRMED` issue comment must identify the exact merged commit, rollout ID, timestamp, hosting project, data project and live URL.
13. `.github/workflows/work-deployment-evidence.yml` validates that evidence and only then sets `[LIVE VERIFY]` and dispatches live Playwright.
14. `.github/workflows/work-live-verification.yml` verifies the same merge SHA and deployment evidence, checks out that exact SHA and runs the checked-in production Playwright configuration.
15. Green generic live verification closes issues declaring `Controlled-Live-Verification: none` as `[DONE]`. Issues declaring `required` remain `[LIVE VERIFY]` until their explicit controlled procedure is complete.

## Firebase safety boundary

- App Hosting project: `orderfly-v21-10334086-b3076`.
- Production data project: `orderfly-39325`.
- The hosting and data projects are deliberately different. Release evidence must preserve both identities.
- Never alter the data-project client/admin configuration merely to make an App Hosting rollout pass.

## Failure handling

- CI/review/current-head mismatch: `[BLOCKED]` with exact evidence, then fix and reverify.
- Stale or non-mergeable PR: `[BLOCKED]`; rebase and rerun CI/review.
- App Hosting rollout failure: stay `[DEPLOYING]` or use `[BLOCKED]` with actual rollout evidence. Do not pretend merge equals deployment.
- Invalid deployment evidence: it is rejected and live verification does not start.
- Production Playwright failure: `[BLOCKED]`; the issue is not Done.
- Product ambiguity or conflicting acceptance evidence returns to PO for a product decision, not a routine release approval.

## Required checks

Before `[READY FOR RELEASE]`:

- release-process regression contract
- TypeScript typecheck
- build exercised by Playwright CI
- relevant Playwright scenarios
- independent/manual exact-head code review
- documentation updates

Before `[DONE]`:

- exact PR merge SHA recorded
- matching successful App Hosting rollout evidence
- post-deployment live Playwright green
- any explicitly required controlled live verification green and safely restored
