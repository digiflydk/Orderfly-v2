# mPanel administration activation (#137)

## Scope and status

This prepares the connection and catalogue protection for Orderfly #135 and
Opsfly esmeralda-restaurant-operations#276. It does not activate shared product
entitlement enforcement or add administration of platform owners to mPanel.
The bootstrap owner is still one explicitly configured active Opsfly admin.
The operator has reported saving the shared secret and both owner IDs in both
providers. Provider state, secret equality and activation are not verified merely
by that report. No actual secret value belongs in source, chat or logs.

## Projects and runtime binding

| Setting | Location |
| --- | --- |
| App Hosting backend `studio`, `us-central1` | `orderfly-v21-10334086-b3076` |
| Firestore production data and rules | `orderfly-39325` |
| mPanel Edge Functions | Supabase `bdemvarwpfcxyczunchx` |

`apphosting.yaml` binds `MPANEL_PLATFORM_ADMIN_SECRET` to Secret Manager version
`MPANEL_PLATFORM_ADMIN_SECRET@1`, runtime only. Confirm that version 1 is the
operator-created shared value and the App Hosting backend has access before
rollout. The secret must have at least 32 random characters. A future rotation
must coordinate both runtimes and update the pinned reference.

Keep `MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID` and
`MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID` in App Hosting Environment and Supabase
Edge Function Secrets with matching values. These identify the exact bootstrap
owner, not every employee. Their authority is checked against the live active
admin and employee session in the configured organization on every request.
The optional Opsfly organization directory allowlist defaults to that organization;
expanding it remains an explicit operator decision. Regular company memberships,
roles and access plans are managed in mPanel after release.

No `MPANEL_PLATFORM_ADMIN_ENABLED=true` is committed by this change.
App Hosting environment changes take effect through a new rollout; saving them
alone does not prove the serving revision is configured.

## Firestore preparation without replacing unknown policy

1. Read and retain the **current published** rules from the data project.
   A previously captured copy is insufficient for production deployment.
2. Run the offline helper, using a new output filename:

   ```sh
   node scripts/prepare-platform-firestore-rules.mjs orderfly-39325 /tmp/live.rules /tmp/platform-candidate.rules
   ```

   It accepts only the previously reviewed test baseline (including its
   `marketingOrderOutbox` denial), ignoring formatting/comments. Any added grant,
   added restriction, renamed collection or unfamiliar policy stops preparation.
   Do not edit the baseline or remove newer rules to make the command succeed;
   review and test a targeted change to the actual policy instead.
3. Review the candidate against the saved live copy. The helper prints input and
   output SHA-256 hashes and **never deploys**, overwrites a file or changes a
   Firebase project. Nothing adds Firestore deployment to `firebase.json`.
4. The candidate closes client reads/writes for `platformAdminAudit`,
   `platformAdminControl`, `platformCompanies`, `platformAccessPlans`,
   `platformAccessRoles`, `platformMemberships` and preserves the existing
   `marketingOrderOutbox` denial. It closes client writes to `users`, `roles`,
   `subscription_plans`; their reads retain the existing baseline behavior.
   Descendants are included. All matching grants exclude protected collections,
   so an overlapping permissive wildcard cannot override the protection.
5. Unrelated baseline access is preserved, including its permissive test access.
   This is a targeted catalogue cutover, **not a full database security audit**.
   Firestore rules do not protect Admin SDK/server actions; the bridge owner
   checks and legacy write guards are independently required.

Legacy catalogue mutations are now permanently retired in this release: both
role action paths, user and pricing-plan create/update/delete reject before
database access regardless of the bridge flag. Both legacy brand creators also
reject automatic user creation. There is no new Admin SDK writer or fallback
permission scheme. The authenticated mPanel bridge is the sole catalogue writer.
During the staged flag-off interval and rollback, catalogue administration is
read-only; new-brand creation resumes when the central bridge is activated and
an existing owner can be selected. Existing brand edits and billing remain.

## Release order and verification

1. Complete exact-head CI and independent review for #137, #135 and Opsfly #276.
2. Merge reviewed changes through the accepted release process; deploy the pair
   with cutover off. Include all affected shared Supabase importers, not just the
   mPanel bundle. Record exact deployed commits and component versions.
3. Confirm the serving Orderfly revision includes the secret binding, matching
   owner IDs and the retired legacy-writer guards. Confirm mPanel secrets are configured.
4. Re-read the current published Firestore rules immediately before publication;
   their hash must match the reviewed input. Publish only the tested candidate
   in `orderfly-39325`, never the hosting project. If state changed, stop and
   prepare/review again. Verify the published candidate hash.
5. Activate the cutover flag in Orderfly and roll out the configured revision.
   Check the owner mPanel catalogue and preview with the existing read-only
   `@issue-273-live` and `@issue-275-live` checks and a valid temporary owner session.
   The paired workflow uses `ISSUE_273_ADMIN_SESSION`; never commit/log its value.
   Verify non-owner rejection, legacy redirects, billing/brand smoke and the
   deployed rules. The bridge is intentionally closed while the flag is off,
   so successful catalogue verification happens after this controlled activation.
6. Only mark release complete after actual deployment and live evidence. If the
   owner bridge fails, disable cutover again and keep the issue open.

Rollback retains protected Firestore rules and audit history. Disable cutover
and roll out again; catalogue editing remains closed. Restoring the bridge
restores editing through the verified owner only. Never restore permissive rules
or roll back past the retired-writer guards: older Admin SDK actions can bypass
Firestore rules. Fix forward within this release baseline.

## Tests

`node --test tests/unit/platform-firestore-preparation.mjs` checks that unknown,
stricter, broader and truncated policies cannot be substituted silently.
`node --test tests/unit/platform-role-server.cjs` executes both actual role
catalogue entry points, including pre-I/O save/delete rejection with the flag
on, off and absent, plus both brand auto-user-creation paths. Existing platform/brand browser and service regressions remain.

`npm ci --prefix tests/firestore` then `npm test --prefix tests/firestore` runs
the real Firestore emulator (Java 21, Node 24). The isolated, locked test package
does not alter app production dependencies. It requires the demo project and
loopback emulator and cannot fall back to production. Anonymous, signed-in and
admin-claim clients must fail protected reads/queries and create/update/delete,
including nested documents. Legacy reads, unrelated baseline operations and
trusted server writes are checked separately. The CI workflow requires these
tests; local fixture success alone is not emulator or production evidence.
