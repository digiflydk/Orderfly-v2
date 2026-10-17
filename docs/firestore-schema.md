# Firestore Schema (Orderfly)

## Collection: `brands`
Stores information about each restaurant brand on the platform.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Public brand name (e.g., "Gourmet Burger") |
| `slug` | string | ✅ | URL-friendly identifier (e.g., "gourmet-burger") |
| `companyName` | string | ✅ | Legal company name |
| `companyRegNo` | string | ✅ | CVR / Organization number |
| `ownerId` | string | ✅ | Reference to `users` collection |
| `status` | string | ✅ | `active`, `pending`, `suspended` |
| `subscriptionPlanId`| string | | Reference to `subscription_plans` |
| `...` | | | See `types/index.ts` for a complete list |

---

## Collection: `locations`
Stores details for each physical restaurant location.

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | Reference to `brands` collection |
| `name` | string | ✅ | Location name (e.g., "Copenhagen K") |
| `slug` | string | ✅ | URL-friendly identifier |
| `address` | string | ✅ | Full street address |
| `isActive` | boolean | ✅ | Controls if location is open for orders |
| `openingHours` | map | ✅ | Nested object with hours for each day |
| `deliveryFee` | number | ✅ | |
| `minOrder` | number | ✅ | |
| `...` | | | See `types/index.ts` for a complete list |

---

## Collection: `products`
The global catalog of all menu items across all brands.

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | Reference to `brands` collection |
| `locationIds` | string[] | | If empty, available at all brand locations |
| `categoryId` | string | ✅ | Reference to `categories` collection |
| `productName` | string | ✅ | |
| `price` | number | ✅ | Base price for pickup |
| `priceDelivery` | number | | Optional delivery-specific price |
| `isActive` | boolean | ✅ | Controls visibility on menu |
| `toppingGroupIds`| string[] | | Reference to `topping_groups` |
| `allergenIds` | string[] | | Reference to `allergens` |
| `sortOrder`| number | | Used for drag-and-drop sorting |

---

## Collection: `categories`
Used to group products on the menu page.

| Field | Type | Required | Notes |
|---|---|---|---|
| `locationIds` | string[] | ✅ | Defines which locations this category appears in |
| `categoryName` | string | ✅ | |
| `sortOrder` | number | | Used for drag-and-drop sorting |
| `isActive` | boolean | ✅ | |
| `icon` | string | | Lucide icon name |

---

## Collection: `orders`
Stores all customer orders after successful payment.

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | |
| `locationId`| string | ✅ | |
| `customerId`| string | ✅ | Reference to `customers` collection |
| `status`| string | ✅ | Enum: `Received`, `In Progress`, `Ready`, `Completed`, `Canceled` |
| `paymentStatus`| string | ✅ | Enum: `Paid`, `Pending`, `Failed` |
| `totalAmount` | number | ✅ | Final amount charged |
| `productItems`| array | ✅ | Array of `MinimalCartItem` objects |
| `paymentDetails`| map | ✅ | Subtotal, discounts, fees, etc. |
| `createdAt`| timestamp | ✅ | Server-generated timestamp |

**Example Document:**
```json
{
  "id": "ORD-123456",
  "status": "Completed",
  "paymentStatus": "Paid",
  "totalAmount": 245.50,
  "customerName": "John Doe",
  "productItems": [
    { "name": "Margherita", "quantity": 1, "price": 89 },
    { "name": "Coke", "quantity": 2, "price": 25 }
  ]
}
```

---

## Collection: `customers`
Aggregates data for each unique customer.

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Unique identifier |
| `fullName`| string | ✅ | |
| `phone`| string | ✅ | |
| `totalOrders`| number | ✅ | Aggregated count |
| `totalSpend`| number | ✅ | Aggregated sum |
| `lastOrderDate`| timestamp | | |
| `loyaltyScore`| number | | Calculated score (0-100) |
| `loyaltyClassification`| string | | `New`, `Occasional`, `Loyal`, `At Risk` |
| `pendingNewsletterDiscountId` | string | | Retains newly granted incentive eligibility across canceled checkout retries; paid usage remains authoritative |
| `marketingConsent`| boolean | | Customer has opted in to marketing/newsletters |
| `discountUsage`| map | | Discount document ID to successful-use count; updated after paid checkout |

## Collection: `feedbackSettings`

One document per brand. `questionVersionId` optionally assigns an active feedback question version to that brand. The document also owns public-review activation, feedback-mail activation, automatic invitation delay, reminder settings, language and optional thank-you behavior. Server-side writes validate brand scope and question-version compatibility.

## Collections: `feedbackMailJobs` and `orderNotificationJobs`

Durable, idempotent notification outboxes. Jobs store source identifiers, state, attempts, timestamps and an opaque event ID. Recipient email and signed feedback URL are resolved from authoritative records immediately before dispatch and are not stored in admin projections. `accepted` means accepted by the central mPanel queue; Mailtrap delivery remains authoritative in mPanel.

## Collection: `marketingOrderOutbox`

Consent-gated Omnisend paid-order delivery queue. Each deterministic job stores
only brand, location, order and customer identifiers, the event time, an opaque
event ID, state, attempts and lease timestamps. The worker resolves the current
customer and immutable invoice, rechecks paid/canceled state and current synced
email consent, and then sends Omnisend's native `paid for order` event. Unknown
post-dispatch outcomes enter terminal `uncertain` state to prevent duplicate
real-time automation. Clients must have no direct read or write access.

---

## Stamp-card collections (stempelkort phase 1)

Server-only, like every other collection (`firestore.access.rules` denies browser access). Times are epoch milliseconds and money is integer øre. Every document carries `brandId` and, where relevant, the tenant snapshot `companyId`. Types are in `src/lib/loyalty/stamp-card/model.ts`.

| Collection | ID | Content |
|---|---|---|
| `loyaltyPrograms` | `{brandId}` | `{brandId, version, settings}`. `settings` follows `programSettingsSchema`. A missing document means an inactive program. Written by the admin settings (PR 4). |
| `loyaltyMembers` | random | `customerId`, `name`, `normalizedEmail`, `status` (`active`/`deleted`), `joinedAt`, `currentCardId`, `stampDay`/`stampsOnDay` for the optional daily limit, `consent` (`given`/`withdrawn`, time, source `portal`/`omnisend`, consent event and text version), `termsVersion`, `sessionEpoch` and `lastActivityAt` (latest stamp, redemption or correction). Deletion keeps only `companyId`, `brandId`, `status`, `joinedAt`, `deletedAt` and the epoch, so the log stays pseudonymous. |
| `loyaltyProgramVersions` | `{brandId}_{version}` | Immutable snapshot of each saved program version with the employee and time. The settings change itself is logged as a `settings_changed` event with every field's old and new value. |
| `loyaltyMemberIdentities` | `sha256(["loyalty-member", brandId, email])` | `{brandId, memberId}`. Prevents duplicates and powers e-mail lookup. |
| `loyaltyCards` | random | The card freezes the rules it was issued under: `programVersion`, `stampsRequired`, `crossLocation`, `cardValidityMonths`, `rewardValidityMonths`, reward snapshot. Also `stamps`, `status` (`active`/`completed`/`expired`), `locationId` (bound location or `null`), `lastStampAt` and `expiresAt` (`null` until the first stamp). |
| `loyaltyRewards` | `sha256([eventId, "reward", n])` | Reward snapshot, `description`, `locationId`, `earnedAt`, `expiresAt`, `status` (`available`/`redeemed`/`expired`/`cancelled`) and the redeeming employee and location. |
| `loyaltyEvents` | `sha256([operation, brandId, idempotencyKey])` or a deterministic job key | Append-only log with tenant, brand, member, type, quantity, amount, channel, source, location, employee ID and name, reason, idempotency key, request hash, card and reward. The primary event stores the operation's `result` receipt. |
| `loyaltyQrTokens` | `sha256(["qr", token])` | `{brandId, memberId, createdAt, expiresAt, usedAt}`. The raw token is never stored; it is valid for 60 seconds and consumed by the first lookup. |
| `loyaltyRateLimits` | `sha256([scope, key, window])` | Fixed-window counters: employee lookups (60/min), sign-up per IP (20/h), login links per e-mail (5/h) and per IP (30/h), link verification per IP (30/h), QR tokens per member (20/min). Keys are hashed, so no raw e-mail or IP is stored. |
| `loyaltyLoginTokens` | `sha256(["login", token])` | `{brandId, memberId, createdAt, expiresAt (15 min), usedAt}`. Single use. |
| `loyaltySessions` | `sha256(["session", token])` | `{brandId, memberId, epoch, createdAt, expiresAt (program sessionDays, default 180 days), revokedAt}`. The raw token exists only in the `__Host-orderfly-loyalty` cookie. |
| `loyaltyMailOutbox` | same ID as the login token | Login mail job. It holds the link only until it is accepted, expires or fails permanently. States: `pending`, `dispatching`, `accepted`, `failed`, `uncertain`, `expired`. |

Newsletter consent from the program uses the existing `marketingConsents`, `marketingOutbox` and `marketingContacts` with `source: 'loyalty'`, the program's consent text and a version derived from that text. A portal opt-out is a consent event with `action: 'unsubscribe'`.

Required composite indexes for the expiry job and the reward lookup are listed in `docs/loyalty-firestore-indexes.json`. Add them additively to the production data project `orderfly-39325`; the file is not a full index inventory. Create them with the manual GitHub workflow **Firestore indexes** (`.github/workflows/firestore-indexes.yml`, script `scripts/firestore-indexes.mjs`): it creates only missing indexes from the chosen `docs/*-firestore-indexes.json` files, never deletes one, and waits until all are `READY`. Locally, the same script runs with `FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token) node scripts/firestore-indexes.mjs docs/loyalty-firestore-indexes.json`. The script first logs which principal it uses (`account <client_email> (key project <id>), target project orderfly-39325`, or the principal of `FIRESTORE_ACCESS_TOKEN` when that variable is set and takes precedence); the account e-mail and project ids are not secret. The CI key belongs to a service account in another Firebase project, so that account needs the IAM role **Cloud Datastore Index Admin** in `orderfly-39325`. If it is missing, the run stops at the first index with `HTTP 403. Grant "Cloud Datastore Index Admin" in orderfly-39325 to <principal>`; grant that role to the named principal in Google Cloud IAM for `orderfly-39325` and rerun the workflow (existing indexes are reported as `exists`). Do not deploy these partial files with `firebase deploy --only firestore:indexes`, which offers to delete every index not in the file.

## Collection: `discounts`
Defines customer-entered discount codes and automatic newsletter-signup incentives.

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | Tenant scope |
| `locationIds` | string[] | ✅ | Eligible restaurant locations |
| `applicationType` | string | ✅ | `code` or `newsletter_signup` |
| `code` | string | ✅ | Entered by the customer for `code`; internally `NEWSLETTER_SIGNUP` for newsletter incentives |
| `discountType` | string | ✅ | `percentage` or `fixed_amount` |
| `discountValue` | number | ✅ | Percentage or DKK amount |
| `minOrderValue` | number | | Minimum eligible basket value |
| `orderTypes` | string[] | ✅ | `pickup`, `delivery`, or both |
| `usageLimit` | number | ✅ | Global successful-use limit; `0` means unlimited |
| `perCustomerLimit` | number | ✅ | Successful-use limit per customer; newsletter incentives default to `1` |
| `usedCount` | number | ✅ | Incremented by the paid-order webhook |
| `isActive` | boolean | ✅ | Controls checkout eligibility |

---

## Collection: `standardDiscounts`
Defines automatic discounts (e.g., "2-for-1 Tuesdays").

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | |
| `locationIds`| string[] | ✅ | |
| `discountType`| string | ✅ | `product`, `category`, `cart`, `free_delivery` |
| `referenceIds`| string[] | | IDs of products/categories this applies to |
| `discountMethod`| string | ✅ | `percentage`, `fixed_amount` |
| `discountValue`| number | | |
| `minOrderValue`| number | | Required for cart/delivery discounts |
| `isActive`| boolean | ✅ | |

---

## Collection: `combos`
Defines combo meal deals.

| Field | Type | Required | Notes |
|---|---|---|---|
| `brandId` | string | ✅ | |
| `locationIds`| string[] | ✅ | |
| `comboName` | string | ✅ | |
| `pickupPrice`| number | ✅ | |
| `productGroups`| array | ✅ | Defines the structure of the combo |

---

## Collection: `settings`
Stores platform-wide settings (e.g., payment keys, languages).

| Document ID | Purpose |
|---|---|
| `general` | Website title, contact info, opening hours |
| `branding` | Platform logo, favicon, and main heading |
| `payment_gateway`| Stripe API keys (test and live) |
| `analytics`| Global GA4/GTM tracking IDs |
| `languages`| Supported languages for UI and feedback |
| `loyalty` | Weights and thresholds for loyalty score calculation |

---

## Collection: `users` & `roles`
Manages admin access control.

| Collection | Key Fields | Notes |
|---|---|---|
| **users** | `name`, `email`, `roleIds[]` | RoleIds reference the `roles` collection. |
| **roles** | `name`, `permissions[]` | Permissions is an array of strings (e.g., `products:create`). |
