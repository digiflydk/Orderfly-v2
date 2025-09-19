# Quick Triage — Create/Edit Questions

**Mål:** Find på 2–5 min om problemet ligger i UI, Action eller DB.

1) **Debug ping**  
   - Kør: `/api/debug/all?scope=feedback`  
   - Hvis `ok:false` → environment/creds/netværk (ikke UI).  
   - Hvis `ok:true` → gå til 2.

2) **Server action (uden UI)**  
   - Åbn `/api/docs` (Swagger UI).  
   - “Try it out” på endpointet for create/update (når dokumenteret).  
   - `{ ok:true,id }` → Backend/DB OK → fejlen er i UI.  
   - `{ ok:false,error }` → Læs fejl og fix i action/payload.

3) **UI submit**  
   - DevTools → Network → se POST-respons.  
   - `200 + { ok:true,id }` men ingen redirect → fix klient-redirect.  
   - `200 + { ok:false,error }` → fix formular/validering.  
   - `504/500` → se server-log (action timeout/cred).

**Pro tips**
- Edit 404 → brug **docId** (ikke forkortet id). Vores edit-loader prøver både docId og felt `id`.
- Sprog-dropdown fallback (DA/EN) forhindrer `undefined.map`-crash.
