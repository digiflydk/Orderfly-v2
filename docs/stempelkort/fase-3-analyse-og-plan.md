# Fase 3 – Stempelkort: analyse (trin 1) og plan (trin 2)

Status: **Godkendt af PM 2026-10-17** med svarene i del B.
Grundlag: `main` @ `0f3aab9` (Orderfly-v2). Esmeralda-repoet er ikke læst igen; fase 1-analysens afsnit A1–A2 om login og mPanel er brugt.
Spec: [fase-3-stempelkort-merchantportal.md](fase-3-stempelkort-merchantportal.md).

**PM-beslutning 2026-10-17:** Fase 3 må bygges parallelt med fase 2 (anden session), selvom spec §0 kræver, at fase 2 er godkendt først. De to faser mødes kun i QR-koden. Kundens QR-token findes allerede fra fase 1 (`issueQrToken`, `GET /api/loyalty/[brandSlug]/qr`), og fase 3 testes mod det.

---

## Del A – Analyse (trin 1)

### A1. Kassens backend fra fase 1 (kan bruges, som den er)

`src/lib/loyalty/stamp-card/counter.ts` og `src/app/api/merchant/loyalty/{lookup,stamp,redeem,correct}` dækker næsten hele kassevisningen:

| Spec | API | Det får frontend tilbage |
|---|---|---|
| §5.1 scan / §5.5 søg | `POST /api/merchant/loyalty/lookup` med `{brandId, locationId, qrToken}` eller `{…, email}` | Navn, maskeret e-mail, stempler X af N, gyldige belønninger (med "kan indløses her"), programmets regler (aktiv, kanaler, minimumsbeløb, rabatregel) og medarbejderens rettigheder til indløsning og korrektion |
| §5.3 giv stempel | `POST …/stamp` med kanal, beløb i øre, rabatflag, `via: qr|search` og idempotensnøgle | Nye stempler X af N og antal optjente belønninger |
| §5.4 indløs | `POST …/redeem` med `rewardId`, `via` og idempotensnøgle | Belønningens beskrivelse |
| §5.6 korrektion | `POST …/correct` (tilføj/fjern stempler, annullér indløsning, årsag påkrævet) | Ny status |

Det er allerede løst i backend:
- **Rettighed pr. afdeling** tjekkes i samme transaktion som skrivningen. Inaktive medarbejdere afvises ved hvert kald (Opsfly-sessionen tjekkes uden cache).
- **Idempotens:** samme nøgle giver samme kvittering. Dobbeltklik og "prøv igen" efter netværksfejl giver derfor ikke to stempler.
- **QR-token:** 60 sekunder, engangsbrug, kun nyeste kode gælder. Ukendt, udløbet, brugt og screenshot giver samme fejl (`qr_invalid`).
- **Log:** stempel via søgning logges som `counter_search`, via QR som `counter_qr`, altid med medarbejderens navn.
- **Fejlkoder** findes for alle beskeder i spec §6: `qr_invalid`, `member_not_found`, `below_minimum`, `discount_excluded`, `channel_not_allowed`, `daily_limit`, `program_inactive`, `reward_not_available`, `reward_expired`, `reward_wrong_location`, `wrong_location`, `rate_limited`, `forbidden`, `unauthorized`, `unavailable`.

**Huller i forhold til spec (se beslutninger i del B):**
1. **Annullér indløsning ved kassen:** API'et kræver id'et på en *indløst* belønning, men opslaget returnerer kun *gyldige* belønninger. Kassen kan derfor ikke finde den belønning, der skal annulleres (kun lige efter en indløsning, hvor id'et kendes).
2. **Programstatus på startskærmen** (§5.1) kendes først efter et opslag. Den kan dog læses på serveren, når siden indlæses, med den eksisterende `readProgram` – uden ændring i backend.
3. **Indløsning lige efter fyldt kort:** stemplingen returnerer ikke den nye belønnings id, og QR-tokenet er brugt. Kunden skal vise en ny QR-kode (eller søges på e-mail) for at indløse med det samme. Jeg foreslår at acceptere det.

### A2. Indløsningssiden fra PR #203 (Spin & Vind)

Filerne `src/app/merchant/redeem/page.tsx` og `merchant-games.tsx`:
- **Genbruges:** brand- og afdelingsvalget bygget på `orderflyReadGrants(...)` (kun brands og aktive afdelinger, hvor medarbejderen har rettigheden) og adskillelsen mellem "se" og "indløse". Bekræft-dialogen som mønster.
- **Genbruges ikke:** kodelisten og server-action-laget. Kassen kalder de færdige API-routes fra fase 1 direkte.

### A3. Login og brugerskifte (timeloggens login)

- Login sker med **navn/e-mail og 6-cifret PIN** mod Esmeraldas `timeclock-admin-auth` via `POST /api/admin/session` (samme som `/admin-login`). Inaktive medarbejdere afvises der. 5 fejlforsøg pr. 10 minutter pr. medarbejder.
- Sessionen ligger i cookien `__session` (højst 8 timer). Log ud = `DELETE /api/admin/session`, som også lukker tokenet hos Esmeralda.
- Der findes **ikke** et login med kun PIN (uden navn). Det ville kræve en ændring i Esmeralda og er usikkert (PIN alene er ikke unik).
- Der findes **ingen** automatisk log ud ved inaktivitet i dag.
- **Konklusion:** Hurtigt skifte bygges oven på det eksisterende login: tabletten husker navnene på de seneste medarbejdere (aldrig PIN), og man trykker sit navn og taster PIN. Der bygges intet nyt login.

### A4. Rettighedstjek i frontend og menu

- `src/lib/access/navigation.ts`: `/merchant` vises kun for brugere med mindst én `orderfly.*:view`-rettighed. **En medarbejder med kun "kassevisning" (og evt. "indløs") afvises derfor af hele `/merchant`-layoutet i dag.**
- `src/app/admin-login/page.tsx` sender efter login til `/superadmin/sales/orders` (eller `/merchant`). En kun-kasse-medarbejder ender på "ingen adgang".
- `src/lib/access/mpanel-launch.ts` (genvej fra mPanel) kender ikke kassevisningen og springer alle `orderfly.stamp_cards:*`-rettigheder over, når de kun gælder enkelte afdelinger. Kassepersonale har typisk kun adgang til én afdeling.
- Sidebaren (`sidebar-client.tsx`) har ingen menupunkt til kassevisningen.

### A5. Kamera og QR-scanning

- Der er **intet QR-bibliotek** i `package.json`.
- Browserens indbyggede `BarcodeDetector` virker i Chrome på Android, men **ikke i Safari på iPad**. Der skal derfor bruges et lille bibliotek som reserve (forslag: `jsqr`, ingen afhængigheder, ca. 50 kB, kun indlæst på kassesiden).
- Kameraet kræver HTTPS (er på plads) og at ingen `Permissions-Policy` blokerer det (der er ingen i `next.config.js`).
- **Fase 2 har ikke fastlagt, hvad QR-koden indeholder.** Kassens opslag forventer selve tokenet (64 tegn). Det skal aftales med fase 2-sessionen (beslutning 3).

### A6. Design

- Kassevisningen bruger `admin-ui.css`, `src/components/ui/*` (`button`, `card`, `dialog`, `alert-dialog`, `input`, `badge`) og adminens farver. Ingen nye farver eller skrifttyper.
- Tablet-tilpasning sker med større størrelser af de eksisterende komponenter (høje knapper, stor tekst), ikke nye komponenter.

---

## Del B – Beslutninger (svar fra PM, 2026-10-17)

| # | Emne | Beslutning |
|---|---|---|
| 1 | Automatisk log ud | **A:** Nyt felt pr. brand under Stempelkort → Indstillinger: "Kassevisning: log ud efter inaktivitet (minutter)", standard 5, 1–60. Lille ændring i fælles kode (`rules.ts`, admin-indstillinger), lavet som første PR. |
| 2 | Annullér indløsning | **Kun i admin** (Medlemmer → medlem → korrektion, som findes fra fase 1). Kassen kan tilføje og fjerne stempler. `counter.ts` ændres ikke. |
| 3 | QR-kodens indhold | Kun selve tokenet (64 tegn). Alt andet afvises med "Det er ikke en stempelkort-kode". Gives videre til fase 2. |
| 4 | Adresse | `/merchant/stamp-card` i merchant-portalen. Kun-kasse-medarbejdere ser kun kassevisningen i fuld skærm; ledere får menupunktet "Kassevisning". |
| 5 | Afdeling | Vælges som brandet, forvalgt ved kun én, og tabletten husker valget. |
| 6 | Tablet | Både iPad og Android. |
| 7 | Afhængighed | `jsqr` godkendt. |

## Del C – Plan (trin 2)

### C1. Skærmbilleder og flow

Alt ligger under `src/app/merchant/stamp-card/` (side, klientkomponenter) og kalder fase 1-API'erne. Frontend viser og sender kun. Beløb omregnes fra kr. til øre; alle regler afgøres i backend.

1. **Låseskærm** (ingen session, efter "Skift bruger" eller efter inaktivitet):
   - Knapper med de seneste medarbejdere på denne tablet (højst 8, kun navne, kan fjernes). Tryk navn → PIN-tastatur → login via `POST /api/admin/session`.
   - "Anden medarbejder" giver felt til navn/e-mail.
   - Afvist login viser "Kunne ikke logge ind. Kontrollér navn og PIN." Inaktive medarbejdere afvises af Esmeralda.
2. **Topbjælke** (altid synlig): aktiv medarbejders navn, brand/afdeling, "Skift bruger" og – kun for ledere med andre rettigheder – "Administration".
3. **Startskærm:** stor knap "Scan QR-kode" og knap "Søg kunde på e-mail". Brand- og afdelingsvalg ved flere muligheder. Er programmet slået fra eller har ingen kassekanaler: tydelig besked, og knapperne er slået fra.
4. **Scanning:** kameraet åbner, scanner automatisk og slår op uden ekstra tryk. Bagkamera foretrækkes. Afviser alt, der ikke er et token.
5. **Kundekort:** navn (og maskeret e-mail ved søgning), "Stempler X af N", belønninger med beskrivelse og udløbsdato, store knapper "Giv stempel" og "Indløs belønning" (sidstnævnte kun med gyldig belønning og rettighed). "Korrektion" kun med rettighed.
6. **Giv stempel** (højst tre tryk: kanal, beløb, bekræft): kun de kanaler, brandet har slået til (aldrig Wolt/Uber Eats); er der kun én, er den valgt på forhånd. Beløbsfelt med taltastatur; under minimum vises "Beløbet er under X kr. og giver ikke stempel", og Bekræft er slået fra. Afkrydsning "Rabat eller kampagne brugt" kun når rabatordrer ikke giver stempel. Kvittering "Stempel givet – 6 af 8" eller "Kortet er fyldt – belønning optjent" i ca. 4 sekunder, derefter tilbage til start.
7. **Indløs:** beskrivelsen stort, "Indløs" → bekræftelsestrin → kvittering "Belønning indløst".
8. **Søg på e-mail:** resultat med navn og maskeret e-mail, medarbejderen bekræfter, derefter samme kundekort (stempler logges "via søgning").
9. **Korrektion:** tilføj/fjern stempler (antal). Annullering af indløsning sker i admin (beslutning 2). Årsag er påkrævet (mindst 3 tegn, som backend kræver).

**Dobbeltklik og netværk:** Knappen låses ved første tryk. Idempotensnøglen laves, når handlingen åbnes, og genbruges ved "Prøv igen". Der vises intet som registreret, før backend har svaret OK. Ved netværksfejl: "Ingen forbindelse. Prøv igen."

**Fejlbeskeder** (dansk, én fil med oversættelse fra backendens fejlkoder):

| Kode | Besked |
|---|---|
| `qr_invalid` | QR-koden er udløbet. Bed kunden opdatere siden. |
| `member_not_found` | Kunden findes ikke. |
| `below_minimum` | Beløbet er under {minimum} kr. og giver ikke stempel. |
| `discount_excluded` | Køb med rabat eller kampagne giver ikke stempel. |
| `daily_limit` | Kunden har fået det maksimale antal stempler i dag. |
| `program_inactive` | Stempelkortet er slået fra. |
| `reward_not_available` | Belønningen er allerede indløst. |
| `reward_expired` | Belønningen er udløbet. |
| `reward_wrong_location` / `wrong_location` | Kortet gælder kun i en anden afdeling. |
| `rate_limited` | For mange opslag. Vent et øjeblik. |
| `forbidden` | Du har ikke adgang til denne handling. |
| `unauthorized` | Du er logget ud. → låseskærm |
| `unavailable` / netværk | Ingen forbindelse. Prøv igen. |

### C2. Kode, der ændres – og hvad der er fælles med fase 2

**Kun kassevisningen (ingen konfliktrisiko):**
- Ny: `src/app/merchant/stamp-card/page.tsx`, klientkomponenter, fejlbeskeder og QR-scanner.
- Ny: Playwright- og unit-tests (se C4).

**Fælles adgangskode uden for `stamp-card/` (små ændringer, rører ikke fase 2):**
- `src/lib/access/navigation.ts`: ny regel `/merchant/stamp-card` → superuser eller `orderfly.stamp_cards:counter`. `/merchant` tillader også `counter`, så kun-kasse-medarbejdere kommer ind i portalen.
- `src/app/merchant/layout.tsx`: skjuler sidebaren for en bruger, hvis eneste synlige side er kassevisningen.
- `src/app/merchant/page.tsx`: en kun-kasse-medarbejder sendes direkte til kassevisningen; andre får "Kassevisning" som genvej.
- `src/components/superadmin/sidebar-client.tsx`: menupunktet "Kassevisning" i merchant-portalen.
- `src/app/admin-login/page.tsx`: efter login sendes en kun-kasse-medarbejder til kassevisningen.
- `src/lib/access/mpanel-launch.ts`: genvej `orderfly.stamp_cards:counter` → `/merchant/stamp-card`, også når rettigheden kun gælder enkelte afdelinger.

**Fælles stempelkort-backend i `src/lib/loyalty/stamp-card/` (beslutning 1):**

| Ændring | Fil | Udløses af | Konfliktrisiko med fase 2 |
|---|---|---|---|
| Nyt felt `counterIdleMinutes` (standard 5, 1–60) i programindstillingerne + felt i admin-indstillinger | `rules.ts`, `admin.ts`, admin-indstillingssiden | Beslutning 1 | Lav-middel: fase 2 læser programindstillingerne (`program`-routen), men nye felter med standardværdi bryder intet. Ændringen bør laves som første, lille PR og merges hurtigt, så fase 2 får den med. |

**Ingen ændring i datamodellen** (ingen nye collections eller indekser), Firestore-reglerne, API-routes eller rettighedskataloget. Ingen ændring i Esmeralda/mPanel.

### C3. Automatisk log ud

- En timer i browseren registrerer tryk og tastatur. Efter den indstillede periode uden aktivitet logges medarbejderen ud (`DELETE /api/admin/session`), og låseskærmen vises.
- Tidspunktet for seneste aktivitet gemmes på tabletten. Har tabletten sovet eller været lukket længere end perioden, logges der ud, så snart siden åbnes igen.
- Serverens egen grænse på 8 timer gælder stadig. Backend tjekker sessionen ved hvert kald, så en udløbet eller deaktiveret medarbejder kan aldrig registrere noget.

### C4. Test

**Unit** (`node --test`, Firestore i hukommelsen som i `tests/unit/loyalty-stamp-card-counter.cjs`):
- Navigation: kun-kasse-bruger ser kassevisningen og intet andet; leder ser begge; uden rettighed afvises (`access-navigation.cjs`).
- mPanel-genvej til kassevisningen med afdelingsbegrænset rettighed.
- `counterIdleMinutes`: standardværdi for gamle indstillinger uden feltet, grænser 1–60.

**Playwright** (opfanget netværk, ingen produktionsdata, tablet liggende 1180×820 og stående 820×1180 samt 390 px). Én test pr. punkt i spec §8, der kan testes automatisk:
- Login, kun kassevisning synlig, afvist login (inaktiv medarbejder), brugerskifte og automatisk log ud (med kunstigt ur).
- Scanning med et falsk kamerabillede af en QR-kode lavet med fase 1's `issueQrToken`-format; udløbet kode afvises.
- E-mail-søgning; under minimum; kun dine-in/takeaway; dobbeltklik giver ét kald med samme nøgle; fyldt kort; indløsning kræver rettighed; korrektion kræver rettighed og årsag; netværksfejl registrerer intet.
- "Alle handlinger står i loggen med den rigtige medarbejder" dækkes af de eksisterende backend-tests fra fase 1 plus en kontrol af, at frontend sender `via` korrekt.

**Manuelt (drift, ikke Work):** hele flowet på restaurantens egen tablet med en testkunde i et testbrand. QR-koden kan laves før fase 2 er færdig ved at hente et token fra `GET /api/loyalty/[brandSlug]/qr` som testmedlem.

`npm run typecheck` og de relevante tests køres før hver PR.

### C5. Små PR'er (trin 3, efter godkendelse)

1. **Fælles backend:** `counterIdleMinutes` i indstillingerne og admin, med tests. Merges først og hurtigt for at undgå konflikt med fase 2.
2. **Adgang og indgang:** navigation, merchant-layout uden sidebar for kun-kasse, menupunkt, login-redirect og mPanel-genvej.
3. **Kassevisningen:** låseskærm og brugerskifte, automatisk log ud, start, scanning, søgning, kundekort, stempel, indløsning, korrektion og fejlbeskeder, med Playwright-tests.

Hver PR opdaterer `docs/stempelkort/README.md` (status og driftsvejledning til kassen), og ved behov `api-overview.md`, `security-rbac.md` og `FILE-MAP.md`. Før merge flettes `main` ind. Esmeralda-deploy er ikke nødvendig for fase 3.

### C6. Genbrug – samlet

| Behov | Genbruges fra |
|---|---|
| Opslag, stempel, indløsning, korrektion, idempotens, rettighed, log | Fase 1: `counter.ts` og `/api/merchant/loyalty/*` |
| Login, inaktiv-tjek og log ud | `POST`/`DELETE /api/admin/session`, `orderflySession()` |
| Brand- og afdelingsvalg | `orderflyReadGrants`-mønstret fra `merchant/redeem/page.tsx` |
| Programstatus på startskærmen | `readProgram` (`model.ts`) |
| Menu og synlighed | `canNavigate`/`filterNavigation`, `SuperAdminLayoutClient merchantPortal` |
| Design | `admin-ui.css`, `src/components/ui/*` |
