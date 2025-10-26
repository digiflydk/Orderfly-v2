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

## Architecture Principles

* Next.js App Router (v15) with Server Actions
* Firestore as single source of truth
* Swagger & Debug routes for testing and operational visibility
