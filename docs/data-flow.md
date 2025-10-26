# Orderfly — Data Flow (Frontend → API/Actions → Firestore)

## Product Management Flow
```mermaid
flowchart TD
  A[/UI: /superadmin/products/new] -->|submit FormData| B[Server Action: createOrUpdateProduct]
  B -->|create/update| C[(Firestore: products)]
  C --> D{Redirect}
  B --> D
```

## Feedback Questions Flow
```mermaid
flowchart TD
  A[/UI: /superadmin/feedback/questions/new/] -->|submit FormData| B[Server Action: createOrUpdateQuestionVersion]
  B -->|create/update| C[(Firestore: feedbackQuestionsVersion)]
  C --> D{Redirect}
  B --> D
```

**Frontend:** Next.js App Router sider (server components) og formular-komponenter (client components).

**Server Actions/API:** Kald fra form submit → skriver/læser Firestore.

**Debug-endpoints:**
- `GET /api/debug/all` – Samlet health-check og nøgle-dokumenter.
- `GET /api/docs` – API-dokumentation.

---

## System Context (Short Version)
See `/docs/architecture.md` for the full diagram.

```mermaid
flowchart LR
  subgraph Client
    A[Customer Webshop]:::box
    B[Superadmin UI]:::box
  end
  subgraph Backend
    C[Server Actions]:::box
    D[(Firestore)]:::db
  end
  A --> C --> D
  B --> C
  classDef box fill:#fff,stroke:#999,rx:6,ry:6;
  classDef db fill:#eef7ff,stroke:#5b9bd5,rx:6,ry:6;
```
See also: `/docs/data-communication.md` for a detailed breakdown of data exchange between Superadmin, Firestore, and Frontend.
