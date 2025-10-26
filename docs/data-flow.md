# Orderfly — Data Flow (Frontend → API/Actions → Firestore)

```mermaid
flowchart TD
  A[/UI: /superadmin/feedback/questions/new/] -->|submit FormData| B[Server Action: createOrUpdateQuestionVersion]
  B -->|create/update| C[(Firestore: feedbackQuestionsVersion)]
  A2[/UI: /superadmin/feedback/questions/edit/:id/] -->|load| D[Server Page Loader]
  D -->|read doc by id / field 'id'| C
  E[/UI: /superadmin/feedback/questions/] -->|list| F[Server Page Loader (list)]
  F -->|query| C


Frontend: Next.js App Router sider (server components) og formular-komponent (client component).

Server Actions/API: Kald fra form submit → skriver/læser Firestore.

Database: feedbackQuestionsVersion (singular) med felter beskrevet i firestore-schema.md.

Debug-endpoints:

GET /api/debug/all – samlet health + nøgle-docs + feedback stats.

GET /api/debug/feedback – seneste 20 question versions.
```