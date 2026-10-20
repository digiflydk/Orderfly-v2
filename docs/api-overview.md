# API Overview (Orderfly)

| Path | Method | Caller | Handler | DB | Response |
|---|---|---|---|---|---|
| /superadmin/products/new | POST (Action) | ProductFormPage | createOrUpdateProduct | products | Redirect |
| /superadmin/products/edit/:id | POST (Action) | ProductFormPage | createOrUpdateProduct | products | Redirect |
| /superadmin/feedback/questions/new | POST (Action) | FeedbackQuestionVersionForm | createOrUpdateQuestionVersion | feedbackQuestionsVersion | Redirect |
| /api/debug/all | GET | Manual/ops | route.ts | settings/*, cms/*, etc. | { ok, data, timestamp } |
| /api/docs/download | GET | Retired | route.ts | Superadmin | 410; use repository docs |

**Server Actions**
- `createOrUpdateProduct(formData)` → Redirects on success, throws on error.
- `createOrUpdateQuestionVersion(formData)` → Returns `{ok:true,id}` or `{ok:false,error}`.

**Runtime**
- Alle debug-routes: `runtime = nodejs`, `dynamic = force-dynamic`, `fetchCache = default-no-store`


## Merchant stamp-card API (stempelkort phase 1, PR 2)

All four endpoints are `POST`, JSON only and same-origin (`Origin` must match; `sec-fetch-site: cross-site` is rejected). They require the admin session cookie. The employee is re-validated natively on every request, so deactivated staff are rejected. Each operation re-checks the permission for the exact brand and location inside its Firestore transaction. Responses are `Cache-Control: no-store`. Errors are `{error: code}`: `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 member_not_found|reward_not_found`, `409` conflict codes, `410 qr_invalid`, `422` business rejections, `429 rate_limited`, `503 unavailable`. Retry with the same `idempotencyKey` (64 hex characters) after a `503`.

| Endpoint | Permission | Body | Result |
|---|---|---|---|
| `/api/merchant/loyalty/lookup` | `orderfly.stamp_cards:counter` | `{brandId, locationId, qrToken}` or `{brandId, locationId, email}` | Member name and masked e-mail, card progress, valid rewards (`redeemableHere`), program rules for the counter, and whether the employee may redeem/correct. A QR token is single-use. |
| `/api/merchant/loyalty/stamp` | `…:counter` | `{brandId, locationId, memberId, channel: dine_in\|takeaway, amountOre, discountUsed, via: qr\|search, idempotencyKey}` | `{stamps, stampsRequired, rewardsEarned, cardId, replayed}`. Rejections: `program_inactive`, `channel_not_allowed`, `below_minimum`, `discount_excluded`, `daily_limit`, `wrong_location`. |
| `/api/merchant/loyalty/redeem` | `…:redeem` | `{brandId, locationId, rewardId, via, idempotencyKey}` | `{rewardId, description, replayed}`. Rejections: `program_inactive`, `reward_not_available`, `reward_expired`, `reward_wrong_location`. |
| `/api/merchant/loyalty/correct` | `…:correct` | `kind: add_stamps\|remove_stamps` with `memberId, count`, or `kind: cancel_redemption` with `rewardId`. Always `reason` (3–500 characters) and `idempotencyKey`. | New card state or reward status. Every correction is logged with the employee and reason. |

The authenticated worker heartbeat `/api/internal/feedback/send` also runs `runLoyaltyExpiry`. It expires idle cards and old rewards in separate transactions and logs each expiry. Its failure is reported as `loyalty: {failed: true}` without failing the other workers.


## Customer stamp-card API (stempelkort phase 1, PR 3)

Used by the customer portal (phase 2). All endpoints live under `/api/loyalty/{brandSlug}/`. The brand is resolved from its public slug and never from a client ID. Mutations are same-origin JSON only, and reads reject `sec-fetch-site: cross-site`. Responses are `no-store`. Errors are `{error: code}`, and a `401` clears the session cookie.

| Endpoint | Session | Body | Result |
|---|---|---|---|
| `GET program` | – | – | `{active, name, stampsRequired, rewardDescription, consentText, consentHelp, termsAccept, terms, consentVersion, termsVersion}`. The texts are filled from the standard-text placeholders (brand details and settings). They are empty while inactive, and `active` is false when a placeholder cannot be filled. `consentVersion` hashes the filled consent and explanation; `termsVersion` hashes the filled acceptance text and terms. |
| `POST signup` | – | `{name, email, newsletterConsent: true, termsAccepted: true, consentVersion, termsVersion}` | Always `{ok: true}`. A new member and versioned consent are created, or an existing member gets a login link. The response never reveals which. The consent log stores the filled consent text, and the member stores the published text version and the hash of the filled texts shown (`loyaltyRenderedTexts`). `409 program_inactive\|program_changed`, `429 rate_limited`. |
| `POST login-link` | – | `{email}` | Always `{ok: true}`. A mail with a one-time link is sent only to an active member. |
| `POST verify` | – | `{token}` (64 hex, from the link fragment) | Sets the `__Host-orderfly-loyalty` cookie (HttpOnly, Secure, SameSite=Lax) and returns `{ok, expiresAt}`. `410 link_invalid\|link_expired`. |
| `GET me` | yes | – | Program, member, card, valid rewards, history (no staff names or reasons) and newsletter status. |
| `GET qr` | yes | – | `{token, expiresAt}`: a single-use 60-second token for the counter lookup. Limited to 20 per minute. |
| `POST consent` | yes | `{subscribed: false}` or `{subscribed: true, consentVersion}` | Changes only the newsletter consent and syncs it to Omnisend. Membership and stamps are kept. |
| `POST delete` | yes | `{confirm: true}` | Deletes the membership and personal data and revokes all sessions. |
| `POST logout` | yes | `{}` | Revokes this session and clears the cookie. |

The login link is `https://{slug}.orderfly.dk/club/login#token=…`. It is built on the server from the brand slug and opens the customer portal (`src/app/[brandSlug]/club/`, phase 2), which also answers on `orderfly.dk/{slug}/club`. The token is in the fragment and verified by POST, so mail scanners cannot consume it. Login mail uses the central Notification Platform template `orderfly.stamp_card.login_link`, which needs the paired Esmeralda release. The brand mapping comes from `ORDERFLY_LOYALTY_NOTIFICATION_BRANDS`, falling back to the existing `ORDERFLY_GAMES_NOTIFICATION_BRANDS`. The worker heartbeat retries waiting mail; an unknown transport result is not retried.
