# Orderfly — PM One-Pager (Hvordan ting hænger sammen)

**Formål:** Giv et hurtigt overblik til PM/QA, så vi kan pinpoint’e fejl uden gætteri og starte nye tråde uden at forklare alt igen.

## Arkitektur (kort)
- **Frontend:** Next.js App Router (v15). Sider: `/superadmin/...`
- **Server Actions & API:** Server-kald til Firestore via Admin SDK.
- **Database:** Firestore
- **Docs:** `/docs/*` (denne mappe)
- **Debug:** `/api/debug/all` (scopes via `?scope=feedback`)

## Hvor ligger produkt-flowet?
- **Create (UI):** `/superadmin/products/new`
- **Edit (UI):** `/superadmin/products/edit/[productId]`
- **Form-komponent:** `src/components/superadmin/product-form-page.tsx`
- **Server action:** `src/app/superadmin/products/actions.ts` (`createOrUpdateProduct`)
- **DB collection:** `products`

## Hurtig fejlsøgning (3 trin)
1) **Helbred:** `GET /api/debug/all` → skal returnere `ok:true`.
2) **Action isoleret (Swagger):** `GET /api/docs` → Test endpoints direkte når de er dokumenteret.
3) **UI:** Hvis serveren er OK, er fejlen sandsynligvis i klient-side logik eller form-serialisering.

## Vigtige hjælpelinks
- **Debug overview:** `/api/debug/all`
- **OpenAPI JSON:** `/openapi.json`
- **Swagger UI:** `/api/docs`
- **Redoc:** `/api/redoc`

> Timezone: Europe/Copenhagen. Versionsnavngivning: `1.0.xxx • OF-XXX`.
