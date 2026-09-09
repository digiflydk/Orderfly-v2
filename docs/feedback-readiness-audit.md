# Quality/feedback – PR #88 / issue #85

Opdateret 9. september 2026. PR'en er ajourført med main inklusive produktrettelserne i #90. Den udvider den første kodeaudit med den aftalte kvalitetsrapport, offentlig visning, feedbackadgang og mailkø. Eksisterende feedback, importdata, produkter og spørgeskemaer migreres eller slettes ikke automatisk.

## Leveret i koden

| Område | Adfærd |
| --- | --- |
| Spørgeskemaer | Samme kanoniske Admin SDK-samling til opret/list/redigér; dokument-ID er autoritativt; sikker timestamp-serialisering. Serverskema afviser tomme/ugyldige spørgsmål, dublerede/reserverede ID'er og ugyldige valgmuligheder/min/max. Oprettelsesdato bevares. |
| Aktivering | Transaktion med fælles låsedokument afviser konfliktende aktive versioner for sprog + pickup/delivery/booking. Nye versioner starter som kladder. Eksisterende aktive konflikter vælges deterministisk, uden automatisk migration. |
| Kundesvar | Autoritative spørgsmål, kilde/kunde/brand og oplevelsestype valideres på serveren. Numeriske svar kræver faktiske tal; ægte NPS=0 bevares. Påkrævede svar og valgmuligheder valideres. Formularindhold bevares ved fejl. |
| Dubletter | Deterministisk feedback-ID pr. brand/kildetype/kilde; transaktion respekterer også gamle ordresvar. Invitationens forbrug og eventuel tak-mail gemmes i samme transaktion som svaret. |
| Adgang | Serververificeret Firebase-session med revokationskontrol. Feedbackrettigheder og brandtilknytning kommer fra betroet serverkonfiguration, ikke den gamle `hasPermission`-placeholder eller åbne rolle-/brugereditorer. Se releasekrav. |
| Moderation | Strengt feltskema; eksisterende post og brandadgang kræves. Private svar, offentlig projektion og moderationsaudit opdateres atomisk. Audit indeholder aktør, brand, feedback-ID, handling, feltnavne og tidspunkt; ingen notetekst. |
| Kvalitetsrapport | `/superadmin/feedback/report`: periode, brand, lokation, onlineordre/restaurantbesøg, svarantal, rating, NPS, lave ratings, lokationssammenligning, udvikling pr. dag, CSV og udskrift. Kun aggregater sendes til rapportklienten. |
| Offentlig visning | `/{brandSlug}/{locationSlug}/reviews`: kun godkendte projektioner fra den aktive lokation og det aktive brand. Brandets offentlig-visning-indstilling er fra som standard. Menulink vises først efter aktivering. |
| Feedbackmail | Varig kø til manuel invitation, automatisk invitation, højst én påmindelse og tak efter svar. Omnisend-adapter bruger den eksisterende brandmapping. Ingen simuleret succes. Se driftskrav og tilstande nedenfor. |
| Andre læsere | Kundehistorikkens feedbacksektion bruger samme adgangskontrol og en lille DTO. Dashboardets feedbacktal kommer fra den beskyttede rapport; utilgængeligt tal vises som N/A. Det gamle debug-endpoint returnerer 404 uden databaselæsning. |

## Adgang og afgrænsning

Login: `/feedback-admin/login`, med en eksisterende Firebase Auth-konto i **orderfly-39325**. Login udveksler et nyligt udstedt ID-token for en HttpOnly, SameSite=Lax-session på højst 8 timer (`Secure` i produktion). Hver beskyttet serverhandling verificerer sessionen igen. Kun konto-UID'er i `ORDERFLY_FEEDBACK_ACCESS` får adgang. Manglende, ugyldig eller dubleret konfiguration afviser adgang uden fallback.

| Rolle | Adgang |
| --- | --- |
| `platform_admin` | Alle feedbackbrands, moderation/indstillinger samt globale spørgeskemaer |
| `brand_editor` | Læse rapport/feedback og moderere/ændre feedbackindstillinger for de angivne brands |
| `brand_viewer` | Kun læse feedback/rapport for de angivne brands |

Eksempel på **syntaks**, ikke produktionskonti:

```json
[
  {"uid":"EXISTING_FIREBASE_ADMIN_UID","role":"platform_admin"},
  {"uid":"EXISTING_FIREBASE_EDITOR_UID","role":"brand_editor","brandIds":["ESMERALDA_BRAND_ID"]}
]
```

Dette beskytter feedbackmodulets servergrænser. Det er **ikke en færdig adgangsmodel for resten af Superadmin**. Legacy bruger-/rolle-/kunde-/ordreruter uden reel adgangskontrol skal gennemgås i et separat platformarbejde. Feedbackroller må ikke lagres i de åbne legacy-role-dokumenter. Adgang til andre kundeoplysninger ligger uden for denne ændring.

## Rapportdefinitioner

- Periode følger `receivedAt` i `Europe/Copenhagen`, inklusive hele slutdatoen og korrekt sommer-/vintertid. Standard: seneste 30 kalenderdage; højst 366 dage.
- Rating: gennemsnit af gyldige stjernesvar (1–5) i hver besvarelse, derefter gennemsnit af de enkelte besvarelser. Hver besvarelse vægter lige. Gamle numeriske ratings bruges som fallback; manglende/0 tæller ikke som en rating.
- NPS: `100 × (antal 9–10 − antal 0–6) / antal gyldige NPS-svar`. 7–8 er passive og indgår i nævneren. Ved flere NPS-spørgsmål bruges det første gyldige svar. Manglende/ugyldige svar tæller ikke som nul.
- Lave ratings: besvarelser med samlet rating højst 2. Det er en rapportindikator, ikke et automatisk opfølgningssystem.
- Alle private besvarelser i det valgte udsnit tæller med, uanset offentlig godkendelse. Manglende dato udelades; ugyldig lokation fremgår særskilt og medtages i totalen.
- Ved over 5.000 svar afvises rapporten med besked om et mindre udsnit; der vises ikke KPI'er fra et tavst afkortet datasæt. Flerbrandsforespørgsler læser højst 5.001 pr. tildelt brand før samlet kontrol.
- CSV indeholder total og lokationsaggregater, periode og gyldige svarantal; ingen kundedata eller kommentarer. Celler beskyttes mod formelfortolkning.
- Svarprocent vises ikke. En accepteret Omnisend-hændelse beviser ikke leveret mail, og gamle invitationer har ingen sammenlignelig historik. Det må ikke præsenteres som en målt leverings- eller svarprocent.

## Offentlige anmeldelser

Publicering kræver både eksplicit godkendelse af den enkelte anmeldelse og `feedbackSettings/{brandId}.publicReviewsEnabled = true`. Gamle `showPublicly`-flag publiceres ikke automatisk: der kræves godkendelsesmetadata og en ny projektion.

`publicFeedbackReviews/{feedbackId}` indeholder kun brand/lokation, visningsnavn, offentlig tekst, rating, modtagelsesdato og godkendelsesdato. Den offentlige DTO udelader også de interne referencefelter. Offentlige læsninger går ikke til `customers` eller private `feedback`-dokumenter.

Nye godkendelser er anonyme som standard. En editor kan eksplicit vælge fornavn; kun kundens første navn fra samme brand bruges. Der findes et særskilt felt til offentlig tekst. E-mails, URL'er og talmønstre fjernes automatisk, men editor skal stadig kontrollere fri tekst for personoplysninger. Original kommentar og interne noter forbliver private.

Visningen er et kurateret udvalg, hvilket fremgår på siden. Højst 20 anmeldelser pr. side med stabil dokument-ID-baseret pagination. Det er ikke en påstand om kronologisk sortering. Skjul/slet fjerner projektionen atomisk. Deaktivering af brand/lokation/offentlig visning skjuler siden ved næste forespørgsel; ingen offentlig cache skal bevare tidligere indhold.

## Mailforløb

1. En manual invitation kræver feedback-editoradgang til ordren. Automatisk ordrekø dannes ved opdatering til `Completed`/`Delivered`, når brugeren også har en gyldig feedbacksession. Andre ordreopdateringer bliver ikke gjort afhængige af mailkøen. Manglende feedbacksession giver ingen automatisk mailjob.
2. Ordren skal være betalt og gennemført, uden registreret refundering. Kunde og lokation skal høre til brandet, og der skal være et aktivt spørgeskema på det valgte sprog.
3. Nye ordreinvitationer har HMAC-signeret token, 30 dages udløb og en serverregistreret kilde. Gamle `orderId`/`customerId`-links bevares for kompatibilitet, men kræver nu også gennemført/betalt ordre ved visning og gemning. De gamle links er stadig ikke signerede; en overgang/dato for lukning kræver en særskilt aftale.
4. Bookingintegrationens eksisterende maskinautentificerede invitation kan oprette et job, hvis automatik er aktiveret. Ventetid regnes fra `starts_at`. Integrationens tilbagekaldelse/udløb respekteres. Det er ikke selvstændigt bevis for fysisk fremmøde; aflyste bookinger skal tilbagekaldes af integrationen.
5. Worker kontrollerer brand/lokation, kilde, svarstatus og både kundens lokale `marketingConsent === true` og eksisterende tilmeldt e-mailkanal i korrekt Omnisend-brand. Den opretter eller gentilmelder ikke kontakter. Der kontrolleres igen efter udbyderens preflight.
6. Højst én invitation og én påmindelse registreres pr. kilde. Påmindelse oprettes atomisk med registrering af accepteret invitation og stoppes efter svar, afmelding, deaktivering eller ugyldig kilde. Valg af nul påmindelser stopper også en allerede planlagt påmindelse.
7. Tak-mail registreres atomisk med et svar, når indstillingen er aktiv og der findes en gyldig invitation. Den sender ikke et nyt feedbacklink.

Indstillinger pr. brand: mail til/fra, automatisk invitation til/fra, ventetid 0–168 timer, sprog da/en, 0 eller 1 påmindelse, påmindelse efter 24–336 timer samt tak til/fra. Alt er fra som standard. Ændring af ventetid flytter ikke allerede planlagte jobs. Slås automatik fra, stoppes nye automatiske jobs; brug mail til/fra for at stoppe al endnu ikke afsendt mail.

### Tilstande og genforsøg

`pending` → `preparing` (120 sekunders lease) → `dispatching` → `accepted` / `failed` / `uncertain`. Uegnede modtagere/kilder bliver `suppressed`.

- `accepted` betyder kun, at Omnisend har accepteret hændelsen. Det er ikke dokumentation for e-maillevering; `autoResponseSent` sættes ikke på dette grundlag.
- HTTP 429 genforsøges højst tre gange. Permanente afvisninger kræver kontrol. Timeout, netværksfejl, HTTP 5xx eller tabt worker under afsendelse bliver `uncertain` og sendes ikke automatisk igen.
- En udløbet `preparing`-lease kan overtages; en udløbet `dispatching`-lease må ikke føre til blind genafsendelse.
- Omnisends realtids-events deduplikeres ikke alene på `eventID`. Derfor bruges varig kø/lease, og et usikkert resultat kræver menneskelig kontrol. Settings viser hændelses-ID til opslag samt højst 50 nylige jobs pr. brand, uden mailadresse eller invitationstoken.
- Manuel genstart kræver editoradgang og eksplicit bekræftelse af, at udbyderen ikke har modtaget hændelsen. Handlingens aktør/tid gemmes. Accepterede eller aktive jobs kan ikke genstartes på denne måde.

Udbyderkontrakt: [Events API](https://api-docs.omnisend.com/reference/post_events), [REST events og eventID](https://api-docs.omnisend.com/docs/how-to-send-events-rest-api), [automations](https://api-docs.omnisend.com/docs/how-to-send-custom-events-to-trigger-custom-automations). Adapteren bruger API-version `2026-03-15`, `events.write` og events med `feedbackUrl` (undtagen tak), brandnavn, lokationsnavn, kildetype og sprog. Skabeloner skal vælge korrekt sprog ud fra egenskaben `language`.

## Releasekonfiguration – skal udføres af releaseansvarlig

Ingen af nedenstående runtimeændringer er udført fra Work.

| Konfiguration | Krav |
| --- | --- |
| Data/Auth | Eksisterende **orderfly-39325**; må ikke flyttes til App Hosting-projektet |
| Hosting | Eksisterende **orderfly-v21-10334086-b3076**; produktbilledlager fra #90 bevares uændret |
| `ORDERFLY_FEEDBACK_ACCESS` | Betroede eksisterende Firebase UID'er, roller og brand-ID'er; konfigurér før feedbackruter tages i brug |
| `ORDERFLY_FEEDBACK_EVENTS` | JSON-liste med `brandId`, `enabled`, `invitation`, `reminder`, `thankYou`; navnene skal matche opsatte Omnisend-automations |
| `ORDERFLY_OMNISEND_BRANDS` | Eksisterende servermapping med korrekt `omnisendBrandId`, API-nøgle, `enabled: true`, `consentMode: "single_opt_in"`; tilstrækkelig læseadgang til brand/kontakt og `events.write` |
| `ORDERFLY_FEEDBACK_TOKEN_SECRET` | Tilfældig hemmelig værdi på mindst 32 tegn; rotation ugyldiggør gamle signerede ordrelinks |
| `ORDERFLY_FEEDBACK_WORKER_SECRET` | Separat tilfældig hemmelig værdi på mindst 32 tegn til worker; aldrig i browser eller Git |
| `ORDERFLY_FEEDBACK_ORIGIN` | Valgfri betroet HTTPS-origin uden sti; standard `https://orderfly.dk` |
| Scheduler | POST `/api/internal/feedback/send`, `Authorization: Bearer <worker-secret>`; fx hvert 5. minut. Højst 10 jobs pr. kald/45 sekunders behandlingsbudget. Ingen automatisk historisk backfill. |
| Skabeloner | Faktiske invitation-/påmindelse-/tak-automations, afsender, sprog og afmeldingsindhold i korrekt Omnisend-brand. Eventaccept alene dokumenterer ikke, at en automation er opsat. |
| Firestore-indexer | Flet de nødvendige indexer fra `docs/feedback-firestore-indexes.json` ind i projektets eksisterende konfiguration. Erstat ikke de eksisterende indexer. |
| Firestore-regler | Verificér at browserklienter ikke kan læse/skrive private feedbackdata, grants, settings, invitationer, mailjobs, audit eller offentlige projektioner direkte. Serverruter bruger Admin SDK. En bred eksisterende allow-regel kan ikke ophæves med en snæver deny-regel; gennemgå den samlede regelsamling. |

Samlinger: `feedback`, `feedbackQuestionsVersion`, `feedbackConfiguration`, `feedbackSettings`, `feedbackInvitations`, `feedbackMailJobs`, `feedbackModerationAudit`, `publicFeedbackReviews`, samt eksisterende `integrationFeedbackInvitations`. Verificér også eksisterende single-field-indexer for de brugte filter-/sorteringsfelter.

Aktivér først mail for et brand, når konfiguration, relevante spørgeskemaer og skabeloner er godkendt. Offentlig visning og mail er separate indstillinger; rapport/moderation kræver ikke aktiveret mail.

## Målrettet validering

- `npm run typecheck`: bestået.
- `node --test tests/unit/feedback-readiness.cjs tests/unit/feedback-report-public.cjs tests/unit/feedback-mail.cjs`: **57/57**.
- `CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/feedback-browser.cjs`: **10/10**.
- Eksisterende `tests/esmeralda-feedback-integration.spec.ts`, isoleret Playwright uden webserver, én worker: **8/8**.

Browserne bruger de faktiske React-komponenter og serverhandlinger med syntetisk I/O og produktions-Tailwind; mobil 390 px og desktop 1280 px. Der testes opret/genåbn/redigér, bevaret kladde ved transportfejl, kundesvar, moderation og offentlig anonym visning/tilbagetrækning, rapportfiltre/CSV samt gemte mailindstillinger og eksplicit genstart. Serverfixtures tester adgang/brandgrænser, DST/NPS, publiceringsrollback, samtidige køkørsler, afmelding/svar-stop, tokenfejl, atomisk tak, timeout/429/5xx og workerautentificering.

Fixtures erstatter Firebase/Omnisend I/O. De beviser ikke produktions-IAM, distribuerede Firestore-låse, faktiske mailskabeloner eller e-maillevering. Ingen produktionsdata, mails/SMS, secrets, IAM, merge, deployment, bred CI-matrix eller workflow dispatch er udført.

## Resterende produktvalg og driftsaccept

- Spørgeskemaer er fortsat globale pr. sprog/oplevelse. Brand-/lokationsspecifikke skabeloner, fuld publicér/arkiv-model og historiske aktive konflikter kræver særskilt beslutning.
- Legacy unsigned ordrelinks, platformens øvrige adgangskontrol og Firestore-regler er udtrykkelige afgrænsninger; de må ikke beskrives som løst af modulsessionen.
- Indbakken læser alle svar inden for brugerens tilladte brands. Stor-skala inbox-pagination, opbevaringspolitik og automatisk opfølgning på lave ratings er ikke leveret her.
- Der er ikke bygget leveringswebhook, historisk kø-backfill eller en troværdig leveringsbaseret svarprocent.
- Før Done: uafhængigt review → PO-accept → releaseansvarlig merger/deployer → verificér login for rette UID, afvisning på tværs af brands, rapport fra kendte svar, individuel godkendelse/tilbagetrækning og deaktiveret offentlig side. Kontrolleret mailtest skal bruge særskilt godkendt testmodtager og verificere Omnisend-hændelse **og** faktisk mail.

Issue #85 forbliver åben indtil den aftalte liveverifikation. Work merger eller deployer ikke sin egen PR.
