# Orderfly deployment flow

Last reviewed: 2026-08-23

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325`: Production Firebase data project. Firestore, Authentication, Storage and server-side Firebase Admin access point here.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code, product issues, pull requests, CI evidence and documentation.

Orderfly follows the same PM / PO / Work lifecycle as Esmeralda. Work branches start from `main` and open pull requests into `main`. Work never merges or deploys its own change. PO acceptance is required before merge, and live verification is required before the issue is Done.

See [Development workflow](development-workflow.md).

## Required development and release flow

1. PM defines the product need, defect or priority.
2. PO creates a complete GitHub issue and marks it `[READY FOR DEV]`.
3. Work creates or resumes `work-issue-<number>` from current `main`, implements the issue, adds tests and updates documentation.
4. Work opens/updates a PR into `main`.
5. Orderfly CI must pass, including typecheck/build and Playwright.
6. Independent code review must pass.
7. Issue moves to `[READY FOR PO]`.
8. PO reviews acceptance criteria, PR/diff, CI, Playwright, code review and documentation.
9. If accepted, the exact approved PR is merged to `main`.
10. Firebase App Hosting deploys or the release operator deploys that approved `main` commit.
11. Issue remains `[AWAITING LIVE VERIFY]` until read-only live Playwright and any issue-specific controlled verification are green.
12. Only then is the issue closed as `[DONE]` and the PM is notified.

A green pre-merge CI run proves the candidate code passed its checks. It does not by itself prove that the same commit is live. Post-merge live verification is therefore a separate mandatory gate.

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

## Environment variables

GitHub Actions variables and secrets are used only by GitHub Actions. They are not automatically copied to Firebase App Hosting.

App Hosting must therefore have its own runtime configuration. The public Firebase client configuration and the Firebase Admin service account must continue to target `orderfly-39325` because that is the data project.

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

Use an explicit project for Firebase CLI operations. Never deploy from an unknown branch or an uncommitted working tree.

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

The baseline live verification is read-only and checks:

1. Live root endpoint responds without a server error.
2. Browser page loads without critical page errors.
3. Public `/m3pizza` surface responds on desktop.
4. Public mobile surface has no horizontal overflow.

The workflow defaults to `https://orderfly.dk`, or uses repository variable `ORDERFLY_LIVE_URL` if explicitly configured.

A feature issue may require stronger live verification. Authentication, payments, order writes, customer mutations or other state-changing scenarios must only be tested live when the issue defines a controlled, reversible and auditable procedure. Unattended automation must not mutate production data.

## Definition of release completion

A Work-managed development issue is not Done until all of the following are true:

- implementation completed
- relevant automated tests added/updated
- Orderfly CI green
- Playwright green
- independent code review green
- documentation updated
- PO acceptance recorded
- PR merged to `main`
- deployment/live endpoint verified
- required controlled live scenarios, if any, verified

## Rollback procedure

1. Identify the latest stable `main` commit that passed live verification.
2. In App Hosting, redeploy that exact stable release/artifact.
3. Re-run live smoke tests on `https://orderfly.dk`.
4. Document incident start time, rollback executor, stable release ID/commit and verification outcome in release notes/operations log.
5. Keep the affected issue `[BLOCKED]` until the defect has been triaged and a safe fix is ready.

Never edit production data merely to hide a failed release.
