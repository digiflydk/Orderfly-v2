
# Operations Log (seneste status & åbne punkter)

## Seneste leverancer
* 1.0.239 • 522-11-122 - Normalized Superadmin Brand Website pages to use AsyncPageProps.
* 1.0.238 • 522-11-121 - Fixed Superadmin brand website home page props for Next 15.
* 1.0.237 • 522-11-120 - Fixed Superadmin brand website config page props for Next 15.
* 1.0.236 • 522-11-119 - Fixed build error by correcting prop handling.
* 1.0.235 • 522-11-118 - Fixed M3 Pizza page props for Next 15.
* 1.0.234 • 522-11-117 - A — Removed legacy `app/src/app` from build.
* 1.0.233 • OF-456 — Added security and RBAC documentation.
* 1.0.232 • OF-455 — Completed Firestore schema documentation for all key collections.
* 1.0.231 • OF-454 — Expanded API contract with OpenAPI specs and example payloads.
* 1.0.230 • OF-453 — Added docs/README.md and fixed historical ticket ID collision.
* 1.0.229 • OF-452 — Added Firestore collections overview (schema + relationships between Superadmin and Frontend).
* 1.0.228 • OF-451 — Added database communication map showing data exchange between Superadmin, Firestore, and Frontend.
* 1.0.227 • OF-450 — Added architecture overview and system diagram to documentation bundle (architecture.md + data-flow.md update)
- 1.0.226 • OF-448 — Restored and updated all documentation files in the `docs/` directory to ensure they are accurate.
- 1.0.225 • OF-447 — Fixed product form submission by correctly structuring the form and handling `FormData` on the server.
- 1.0.224 • OF-523 — Fixed layout and header logic to correctly display brand-specific headers.
- 1.0.223 • OF-522 — Implemented client-side routing for the order modal.
- 1.0.222 • OF-521 — Refined AI project qualification flow and lead saving.
- 1.0.221 • OF-520 — Added comprehensive settings management for website content (Header, Footer, Sections).
- 1.0.220 • OF-519 — Implemented dynamic theme and font size management via CMS.
- 1.0.219 • OF-518 — Developed customer and lead management pages in the CMS.
- 1.0.218 • OF-517 — Created layout for the new public-facing CMS-driven website.
- 1.0.217 • OF-490 — Integrated AI-powered menu import from image.
- 1.0.216 • OF-489 — Finalized server actions for user and role management.
- 1.0.215 • OF-488 — Developed client pages for user and role management with forms.
- 1.0.214 • OF-487 — Added server actions for creating and updating subscription plans.
- 1.0.213 • OF-486 — Developed client-side management page for subscription plans.
- 1.0.212 • OF-485 — Implemented billing dashboard with MRR and brand subscription status.
- 1.0.211 • OF-483 — Created detailed view page for individual customer records.
- 1.0.210 • OF-481 — Zod→OpenAPI schemas (QuestionOption, Question, FeedbackQuestionsVersion)
- 1.0.209 • OF-480 — OpenAPI/Swagger/Redoc
- 1.0.208 • OF-479 — /api/debug/all (scopes) + docs
- 1.0.207 • OF-478 — Timeout-guard + debug route
- 1.0.206 • OF-475 — Stabil Admin init (service account)
- 1.0.205 • OF-472 — Edit-loader robust + sprog-fallback
- 1.0.204 • OF-471 — Server action create/update + redirect + logs
- 1.0.203 • OF-470 — Developed loyalty score calculation logic.
- 1.0.202 • OF-469 — Created settings page for loyalty program weights and thresholds.
- 1.0.201 • OF-468 — Implemented customer data aggregation for total orders and spend.
- 1.0.200 • OF-465 — Developed initial version of the customer list page.
- 1.0.199 • OF-464 — Added server actions for creating and managing upsell campaigns.
- 1.0.198 • OF-463 — Created form page for upsell configuration.
-- 1.0.197 • OF-462 — Developed client page for listing and filtering upsells.
- 1.0.196 • OF-461 — Added server actions for combo menus.
- 1.0.195 • OF-460 — Created form page for building and editing combo menus.
- 1.0.194 • OF-459 — Developed client page for combo menus with brand filtering.
- 1.0.193 • OF-458 — Implemented validation logic for standard discounts.
- 1.0.192 • OF-457 — Created validation test runner page for discount logic.
- 1.0.191 • OF-456 — Added server actions for standard (automatic) discounts.
- 1.0.190 • OF-455 — Developed form page for creating and editing standard discounts.
- 1.0.189 • OF-454 — Implemented client-side page for managing standard discounts.
- 1.0.188 • OF-453 — Refined discount code validation server-side action.
- 1.0.187 • OF-452-LEG — Created form page for discount code management (legacy renumber to avoid collision)
- 1.0.186 • OF-451 — Developed client page for discount code list with filtering.
- 1.0.185 • OF-450 — Implemented drag-and-drop sorting for topping lists.
- 1.0.184 • OF-449 — Created form pages for toppings and topping groups.
- 1.0.183 • OF-446 — Added server actions for toppings and topping groups.
- 1.0.182 • OF-445 — Developed client-side UI for managing toppings.
- 1.0.181 • OF-444 — Implemented server actions for food categories and allergens.
- 1.0.180 • OF-443 — Created client-side pages for managing food categories and allergens.
- 1.0.179 • OF-442 — Finalized client-side sorting and filtering for product list.
- 1.0.178 • OF-441 — Implemented product duplication functionality.
- 1.0.177 • OF-440 — Added drag-and-drop reordering for product lists.
- 1.0.176 • OF-439 — Developed client-side page for listing and filtering products.
- 1.0.175 • OF-438 — Refined server actions for locations with geocoding stubs.

## Åbne issues (eksempler — ajourfør ved behov)
- [ ] Implementere fuld validering og database-logik i `createOrUpdateProduct` action.
Se også: `/docs/OPEN-ISSUES.md`

## Nøgleversioner
- Next.js: 15.5.x
- Timezone: Europe/Copenhagen

## Procesregel: Godkendelse før ændringer
- Hvis der er **tvil eller uklarhed**, SKAL AI/udvikler spørge PM (Omair) **før ændringer** foretages.
- Der må **IKKE ændres eller slettes** noget, som allerede er godkendt eller er en etableret del af projektet, uden eksplicit tilladelse.
- Kun ændringer med **eksplicit godkendelse** fra PM må implementeres.
- Denne regel gælder både for kode, dokumentation, struktur og konfiguration.
