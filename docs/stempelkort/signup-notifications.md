# Email notifications for new Club memberships

Issue #544, coordination #385. Superadmin can follow signup activity independently for each brand.

## Administration

Open **Superadmin → Loyalitet → Stempelkort**, edit the brand, and use **E-mail ved nye Club-tilmeldinger** below the program form. The separate form has an enabled switch, one recipient email and its own save button. Only a current platform superuser sees or can read/write the recipient settings. Company administrators with stamp-card settings permission cannot access this feature.

All brands default to off. The saved recipient must be a valid email address; enabling additionally requires the brand's existing loyalty mail mapping. No recipient or brand is activated by deployment. The operator chooses and saves each brand explicitly. Settings are independent of program rules, text versions, campaigns and rewards. They are version-checked to reject concurrent edits, and audited with actor/time/before/after values. Authorization is rechecked against the current policy in the same transaction as the write.

## Signup and delivery

Both portal and checkout call the existing membership signup service. Only its **new member** branch reads these settings and creates a deterministic outbox document in the same Firestore transaction as membership/consent/bonus. A rollback leaves no queued message. Existing-member signup, consent refresh and login do not queue an admin notification. Enabling later does not backfill historical memberships.

The existing loyalty heartbeat processes up to 20 eligible jobs, separately from login mail and expiry. Before claiming a job, it rereads brand settings, the brand, member and current company mapping. Disabled, changed-version or changed-recipient settings cancel waiting jobs. Deleted/foreign members, suspended brands, or changed company ownership also cancel them. Switching off and back on cannot resurrect an earlier configuration's jobs. A message already handed to the provider cannot be recalled.

The provider message uses existing `loyaltyMailConfig`: `ORDERFLY_LOYALTY_NOTIFICATION_BRANDS`, falling back to `ORDERFLY_GAMES_NOTIFICATION_BRANDS`, and the existing central notification endpoint. No new API integration or secret is introduced.

Template: `orderfly.stamp_card.member_joined`; locale `da`; related entity `{type: 'loyalty_member', id: memberId}`. Variables: `brand_id`, `brand_name`, `program_name`, `member_id`, `joined_at` (ISO), `admin_url`. The fixed admin URL is `https://orderfly.dk/superadmin/loyalty/stamp-card/members/{memberId}` and retains the member page's normal login and authorization checks. No member name, customer email, birthdate, gender, phone, QR token or login link is included in the email.

A claim is transactional, so competing workers cannot send the same job. Provider idempotency key is `loyalty-member-joined-{outboxId}` and remains stable across definite retries. Missing configuration postpones a job without preventing signup. A definite retryable rejection retries at most five attempts. Permanent rejection stops; an unknown transport result stops as `uncertain` rather than risking duplicate notifications. As with login mail, an interrupted process after claim may leave `dispatching`; inspect central delivery status before any operator recovery, never blindly resend. `accepted` means the central platform accepted the request, not proof of inbox delivery.

## Data and release

Server-only Firestore collections:

- `loyaltySignupNotificationSettings/{brandId}`: brand ID, settings version, enabled/recipient, update actor/time.
- `loyaltySignupNotificationAudit/{hash}`: versioned settings audit.
- `loyaltySignupNotificationOutbox/{hash(brandId,memberId)}`: minimal signup metadata and delivery state.

Existing deny-all browser rules cover these new collections. The due-job query uses a single indexed `nextAttemptAt` field; no rules/index migration is needed. These settings are deliberately absent from public program/member responses.

The paired central platform release must support and validate the new template before activation. Implementation does not send test emails or create members in production. Release follows AGENTS.md: current main, own tests/typecheck, green current-head CI, independent Codex review, serial merge, actual deployed SHA, then authenticated read-only UI QA. Actual inbox delivery requires a separately authorized controlled test or observation of a real signup. Keep that distinct from synthetic test results and provider acceptance.

## Verification

`node --test tests/unit/loyalty-signup-notifications.cjs` exercises actual services with an in-memory transactional store: authorization, brand isolation, version conflict, audit, signup/login deduplication, checkout, rollback, competing workers, cancellation, minimal payload and failures/retries. `loyalty-signup-notifications-browser.cjs` renders the actual client card at 390/1440px and tests validation, save/off/version and server-error handling with a synthetic server action. Neither is production live QA. Existing membership/checkout/login suites are retained. Both new suites run in the existing Club CI step; no workflow permission or approval rules change.
