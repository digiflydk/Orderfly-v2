# File Map (nuværende placeringer — opdater løbende ved ændringer)

## Feedback (Questions)
- UI (New): `src/app/superadmin/feedback/questions/new/page.tsx`
- UI (Edit): `src/app/superadmin/feedback/questions/edit/[versionId]/page.tsx`
- Form: `src/components/superadmin/feedback-question-version-form.tsx`
- Server Action: `src/app/superadmin/feedback/actions.ts` (export: `createOrUpdateQuestionVersion`)
- Firestore Admin init: `src/lib/firebase-admin.ts`
- Debug endpoints:
  - All-in-one: `src/app/api/debug/all/route.ts`
- OpenAPI:
  - Spec builder: `src/lib/openapi/spec.ts`
  - Zod registry: `src/lib/openapi/zod.ts`
  - Schemas: `src/lib/schemas/feedback.ts`
  - Swagger UI page: `src/app/api/docs/route.ts`
  - Redoc page: `src/app/api/redoc/route.ts`

## Settings/CMS (eksempler — udfyld når relevante)
- Header: `cms/pages/header/header` (Firestore doc)
- (Tilføj flere sider/collections her når de tages i brug)