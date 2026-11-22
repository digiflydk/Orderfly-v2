# Orderfly deployment flow

Last reviewed: 2026-11-22 (tests local, Actions for deployment only, #934)

## Firebase project roles

- `orderfly-v21-10334086-b3076`: Firebase Studio and App Hosting project. This project hosts and deploys the application.
- `orderfly-39325` (Orderfly - DB): Production Firestore, Authentication and server-side Firebase Admin credential.
- `studio-2819118380-ae26c` (Orderfly v2): PO-confirmed product-image Storage project. The active bucket is `studio-2819118380-ae26c.firebasestorage.app`. Product-image upload uses the existing Admin credential with explicit bucket/project configuration; verify cross-project object-create access before release.

The hosting project and data project are intentionally different. Do not change the `NEXT_PUBLIC_FIREBASE_*` values to the hosting project unless the data architecture is deliberately migrated.

## Source of truth

GitHub is the source of truth for application code, product issues, pull requests, CI evidence and documentation.

Work branches from `main`, opens pull requests into `main`, runs the tests itself and merges under the automatic merge rule in [AGENTS.md](../AGENTS.md#automatic-merge-and-deploy). GitHub Actions is used **only for deployment**. See [Development workflow](development-workflow.md).

## Required development and release flow

1. PM defines the product need, defect or priority; PO creates the issue.
2. Work implements on a branch from current `main`, adds tests and updates documentation, and opens a PR into `main`.
3. Work runs `npm run ci` on the exact head commit (every former CI test step, including the build) and posts the summary on the PR.
4. Independent code review passes (Codex, or a Claude review agent when Codex is unavailable).
5. Work merges under the automatic merge rule.
6. Deployment is automatic: Firebase App Hosting deploys `main`, and the Firestore workflows deploy merged rules, indexes and migrations (below).
7. Work waits until `/api/health` reports the merge commit (or a later `main` that contains it) as `release` and any Firestore deployment run has succeeded, then performs the live verification the issue requires.
8. The issue is Done when the change is live and its live acceptance criteria are met; a failure leads to an immediate revert PR.

A green `npm run ci` proves the candidate passed its checks. It does not prove that the same commit is live, and merge does not mean Done.

## Firestore indexes, rules and data migrations

Changes to the production data project `orderfly-39325` are deployed by GitHub workflows after the merge to `main`, with no manual step:

- **Firestore rules** (`firestore-rules.yml`): when `firestore.access.rules` or `firebase.access.json` changes, publishes the rules on top of the live rules it has just read and verifies the published hash. A no-op when the rules are already live.
- **Firestore indexes** (`firestore-indexes.yml`): when a `docs/*-firestore-indexes.json` file is added or changed, creates its missing composite indexes and waits until they are READY. Additive only.
- **Firestore data migration** (`firestore-migration.yml`): when a `scripts/migrations/<name>.mjs` is added or changed, plans, logs and applies exactly that plan (`auto`) and records it in `dataMigrationAudit`. Migrations are idempotent, so a re-run applies nothing.

They share the concurrency group `firestore-production-writes` and use the repository secret `FIREBASE_SERVICE_ACCOUNT_JSON`. A manual run can preview (read only). Details: `docs/firestore-operations.md`.

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

Production App Hosting runtime values must be available in the hosting environment. Sensitive values stay in managed secrets; the non-secret product-image bucket/project pair is explicitly configured in `apphosting.yaml`:

- `SITE_URL=https://orderfly.dk`
- `NEXT_PUBLIC_SITE_URL=https://orderfly.dk`
- production `NEXT_PUBLIC_FIREBASE_*` values pointing at `orderfly-39325`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for the production Firebase data project
- `FIREBASE_STORAGE_BUCKET=studio-2819118380-ae26c.firebasestorage.app` for product images
- `FIREBASE_STORAGE_PROJECT_ID=studio-2819118380-ae26c` for product-image bucket validation

`FIREBASE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY` and all other sensitive values must only be stored as managed secrets, never committed or copied into issue/PR comments or logs.

## Auth, callback and CORS impact

When changing host-dependent behavior, verify:

- Firebase Authentication authorized domains include `orderfly.dk`.
- OAuth providers/callbacks use `https://orderfly.dk` where applicable.
- API CORS allowlists contain the intended origin without broad wildcard access.
- Payment and third-party return URLs using `NEXT_PUBLIC_SITE_URL` resolve to the production domain.

## Post-merge live verification

Work performs live verification after each deployment (no GitHub workflow runs tests). It is read-only by default: `/api/health` reports the merge commit, the changed pages and endpoints respond as the issue requires, and relevant browser checks pass against `https://orderfly.dk`. Evidence is posted on the PR or issue.

Authentication, payments, orders, customer mutations or other state-changing scenarios may only be tested live when the issue defines a controlled, reversible and auditable procedure. Unattended automation must not mutate production data.

## Definition of release completion

A Work-managed development issue is not Done until all applicable items are true:

- implementation completed
- relevant automated tests added or updated
- `npm run ci` green on the merged head
- independent code review green
- documentation updated
- the automatic merge rule in AGENTS.md met (or explicit PO/PM acceptance)
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


## Coordinated feedback release #126 / Esmeralda #370

The customer explicitly authorizes merge and deployment for this release after green engineering checks and independent exact-head review. This authorization applies to this release; it does not remove normal review gates.

Deploy the companion notification template migration and the matching `orderfly-notification-enqueue`, `notification-admin` and `notification-worker` sources through the connected Esmeralda operator route. Preserve the bridge's private machine-secret authentication and `verify_jwt=false`. Verify DA/EN publications for the mapped organization. Then merge the reviewed Orderfly candidate and wait for a successful Firebase App Hosting rollout check tied to the exact main merge SHA. The non-secret brand/organization/recipient binding is in `apphosting.yaml`; existing platform endpoint and integration-secret runtime configuration remain required.

This historical release used an issue-specific `Feedback Code Review` workflow, removed with #934; reviews now follow the automatic merge rule in AGENTS.md.

Live verification is read-only: check unauthenticated private worker/bridge rejection and the authenticated admin-link boundary, then inspect the scoped template/mapping and release evidence. Do not create a fake production booking, order or feedback. Record the first naturally received feedback's job and central provider status as operational delivery evidence, keeping customer details out of release comments. Queue acceptance alone cannot prove email receipt.

## Stripe / Worldline rollout (#914)

This task explicitly uses local checks/review instead of GitHub Actions. Keep
`[skip ci]` in commits and the final PR title: the existing closed-PR live workflow
checks that title before allocating a runner. Do not dispatch Actions manually.
Record exact local candidate/review evidence and perform release readback locally.
This exception does not permit weakening authentication, transaction, print or
payment checks.

The payment code can deploy while Worldline live remains gated by
`ORDERFLY_WORLDLINE_LIVE_ENABLED` (default off). Scope-specific credentials remain
manual, write-only administrator input. Verify Secret Manager permissions for the
configured secret project and keep original numeric versions usable for existing
orders. New unconfigured merchants retain pinned legacy Stripe compatibility.
Callback/recovery hooks use the existing authenticated heartbeat; verify it after
deployment. No scheduler or credential is provisioned by source deployment.

Follow the controlled procedure in [merchant payments](worldline-merchant-settings.md)
after manual sandbox key entry. A merged/deployed code candidate is not evidence
of a successful Worldline sandbox payment, actual refund, physical print or courier
booking. Do not enable Worldline live before the required real-provider acceptance.
