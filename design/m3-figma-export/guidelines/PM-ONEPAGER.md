# Orderfly — PM One-Pager (Hvordan ting hænger sammen)

**Formål:** Giv et hurtigt overblik til PM/QA, så vi kan pinpoint’e fejl uden gætteri og starte nye tråde uden at forklare alt igen.

## Arkitektur (kort)
- **Frontend:** Next.js App Router (v15). Sider: `/superadmin/...`
- **Server Actions & API:** Server-kald til Firestore via Admin SDK
- **Database:** Firestore
- **Docs:** `/docs/*` (denne mappe)
- **Debug:** `/api/debug/all` (scopes via `?scope=feedback`)

## Hvor ligger feedback-flowet?
- **Create (UI):** `/superadmin/feedback/questions/new`
- **Edit (UI):** `/superadmin/feedback/questions/edit/[id]`
- **Server action:** `src/app/superadmin/feedback/actions.ts`
  - `createOrUpdateQuestionVersion(formData) → { ok:true,id } | { ok:false,error }`
- **DB collection:** `feedbackQuestionsVersion` (felt: `id`, `versionLabel`, `isActive`, `language`, `orderTypes`, `questions[]`, `createdAt`, `updatedAt`)
- **Form-komponent:** `src/components/superadmin/feedback-question-version-form.tsx`

## Hurtig fejlsøgning (3 trin)
1) **Helbred:** `GET /api/debug/all?scope=feedback` → skal returnere `ok:true`.  
2) **Action isoleret (Swagger):** `GET /api/docs` → Try it out for action-endpoint (når dokumenteret).  
3) **UI:** Hvis action er OK i Swagger, er fejlen i submit/redirect på siden.

## Vigtige hjælpelinks
- **Debug overview:** `/api/debug/all`
- **OpenAPI JSON:** `/openapi.json`
- **Swagger UI:** `/api/docs`
- **Redoc:** `/api/redoc`

> Timezone: Europe/Copenhagen. Versionsnavngivning: `1.0.xxx • OF-XXX`.
