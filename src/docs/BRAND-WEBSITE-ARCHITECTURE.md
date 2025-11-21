
# Brand Website Module - Architecture

This document provides a high-level overview of the technical architecture for the Brand Website Module.

**Data Flow:**
`Superadmin CMS` → `Server Actions` → `Firestore` → `Public Website (Server-Side Rendered)`

**Core Principles:**
*   **Isolation:** The website module is architecturally separate from the core ordering system. A failure in the website rendering will not affect a customer's ability to place an order.
*   **Server-Centric:** All data fetching for the public website happens on the server via Next.js Server Components. The client receives pre-rendered HTML.
*   **Admin SDK Only:** All backend operations (saving from CMS) use the Firebase Admin SDK for security and consistency.
