# Orderfly — System Architecture Overview

This document provides a unified overview of how the frontend, server actions, APIs, and Firestore interact in Orderfly v2.

## System Context (Mermaid)
```mermaid
flowchart LR
  subgraph Client
    A[Customer Webshop\n/ [brand]/[location]]:::box
    B[Superadmin UI\n/ superadmin/*]:::box
  end

  subgraph Next.js App Router (v15)
    C[Server Components]:::box
    D[Client Components]:::box
    E[Server Actions\n(e.g. createOrUpdateProduct)]:::box
    F[API Routes\n/api/debug/all, /api/docs]:::box
  end

  subgraph Firebase
    G[(Firestore\nproducts,\nfeedbackQuestionsVersion,\nsettings/*, cms/*)]:::db
    H[Firebase Admin SDK]:::svc
  end

  A --> C
  B --> C
  D --> E
  C --> E
  E --> H --> G
  F --> H
  classDef box fill:#fff,stroke:#999,rx:6,ry:6;
  classDef db fill:#eef7ff,stroke:#5b9bd5,rx:6,ry:6;
  classDef svc fill:#f7f7f7,stroke:#aaa,rx:6,ry:6;
```

## Core Flows

* **Product Flow:** UI → `createOrUpdateProduct` → Firestore → Redirect
* **Feedback Flow:** UI → `createOrUpdateQuestionVersion` → Firestore → Redirect
* **Debug & Docs:** `/api/debug/all`, `/api/docs`, `/api/redoc`
* **M3Pizza Order Entry:** `/m3pizza` is internally rewritten to the M3Pizza marketing page, while the public URL stays unchanged. The delivery-method modal continues to the shared commerce route `/cphpizza/m3-pizza-hellerup?deliveryMethod={delivery|pickup}`, using the production CPH PIZZA brand and M3 Pizza Hellerup location. The route is handled by `/{brandSlug}/{locationSlug}` and renders the existing Firestore-backed menu, product, cart and checkout flow. `/m3pizza/order` remains a middleware compatibility redirect and normalizes legacy `takeaway` to `pickup`. Confirmation pages resolve asynchronous route/query props, use the order ID with checkout-session fallback, verify that the order belongs to the requested brand/location, serialize Firestore timestamps before client rendering, and omit payment-provider identifiers from the browser payload. The retired `/m3pizza/m3pizza/m3-pizza-hellerup` preview route is not part of the public flow.

## Architecture Principles

* Next.js App Router (v15) with Server Actions
* Firestore as single source of truth
* Swagger & Debug routes for testing and operational visibility
