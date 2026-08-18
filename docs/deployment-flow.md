# Orderfly deployment flow

## Environment architecture

Orderfly uses the same GitHub repository for staging and production, but hosting, runtime configuration, secrets and Firebase data access must be isolated between the two environments.

### Staging

- GitHub repository: `digiflydk/Orderfly-v2`
- Live branch: **`develop`**
- App Hosting project: **`orderfly-v2-staging`**
- App Hosting environment name: **`staging`**
- Staging App Hosting URL: `https://orderfly-staging--orderfly-v2-staging.europe-west4.hosted.app`
- Firebase data project: **`orderfly-39325`**
- Firestore, Authentication, Storage and staging Firebase Admin credentials point to `orderfly-39325`.
- `orderfly.dk` must never be attached to the staging backend.

### Production

- GitHub repository: `digiflydk/Orderfly-v2`
- Live branch: **`main`**
- App Hosting project: **`orderfly-v21-10334086-b3076`**
- Canonical production URL: **`https://orderfly.dk`**
- Production must use a **separate Firebase data project**. The production data project must not be `orderfly-39325`.
- Production Firebase client configuration and Firebase Admin service account must only point to the dedicated production data project.
- Production service accounts must not be granted Firestore/Auth/Storage access to `orderfly-39325`.

The production data project ID is intentionally not documented until the dedicated project has been created and approved.

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
3. Commit and push the feature branch.
4. Open a pull request into `develop`.
5. GitHub Actions must pass.
6. Merge into `develop`.
7. App Hosting automatically rolls out the approved `develop` commit to the staging backend.
8. Verify the staging URL and run smoke/integration tests against staging data only.
9. Open a release pull request from `develop` into `main`.
10. GitHub Actions must pass again.
11. Merge into `main` only after staging acceptance.
12. Production App Hosting rolls out the approved `main` commit.

Production may only be deployed from `main`. Preview/staging validation must happen on `develop` or feature previews, never on `orderfly.dk`.

## Branch-to-environment contract

```text
feature/*
   ↓ PR
 develop
   ↓
orderfly-v2-staging App Hosting
   ↓
orderfly-39325
   ↓
staging hosted.app URL

 develop
   ↓ release PR
 main
   ↓
orderfly-v21-10334086-b3076 App Hosting
   ↓
DEDICATED PRODUCTION DATA PROJECT
   ↓
orderfly.dk
```

A commit on `develop` must not become visible on `orderfly.dk` unless that exact change is subsequently approved and merged into `main`.

## Production domain configuration (`orderfly.dk`)

- Hosting platform: **Firebase App Hosting** (`orderfly-v21-10334086-b3076`).
- Production branch: **`main`**.
- Canonical URL: **`https://orderfly.dk`**.
- `https://www.orderfly.dk` must permanently redirect to the canonical URL.
- `http://orderfly.dk` must redirect to HTTPS.

The app enforces canonical host and HTTPS with edge middleware in `/middleware.ts`:

- `www.orderfly.dk` → `https://orderfly.dk` (HTTP 308, preserves path/query).
- `http://orderfly.dk` → `https://orderfly.dk` (HTTP 308, preserves path/query).
- Other hosts such as staging/preview/dev must not be rewritten to production.

## DNS and certificate checklist

DNS access is required in the domain registrar/DNS provider account for `orderfly.dk`. Configure the production custom domain only on the production App Hosting backend and apply the DNS records shown by Firebase.

Validate:

1. `orderfly.dk` resolves to the production App Hosting backend.
2. `www.orderfly.dk` resolves and is configured for redirect.
3. SSL/TLS certificate is issued and active for both hostnames.
4. The staging backend has no production custom domain attached.

## Environment variables

GitHub Actions variables and secrets are used only by GitHub Actions. They are not automatically copied to Firebase App Hosting.

App Hosting therefore has its own environment configuration.

### Staging runtime values

Staging App Hosting must use the Firebase Web App configuration belonging to `orderfly-39325`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=orderfly-39325`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `SITE_URL` pointing to the staging URL
- other non-sensitive staging-only values as required

Sensitive values must be stored in Secret Manager. The staging `FIREBASE_SERVICE_ACCOUNT_JSON` must contain credentials for `orderfly-39325` only.

### Production runtime values

Production App Hosting must use values belonging to the dedicated production data project:

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk` where used
- production `NEXT_PUBLIC_FIREBASE_*` values pointing to the dedicated production data project
- production `FIREBASE_SERVICE_ACCOUNT_JSON` for the dedicated production data project

Production must never reuse the staging service account JSON.

## Secrets

`FIREBASE_SERVICE_ACCOUNT_JSON`, `GEMINI_API_KEY` and other sensitive values must be stored in Google Cloud Secret Manager / Firebase App Hosting secrets and never committed to the repository, pasted into issue comments or printed in logs.

The same secret name may exist in staging and production projects, but the underlying secret values must be environment-specific.

## `.firebaserc` and Firebase CLI

The repository currently contains Firebase aliases that predate the full staging/production separation. In particular, `orderfly-39325` is the staging data project and must not be treated as production simply because an alias references it.

Always specify the intended Firebase project explicitly for administrative/deployment commands. Never run a data-changing Firebase CLI command against an assumed default project.

Before any production Firebase CLI operation, verify the production data project ID explicitly. Until the dedicated production data project exists, no production data deployment should be performed.

## Auth, callback and CORS impact

Environment-specific hostnames must be allowlisted separately:

- Staging Firebase Authentication must authorize the staging `*.hosted.app` hostname as required.
- Production Firebase Authentication must authorize `orderfly.dk`.
- OAuth callbacks, CORS allowlists and payment/third-party return URLs must use the URL for the corresponding environment.
- Staging callbacks must not be configured to send users into production unless deliberately testing a production integration.

## Staging verification

Before approving a release PR from `develop` to `main`, confirm:

- The staging rollout deploys the expected `develop` commit.
- The staging URL stays on the staging hostname and does not redirect to `orderfly.dk`.
- Client Firebase configuration resolves to `orderfly-39325`.
- `/api/diag/health` returns `ok: true` and `projectId: "orderfly-39325"` for the Firebase Admin connection.
- Login/auth works against staging Auth.
- Representative Firestore reads/writes happen only in staging.
- No production credentials are present in the staging backend.

## Production verification before rollout

Before a production rollout, confirm:

- The deployed commit is the approved current `main` commit.
- GitHub Actions are green.
- Production App Hosting variables and secrets are present.
- Production Firebase client config does **not** point to `orderfly-39325`.
- Production Firebase Admin health check reports the dedicated production data project ID.
- Production service accounts have no intended dependency on staging data.
- The custom production domain points to the intended production App Hosting backend.
- `http://orderfly.dk` redirects to `https://orderfly.dk`.
- `https://www.orderfly.dk/<path>?<query>` redirects to `https://orderfly.dk/<path>?<query>`.

## Post-deploy production smoke test

After deploy on `main`, run smoke tests directly on `https://orderfly.dk`:

1. Landing page loads without critical browser/server errors.
2. Login and logout both work.
3. Session survives a browser refresh.
4. Navigation to core portal pages works.
5. At least one representative API/database flow works.
6. Relevant auth callbacks/redirects work on the production domain.
7. Firebase diagnostics report the dedicated production project, never `orderfly-39325`.

## Rollback procedure (critical release incident)

1. Identify the latest stable `main` commit that passed smoke tests.
2. In production App Hosting, redeploy that exact stable release/artifact.
3. Re-run the smoke tests on `https://orderfly.dk`.
4. Confirm the rollback still uses the dedicated production Firebase data project.
5. Document incident start time, rollback executor, stable release ID/commit and verification outcome in release notes/operations log.

Expected ownership:

- Release owner executes deployment/rollback.
- PM/QA confirms smoke-test acceptance.

## Hard isolation rules

- `develop` → staging hosting → `orderfly-39325`.
- `main` → production hosting → dedicated production Firebase data project.
- Staging must never receive production secrets.
- Production must never use the staging Firebase Admin service account.
- Production must not intentionally be granted data access to `orderfly-39325`.
- `orderfly.dk` must only be attached to the production App Hosting backend.
