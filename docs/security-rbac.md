# Orderfly — Security & Role-Based Access Control (RBAC)

This document outlines the security model, roles, and permissions strategy for the Orderfly platform.

---

## 1. Core Principles

*   **Least Privilege:** Users are granted only the minimum permissions necessary to perform their job functions. New users default to the most restrictive role.
*   **Server-Side Enforcement:** All permission checks are performed on the server within Server Actions before any data mutation occurs. The client-side UI may hide buttons, but the server is the ultimate authority.
*   **Centralized Permissions:** A single `hasPermission()` utility (or equivalent) is used for all access checks to ensure consistency.

---

## 2. Roles & Permissions Matrix

The platform defines several key roles. The "Superadmin" role has unrestricted access, while other roles are progressively more limited.

| Role | Description | Key Responsibilities |
| :--- | :--- | :--- |
| **Superadmin** | Full platform access. Can manage all brands, users, and system settings. | System configuration, billing, user management, brand onboarding. |
| **Brand Manager** | Full access to one or more assigned brands. | Manages locations, menus, products, and discounts for their brand. |
| **Location Manager** | Access to manage specific, assigned locations. | Manages orders, staff, and daily operations for a single restaurant. |
| **Viewer** | Read-only access to dashboards and reports. | Views sales data and performance metrics without modification rights. |

---

## 3. Server Actions Guard Strategy

Every Server Action that performs a write, update, or delete operation MUST be guarded with a permission check at the very beginning of the function.

**Example Guard Pattern:**
````typescript
// src/app/superadmin/products/actions.ts

import { hasPermission } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';

export async function createOrUpdateProduct(formData: FormData) {
  // 1. Authenticate user (e.g., from session/cookie)
  // const user = await getCurrentUser();

  // 2. Enforce permission check
  const canPerformAction = hasPermission('products:create');
  if (!canPerformAction) {
    throw new Error('You do not have permission to create or update products.');
  }

  // 3. Proceed with validation and database logic...
  // ...

  revalidatePath('/superadmin/products');
}
````

This ensures that even if a user bypasses client-side UI restrictions, the server will prevent any unauthorized data modification.

---

## 4. Audit & Logging

*   **Logged Actions:** All `create`, `update`, and `delete` operations performed through Server Actions are logged.
*   **Logged Data:** Each log entry includes `userId`, `timestamp`, the action performed (e.g., `product.update`), and the document ID affected.
*   **PII Policy:** Payloads containing Personally Identifiable Information (PII) like customer names or emails are **NOT** logged. Only non-sensitive metadata is recorded.
*   **Retention:** Audit logs are retained for 90 days.

---

## 5. Least-Privilege Defaults & Data Ownership

*   **New Users:** New users created in the Superadmin panel default to the most restrictive role (e.g., "Viewer" or no role). Permissions must be explicitly granted.
*   **Brand Data:** A `Brand Manager` can only modify data associated with their assigned `brandId`. Server actions must include `where('brandId', '==', user.brandId)` clauses in all queries.
*   **Subscription Changes:** Only a `Superadmin` can change a brand's subscription plan (`subscriptionPlanId`) or manage billing details via Stripe.

---

## 6. Summary: Role × Operation × Collection

| Role | Operation | Brands | Locations | Products | Orders | Customers | Users/Roles | Settings |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Superadmin** | C/R/U/D | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Brand Manager**| Create | ✗ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ |
| | Read | ✅ | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ |
| | Update | ✗ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ |
| | Delete | ✗ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ |
| **Location Mgr** | Read | ✗ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ |
| | Update | ✗ | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ |
| **Viewer** | Read | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

---

## Related Code
- Permission utility: `src/lib/permissions.ts`
- Guard usage: called at the start of every write Server Action (e.g., `src/app/superadmin/products/actions.ts`)