# Firestore production operations

Three manual GitHub workflows change the production data project `orderfly-39325`. All use the repository secret `FIREBASE_SERVICE_ACCOUNT_JSON`; the key never leaves GitHub. The two that can change access or data, **Firestore rules** and **Firestore data migration**, write only after a person approves the run.

| Workflow | Changes | Approval |
|---|---|---|
| **Firestore indexes** (`firestore-indexes.yml`) | Adds missing composite indexes and missing single-field override indexes (`fieldOverrides`) from `docs/*-firestore-indexes.json`. Never deletes; an override keeps the field's existing indexes. See [firestore-schema.md](firestore-schema.md). | None (additive only) |
| **Firestore rules** (`firestore-rules.yml`) | Publishes the rules file named in `firebase.access.json` (`firestore.access.rules`). | `production` environment |
| **Firestore data migration** (`firestore-migration.yml`) | Runs one migration from `scripts/migrations/`. | `production` environment |

The rules and migration workflows share the concurrency group `firestore-production-writes`, so two production writes never run at once.

## Preview, then apply

Both approval workflows run in two steps:

1. **Preview** (`mode: preview`, any branch). Reads only.
   - Rules: prints the live and candidate SHA-256 and a diff of live against the candidate.
   - Migration: prints the planned items and their manifest SHA-256.
2. **Apply** (`mode: apply`, from `main` only, with the hash from the reviewed preview).
   - The job waits for approval in the GitHub environment `production`.
   - Before writing, it checks that it runs from `main` and that `production` has required reviewers. Without them it stops without writing.
   - Rules: re-reads the live rules and stops if their hash differs from `expected_live_sha256`. It publishes the candidate (Google compiles it first; a syntax error stops the run) and verifies the published hash. An unchanged candidate is not republished.
   - Migration: plans again and stops if the manifest hash differs from `manifest_sha256`. It applies the items in order and records the run in `dataMigrationAudit` (migration, manifest hash, item count, applied count, status `started`/`completed`/`failed`, run URL, commit and actor). A failure stops at that item and is recorded as `failed`.

Rerun a preview whenever production changed in between; an outdated hash is always refused.

`firestore.access.rules` is the deny-all browser policy from #139. Publish it only when [freemium-rbac-139.md](freemium-rbac-139.md) step 4 allows it (the server migration is deployed and verified). The preview diff shows what the live rules lose.

## Runbooks for one-time migrations

- [test-order-cleanup-2026-10-18.md](test-order-cleanup-2026-10-18.md): sletning af testordrerne fra live-testen 2026-10-18.

## Writing a migration

The contract is in [`scripts/migrations/README.md`](../scripts/migrations/README.md): `plan(db)` reads only and returns JSON items without personal data (they are logged), `applyItem(db, item)` re-checks each document in a transaction, and a finished migration plans nothing on rerun. A migration is applied only after its pull request is reviewed and merged to `main`.

The one-time permission rename (`orderfly.loyalty` → `orderfly.customer_score`) ran through the access authority from mPanel and was removed afterwards. See [freemium-rbac-139.md](freemium-rbac-139.md).

## One-time setup

- **GitHub:** Settings → Environments → `production` with you (and any other approvers) as required reviewers. Leave "Prevent self-review" off if the person approving also starts the runs.
- **Google Cloud IAM in `orderfly-39325`** for the service account in `FIREBASE_SERVICE_ACCOUNT_JSON` (its e-mail is printed as `account` at the start of each run; the key belongs to another Firebase project):
  - **Cloud Datastore Index Admin** – indexes.
  - **Firebase Rules Admin** – rules.
  - **Cloud Datastore User** – data migrations.

A missing role shows up as `HTTP 403` / `PERMISSION_DENIED` naming the principal.

## Running locally

`node scripts/firestore-rules-release.mjs preview` uses `FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token)`; `node scripts/firestore-migrate.mjs <name> preview` uses Application Default Credentials. Production applies go through the workflows, so they get approval and the audit entry.
