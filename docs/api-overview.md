# API Overview (Orderfly)

| Path | Method | Caller | Handler | DB | Response |
|---|---|---|---|---|---|
| /superadmin/feedback/questions/new | POST (RSC/Action) | FeedbackQuestionVersionForm | createOrUpdateQuestionVersion | feedbackQuestionsVersion | { ok: true, id } / { ok: false, error } |
| /superadmin/feedback/questions/edit/:id | GET | Server page loader | (getByDocId / getByIdField) | feedbackQuestionsVersion | 200 / 404 |
| /api/debug/all | GET | Manual/ops | route.ts | settings/*, cms/*, feedbackQuestionsVersion | { ok, data, timestamp } |
| /api/debug/feedback | GET | Manual/ops | route.ts | feedbackQuestionsVersion | { ok, count, items[] } |

**Server Actions**
- `createOrUpdateQuestionVersion(formData)`  
  - **Create**: add doc → set `id=docId` → return `{ok:true,id}`  
  - **Update**: set merge by `id` → return `{ok:true,id}`  
  - Fejl: `{ok:false,error}`

**Runtime**
- Alle debug-routes: `runtime = nodejs`, `dynamic = force-dynamic`, `fetchCache = default-no-store`
