# Orderfly — Database Communication Map

This document explains how data flows between the **Superadmin**, **Firestore**, and the **Frontend (Customer Webshop)**.  
It focuses on what data is *sent*, *stored*, and *retrieved* in each direction.

---

## Overview Diagram (Mermaid)

```mermaid
flowchart LR
  A[Superadmin UI\n/ superadmin/*] -->|Server Actions| B[(Firestore)]
  B -->|Read/Sync| C[Frontend\n/ [brand]/[location]]
  B -->|Realtime Updates| D[Superadmin Lists]
  classDef box fill:#fff,stroke:#999,rx:6,ry:6;
  classDef db fill:#eef7ff,stroke:#5b9bd5,rx:6,ry:6;
```

---

## 1. Superadmin → Firestore (Writes)

| Action                         | File                                               | Firestore Collection       | Payload Example                                                 | Description                                           |
| ------------------------------ | -------------------------------------------------- | -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Create/Update Product          | `src/app/superadmin/products/actions.ts`           | `products`                 | `{ brandId, locationIds, categoryId, productName, price, ... }` | Server Action that saves or updates product documents |
| Create/Update Feedback Version | `src/app/superadmin/feedback/actions.ts`           | `feedbackQuestionsVersion` | `{ versionLabel, questions[], orderTypes, language }`           | Stores versioned feedback questionnaires              |
| Create/Update Category         | `src/app/superadmin/categories/actions.ts`         | `categories`               | `{ name, sortOrder, isActive }`                                 | Updates category documents                            |
| Create/Update Combo Menu       | `src/app/superadmin/combos/actions.ts`             | `combos`                   | `{ brandId, items[], price }`                                   | Creates combo menu configurations                     |
| Manage Discounts               | `src/app/superadmin/standard-discounts/actions.ts` | `standardDiscounts`        | `{ type, value, minOrder, active }`                             | Updates automatic discounts                           |

---

## 2. Firestore → Frontend (Reads)

| Consumer          | Source                                                              | Firestore Collections                             | Data Used                               | Purpose                             |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| Customer Menu     | `src/app/[brandSlug]/[locationSlug]/page.tsx`                       | `products`, `categories`, `toppings`, `allergens` | Product listings, category filters      | Displays full menu on webshop       |
| Checkout          | `src/app/[brandSlug]/[locationSlug]/checkout/page.tsx`              | `products`, `settings`                            | Product price, availability, tax rules  | Prepares checkout and pricing       |
| Confirmation Page | `src/app/[brandSlug]/[locationSlug]/checkout/confirmation/page.tsx` | `orders`                                          | `{ id, total, items[], paymentStatus }` | Displays order confirmation         |
| Brand Homepage    | `src/app/[brandSlug]/page.tsx`                                      | `locations`, `settings`                           | Locations, branding details             | Loads available locations per brand |

---

## 3. Firestore ↔ Superadmin (Realtime Reads)

| Context            | Firestore Collection       | Purpose                           | File                                    |
| ------------------ | -------------------------- | --------------------------------- | --------------------------------------- |
| Product List       | `products`                 | Lists, filters, sorting           | `src/app/superadmin/products/page.tsx`  |
| Feedback Questions | `feedbackQuestionsVersion` | Displays latest version per brand | `src/app/superadmin/feedback/page.tsx`  |
| Locations          | `locations`                | Display + edit location data      | `src/app/superadmin/locations/page.tsx` |
| Toppings           | `toppings`                 | Load toppings and groups          | `src/app/superadmin/toppings/page.tsx`  |

---

## Notes

* All communication between Superadmin and Firestore uses **Server Actions** (with `'use server'` directive).
* All reads from Frontend (Customer Webshop) are done via **Next.js Server Components** that fetch Firestore data directly (read-only).
* All write operations are secured via **Firebase Admin SDK** and validated with Zod schemas.

---

## Related Docs

* `/docs/data-flow.md` – Technical flow overview
* `/docs/architecture.md` – System architecture diagram
* `/docs/firestore-collections-overview.md` — Complete schema and relationship map
