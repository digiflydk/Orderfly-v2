# Orderfly deployment flow

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325`: Production Firebase data project. Firestore, Authentication, Storage and server-side Firebase Admin access point here.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code.

- Feature branches contain work in progress.
- `develop` is the staging integration branch.
- `main` is the production release branch.
- Firebase Studio may edit, preview, commit and push code.
- Production must not be published from uncommitted local Studio state.

## Required flow

1. Create one feature branch per task.
2. Develop locally or in Firebase Studio.
3. Commit and push the branch.
4. Open a pull request into `develop`.
5. GitHub Actions must pass.
6. Merge into `develop` and verify the staging version.
7. Open a release pull request from `develop` into `main`.
8. GitHub Actions must pass again.
9. Merge into `main`.
10. Deploy the approved `main` commit through the App Hosting backend in `orderfly-v21-10334086-b3076`.

Production may only be deployed from `main`. Preview/staging validation must happen on `develop` (or App Hosting preview URLs), never on `orderfly.dk`.

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

DNS access is required in the domain registrar/DNS provider account for `orderfly.dk`. The release owner must coordinate with the person/team that has registrar access before go-live.

Configure the production domain in Firebase App Hosting and then apply the DNS records shown by Firebase (typically apex A/AAAA or ALIAS/ANAME and optional `www` CNAME). Validate:

1. `orderfly.dk` resolves to the intended App Hosting backend.
2. `www.orderfly.dk` resolves and is configured for redirect.
3. SSL/TLS certificate is issued and active for both `orderfly.dk` and `www.orderfly.dk`.
4. Automatic certificate renewal remains enabled in Firebase-managed certificates.

## Environment variables

GitHub Actions variables and secrets are used only by GitHub Actions. They are not automatically copied to Firebase App Hosting.

App Hosting must therefore have its own runtime configuration.

The public Firebase client configuration and the Firebase Admin service account must continue to target `orderfly-39325` because that is the data project.

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

Use an explicit project when running Firebase CLI commands:

```bash
firebase use hosting
firebase deploy --project hosting
```

Do not run `firebase deploy` from an unknown branch or with uncommitted changes.

## Production-only runtime settings

Production App Hosting runtime values must be set in the hosting environment (not in git):

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk`
- Production `NEXT_PUBLIC_FIREBASE_*` values pointing at `orderfly-39325`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for the production Firebase project

`FIREBASE_SERVICE_ACCOUNT_JSON` and all other sensitive values must only be stored as managed secrets (GitHub Secrets/Firebase Secret Manager), never committed to the repository or shared in issue comments/logs.

## Auth, callback and CORS impact

When switching production domain, verify and update any allowlists/callback URLs that depend on hostnames:

- Firebase Authentication authorized domains must include `orderfly.dk`.
- OAuth providers/callbacks must use `https://orderfly.dk` where applicable.
- API CORS allowlists must include `https://orderfly.dk` and must not over-broaden origin access.
- Payment or third-party return URLs that use `NEXT_PUBLIC_SITE_URL` must resolve to `https://orderfly.dk`.

## Verification before production

Before a production rollout, confirm:

- The deployed commit is the current `main` commit.
- GitHub Actions are green.
- App Hosting variables and secrets are present.
- The app still points to `orderfly-39325` for Firebase data.
- The custom production domain points to the intended App Hosting backend.
- `http://orderfly.dk` redirects to `https://orderfly.dk`.
- `https://www.orderfly.dk/<path>?<query>` redirects to `https://orderfly.dk/<path>?<query>`.

## Post-deploy smoke test (minimum)

After deploy on `main`, run smoke tests directly on `https://orderfly.dk`:

1. Landing page loads without critical browser/server errors.
2. Login and logout both work.
3. Session survives a browser refresh.
4. Navigation to core portal pages works.
5. At least one representative API/database flow works.
6. Relevant auth callbacks/redirects work on the production domain.

## Rollback procedure (critical release incident)

1. Identify the latest stable `main` commit that passed smoke test.
2. In App Hosting, redeploy that exact stable release/artifact.
3. Re-run the smoke test on `https://orderfly.dk`.
4. Document incident start time, rollback executor, stable release ID/commit, and verification outcome in release notes/operations log.

Expected ownership:

- Release owner executes deployment/rollback.
- PM/QA confirms smoke-test acceptance.

## Impact on existing environments and users

- Preview/staging URLs stay separate from `orderfly.dk`.
- Preview/staging must never be configured with production data by mistake.
- Existing users on production keep using `https://orderfly.dk`; no staging URL is promoted as production.
