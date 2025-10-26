# Orderfly — Firestore Indexing & Performance Guide

This document outlines the query patterns and required Firestore indexes for optimal performance across the Orderfly platform.

---

## 1. Indexing Principles

*   **Single-Field Indexes:** Firestore automatically creates single-field indexes for all primitive fields. These cover most simple `where` and `orderBy` queries on a single field.
*   **Composite Indexes:** For queries involving multiple `where` clauses (on different fields) or a combination of `where` and `orderBy`, composite indexes are required.
*   **`in` and `array-contains-any`:** These operators can query up to 30 values at once. For larger sets, queries must be batched on the client/server.
*   **Order Matters:** In a composite index, the order of fields must match the query: equality (`==`) filters first, then range/inequality (`<`, `>`, `!=`), then `orderBy`.

---

## 2. Query Patterns & Required Indexes

### 2.1 Products List (`/superadmin/products`)

*   **Query:** Filter by `brandId` and sort by `sortOrder`.
*   **Pattern:** `db.collection("products").where("brandId", "==", brandId).orderBy("sortOrder", "asc")`
*   **Index Required:**

    ```json
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "brandId", "order": "ASCENDING" },
        { "fieldPath": "sortOrder", "order": "ASCENDING" }
      ]
    }
    ```

*   **Performance Notes:**
    *   Pagination should be handled server-side using query cursors (`startAfter`).
    *   Limit results to a reasonable page size (e.g., 50).
    *   Client-side search filters the already-fetched list. For larger catalogs, a dedicated search index (e.g., Algolia) would be needed.

### 2.2 Orders List (`/superadmin/sales/orders`)

*   **Query:** Filter by date range (`createdAt`) and optionally by `brandId` and `locationId` (if <= 30), sorted by date.
*   **Pattern:** `db.collection("orders").where("createdAt", ">=", startDate).where("createdAt", "<=", endDate).where("brandId", "==", brandId).orderBy("createdAt", "desc")`
*   **Index Required:**

    ```json
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "brandId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
    ```

*   **Performance Notes:**
    *   The `locationId` filter uses an `in` query, limited to 30 locations. For more complex filtering, data would need to be exported to a dedicated analytics database (e.g., BigQuery).
    *   The page is dynamically rendered (`revalidate = 0`) to ensure data is always fresh.

### 2.3 Customer List (`/superadmin/customers`)

*   **Query:** Sorted by `lastOrderDate`.
*   **Pattern:** `db.collection("customers").orderBy("lastOrderDate", "desc")`
*   **Index Required:** Firestore's automatic single-field indexes handle this. If combined with a filter (e.g., by brand), a composite index would be needed:

    ```json
    {
      "collectionGroup": "customers",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "brandId", "order": "ASCENDING" },
        { "fieldPath": "lastOrderDate", "order": "DESCENDING" }
      ]
    }
    ```

*   **Performance Notes:**
    *   The customer list can grow very large. Server-side pagination is critical.
    *   Aggregated fields like `totalOrders` and `totalSpend` should be updated via Cloud Functions triggers on the `orders` collection to avoid expensive client-side calculations.

### 2.4 Frontend Menu (`/[brandSlug]/[locationSlug]`)

*   **Query:** Filter active products by `brandId` and check if `locationIds` contains the current location.
*   **Pattern:** `db.collection("products").where("brandId", "==", brandId).where("isActive", "==", true)` (location filter applied in code).
*   **Index Required:**

    ```json
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "brandId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" }
      ]
    }
    ```

*   **Performance Notes:**
    *   The page should use server-side rendering with aggressive caching (`revalidate`) as menus change infrequently.
    *   Fetching all products for a brand and filtering by location in memory is acceptable for a moderate number of products but can become a bottleneck.
    *   A better long-term solution is a denormalized `location_menus` collection that stores a direct list of product IDs for each location.

---

## 3. Caching & Rendering Strategy

| Page/Component                     | Strategy        | `revalidate`         | Reason                                                     |
| ---------------------------------- | --------------- | -------------------- | ---------------------------------------------------------- |
| **Superadmin Dashboards**          | Dynamic         | `0`                  | Data must be real-time.                                    |
| **Superadmin List Pages** (Products, etc.)| Dynamic         | `0`                  | Data must be up-to-date for management.                    |
| **Frontend Menu Page** (`/../page.tsx`) | Revalidated ISR   | `3600` (1 hour)      | Menus change infrequently; fast load times are critical.   |
| **Frontend Brand Homepage**        | Revalidated ISR   | `86400` (24 hours)   | Brand/location info is very static.                        |
| **API Routes** (`/api/debug/*`)    | Dynamic         | `no-store`           | Always requires fresh data for diagnostics.                |

---

## 4. Guardrails & Limits

*   **Pagination:** All list views fetching from Firestore **must** implement server-side pagination with `limit()` and `startAfter()`. A default page size of 50 is recommended.
*   **`in` Queries:** Be mindful of the 30-value limit for `in` and `array-contains-any` operators. Code should handle batching for larger arrays.
*   **Data Size:** For read-heavy but sensitive operations (like analytics), consider creating pre-aggregated daily summary documents (`analytics_daily`) via a scheduled Cloud Function to reduce read costs and complexity.
*   **Server-Side Filtering:** When a composite index is not feasible (e.g., filtering on multiple array fields), fetch a broader dataset on the server and filter in code. This is a trade-off and should be used cautiously.
