# Brand Website Module — Overview

This document provides a complete overview of the Brand Website Module, a multi-tenant CMS and public-facing website engine built into Orderfly.

## 1. Scope & Purpose

The module's primary purpose is to provide each brand on the Orderfly platform with a simple, configurable marketing website.

*   **Scope:**
    *   Manage public-facing marketing websites on a per-brand basis.
    *   Support for primary and additional domains via DNS mapping.
    *   Template-based design with customizable colors, fonts, and content.
*   **Non-goals for v1:**
    *   No location-specific marketing pages (all content is brand-level).
    *   No "page builder" functionality.
    *   No brand-admin access; management is Superadmin-only for v1.

## 2. Architecture Overview

The module is designed to be isolated from the core ordering flow to ensure stability. A failure in the website rendering logic will not affect a customer's ability to place an order.

**Data Flow:**
`Superadmin CMS` → `Server Actions` → `Firestore` → `Public Website (Server-Side Rendered)`

All content and configuration are saved to Firestore via Superadmin server actions. The public-facing website reads this data at request time using server components.

## 3. Firestore DB Structure (High Level)

| Path                                    | Type       | Description                                                 |
| --------------------------------------- | ---------- | ----------------------------------------------------------- |
| `brands/{brandId}/website/config`       | Document   | Core configuration: domains, status, template ID.           |
| `brands/{brandId}/website/home`         | Document   | All content for the homepage sections.                      |
| `brands/{brandId}/website/pages/{slug}` | Collection | Content for custom static pages (e.g., "About Us").         |
| `brands/{brandId}/website/menuSettings` | Document   | Settings for how the public menu is displayed.              |
| `auditLogs/{logId}`                     | Document   | Immutable log of all changes made via the CMS.              |
| `dadmin/developer/logs/{logId}`         | Document   | Detailed error and debug logs for developers.               |

**Document Fields Overview:**
*   **config:** `primaryDomain`, `extraDomains`, `status`, `templateId`.
*   **home:** `hero`, `promoTiles`, `banner`, `footerCta`, `menuPreview`.
*   **design:** `colors`, `typography`, `layout`.
*   **seo:** `globalTitle`, `globalDescription`, `shareImage`.
*   **menuSettings:** `displayMode`, `featuredCategoryIds`.

## 4. CMS API Map (Superadmin Actions)

### Config & Design
*   `saveBrandWebsiteConfig`: Saves domain and status settings to `brands/{brandId}/website/config`.
*   `saveBrandWebsiteDesignSystem`: Saves colors and typography to `brands/{brandId}/website/design`.
*   `saveBrandWebsiteSeo`: Saves SEO metadata to `brands/{brandId}/website/seo`.

### Homepage Content
*   `saveBrandWebsiteHome`: Saves all homepage section content to `brands/{brandId}/website/home`.

### Pages
*   `listBrandWebsitePages`, `getBrandWebsitePage`, `createOrUpdateBrandWebsitePage`, `deleteBrandWebsitePage`: Standard CRUD operations for documents in the `brands/{brandId}/website/pages` collection.

### Menu Settings
*   `saveBrandWebsiteMenuSettings`: Saves menu display preferences to `brands/{brandId}/website/menuSettings`.

## 5. Public Website API Map (Read-Only)

*   `resolveBrandByDomain(hostname)`: Returns the brand ID associated with a given domain.
*   `getPublicBrandWebsiteConfig(brandId)`: Returns the website configuration.
*   `getPublicBrandWebsiteHome(brandId)`: Returns all homepage content.
*   `getPublicBrandWebsitePages(brandId)` / `getPublicBrandWebsitePageBySlug`: Returns a list of pages or a single page.
*   `getPublicBrandWebsiteMenuSettings(brandId)`: Returns menu display settings.
*   `getPublicBrandMenuData(brandId)`: Returns the product and category data needed to render a public menu.
*   `getPublicBrandLocationData(brandId)`: Returns location data for the brand.

## 6. Logging & Audit Model

*   **Audit Logs (`auditLogs`):** Immutable records of all CMS write operations (`saveBrandWebsite*`). Captures who changed what, when, and from where.
*   **API Logs (`dadmin/developer/logs`):** Detailed debug and error logs from API routes and server actions for developer troubleshooting.

**Rules:**
*   A global toggle and per-action toggles control logging verbosity.
*   All `saveBrandWebsite*` actions must create an audit entry.

## 7. QA Strategy

Each task under **Epic 511** will be accompanied by acceptance tests that target the API layer directly, bypassing the React UI.

*   **Examples:**
    *   Tests for saving and retrieving homepage content.
    *   Tests for creating, updating, and deleting a custom page.
    *   Tests for domain resolution logic (`resolveBrandByDomain`).
*   **Deployment Rule:** No deployment is permitted if any acceptance tests for this module fail.

## 8. Backlog Overview (Epic 511)

*   **OF-511-01:** DB structure and documentation (this document).
*   **OF-511-02:** CMS APIs for config, design, and homepage.
*   **OF-511-03:** Public website APIs for rendering content.
*   **OF-511-04:** Audit and logging integration.
*   **OF-511-05:** Template 1 implementation (rendering engine).

## 9. Troubleshooting

1.  **Check Audit Logs:** Look for recent changes under `brands/{brandId}/website/*` in `/superadmin/logs/audit`.
2.  **Check API Logs:** Look for failing `saveBrandWebsite*` calls in `/superadmin/logs/developer`.
3.  **Inspect Snapshots:** Use CMS Snapshots to inspect the current state of Firestore documents.
4.  **Verify DB Paths:** Use the DB Paths Dump to confirm all paths are correct.
5.  **Run Acceptance Tests:** Execute the tests for the failing feature.
6.  **Domain Issues:** Verify `primaryDomain` and `extraDomains` in `brands/{brandId}/website/config` and test `resolveBrandByDomain`.

## 10. Reusability

This document serves as the template for how all future Orderfly modules should be documented, covering Architecture, Database, APIs, Logging, QA, Backlog, and Troubleshooting.
