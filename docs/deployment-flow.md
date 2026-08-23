# Orderfly deployment flow

Last reviewed: 2026-08-23

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325`: Production Firebase data project. Firestore, Authentication, Storage and server-side Firebase Admin access point here.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code, product issues, pull requests, CI evidence and documentation.

Orderfly product development uses:

- feature / Work branches for work in progress
- `develop` as the staging integration branch
- `main` as the production release branch

Work never merges or deploys its own change. PO acceptance is required before merge to `develop`, and staging verification is required before the development issue is Done. Production promotion from `develop` to `main` is a separate release decision.

See [Development workflow](development-workflow.md).

## Required development flow

1. PM defines the product need, defect or priority.
2. PO creates a complete GitHub issue and marks it `[READY FOR DEV]`.
3. Work creates or resumes `work-issue-<number>` from current `develop`, implements the issue, adds tests and updates documentation.
4. Work opens/updates a PR into `develop`.
5. The explicitly dispatched Orderfly CI run must pass, including typecheck/build and Playwright.
6. Independent code review must pass.
7. Issue moves to `[READY FOR PO]`.
8. PO reviews acceptance criteria, PR/diff, CI, Playwright, code review and documentation.
9. If accepted, the exact approved PR is merged to `develop`.
10. The configured App Hosting/preview staging environment must represent the merged `develop` code.
11. Issue moves to `[STAGING VERIFY]` and read-only Playwright runs against `ORDERFLY_STAGING_URL`.
12. Only when staging verification is green is the development issue closed as `[DONE]` and the PM notified.

A green Work issue means the feature has completed development and staging verification. It does **not** mean the feature has automatically been promoted to production.

## Production promotion

Production promotion remains deliberate:

1. Confirm the required set of `[DONE]` changes in `develop` is ready for release.
2. Open a release PR from `develop` to `main`.
3. Run Orderfly CI again on the release candidate.
4. Review release scope, Firebase configuration, migrations/data impact, auth/callback/CORS impact and rollback plan.
5. Merge the approved release PR to `main`.
6. Deploy the approved `main` commit through Firebase App Hosting project `orderfly-v21-10334086-b3076`.
7. Run production smoke verification on `https://orderfly.dk`.
8. Record the production release commit and verification evidence.

Production may only be deployed from `main`. A development Work issue must never promote itself from `develop` to `main`.

## Production domain configuration (`orderfly.dk`)

- Hosting platform: **Firebase App Hosting** (`orderfly-v21-10334086-b3076`).
- Production branch: **`main`**.
- Canonical URL: **`https://orderfly.dk`**.
- `https://www.orderfly.dk` must permanently redirect to the canonical URL.
- `http://orderfly.dk` must redirect to HTTPS.

The app enforces canonical host and HTTPS with edge middleware in `/middleware.ts`:

- `www.orderfly.dk` -> `https://orderfly.dk` (HTTP 308, preserves path/query).
- `http://orderfly.dk` -> `https://orderfly.dk` (HTTP 308, preserves path/query).
- Other preview/staging/dev hosts are not rewritten by this rule.

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

## Required GitHub automation configuration

- Repository secret `OPENAI_API_KEY` for Work implementation and independent Codex review.
- Repository variable `ORDERFLY_STAGING_URL` pointing to the live environment that represents merged `develop` code.

`ORDERFLY_STAGING_URL` must not point to the production `orderfly.dk` domain for unattended feature verification.

## Production runtime settings

Production App Hosting runtime values must be set in the hosting environment, not in git:

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk`
- production `NEXT_PUBLIC_FIREBASE_*` values pointing at `orderfly-39325`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for the production Firebase data project

`FIREBASE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY` and all other sensitive values must only be stored as managed secrets, never committed or copied into issue/PR comments or logs.

## Auth, callback and CORS impact

Before production promotion of host-dependent behavior, verify:

- Firebase Authentication authorized domains include `orderfly.dk`.
- OAuth providers/callbacks use `https://orderfly.dk` where applicable.
- API CORS allowlists contain the intended origin without broad wildcard access.
- Payment and third-party return URLs using `NEXT_PUBLIC_SITE_URL` resolve to the production domain.

## Staging verification for Work issues

`.github/workflows/work-live-verification.yml` runs for merged Work-managed PRs into `develop`.

The baseline staging verification is read-only and checks:

1. Staging root endpoint responds without a server error.
2. Browser page loads without critical page errors.
3. Public `/m3pizza` surface responds on desktop.
4. Public mobile surface has no horizontal overflow.

A feature issue may require stronger staging verification. Authentication, payments, order writes, customer mutations or other state-changing scenarios must only be tested when the issue defines a controlled, reversible and auditable procedure in the intended non-production environment.

## Production smoke test

After an approved `main` deployment, verify at minimum:

1. `https://orderfly.dk` loads without critical browser/server errors.
2. `https://www.orderfly.dk` redirects to the canonical domain.
3. HTTP redirects to HTTPS.
4. Login/logout and session refresh work when those flows are in release scope.
5. Representative production reads/APIs required by the release work.

Production write tests require a separate controlled procedure. Unattended Work automation must not mutate production data.

## Definition of development completion

A Work-managed development issue is not Done until all of the following are true:

- implementation completed
- relevant automated tests added/updated
- Orderfly CI green
- Playwright green
- independent code review green
- documentation updated
- PO acceptance recorded
- PR merged to `develop`
- configured `develop` staging environment verified
- required controlled staging scenarios, if any, verified

## Rollback procedure for production

1. Identify the latest stable `main` commit that passed production verification.
2. In App Hosting, redeploy that exact stable release/artifact.
3. Re-run smoke tests on `https://orderfly.dk`.
4. Document incident start time, rollback executor, stable release ID/commit and verification outcome in release notes/operations log.
5. Create/prioritize the regression bug through the normal PM/PO/Work flow.

Never edit production data merely to hide a failed release.
