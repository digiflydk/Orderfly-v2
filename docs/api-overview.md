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
