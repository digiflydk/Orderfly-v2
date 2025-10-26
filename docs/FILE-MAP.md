# File Map (nuværende placeringer — opdater løbende ved ændringer)

## Customer Webshop (Frontend)
- **Brand Homepage (Location List):** `src/app/[brandSlug]/page.tsx`
- **Menu Page (Server):** `src/app/[brandSlug]/[locationSlug]/page.tsx`
- **Menu Page (Client):** `src/app/[brandSlug]/[locationSlug]/menu-client.tsx`
- **Checkout Page:** `src/app/[brandSlug]/[locationSlug]/checkout/page.tsx`
- **Confirmation Page:** `src/app/[brandSlug]/[locationSlug]/checkout/confirmation/page.tsx`
- **Cart Context:** `src/context/cart-context.tsx`
- **Cart Components:** `src/components/cart/*`
- **Checkout Components:** `src/components/checkout/*`
- **Product Components:** `src/components/product/*`
- **Layout Components:** `src/components/layout/*`

## Superadmin Core
- **Layout:** `src/app/superadmin/layout.tsx`
- **Sidebar:** `src/components/superadmin/sidebar-client.tsx`
- **Dashboard:** `src/app/superadmin/dashboard/page.tsx`

## Catalog Management
- **Brands:** `src/app/superadmin/brands/page.tsx` (List) / `.../new` (Create) / `.../edit/[brandId]` (Edit)
- **Locations:** `src/app/superadmin/locations/page.tsx` (List) / `.../new` (Create) / `.../edit/[locationId]` (Edit)
- **Products:** `src/app/superadmin/products/page.tsx` (List) / `.../new` (Create) / `.../edit/[productId]` (Edit)
- **Categories:** `src/app/superadmin/categories/page.tsx` (List) / `.../new` (Create) / `.../edit/[categoryId]` (Edit)
- **Toppings:** `src/app/superadmin/toppings/page.tsx` (List)
- **Allergens:** `src/app/superadmin/allergens/page.tsx` (List)

## Promotions
- **Standard Discounts:** `src/app/superadmin/standard-discounts/page.tsx`
- **Voucher Codes:** `src/app/superadmin/discounts/page.tsx`
- **Combo Menus:** `src/app/superadmin/combos/page.tsx`
- **Upsells:** `src/app/superadmin/upsells/page.tsx`

## People & Access
- **Users:** `src/app/superadmin/users/page.tsx`
- **Roles:** `src/app/superadmin/roles/page.tsx`

## Feedback (Questions)
- **List:** `src/app/superadmin/feedback/page.tsx`
- **Question Versions UI:** `src/app/superadmin/feedback/questions/page.tsx`
- **Question Form:** `src/components/superadmin/feedback-question-version-form.tsx`
- **Server Action:** `src/app/superadmin/feedback/actions.ts`

## Debug & System
- **Debug Endpoints:** `/api/debug/all/route.ts`
- **OpenAPI Spec:** `src/lib/openapi/spec.ts`, `src/app/api/docs/route.ts` (UI)
- **Firebase Admin Init:** `src/lib/firebase-admin.ts`
