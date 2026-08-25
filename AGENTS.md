# Orderfly Work engineering rules

## Repository and release boundaries

- GitHub is the source of truth.
- Use `MANUAL_NO_API_MODE`. Manual Work branches from current `main`, implements the issue, adds tests/documentation and opens a pull request into `main`.
- The PR body must contain exactly one `Manual-Work-Issue: #<number>` marker and `Controlled-Live-Verification: none|required`.
- Work does not need OpenAI API credits or an API-based coding/review workflow.
- After implementation, CI and independent/manual review are green, set the issue to `[READY FOR RELEASE]`. There is no routine PO acceptance stop.
- The trusted default-branch release gate revalidates the current PR head, CI and exact-head review evidence immediately before merge.
- Production deployment is separate from merge. Firebase App Hosting must complete the rollout for the exact merge SHA before live verification starts.
- Keep only one merged but not successfully live-verified release active at a time. `[DEPLOYING]` and `[LIVE VERIFY]` hold the lock directly. For a trusted `[BLOCKED]` or post-merge `[READY FOR RELEASE]` issue, the gate derives lock state from the actual linked GitHub PR: if that PR is really merged and no trusted `LIVE_VERIFICATION_PASSED` matches its merge SHA, the release lock remains even if post-merge bookkeeping failed. A genuinely pre-merge blocked issue has no merged linked PR and does not hold the lock.
- `[DONE]` is allowed only after deployment-aware live verification and any required controlled live verification pass.

Canonical lifecycle:

`[READY FOR MANUAL WORK] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR RELEASE] -> [DEPLOYING] -> [LIVE VERIFY] -> [DONE]`

Use `[BLOCKED]` for genuine engineering, merge, deployment or live-verification failures.

## Firebase project separation

- Firebase App Hosting project: `orderfly-v21-10334086-b3076`.
- Production data project: `orderfly-39325`.
- Do not point public/server Firebase data configuration at the hosting project unless an explicit architecture migration issue requires it.
- Deployment evidence must preserve both project identities and the exact rollout commit.
- Never expose or commit Firebase service-account JSON, API secrets, payment secrets or session credentials.

## Product and security integrity

- Implement the linked GitHub issue and its acceptance criteria, not adjacent speculative work.
- Preserve authentication, tenant/brand boundaries and server-side authorization.
- Flag any query or mutation that could read or modify another customer/brand's records without an explicit ownership boundary.
- Do not weaken input validation, authorization or audit behavior to make a test pass.

## Testing and review

- Run `npm run typecheck` for TypeScript changes.
- Run `npm run test:release-contract` when release/process behavior changes.
- Run the relevant Playwright tests for changed user flows.
- Independent/manual review records `MANUAL_CODE_REVIEW: CLEAN` plus `Reviewed-Head: <40-character SHA>` only when no blocking finding remains.
- A later review marker or changed head invalidates older clean evidence.
- Keep browser tests meaningful. Do not skip, loosen or delete assertions merely to make CI green.
- Post-deploy live verification is read-only unless an issue defines an explicitly controlled and reversible write test.
- The controlled-live mode used for finalization must be re-read from trusted persisted `RELEASE_MERGED` evidence and match the deployment dispatch exactly. Missing or changed payload values fail closed.
- Unattended tests must not mutate production data.

## Documentation

- Update relevant files under `docs/` in the same pull request whenever behavior, architecture, APIs, data flow, deployment, operations or testing changes.
- Keep the PM -> PO requirements -> Manual Work -> CI/Playwright -> code review -> READY FOR RELEASE -> merge -> App Hosting deployment -> live verification -> Done workflow accurate.

## Work agent boundary

Manual Work may edit the repository, add tests and update documentation. Release permissions stay in trusted default-branch workflows. Production mutation, secret changes and fabricated deployment evidence are prohibited.
