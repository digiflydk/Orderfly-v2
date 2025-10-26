# Operations Log (seneste status & åbne punkter)

## Seneste leverancer
- 1.0.224 • OF-447 — Fixed product form submission by correctly structuring the form and handling `FormData` on the server.
- 1.0.225 • OF-448 — Restored and updated all documentation files in the `docs/` directory to ensure they are accurate.
- 1.0.210 • OF-481 — Zod→OpenAPI schemas (QuestionOption, Question, FeedbackQuestionsVersion)
- 1.0.209 • OF-480 — OpenAPI/Swagger/Redoc
- 1.0.208 • OF-479 — /api/debug/all (scopes) + docs

## Åbne issues (eksempler — ajourfør ved behov)
- [ ] Dokumentér `createOrUpdateProduct` som HTTP endpoint i OpenAPI.
- [ ] Superadmin debug UI, der visualiserer `/api/debug/all` grønt/gult/rødt.
- [ ] Implementere fuld validering og database-logik i `createOrUpdateProduct` action.

## Nøgleversioner
- Next.js: 15.5.x
- Timezone: Europe/Copenhagen

## Procesregel: Godkendelse før ændringer
- Hvis der er **tvil eller uklarhed**, SKAL AI/udvikler spørge PM (Omair) **før ændringer** foretages.
- Der må **IKKE ændres eller slettes** noget, som allerede er godkendt eller er en etableret del af projektet, uden eksplicit tilladelse.
- Kun ændringer med **eksplicit godkendelse** fra PM må implementeres.
- Denne regel gælder både for kode, dokumentation, struktur og konfiguration.
