# Firestore production operations

Three GitHub workflows change the production data project `orderfly-39325`. Since #934 they run **automatically after a merge to `main`** that changes their files; there is no manual approval step. GitHub Actions is used only for these and other deployments, never for tests (Work runs `npm run ci` before merging). All use the repository secret `FIREBASE_SERVICE_ACCOUNT_JSON`; the key never leaves GitHub.

| Workflow | Runs after a merge that changes | Does |
|---|---|---|
| **Firestore rules** (`firestore-rules.yml`) | `firestore.access.rules` or `firebase.access.json` | `firestore-rules-release.mjs auto`: reads the live rules, publishes the candidate on top of exactly those (Google compiles it first; a syntax error stops the run) and verifies the published hash. Nothing is published when the candidate is already live. |
| **Firestore indexes** (`firestore-indexes.yml`) | `docs/*-firestore-indexes.json` | Creates the missing composite indexes of the changed files and waits until READY. Never deletes. See [firestore-schema.md](firestore-schema.md). |
| **Firestore data migration** (`firestore-migration.yml`) | `scripts/migrations/<name>.mjs` (added or changed) | `firestore-migrate.mjs <name> auto` for each: plans, prints the plan and its manifest SHA-256, applies exactly that plan and records the run in `dataMigrationAudit` (migration, manifest hash, item count, applied count, status `started`/`completed`/`failed`). Idempotent migrations then report nothing to apply. |

Each workflow has its own concurrency group (`firestore-rules`, `firestore-indexes`, `firestore-migrations`), so two runs of the same kind never run at once and one kind never replaces a pending run of another. GitHub keeps only one pending run per group, so the index and migration workflows do not rely on their own push alone: they deploy everything changed since the last *successful* automatic run of the same workflow. A migration from a replaced or failed run is therefore picked up by the next run; idempotent migrations make repeats harmless. The rules workflow always publishes the complete current file. Each workflow can also be started manually: `preview` reads only (rules: live and candidate hash and a diff; migration: the planned items), `auto` deploys from `main` now.

**Merging is deploying.** Review and `npm run ci` therefore happen on the pull request:

- **Rules:** the PR publishes the *whole* `firestore.access.rules` file, not only the changed lines. `firestore.access.rules` is the deny-all browser policy from #139; a PR that changes it must state that the complete file is ready to be live ([freemium-rbac-139.md](freemium-rbac-139.md) step 4). The emulator tests in `tests/firestore` (part of `npm run ci`) must cover the change.
- **Migrations:** follow [`scripts/migrations/README.md`](../scripts/migrations/README.md) (idempotent, scoped, no personal data in items, unit test with a fake database). The plan is printed in the workflow log before it is applied.
- After the merge Work checks that the deployment run succeeded before live verification; a failed run is reported and fixed or reverted at once.

## Runbooks for one-time migrations

- [test-order-cleanup-2026-10-18.md](test-order-cleanup-2026-10-18.md): sletning af testordrerne fra live-testen 2026-10-18.

## Writing a migration

The contract is in [`scripts/migrations/README.md`](../scripts/migrations/README.md): `plan(db)` reads only and returns JSON items without personal data (they are logged), `applyItem(db, item)` re-checks each document in a transaction, and a finished migration plans nothing on rerun. A migration is applied only after its pull request is reviewed and merged to `main`.

The one-time permission rename (`orderfly.loyalty` → `orderfly.customer_score`) ran through the access authority from mPanel and was removed afterwards. See [freemium-rbac-139.md](freemium-rbac-139.md).

## One-time setup

- **GitHub:** Actions must be enabled for the repository (deployment workflows only). The former `production` environment approval is no longer used.
- **Google Cloud IAM in `orderfly-39325`** for the service account in `FIREBASE_SERVICE_ACCOUNT_JSON` (its e-mail is printed as `account` at the start of each run; the key belongs to another Firebase project):
  - **Cloud Datastore Index Admin** – indexes.
  - **Firebase Rules Admin** – rules.
  - **Cloud Datastore User** – data migrations.

A missing role shows up as `HTTP 403` / `PERMISSION_DENIED` naming the principal.

## Running locally

`node scripts/firestore-rules-release.mjs preview` uses `FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token)`; `node scripts/firestore-migrate.mjs <name> preview` uses Application Default Credentials. Production applies go through the workflows, so they get approval and the audit entry.
