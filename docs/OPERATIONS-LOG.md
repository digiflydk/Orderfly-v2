# Operations Log (seneste status & åbne punkter)

## Seneste leverancer
- 1.0.204 • OF-471 — Server action create/update + redirect + logs
- 1.0.205 • OF-472 — Edit-loader robust + sprog-fallback
- 1.0.206 • OF-475 — Stabil Admin init (service account)
- 1.0.207 • OF-478 — Timeout-guard + debug route
- 1.0.208 • OF-479 — /api/debug/all (scopes) + docs
- 1.0.209 • OF-480 — OpenAPI/Swagger/Redoc
- 1.0.210 • OF-481 — Zod→OpenAPI schemas (QuestionOption, Question, FeedbackQuestionsVersion)

## Åbne issues (eksempler — ajourfør ved behov)
- [ ] Dokumentér `createOrUpdateQuestionVersion` som HTTP endpoint i OpenAPI (OF-482) så QA kan “Try it out”.
- [ ] Superadmin debug UI, der visualiserer `/api/debug/all` grønt/gult/rødt.
- [ ] Liste-side for versions med korrekte Edit-links (hvis ikke allerede).

## Nøgleversioner
- Next.js: 15.x
- Timezone: Europe/Copenhagen

## Procesregel: Godkendelse før ændringer

- Hvis der er **tvil eller uklarhed**, SKAL AI/udvikler spørge PM (Omair) **før ændringer** foretages.  
- Der må **IKKE ændres eller slettes** noget, som allerede er godkendt eller er en etableret del af projektet, uden eksplicit tilladelse.  
- Kun ændringer med **eksplicit godkendelse** fra PM må implementeres.  
- Denne regel gælder både for kode, dokumentation, struktur og konfiguration.