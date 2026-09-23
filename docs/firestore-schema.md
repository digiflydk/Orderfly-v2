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

## Collection: `feedbackQuestionsVersion`

Versioned feedback forms. `scope` is either `default` (available to every brand) or `brand` (available only to `brandId`). A missing `scope` on a legacy document is interpreted as `default`. At most one active version may cover the same language and experience type within each scope: one platform default and one per brand. When a brand has no explicit `feedbackSettings.questionVersionId`, its active brand-specific version is preferred and the active default is the fallback.

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
