# Orderfly deployment flow

Last reviewed: 2026-08-23

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325`: Production Firebase data project. Firestore, Authentication, Storage and server-side Firebase Admin access point here.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code, product issues, pull requests, CI evidence and documentation.

- Feature and `work-issue-*` branches contain work in progress.
- `develop` is the staging integration branch.
- `main` is the production release branch.
- Firebase Studio may edit, preview, commit and push code, but production must not be published from uncommitted Studio state.
- Work never merges or deploys its own change.

See [Development workflow](development-workflow.md) for the PM / PO / Work lifecycle.

## Required development flow

1. PM defines the product need, defect or priority.
2. PO creates a complete GitHub issue and marks it `[READY FOR DEV]`.
3. Work creates or resumes `work-issue-<number>` from current `develop`, implements the issue, adds tests and updates documentation.
4. Work opens or updates a PR into `develop`.
5. Work explicitly dispatches Orderfly CI on the branch. Typecheck/build and Playwright must pass.
6. Independent code review must pass.
7. Issue moves to `[READY FOR PO]`.
8. PO reviews acceptance criteria, PR/diff, CI, Playwright, code review and documentation.
9. If accepted, the exact approved PR is merged into `develop`.
10. The configured staging environment representing merged `develop` is verified with read-only Playwright.
11. The development issue is only `[DONE]` after staging verification is green.

A `[DONE]` Work issue means development plus staging verification is complete. It does not mean the change has automatically been promoted to production.

## Production release flow

1. Select the required `[DONE]` changes in `develop` for release.
2. Open a release PR from `develop` into `main`.
3. GitHub Actions must pass again on the release candidate.
4. Review Firebase configuration, auth/callback/CORS impact, data/migration impact and rollback plan.
5. Merge the approved release PR to `main`.
6. Deploy the approved `main` commit through App Hosting in `orderfly-v21-10334086-b3076`.
7. Run production smoke verification on `https://orderfly.dk`.
8. Record the production commit and verification evidence.

Production may only be deployed from `main`. Preview/staging validation must happen on `develop` or its App Hosting preview/staging URL, never on `orderfly.dk`.

## Production domain configuration (`orderfly.dk`)

- Hosting platform: **Firebase App Hosting** (`orderfly-v21-10334086-b3076`).
- Production branch: **`main`**.
- Canonical URL: **`https://orderfly.dk`**.
- `https://www.orderfly.dk` must permanently redirect to the canonical URL.
- `http://orderfly.dk` must redirect to HTTPS.

The app enforces canonical host and HTTPS with edge middleware in `/middleware.ts`:

- `www.orderfly.dk` → `https://orderfly.dk` (HTTP 308, preserves path/query).
- `http://orderfly.dk` → `https://orderfly.dk` (HTTP 308, preserves path/query).
- Other hosts (preview/staging/dev) are not rewritten by this rule.

## DNS and certificate checklist

DNS access is required in the domain registrar/DNS provider account for `orderfly.dk`. Configure the production domain in Firebase App Hosting and apply the DNS records shown by Firebase. Validate:

1. `orderfly.dk` resolves to the intended App Hosting backend.
2. `www.orderfly.dk` resolves and is configured for redirect.
3. SSL/TLS certificate is active for both hostnames.
4. Automatic certificate renewal remains enabled.

## GitHub automation configuration

The automated development loop requires:

- repository secret `OPENAI_API_KEY` for `openai/codex-action` implementation and independent review;
- repository variable `ORDERFLY_STAGING_URL` pointing to the live environment representing merged `develop` code.

`ORDERFLY_STAGING_URL` must not point to production. Secrets must never be placed in source, issues, PR comments or logs.

## Environment variables

GitHub Actions variables and secrets are used only by GitHub Actions. They are not automatically copied to Firebase App Hosting.

App Hosting must therefore have its own runtime configuration. The public Firebase client configuration and Firebase Admin service account must continue to target `orderfly-39325` because that is the data project.

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

Use an explicit project when running Firebase CLI commands and never deploy from an unknown branch or uncommitted working tree.

## Production runtime settings

Production App Hosting runtime values must be set in the hosting environment, not in git:

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk`
- production `NEXT_PUBLIC_FIREBASE_*` values pointing at `orderfly-39325`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for the production Firebase data project

## Auth, callback and CORS impact

Before production promotion of host-dependent behavior, verify:

- Firebase Authentication authorized domains include `orderfly.dk`.
- OAuth providers/callbacks use `https://orderfly.dk` where applicable.
- API CORS allowlists contain the intended origin without broad wildcard access.
- Payment and third-party return URLs using `NEXT_PUBLIC_SITE_URL` resolve to the production domain.

## Staging verification for Work issues

`.github/workflows/work-staging-live.yml` runs for merged Work-managed PRs into `develop`.

The baseline staging verification is read-only and checks:

1. Staging root responds without a server error.
2. Browser page loads without critical page errors.
3. Public `/m3pizza` responds on desktop.
4. Public mobile surface has no horizontal overflow.

A feature issue may require stronger staging verification. Authentication, payments, order writes, customer mutations or other state-changing scenarios must only be tested when the issue defines a controlled, reversible and auditable procedure in the intended non-production environment.

## Production smoke test

After deploy from `main`, run smoke tests directly on `https://orderfly.dk`:

1. Landing page loads without critical browser/server errors.
2. Login and logout work when relevant to the release.
3. Session refresh works when relevant.
4. Navigation to affected core pages works.
5. Representative production reads/APIs required by the release work.
6. Relevant auth callbacks/redirects work on the production domain.

Unattended Work automation must not mutate production data.

## Definition of development completion

A Work-managed issue is not Done until all of the following are true:

- implementation complete
- relevant automated tests added or updated
- Orderfly CI green
- Playwright green
- independent code review green
- documentation updated
- PO acceptance recorded
- PR merged to `develop`
- configured `develop` staging environment verified
- any required controlled staging scenarios verified

## Rollback procedure for production

1. Identify the latest stable `main` commit that passed production smoke verification.
2. In App Hosting, redeploy that exact stable release/artifact.
3. Re-run smoke tests on `https://orderfly.dk`.
4. Document incident start time, rollback executor, stable release ID/commit and verification outcome in release notes/operations log.
5. Create and prioritize the regression bug through the normal PM / PO / Work flow.

Never edit production data merely to hide a failed release.
