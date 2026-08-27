# Orderfly deployment flow

Last reviewed: 2026-08-25

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase App Hosting project. It hosts and rolls out the application from the configured GitHub live branch.
- `orderfly-39325`: production Firebase data project for Firestore, Authentication, Storage and server-side Firebase Admin access.

These projects are intentionally different. A hosting release must not repoint production data configuration to the App Hosting project.

## Canonical release lifecycle

`[READY FOR MANUAL WORK] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR RELEASE] -> [DEPLOYING] -> [LIVE VERIFY] -> [DONE]`

There is no routine PO stop after green engineering review. PO defines and clarifies product requirements before/during implementation and intervenes when evidence conflicts with the requested behavior.

Orderfly uses `MANUAL_NO_API_MODE`. Release orchestration does not require OpenAI API credits or an API-based coding/review workflow.

## Engineering gate and merge

Manual Work opens one PR into `main` with:

```text
Manual-Work-Issue: #<issue>
Controlled-Live-Verification: none|required
```

Before `[READY FOR RELEASE]` the current PR head must have:

- successful `Orderfly CI` / `Typecheck, build and Playwright`;
- successful release-process regression contract;
- independent/manual review recorded as `MANUAL_CODE_REVIEW: CLEAN` and `Reviewed-Head: <SHA>`;
- required documentation updates.

`.github/workflows/work-quality-gate.yml` rechecks all evidence immediately before merge. It refuses to merge while another trusted release is `[DEPLOYING]` or `[LIVE VERIFY]`. For a trusted `[BLOCKED]` or post-merge `[READY FOR RELEASE]` issue, it resolves the linked PR through the `Manual-Work-Issue` marker and asks GitHub whether that PR actually merged. If it did and no trusted `LIVE_VERIFICATION_PASSED` matches the real merge SHA, the repository-wide lock remains. This does not depend on `RELEASE_MERGED` bookkeeping successfully completing after the merge.

A successful gate squash-merges the verified head, records the returned merge SHA and sets the issue to `[DEPLOYING]`. Merge is not deployment proof. The workflow exposes the returned merge SHA immediately so a later bookkeeping failure can be recorded accurately.

## Production deployment through Firebase App Hosting

Production branch: `main`.

Firebase App Hosting automatic rollouts are the established deployment mechanism. When the connected live branch receives the accepted merge commit, App Hosting builds and rolls out that commit. No additional GitHub release credential is introduced by this workflow.

The exact rollout must be visible in App Hosting/Cloud Build evidence before live verification can begin. Post a trusted issue comment in this exact shape:

```text
APP_HOSTING_ROLLOUT_CONFIRMED
PR: #<pr>
Merge-SHA: <40-character merge SHA>
Deployment-Timestamp: <ISO-8601 UTC timestamp>
App-Hosting-Project: orderfly-v21-10334086-b3076
Data-Project: orderfly-39325
Rollout-ID: <Firebase App Hosting rollout or Cloud Build identifier>
Rollout-Commit: <same 40-character merge SHA>
Live-URL: https://orderfly.dk
Operation-Result: success
```

`.github/workflows/work-deployment-evidence.yml` accepts only a trusted repository participant, a real timestamp after merge, the exact merged PR/SHA, the correct hosting/data project split and a rollout commit equal to the merge SHA. `main` must still equal that SHA because the persistent release lock prevents overlapping unverified releases.

Successful validation records `DEPLOYMENT_SUCCEEDED`, moves the issue to `[LIVE VERIFY]` and dispatches post-deploy live verification. Invalid evidence cannot start live Playwright and does not create an API-key blocker.

## Post-deployment live Playwright

`.github/workflows/work-live-verification.yml` is triggered only by the validated deployment evidence dispatch. It refuses to run unless the issue, merged PR, current `main`, deployment record and dispatch all identify the same merge SHA. It re-reads `Controlled-Live-Verification` from trusted persisted `RELEASE_MERGED` evidence and requires the dispatch value to match it exactly; missing, altered or invalid values fail closed.

The workflow checks out the exact deployed SHA and uses checked-in `playwright.live.config.ts` plus `tests/work-post-deploy-live.spec.ts`. It does not create a config under `/tmp`, use a global Playwright install or treat merge as deployment evidence.

The generic production smoke is read-only and verifies at minimum:

- `https://orderfly.dk` responds and renders;
- `/m3pizza` responds and renders;
- `/m3pizza` has no page-level horizontal overflow at a 375 px viewport;
- uncaught browser page errors fail the landing-page test.

If the persisted controlled-live mode is `none`, a green post-deploy run records `LIVE_VERIFICATION_PASSED`, sets `[DONE]` and closes the issue. If the persisted mode is `required`, generic smoke leaves the issue `[LIVE VERIFY]` until the issue-specific reversible procedure is complete.

A post-merge deployment or live failure may set the issue `[BLOCKED]`, but that does not release the repository-wide release lock. The next release gate resolves the actual linked merged PR and requires matching trusted live-success evidence for its merge SHA before allowing `main` to advance.

## Production domain

- Canonical URL: `https://orderfly.dk`.
- `https://www.orderfly.dk` must permanently redirect to the canonical URL.
- HTTP must redirect to HTTPS.
- Host-dependent auth callbacks, CORS, payment return URLs and `NEXT_PUBLIC_SITE_URL` must continue to use the production domain as documented.

## Runtime configuration

GitHub Actions variables/secrets are not App Hosting runtime configuration. App Hosting must retain its own managed runtime values.

Public/server Firebase data configuration must continue to target `orderfly-39325`, including the production public Firebase settings and server-side service account. Sensitive values remain managed secrets and must never be copied into source, issues, PRs or logs.

The checked-in target map remains:

```json
{
  "projects": {
    "default": "orderfly-v21-10334086-b3076",
    "hosting": "orderfly-v21-10334086-b3076",
    "database": "orderfly-39325"
  }
}
```

## Rollback

1. Identify the latest stable App Hosting rollout with successful live verification.
2. Roll back/rebuild the exact stable commit through App Hosting.
3. Record the stable commit and rollout/build identifier.
4. Re-run post-deploy live smoke on `https://orderfly.dk`.
5. Keep the affected issue `[BLOCKED]` until the defect is understood and the production state is verified.

Never edit production data merely to hide a failed release.
