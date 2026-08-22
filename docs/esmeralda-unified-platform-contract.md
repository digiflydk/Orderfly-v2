# Orderfly v2 + Esmeralda unified platform contract

Status: canonical integration contract for the first unified-platform implementation.

## Goal

Orderfly v2 and Esmeralda Restaurant Operations remain separate runtimes and databases for now, but shared business concepts must have one canonical meaning. Native field names may remain in Firestore and Supabase while adapters expose the canonical contract below.

This avoids breaking existing production flows while preventing two competing data models from growing further apart.

## System ownership

- **Orderfly v2** owns restaurant e-commerce, consumer customers, menu/catalog, online orders, loyalty and order feedback.
- **Esmeralda Restaurant Operations** owns HR, attendance, employee scheduling, table booking, production, B2B frozen-pizza operations and mPanel.
- Shared entities use explicit ID mappings. IDs from Firestore and Supabase must never be assumed to be interchangeable.

## Critical semantic boundaries

### Consumer customer vs production customer

Do not merge these entities.

- Orderfly `customers` = restaurant consumer / guest / end customer.
- Esmeralda booking guest = restaurant consumer / guest and should resolve to the same consumer-customer concept as Orderfly.
- Esmeralda `production_customers` = B2B account, distributor, sales outlet or internal production customer.

Canonical names:

- `consumer_customer`
- `business_account`

### Online order vs production sales order

Do not merge these entities into one operational table.

- Orderfly `orders` = restaurant checkout order.
- Esmeralda `production_sales_orders` = B2B sales order for manufactured products.

Canonical names:

- `commerce_order`
- `production_sales_order`

### Menu product vs production product

Do not merge these entities by name.

- Orderfly `products` = sellable menu item.
- Esmeralda `production_products` = manufactured SKU/intermediate product.

A product can be linked across systems, but the records have different lifecycles and responsibilities.

Canonical names:

- `menu_product`
- `production_product`

## Canonical entity mapping

### Organization / brand

Canonical entity: `organization`

| Canonical field | Esmeralda | Orderfly v2 | Notes |
|---|---|---|---|
| `organization_id` | `organizations.id` | mapped from `brands.id` | Global contract ID must use an explicit cross-system mapping, not native IDs directly. |
| `name` | `organizations.name` | `brands.name` | Human-facing business name. |
| `slug` | `organizations.slug` | `brands.slug` | Stable public/business slug where possible. |
| `legal_name` | currently organization/business settings | `brands.companyName` | Legal company name. |
| `company_registration_number` | organization/business settings | `brands.companyRegNo` | CVR / organization number. |
| `brand_name` | `organizations.brand_name` | `brands.name` | Public brand label. |
| `logo_url` | `organizations.logo_url` | `brands.logoUrl` | Public logo. |
| `status` | derived from `is_active` | `brands.status` | Canonical values: `active`, `pending`, `suspended`, `inactive`. |
| `timezone` | `organizations.timezone` | location/config default | IANA timezone. |
| `default_locale` | `organizations.default_locale` | language/settings | BCP-47 locale. |
| `currency` | organization settings | `brands.currency` | ISO 4217. |

Decision: **`organization` is the cross-platform canonical term.** Orderfly `brand` is an adapter-facing name for the same tenant/business concept, not a second tenant level.

### Location

Canonical entity: `location`

| Canonical field | Esmeralda | Orderfly v2 | Notes |
|---|---|---|---|
| `location_id` | `restaurant_locations.id` / linked `work_locations.id` | `locations.id` | Use mapping table/collection. Do not join by name. |
| `organization_id` | `organization_id` | `brandId` | Parent tenant. |
| `name` | location name | `locations.name` | Human-facing location name. |
| `slug` | `restaurant_locations.slug` | `locations.slug` | Stable location key. |
| `street_address` | location address fields | `street` / `address` | Canonical street address. |
| `postal_code` | location postal field | `zipCode` | Canonical name is `postal_code`. |
| `city` | location city | `city` | Same meaning. |
| `country_code` | location country/default | `country` | ISO 3166-1 alpha-2. |
| `is_active` | active flag | `isActive` | Same meaning. |

Esmeralda currently has separate operational location concepts for booking and HR. These must be explicitly linked to the same canonical `location`, not inferred by text matching.

### Consumer customer

Canonical entity: `consumer_customer`

Orderfly remains the first source of truth for the consumer customer profile.

| Canonical field | Esmeralda booking | Orderfly v2 customer | Notes |
|---|---|---|---|
| `consumer_customer_id` | new mapped/reference field | `customers.id` | Booking should persist a customer link after resolution. |
| `organization_id` | booking `organization_id` | `brandId` | Same tenant concept. |
| `full_name` | `guest_name` | `fullName` | Same meaning. |
| `email` | `guest_email` | `email` | Normalize lowercase/trim. |
| `phone` | `guest_phone` | `phone` | Normalize to a consistent international format where possible. |
| `street_address` | optional future booking field | `street` | Do not overload booking note. |
| `postal_code` | optional future booking field | `zipCode` | Canonical name. |
| `city` | optional future booking field | `city` | Same meaning. |
| `marketing_consent` | booking consent/custom field if collected | `marketingConsent` | Must preserve consent source/timestamp. |
| `notes` | guest/customer note where appropriate | `notes` | Booking-specific notes should remain on the booking unless explicitly promoted to customer notes. |
| `status` | derived | `status` | Canonical `active` / `inactive`. |

Resolution policy for a new booking:

1. If email exists, normalize and look up within the same organization/brand.
2. If one matching consumer customer exists, link it.
3. If no match exists, create a consumer customer in the integration/customer service.
4. Phone can be used as a secondary match only with conservative conflict handling.
5. Never match by name alone.
6. Store the resulting customer mapping on the booking.

### Table booking

Canonical entity: `booking`

Esmeralda remains source of truth for booking operations.

| Canonical field | Esmeralda | Orderfly/shared use |
|---|---|---|
| `booking_id` | booking primary ID | exposed through integration contract |
| `organization_id` | `organization_id` | mapped to Orderfly brand |
| `location_id` | `location_id` | mapped to Orderfly location |
| `consumer_customer_id` | new integration reference | Orderfly consumer customer mapping |
| `booking_reference` | booking reference | same |
| `party_size` | `party_size` | same |
| `starts_at` | `starts_at` | same ISO timestamp |
| `guest_name_snapshot` | `guest_name` | immutable booking-time snapshot |
| `guest_email_snapshot` | `guest_email` | immutable booking-time snapshot |
| `guest_phone_snapshot` | `guest_phone` | immutable booking-time snapshot |
| `guest_note` | `guest_note` | booking-specific note |
| `source` | source, currently e.g. `website` | same |
| `attribution` | attribution payload | same |
| `status` | booking status | canonical booking status enum |
| `created_at` | booking created time | same |

Customer contact data remains snapshotted on the booking even after a `consumer_customer_id` is linked. This preserves historical truth if the customer changes phone/email later.

### Consumer feedback

Canonical entity: `feedback`

Orderfly owns the feedback engine and question/version model. Feedback must be able to originate from either an Orderfly commerce order or an Esmeralda booking.

Current Orderfly feedback is order-linked. Extend the shared contract to use a source reference:

- `source_type`: `commerce_order` or `booking`
- `source_id`: Orderfly order ID or Esmeralda booking ID
- `consumer_customer_id`
- `organization_id`
- `location_id`

During migration, existing Orderfly feedback can map `orderId -> source_id` and set `source_type = commerce_order` without changing historic meaning.

### Commerce order

Canonical entity: `commerce_order`

| Canonical field | Orderfly v2 | Notes |
|---|---|---|
| `commerce_order_id` | `orders.id` | Native Orderfly order ID. |
| `organization_id` | `brandId` | Canonical tenant mapping. |
| `location_id` | `locationId` | Canonical location mapping. |
| `consumer_customer_id` | `customerId` | Canonical consumer customer. |
| `status` | `status` | Map to canonical order status vocabulary at API boundary. |
| `payment_status` | `paymentStatus` | Same meaning. |
| `total_amount` | `totalAmount` | Money amount. |
| `items` | `productItems` | Order-line snapshots. |
| `created_at` | `createdAt` | Same meaning. |

### Production B2B business account

Canonical entity: `business_account`

| Canonical field | Esmeralda production | Notes |
|---|---|---|
| `business_account_id` | `production_customers.id` | Do not map to Orderfly consumer customers. |
| `organization_id` | `organization_id` | Tenant. |
| `name` | `name` | Company/outlet name. |
| `account_type` | `customer_type` | `business`, `internal`, `distributor`. |
| `contact_name` | `contact_name` | Contact person. |
| `email` | `email` | General contact email. |
| `phone` | `phone` | Contact phone. |
| `company_registration_number` | `cvr_number` | CVR. |
| `street_address` | `address` | Billing street address. |
| `postal_code` | `postal_code` | Same meaning. |
| `city` | `city` | Same meaning. |
| `invoice_email` | `invoice_email` | Billing email. |
| `payment_terms` | `payment_terms` | Canonical values should remain `immediate`, `net_8`, `net_30`. |
| `is_active` | `is_active` | Same meaning. |

### Production sales order

Canonical entity: `production_sales_order`

| Canonical field | Esmeralda production |
|---|---|
| `production_sales_order_id` | `production_sales_orders.id` |
| `organization_id` | `organization_id` |
| `business_account_id` | `customer_id` |
| `order_number` | `order_number` |
| `customer_reference` | `customer_reference` |
| `order_date` | `order_date` |
| `status` | `status` |
| `total_amount` | `total_amount` |
| `notes` | `notes` |
| `created_at` | `created_at` |
| `updated_at` | `updated_at` |

### Menu product vs production product

Shared field vocabulary should be consistent even though the entities remain separate.

| Canonical field | Orderfly menu product | Esmeralda production product |
|---|---|---|
| `name` | `productName` | `name` |
| `organization_id` | `brandId` | `organization_id` |
| `is_active` | `isActive` | `is_active` |
| `location_ids` | `locationIds` | not applicable to manufacturing master SKU by default |
| `product_code` | optional/new | `code` |

If a manufactured frozen pizza is also sold through Orderfly, use an explicit `product_link` between the two records. Never match products by name.

### User, membership and permissions

Canonical concepts:

- `platform_user`: login identity
- `organization_membership`: tenant membership
- `role`: named permission bundle
- `permission`: atomic permission string
- `employee`: HR/employment person record

Orderfly currently has Firebase-auth-backed `users` with `roleIds[]` and `roles.permissions[]`.

Esmeralda has Supabase Auth, `organization_memberships.access_level`, employee records and module access permissions.

Decision:

- Do not treat `employee` and `platform_user` as the same entity.
- A platform user may optionally link to an employee.
- Long term, permissions should converge on atomic permission strings while retaining a coarse membership access level for tenant administration.

### Tracking configuration

Canonical entity: `tracking_config`

| Canonical field | Esmeralda | Orderfly v2 |
|---|---|---|
| `organization_id` | organization | brand mapping |
| `location_id` | booking tracking location | optional location override |
| `ga4_measurement_id` | `google_measurement_id` | `ga4MeasurementId` |
| `gtm_container_id` | future/shared | `gtmContainerId` |
| `meta_pixel_id` | `meta_pixel_id` | future/shared |
| `google_enabled` | `is_google_enabled` | derived from config |
| `meta_enabled` | `is_meta_enabled` | derived from config |

## Naming rules for integration APIs

1. Cross-platform payloads use **snake_case**.
2. Firestore keeps its native camelCase fields until a deliberate migration is approved.
3. Supabase keeps its native snake_case fields.
4. Adapters/mappers perform naming conversion at the boundary.
5. New shared fields should use the canonical names in this document.
6. No joins based on display names, email text alone across tenants, or location names.

## ID mapping

Create explicit cross-system mappings instead of reusing native IDs.

Recommended logical mappings:

- `organization_links(esmeralda_organization_id, orderfly_brand_id)`
- `location_links(esmeralda_location_id, orderfly_location_id, organization_link_id)`
- `consumer_customer_links(esmeralda_booking_customer_ref, orderfly_customer_id)` where needed
- `product_links(esmeralda_production_product_id, orderfly_product_id, link_type)`

A future shared integration service may replace these with globally issued IDs, but native Firestore string IDs and Supabase UUIDs must remain valid in their owning systems.

## First implementation slice

1. Add explicit organization and location mapping for Esmeralda <-> Orderfly v2.
2. Add `consumer_customer_id` / integration reference to Esmeralda bookings.
3. On booking confirmation, resolve/upsert the Orderfly consumer customer using normalized email first.
4. Keep guest name/email/phone snapshots on the booking.
5. Extend Orderfly feedback source model from order-only to `source_type + source_id` so a booking can use the same feedback engine.
6. Reuse the same location/organization/customer mappings for customer history views in mPanel.
7. Add contract tests in both repositories for canonical field adapters.

## Non-goals for the first slice

- No physical database merger.
- No direct Firestore IDs stored as replacements for Supabase UUID primary keys.
- No merger of B2C customers with production B2B customers.
- No merger of restaurant commerce orders with production sales orders.
- No merger of menu products with manufacturing SKUs.
- No large rename migration of existing production fields merely for naming consistency.

## Source references in the repositories

Esmeralda:

- `supabase/migrations/20260810110000_add_multi_tenant_foundation.sql`
- `supabase/functions/booking-api/index.ts`
- `supabase/migrations/20260815142500_production_module_foundation.sql`
- `supabase/migrations/20260819230523_add_production_customer_billing_fields.sql`
- `supabase/migrations/20260820154500_add_production_sales_orders.sql`

Orderfly v2:

- `docs/firestore-schema.md`
- `src/types/index.ts`
- `docs/architecture.md`
