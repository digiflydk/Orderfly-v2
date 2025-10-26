# Debug UI Spec (OF-458)

This document outlines the specification for a Superadmin Debug UI page that provides a real-time health overview of the Orderfly platform by consuming the `/api/debug/all` endpoint.

## 1. Concept

The UI will be a page located at `/superadmin/debug/health` that displays a grid of "status cards". Each card represents a specific system component or check. The card's color (Green, Amber, Red) indicates the health of that component based on predefined rules.

- **Green**: Healthy / OK
- **Amber**: Warning / Potential Issue
- **Red**: Error / Critical Issue

The page should auto-refresh every 30-60 seconds.

## 2. Status Card Checks & Rules

This table defines each check, its data source from `/api/debug/all`, and its G/A/R logic.

| Check Name | Data Source (`/api/debug/all`) | Green Rule | Amber Rule | Red Rule | Suggested Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Admin** | `meta.adminHealth.ok` | `true` | - | `false` | Check `FIREBASE_SERVICE_ACCOUNT` env var. Verify permissions. |
| **Firestore Read** | `globals.settingsGeneral.ok` | `true` | - | `false` | Firestore read failed. Check permissions or network rules. |
| **Stripe Webhooks** | `payment.lastWebhookTimestamp` | `< 15 min` | `15–60 min` | `> 60 min` | Go to Stripe Dashboard. Check "Events" for failed deliveries. |
| **OpenAPI Spec** | `meta.spec.ok` | `true` | `false` but `meta.spec.error` contains "ENOENT" | `false` | OpenAPI spec failed to build. Run `npm run build-spec` or check schemas. |
| **Global Settings** | `globals.settingsGeneral.exists` | `true` | - | `false` | Document `settings/general` is missing. Seed the database. |
| **CMS: Header** | `globals.cmsHeader.exists` | `true` | - | `false` | Document `cms/pages/header/header` is missing. Create it in CMS. |
| **CMS: Footer** | `globals.cmsFooter.exists` | `true` | - | `false` | Document `cms/pages/footer/footer` is missing. Create it in CMS. |
| **Catalog: Brands** | `brands[].id` | At least 1 brand exists | - | 0 brands exist | The `brands` collection is empty. Go to `/superadmin/brands` to create one. |
| **Catalog: Locations** | `brands[].locations` | All brands have >= 1 location | Some brands have 0 locations | All brands have 0 locations | Some brands have no locations. Go to `/superadmin/locations`. |

## 3. UI Wireframe Notes

The page (`/superadmin/debug/health`) should consist of:

1.  **Main Heading**: "System Health & Debug"
2.  **Last Updated Timestamp**: Shows when data was last fetched.
3.  **Refresh Button**: Manually triggers a re-fetch of `/api/debug/all`.
4.  **Grid of Status Cards**:
    *   Each card has:
        *   An **icon** (e.g., `ShieldCheck`, `Database`, `Webhook`).
        *   A **title** (e.g., "Firebase Admin", "Stripe Webhooks").
        *   A **status indicator** (Green/Amber/Red dot or background).
        *   A **short description** of the check result (e.g., "OK", "Last webhook: 45 min ago").
        *   **Action links** (e.g., "View Logs", "Go to Settings", "OpenAPI Docs").
5.  **Raw Data Viewer**: An accordion or collapsible section at the bottom to display the raw JSON from `/api/debug/all` for advanced troubleshooting.

**Example Card Layout:**

```
+----------------------------------------+
| 🟢 Firebase Admin                      |
|    Service account authenticated.      |
|    Last check: just now                |
|                                        |
|    [View Logs]  [Service Account]      |
+----------------------------------------+
```
