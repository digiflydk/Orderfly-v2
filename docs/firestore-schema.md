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
