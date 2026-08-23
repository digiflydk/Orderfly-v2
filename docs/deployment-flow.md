# Orderfly deployment flow

Last reviewed: 2026-08-23

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325`: Production Firebase data project. Firestore, Authentication, Storage and server-side Firebase Admin access point here.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code, product issues, pull requests, CI evidence and documentation.

Orderfly follows the same PM / PO / Work lifecycle as Esmeralda:

`[READY FOR DEV] -> [IN DEVELOPMENT] -> [IN REVIEW] -> [READY FOR PO] -> [AWAITING LIVE VERIFY] -> [DONE]`

Work branches from `main` and opens pull requests into `main`. Work never merges or deploys its own change. PO acceptance is required before merge, and deployment plus live verification are required before an issue is Done.

See [Development workflow](development-workflow.md).

## Required development and release flow

1. PM defines the product need, defect or priority.
2. PO creates a complete GitHub issue and marks it `[READY FOR DEV]`.
3. Work creates or resumes `work-issue-<number>` from current `main`, implements the issue, adds tests and updates documentation.
4. Work opens or updates a PR into `main`.
5. The existing Orderfly Playwright workflow must pass on the Work branch, including the build exercised by Playwright. Work also runs TypeScript typecheck before creating the PR.
6. Independent code review must pass.
7. The issue moves to `[READY FOR PO]`.
8. PO reviews acceptance criteria, PR/diff, CI, Playwright evidence, code review, documentation and unresolved risks.
9. If accepted, the exact reviewed PR is merged to `main`, and the issue becomes `[AWAITING LIVE VERIFY]`.
10. Firebase App Hosting deploys, or the release operator deploys, the approved `main` commit.
11. Read-only live Playwright and any issue-specific controlled live verification are performed.
12. Only PO may close the issue as `[DONE]` after confirming the approved change is live and all acceptance evidence is complete. PM is then notified.

A green pre-merge test run proves the candidate code passed its checks. It does not by itself prove that the same commit is live. Merge also does not mean Done.

## Production domain configuration (`orderfly.dk`)

- Hosting platform: **Firebase App Hosting** (`orderfly-v21-10334086-b3076`).
- Production branch: **`main`**.
- Canonical URL: **`https://orderfly.dk`**.
- `https://www.orderfly.dk` must permanently redirect to the canonical URL.
- `http://orderfly.dk` must redirect to HTTPS.

The app enforces canonical host and HTTPS with edge middleware in `/middleware.ts`:

- `www.orderfly.dk` -> `https://orderfly.dk` (HTTP 308, preserves path/query).
- `http://orderfly.dk` -> `https://orderfly.dk` (HTTP 308, preserves path/query).
- Other preview/dev hosts are not rewritten by this rule.

## DNS and certificate checklist

DNS access is required in the domain registrar/DNS provider account for `orderfly.dk`. Before go-live, validate:

1. `orderfly.dk` resolves to the intended App Hosting backend.
2. `www.orderfly.dk` resolves and redirects correctly.
3. SSL/TLS certificates are active for both hosts.
4. Automatic certificate renewal remains enabled.

## Environment variables

GitHub Actions variables and secrets are used only by GitHub Actions. They are not automatically copied to Firebase App Hosting.

App Hosting must therefore have its own runtime configuration. The public Firebase client configuration and the Firebase Admin service account must continue to target `orderfly-39325` because that is the production data project.

The deployment target is selected by `.firebaserc`:

```json
{
  "projects": {
    "default": "orderfly-v21-10334086-b3076",
    "hosting": "orderfly-v21-10334086-b3076",
    "database": "orderfly-39325"
  }
}
```

Use an explicit project when running Firebase CLI operations. Never deploy from an unknown branch or an uncommitted working tree.

## Production runtime settings

Production App Hosting runtime values must be set in the hosting environment, not in git:

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk`
- production `NEXT_PUBLIC_FIREBASE_*` values pointing at `orderfly-39325`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for the production Firebase data project

`FIREBASE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY` and all other sensitive values must only be stored as managed secrets, never committed or copied into issue/PR comments or logs.

## Auth, callback and CORS impact

When changing host-dependent behavior, verify:

- Firebase Authentication authorized domains include `orderfly.dk`.
- OAuth providers/callbacks use `https://orderfly.dk` where applicable.
- API CORS allowlists contain the intended origin without broad wildcard access.
- Payment and third-party return URLs using `NEXT_PUBLIC_SITE_URL` resolve to the production domain.

## Post-merge live verification

`.github/workflows/work-live-verification.yml` runs for merged Work-managed PRs into `main`.

The baseline verification is read-only and checks live endpoint/browser health, the public brand surface and a mobile overflow regression. It records evidence on the linked issue and leaves the issue in `[AWAITING LIVE VERIFY]`.

A green generic smoke test is not allowed to close the issue automatically. PO must also verify deployment evidence and every issue-specific acceptance criterion.

Authentication, payments, orders, customer mutations or other state-changing scenarios may only be tested live when the issue defines a controlled, reversible and auditable procedure. Unattended automation must not mutate production data.

## Definition of release completion

A Work-managed development issue is not Done until all applicable items are true:

- implementation completed
- relevant automated tests added or updated
- TypeScript/type validation green
- Playwright green
- independent code review green
- documentation updated
- PO acceptance recorded
- PR merged to `main`
- approved change deployed
- read-only live verification green
- any required controlled live scenarios verified and restored safely

## Rollback procedure

1. Identify the latest stable `main` commit that passed live verification.
2. In App Hosting, redeploy that exact stable release/artifact.
3. Re-run live smoke tests on `https://orderfly.dk`.
4. Document incident start time, rollback executor, stable release ID/commit and verification outcome in release notes/operations log.
5. Keep the affected issue `[BLOCKED]` until the defect has been triaged and a safe fix is ready.

Never edit production data merely to hide a failed release.
