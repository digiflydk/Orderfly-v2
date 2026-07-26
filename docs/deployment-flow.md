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

## Verification before production

Before a production rollout, confirm:

- The deployed commit is the current `main` commit.
- GitHub Actions are green.
- App Hosting variables and secrets are present.
- The app still points to `orderfly-39325` for Firebase data.
- The custom production domain points to the intended App Hosting backend.
