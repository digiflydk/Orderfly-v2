# API Overview (Orderfly)

| Path | Method | Caller | Handler | DB | Response |
|---|---|---|---|---|---|
| /api/integrations/esmeralda/superadmin-sso/exchange | POST form | mPanel launch | redeemLaunchCode | integrationSsoRedemptions, superadminSessions | 303 dashboard |
| /api/superadmin/session/logout | POST | Superadmin session | revokeRawSuperadminSession | superadminSessions | JSON |
| /superadmin/products/new | POST (Action) | ProductFormPage | createOrUpdateProduct | products | Redirect |
| /superadmin/products/edit/:id | POST (Action) | ProductFormPage | createOrUpdateProduct | products | Redirect |
| /superadmin/feedback/questions/new | POST (Action) | FeedbackQuestionVersionForm | createOrUpdateQuestionVersion | feedbackQuestionsVersion | Redirect |
| /api/debug/all | GET | Manual/ops | route.ts | settings/*, cms/*, etc. | { ok, data, timestamp } |
| /api/docs/download | GET | Manual/ops | route.ts | - | File download |

**Server Actions**
- `createOrUpdateProduct(formData)` → Redirects on success, throws on error.
- `createOrUpdateQuestionVersion(formData)` → Returns `{ok:true,id}` or `{ok:false,error}`.

**Runtime**
- Alle debug-routes: `runtime = nodejs`, `dynamic = force-dynamic`, `fetchCache = default-no-store`
