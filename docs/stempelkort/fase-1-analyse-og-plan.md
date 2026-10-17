# Fase 1 – Stempelkort: analyse (trin 1) og plan (trin 2)

Status: **Plan komplet efter ejerens svar 2026-10-16. Godkendt af ejeren 2026-10-16.** Der er ikke ændret applikationskode.
Grundlag: `main` @ `f828c68` (Orderfly-v2) og `esmeralda-restaurant-operations` @ `51c6ced` (mPanel/Opsfly).
Spec: [fase-1-stempelkort-backend.md](fase-1-stempelkort-backend.md). Fase 2 og 3 er kun læst for at sikre, at fase 1-API'erne dækker dem.

---

## Del A – Analyse (trin 1)

### A1. mPanel: rolle- og rettighedsmodulet

Rettighedssystemet er **delt mellem de to repos**:

| Del | Placering | Rolle |
|---|---|---|
| Rettighedskatalog | Orderfly `src/lib/access/policy.ts` (`FEATURES` → `PERMISSIONS`) | Kilden til alle gyldige rettigheder, i formatet `feature:action`, fx `orderfly.games:redeem`. Ukendte rettigheder afvises af zod. |
| Politik (data) | Firestore `platformAdminControl/access-v1` | `principals`, `companies` (tenant med `orderflyBrandIds`, `opsflyOrganizationId` og `locationIds`), `roles` (`superuser`/`company_admin`/`company_user` plus `permissions`) og `memberships` (company, `locationIds` eller `null` for hele virksomheden). |
| Autoritet | Orderfly `src/lib/access/authority.ts` (`executeAuthority`) | Alle læsninger og ændringer sker i én Firestore-transaktion med revision, audit (`platformAdminAudit`), delegationsregler og beskyttelse af sidste superuser. |
| UI | mPanel `supabase/functions/mpanel-ui/browser.js` (genereret bundle, `index.ts`) | Fanerne Brugere, Roller og Virksomheder. Danske navne står i `featureNames`, handlingsnavne i `permissionName`, og modulgrupper i `accessModules`. |
| Bro | mPanel `platform-admin` Edge Function → Orderfly `src/app/api/integrations/mpanel/access/route.ts` | Maskinhemmelighed plus en verificeret medarbejdersession. Browseren sender aldrig identitet eller rettigheder. |

**Tjek i backend (Orderfly):**
- `requireOrderflyAccess(brandId, locationIds, permission)`: tjekker ét bestemt brand og evt. bestemte afdelinger.
- `orderflyReadGrants(permission)`: giver listen over brands og afdelinger, brugeren har rettigheden til. Bruges til lister og filtre.
- `authorizeTransaction(tx, identity, data, permission, kind)` og `mutateScopedDocument(...)` i `src/lib/access/scoped-data.ts`: tjekker politik og ejerskab **i samme transaktion** som skrivningen.

**Tjek i frontend:** `src/lib/access/navigation.ts` (`canNavigate` og `filterNavigation`). Det styrer kun, hvad der vises. Al adgang håndhæves i backend.

**Sådan tilføjes en ny rettighed:**
1. Tilføj feature og handlinger i `FEATURES` i Orderfly.
2. Tilføj det danske navn i `featureNames` og evt. nye handlingsnavne i `permissionName` i mPanel.
3. Tilføj rettigheden i `accessModules` i mPanel.
4. Genbyg bundlen, så den matcher `scripts/generated-ui-parity.mjs`.
5. Tildel rollerne i mPanel. Det er drift, ikke kode.

**Fund:**
- `orderfly.loyalty` (view/create/edit/delete) **findes allerede**. Den beskytter den interne kundescore på `/superadmin/loyalty` (se spørgsmål 1).
- mPanel mangler et navn for `orderfly.games` og for handlingen `redeem` og viser i dag "Funktion · Handling". Det rettes samtidig.

#### A1.1 Kodegennemgang af mPanel (esmeralda-restaurant-operations @ `51c6ced`)

Kilden er `supabase/functions/mpanel-ui/browser.js`. Den genererede `index.ts` holdes byte-identisk via `scripts/generated-ui-parity.mjs` og `build-mpanel-ui.mjs`. Serveren er `supabase/functions/platform-admin/handler.ts`.

- **Rettighedslisten kommer fra Orderfly.** Rolleeditoren viser `accessCatalog.permissions`, som er `PERMISSIONS` returneret af `executeAuthority({action:'list'})` (`authority.ts`). Nye rettigheder i `FEATURES` vises derfor automatisk i mPanel uden kodeændring der. Uden et navn i `featureNames` og en handlingslabel i `permissionName` vises de dog som "Funktion · Handling". Den lukkede label-liste kender kun `view`, `create`, `edit`, `delete` og `approve`.
- **Moduler** (`accessModules`) er fem grupper: HR, Finance, Produktion, Orderfly (`prefix:'orderfly.'`, `initial:['orderfly.orders:view']`) og Bordbooking.
  - `moduleOwns` afgør gruppen.
  - Afkrydser man et modul, sættes `initial`-rettighederne. Fravælger man det, fjernes alle rollens rettigheder i modulet.
  - Rettigheder, som intet modul ejer, vises under "Selvbetjening og øvrig administration".
  - Modulnavnene vises også ved brugere (`memberModules`).
- **Roller** gemmes med `{id, name, companyId, kind, permissions, active}` via `{action:'change', kind:'roles'}`. Det er Orderfly-autoriteten, der validerer delegationen: en admin kan ikke give flere rettigheder, end vedkommende selv har.
- **Brugere** (memberships) tilknyttes via `enroll`. `platform-admin` kontrollerer først, at medarbejderen er aktiv i `employees.is_active` i en tilladt organisation.
- **Session og inaktive medarbejdere:** Login i `timeclock-admin-auth` og sessionstjek i `native-session.ts` kræver `employees.is_active=true` og en ikke-tilbagekaldt, ikke-udløbet `employee_sessions`. `platform-admin` gentager tjekket af session, medarbejder og organisation ved hvert kald.
- **Moduladgang i mPanel-forsiden** (`module_access`) gælder kun Opsfly-moduler. `centralNativePermissions` accepterer kun `opsfly.`/`platform.` med standardhandlinger, så nye `orderfly.*`-handlinger påvirker ikke Opsfly.
- **Orderfly-genvej fra mPanel** (`orderfly_launch` → Orderfly `src/lib/access/mpanel-launch.ts`) vælger startside ud fra en fast liste. Her står `['orderfly.loyalty:view','/superadmin/loyalty']`. Den skal ændres til kundescorens nye rute, og stempelkort-ruterne skal tilføjes. Ellers kan en bruger med kun stempelkort-rettigheder ikke åbne Orderfly fra mPanel.
- **Login i Orderfly** (`/api/admin/session`) kræver superuser eller mindst én `orderfly.*`-rettighed. Det dækker de nye rettigheder.
- **Eksisterende tests**, som udvides: `tests/e2e/access-authority.spec.mjs`, `platform-admin.spec.mjs` og `module-access.spec.mjs` samt `tests/contracts/platform-admin.test.mjs`. Ændringen er R3 i Esmeralda (auth/permissions) og kræver issue, preflight-manifest og docs-opdatering (`docs/modules/platform-administration.md`, `platform-manifest.json`).
- **De faktiske roller** ligger i Orderflys produktions-Firestore (`platformAdminControl/access-v1`) og kan kun ses i mPanel → Roller. De findes ikke i nogen af de to repos.

### A2. Medarbejderlogin fra timeloggen (Opsfly)

- `/admin-login` med metoden "opsfly" (navn/e-mail og 6-cifret PIN) → `src/app/api/admin/session/route.ts` → `loginOpsfly()` (`src/lib/access/opsfly-login.ts`) → Esmeraldas `timeclock-admin-auth`, som er samme login som timeloggen.
- Esmeralda gemmer kun en hash af sessionstokenet og begrænser forsøg til 5 fejl pr. 10 minutter pr. medarbejder.
- Orderfly gemmer tokenet i en HMAC-signeret `__session`-cookie (`opsfly.v1.…`), som højst gælder i 8 timer.
- **Hver request** kalder `verifyOpsflyCookie` → `nativeOpsflySession`, som spørger Esmeralda uden cache. Logout, ny PIN og **deaktivering af medarbejderen** stopper derfor adgangen med det samme. Desuden skal `principal.active` være sat i politikken.
- mPanel kan også sende en bruger videre til Orderfly med en engangskode (#319, `mpanel-launch.ts`).
- **Konklusion:** Spec-kravet "eksisterende login, og inaktive mister automatisk adgang" opfyldes ved at genbruge `verifiedOrderflyIdentity()` og `orderflySession()`. Der skal ikke bygges et nyt login.
- Bemærk: `organization_slug: 'esmeralda'` er hårdkodet i `opsfly-login.ts`. Det betyder ikke noget for denne leverance.

### A3. Promotion-modulet

- I menuen ligger gruppen **Promotions** (`src/components/superadmin/sidebar-client.tsx`) med: Discounts, Combos, Upsells, Newsletter & Omnisend, Games, Indløs kode, Standard Discounts og **Loyalty**.
- **Rabatkoder** gemmes i `discounts`, automatiske rabatter i `standard_discounts`. Begge har `brandId` og `locationIds`, `isActive`, `startDate`/`endDate`, `activeDays`, `activeTimeSlots` og `orderTypes` (`pickup`/`delivery`).
- Rettighedsscope `'locations'` med håndtering af forældreløse afdelinger (`scoped-data.ts`).
- **På ordrer** gemmes `discountTotal`, `itemDiscountTotal`, `cartDiscountTotal` og `cartDiscountName`, så det kan afgøres, om rabat er brugt. Desuden gemmes `paidAt` (styrer salgsrapporteringen), `refundedAmountOre`, `deliveryType: 'Pickup' | 'Delivery'` og `status`.
- I ordremodellen findes **ingen dine-in-kanal**. Dine-in opstår kun via kassevisningen i fase 3.

### A4. Tenant- og brandmodellen samt filtre

- **Tenant** svarer til `company` i politikken. Et Orderfly-brand kan kun høre til én company (valideret). Afdelinger er `locations` med `brandId`.
- Forretningsdata har `brandId` og evt. `locationId`/`locationIds`. Firestore-reglerne (`firestore.access.rules`) **afviser al adgang fra browseren**. Alt går gennem serverkode, der filtrerer på brand.
- **Filtre:** `FiltersBar`, `FiltersBarClient`, `useSAFilters` og `SACommonFilters` (`dateFrom`, `dateTo`, `brandId | 'all'`, `locationIds`) gemmes i URL'en. Valgmulighederne hentes via `nativeCatalog(permission)` og `selectorCatalog()`.
- **Mangler i forhold til spec §4:** filter på tenant, valg af flere brands, faste perioder (i dag, 7 dage …), kanal, medarbejder og at huske filtervalget mellem sider. Det løses ved at udvide de eksisterende komponenter, ikke ved at bygge nye.

### A5. Kundemodellen og samtykke

- `customers` er **pr. brand**. Kunder matches på normaliseret e-mail (`trim().toLowerCase()`) via `normalizedEmail`, `email` og `emailAliases`. Hash-reservationen `integrationConsumerCustomerIdentities/{sha256(brandId\nemail)}` forhindrer dubletter (`findCheckoutCustomer`, `src/lib/customer-identity.ts`).
- **Samtykke** gemmes som versionerede hændelser i `marketingConsents` med præcis den viste tekst og version. Til hver hændelse hører et job i `marketingOutbox` og en tilstand i `marketingContacts`. `customers.marketingConsent` gælder kun kundens primære e-mail.
- Reglen om, at "kunde ≠ samtykke", er allerede gennemført. Booking og ordrer giver ikke samtykke (`docs/omnisend-customer-import.md`).

### A6. Omnisend-integrationen

- Koden ligger i `src/lib/marketing/*`. Brandopsætningen ligger i hemmeligheden `ORDERFLY_OMNISEND_BRANDS`.
- Workeren kører via det eksisterende heartbeat: mPanels notification-worker kalder `/api/internal/feedback/send` hvert minut, og der er desuden `/api/internal/marketing/sync`.
- **Tilmelding:** `consentPayload` sender `subscribed` med kilde og tidspunkt. Et job gentages ikke, hvis Omnisend allerede har kontakten.
- **Afmelding fra Omnisend tilbage til Orderfly** sker ved **polling**, ikke webhook: `marketingContacts` afstemmes hver time. Er kontakten afmeldt, bliver den `suppressed`, og `customers.marketingConsent` sættes til `false`.
- **Kontaktimport** (`import-worker.ts`) læser fra et vandmærke. Kunder, der endnu ikke er importeret, oprettes eller matches via samme resolver.
- **Der mangler en vej fra Orderfly til Omnisend for afmelding.** I dag sendes kun `subscribed`. Det skal tilføjes, så kunden kan afmelde sig i portalen.

### A7. Indløsningssiden fra PR #203 (Spin & Vind)

Filerne er `src/app/merchant/layout.tsx`, `merchant/redeem/page.tsx`, `merchant/merchant-games.tsx` og `merchant/actions.ts`.

**Det kan genbruges:**
- Layoutet `/merchant` (`SuperAdminLayoutClient merchantPortal`) med sessionstjek.
- Brand- og afdelingsvælgeren bygget på `orderflyReadGrants`, med **adskilte rettigheder til at se og til at indløse**.
- Transaktionsmønstret i `redeemMerchantGameCode`: `authorizeTransaction` i transaktionen, **et deterministisk dokument-ID som idempotens** (`tx.create` af `gameConversions/{sha256(...)}`) og en `auditLogs`-række med `actorId`.
- Dialogen "bekræft indløsning".

**Det genbruges ikke:** kodelisten. Kassen skal scanne og slå op, ikke vælge i en liste.

**Bemærk:** `actorId` er `principalKey` (en hash). Medarbejderens navn findes i politikkens `principals[].name` og skal gemmes som snapshot i loggen.

### A8. Designsystemet

- Reglerne står i `docs/admin-design-system.md`, og tokens ligger i `src/styles/admin-ui.css` (`.admin-shell`).
- Komponenter i `src/components/ui/*`: `card`, `table`, `tabs`, `badge`, `dialog`, `alert-dialog`, `switch`, `input`, `select`, `textarea`, `empty-state`, `skeleton` og `chart` (Recharts-wrapper).
- Til filtre: `AdminDateRange`, `AdminSelectField` og `FiltersBar`.
- **KPI-kort** følger `Card`-gitteret i `src/app/superadmin/dashboard/page.tsx` og `Kpi` i `customers/[customerId]/page.tsx`.
- **Formularer** bruger react-hook-form og zod i `*-form-page.tsx` samt `use-admin-form-recovery`.
- **Grafer:** `ui/chart.tsx` findes, men bruges endnu ikke i Orderfly-admin. "Indkøbsdashboardet" ligger i Opsfly. Graferne bygges derfor på `ui/chart.tsx` med admin-tokens og uden nye farver.

### A9. Øvrige fund, der påvirker planen

- **Mail:** Orderfly sender mails via Esmeraldas centrale Notification Platform (`src/lib/notifications/platform.ts`) med en lukket liste af `templateKey`. En login-mail kræver en ny skabelon og en udvidet liste i Esmeralda: migration, `orderfly-notification-enqueue` og `_shared/notification-templates.ts`. Det betyder **en parret PR i esmeralda-restaurant-operations**.
- **Rate limiting:** Mønstret er en tæller i Firestore pr. nøgle og dag, som i `gamePlayLimits` i `src/lib/games/play.ts`.
- **Planlagte job:** Der er ingen separat scheduler. Det eksisterende heartbeat (`/api/internal/feedback/send`) kører jobs inden for en tidsfrist.

---

## Del B – Beslutninger (svar fra ejeren, 2026-10-16)

| # | Emne | Beslutning |
|---|---|---|
| 1 | Menu | Ny hovedgruppe **Loyalitet** i sidebaren med **Stempelkort** og **Kundescore**. Kundescoren (tidl. "Loyalty" under Promotions) flyttes ud af Promotions. |
| 2 | Rettighedsnavne | Godkendt (se C3, dog med ét åbent forbehold om oversigtsrettigheden). |
| 3 | Login-mail | Godkendt: ny skabelon `orderfly.stamp_card.login_link` via parret PR i esmeralda-restaurant-operations. |
| 4 | Kanaler | **Parameter pr. brand.** Ved kassen: dine-in og/eller takeaway. Orderfly-ordrer (senere automatik): afhentning og/eller levering. Mindst én kanal skal være valgt, når programmet er aktivt. Wolt, Uber Eats og andre tredjepartskanaler findes ikke som valgmulighed. |
| 5 | QR-token | **B:** tilfældigt token, gemt i databasen som hash, gyldigt i 60 sekunder og til engangsbrug. Der kræves ingen ny hemmelighed. |
| a | Afdeling | Når kortet ikke gælder på tværs, er det bundet til afdelingen for det første stempel. |
| b | Belønning | I fase 1 registreres indløsningen manuelt ved kassen. Typen gemmes til visning, rapporter og senere brug. |
| c | Tenant-filter | Vises kun for platformens superusers. |
| d | Sletning | Kunde og Omnisend-kontakt bevares. Loggen pseudonymiseres. |
| e | Roller | Der oprettes **ingen** roller fra koden. Rollerne i mPanel findes allerede og administreres dynamisk. Leverancen sørger kun for, at modulets rettigheder står i kataloget og vises samlet i mPanel's rolleeditor, så de kan føjes til eksisterende roller eller nye roller. |

### Opfølgende beslutninger

| # | Emne | Beslutning |
|---|---|---|
| 6 | Oversigtsrettighed | Ny `orderfly.stamp_cards:overview`. |
| 7 | Kundescore | **Ren struktur med migration:** `orderfly.loyalty:*` omdøbes til `orderfly.customer_score:*`. Alle eksisterende roller flyttes 1:1, uden at nogen får nye rettigheder. Derefter fjernes `orderfly.loyalty`. Se C3.1. |

---

## Del C – Plan (trin 2)

### C1. Datamodel (Firestore, kun adgang fra serveren)

Alle dokumenter har `brandId` og `companyId` (snapshot til log og rapporter). Hvor relevant har de også `locationId`. Tidspunkter er `Timestamp`, beløb er heltal i øre.

| Collection | Nøgle | Indhold |
|---|---|---|
| `loyaltyPrograms` | `{brandId}` | Aktuelle indstillinger (alle parametre fra §6.1 plus "maks. stempler pr. dag"; kanaler som to lister: `counterChannels ⊆ {dine_in, takeaway}` og `orderTypes ⊆ {pickup, delivery}`), `revision`, `version` (heltal), `termsText`/`termsVersion`, `consentText`/`consentVersion`, `updatedAt`/`updatedBy`. Standard er `active:false`. |
| `loyaltyProgramVersions` | `{brandId}_{version}` | Uforanderligt snapshot pr. gemning. Kort og belønninger refererer til `programVersion`, så ændringer kun gælder fremadrettet. |
| `loyaltyMembers` | tilfældigt id | `customerId`, `name`, `normalizedEmail`, `status` (`active`/`deleted`), `joinedAt`, `consent` (aktuel status og seneste `consentEventId`), `sessionEpoch` (bruges til at tilbagekalde alle sessioner), `currentCardId`. |
| `loyaltyMemberIdentities` | `sha256(brandId\nemail)` | Lås mod dubletter: `memberId`. Oprettes med `tx.create`. |
| `loyaltyCards` | tilfældigt id | `memberId`, `locationId \| null`, `programVersion`, `stampsRequired`, `stamps`, `status` (`active`/`completed`/`expired`), `startedAt`, `lastStampAt`, `expiresAt`. |
| `loyaltyRewards` | tilfældigt id | `memberId`, `cardId`, `programVersion`, snapshot af type, værdi og beskrivelse, `earnedAt`, `expiresAt`, `status` (`available`/`redeemed`/`expired`/`cancelled`), `redeemedAt`/`redeemedBy`/`redeemedLocationId`. |
| `loyaltyEvents` | `sha256(brandId, scope, idempotencyKey)` | **Append-only hændelseslog** med alle felterne fra §10: type, antal, beløb, kanal, kilde (`counter_qr`/`counter_search`/`order`/`portal`/`admin`/`job`), medarbejder (`actorId` plus `actorName`-snapshot), årsag, idempotensnøgle, `requestHash` og `createdAt`. Samme nøgle med andet indhold giver 409. |
| `loyaltyLoginTokens` | `sha256(token)` | `memberId`, `expiresAt` (15 minutter), `usedAt`. Engangsbrug sikres i en transaktion. |
| `loyaltySessions` | `sha256(token)` | `memberId`, `epoch`, `expiresAt` (indstilling, 180 dage), `revokedAt`. HttpOnly-cookie med eget navn, ikke `__session`. |
| `loyaltyQrTokens` | `sha256(token)` | `memberId`, `brandId`, `expiresAt` (60 sekunder), `usedAt`. Ved opslag i kassen markeres tokenet som brugt i samme transaktion. Et nyt token udsteder ikke et nyt, før det forrige er udløbet eller brugt. |
| `loyaltyRateLimits` | `sha256(scope, key, vindue)` | Tæller efter mønstret fra `gamePlayLimits`. |

- **Samtykke** genbruger `marketingConsents`, `marketingOutbox` og `marketingContacts`. `ConsentEvent.source` udvides med `'loyalty'`, og den versionerede tekst kommer fra `loyaltyPrograms`.
- **Indekser** dokumenteres i `docs/loyalty-firestore-indexes.json` efter mønstret fra feedback og games. Eksempler: events på (`brandId`, `createdAt`), (`brandId`, `type`, `createdAt`), (`brandId`, `actorId`, `createdAt`). Cards og rewards på (`status`, `expiresAt`). Members på (`brandId`, `joinedAt`).
- Firestore-reglerne er uændrede: alt fra browseren afvises.

### C2. Forretningsregler (rene funktioner)

`src/lib/loyalty/stamp-card/rules.ts` har ingen I/O og testes direkte:
- Kvalificerende køb: kanalen skal være slået til i brandets indstillinger, og reglerne for minimumsbeløb, rabatflag og maks. stempler pr. dag gælder.
- Kanalerne er lukkede typer. Ved kassen: `dine_in`/`takeaway`. Fra Orderfly: `pickup`/`delivery`. Wolt, Uber Eats og alle andre værdier afvises af zod og kan ikke vælges i indstillingerne.
- Stempling: når kortet fyldes, oprettes en belønning, og et nyt kort startes (også hvis "stempler pr. køb" går ud over det fyldte kort).
- Udløbsfrist for kort: `lastStampAt + gyldighed`. Udløb af belønninger.

`src/lib/loyalty/stamp-card/store.ts` står for transaktionerne: tilmelding, stempling, indløsning, korrektion, udløb og sletning. Hver skrivning bruger `authorizeTransaction` eller en tilsvarende politiklæsning i samme transaktion og skriver en hændelse i `loyaltyEvents`.

### C3. Rettigheder

`FEATURES` får to nye features: `orderfly.stamp_cards` (følger præcedensen med `orderfly.games:redeem`) og `orderfly.customer_score`, som afløser `orderfly.loyalty` (se C3.1).

| Spec | Rettighed | Navn i mPanel |
|---|---|---|
| Loyalitet – se oversigt | `orderfly.stamp_cards:overview` | Stempelkort · Oversigt |
| Stempelkort – kassevisning | `orderfly.stamp_cards:counter` | Stempelkort · Kassevisning |
| Stempelkort – indløs belønning | `orderfly.stamp_cards:redeem` | Stempelkort · Indløs belønning |
| Stempelkort – manuel korrektion | `orderfly.stamp_cards:correct` | Stempelkort · Manuel korrektion |
| Stempelkort – indstillinger | `orderfly.stamp_cards:settings` | Stempelkort · Indstillinger |
| Stempelkort – medlemmer | `orderfly.stamp_cards:members` | Stempelkort · Medlemmer |
| Stempelkort – log | `orderfly.stamp_cards:log` | Stempelkort · Log |
| Kundescore (flyttet) | `orderfly.customer_score:view/create/edit/delete` (tidl. `orderfly.loyalty:*`) | Kundescore · Se/Opret/Redigér/Slet |

**Roller:** Der oprettes ingen roller fra koden. Eksisterende roller ændres kun ved den 1:1-migration, der er beskrevet i C3.1. Stempelkort-rettighederne er ikke tildelt nogen, når de udrulles. En administrator føjer dem til eksisterende eller nye roller i mPanel.

**I mPanel** (parret PR):
- Ny modulgruppe `{id:'loyalty', name:'Loyalitet', features:['orderfly.stamp_cards','orderfly.customer_score'], initial:['orderfly.stamp_cards:overview']}` i `accessModules`.
- Modulet "Orderfly" ejer i dag alt med præfikset `orderfly.`. Det ændres, så Loyalitet-rettighederne ikke vises to gange.
- Danske navne for de nye handlinger. Desuden de manglende navne for `orderfly.games` og `redeem`.
- Bundlen genbygges, så den matcher `generated-ui-parity`.

**Konsekvens for eksisterende roller:** Kundescore-rettigheden vises fremover under Loyalitet som `customer_score` i stedet for under Orderfly. Fravælges Orderfly-modulet på en rolle, fjernes kundescore-rettigheden ikke længere automatisk. `featureNames` får `orderfly.customer_score:'Kundescore'` og `orderfly.stamp_cards:'Stempelkort'`, og `orderfly.loyalty` fjernes.

**Orderfly:** `navigation.ts` får regler for de nye ruter, som ikke ender på `:view`, på samme måde som `/merchant/redeem` har sin egen regel. `selectorCatalog` medtager `orderfly.stamp_cards:*`, så brugere med kun disse rettigheder får brand- og afdelingsvalg.

**Scope:** `counter`, `redeem` og `correct` tjekkes på den afdeling, hvor handlingen sker. `overview`, `settings`, `members` og `log` tjekkes på de brands og afdelinger, filteret viser. Medlemslister og eksport kræver adgang til hele brandet.

### C3.1 Migration af `orderfly.loyalty` → `orderfly.customer_score`

**Problem:** `policySchema` afviser ukendte rettigheder. Hvis `orderfly.loyalty` fjernes fra kataloget, før de gemte roller er migreret, bliver hele politikken ugyldig (`invalid_policy`). Så mister alle adgang til både Orderfly og mPanel. Migrationen skal derfor ske i den rækkefølge, der er beskrevet herunder.

**Release 1 (denne leverance)**
1. **Normalisering ved læsning.** `orderfly.loyalty:<action>` accepteres som et *legacy-alias* i `policySchema`. `requireValid` (`authority.ts`) og `authorizeTransaction` (`scoped-data.ts`) normaliserer det til `orderfly.customer_score:<action>` i hukommelsen, før der tages beslutninger.
   - Fra deploy har eksisterende roller derfor præcis samme adgang under det nye navn.
   - Kataloget (`PERMISSIONS`) og mPanel viser kun det nye navn.
   - Alle skrivninger af politikken gemmer den normaliserede form.
2. **Eksplicit, revideret migration.** En ny kommando i autoriteten, `{action:'migratePermissions', requestId, revision}`, har følgende egenskaber:
   - Den kan kun udføres af en superuser.
   - Den kører i én transaktion og tjekker revision.
   - Den er idempotent: en ny kørsel uden legacy-værdier giver `migrated: 0` uden skrivning.
   - Den omskriver alle roller 1:1.
   - Den skriver en `platformAdminAudit`-række med antallet af ændrede roller og deres ID'er før og efter.
   - Den kan køres som `dryRun:true`, som kun returnerer rapporten.
   - Den udløses af platformens superuser i mPanel ("Migrér rettigheder") eller af en operatør. Work kører den ikke mod produktion.
3. Koden bruger kun `orderfly.customer_score:*`: `navigation.ts`, `mpanel-launch.ts` (`/superadmin/loyalty/score`), sidebaren og kundescorens sider.
   - Kundescorens nuværende adgangsniveau bevares: læsning kræver `view`, og gemning af den globale scoremodel kræver fortsat platformens superuser.

**Release 2 (lille opfølgende PR efter verificeret migration)**
- Aliaset fjernes.
- Forudsætningen er, at en læsning af politikken i produktion efter migrationen viser 0 legacy-værdier. Det verificeres skrivebeskyttet med en dry-run.

**Tests**
- Unit: en politik med legacy-rettigheder giver samme `authorize`-resultat som den migrerede.
- Migration: tom, delvis og fuld migration. Idempotens. Konflikt ved forkert revision. Afvisning ved ikke-superuser. Audit-række skrives.
- Ingen delegationsforøgelse: en company-admin, der kun havde `orderfly.loyalty:view`, kan fortsat kun give `customer_score:view`.
- mPanel: rolleeditoren viser `customer_score` under Loyalitet og ingen "Funktion · Handling".

### C4. API'er

Mønstret følger repoet: zod-validering, `Cache-Control: no-store`, saniterede fejlkoder og rettighedstjek ved hvert kald. Logikken ligger i `src/lib/loyalty/stamp-card/*`, og routes og actions er tynde lag ovenpå.

**Kunde (til fase 2).** Brandet findes ud fra værten eller slug'en og aldrig ud fra et `brandId` sendt af klienten.
- `POST /api/loyalty/signup`: navn, e-mail, samtykke (krævet, versioneret) og accept af vilkår. Svaret er altid neutralt, så det ikke afslører, om e-mailen findes. En eksisterende kunde kobles på uden dublet. Er e-mailen allerede medlem, sendes et login-link.
- `POST /api/loyalty/login-link`: neutralt svar med rate limit pr. e-mail og IP.
- `GET /api/loyalty/verify?token=`: tokenet bruges én gang og har 15 minutters levetid. Kaldet sætter sessionscookien og redirecter.
- `GET /api/loyalty/me`: kort, belønninger, historik (uden medarbejdernavne) og samtykkestatus.
- `GET /api/loyalty/qr`: et tilfældigt token på 256 bit, gemt som hash i `loyaltyQrTokens`, gyldigt i 60 sekunder og til engangsbrug.
- `POST /api/loyalty/consent`: afmelding eller ny tilmelding til nyhedsbrevet. Synkroniseres til Omnisend (`unsubscribed` tilføjes i provideren).
- `POST /api/loyalty/delete` og `POST /api/loyalty/logout`.

**Merchant (til fase 3).** Kræver `verifiedOrderflyIdentity()`, så inaktive medarbejdere afvises ved hvert kald.
- `POST /api/merchant/loyalty/lookup`: `{brandId, locationId, qrToken}` eller `{email}`. Svaret viser maskeret e-mail. Rettighed: `counter`.
- `POST /api/merchant/loyalty/stamp`: `{…, channel, amountOre, discountUsed, idempotencyKey, via: 'qr'|'search'}`. Rettighed: `counter`.
- `POST /api/merchant/loyalty/redeem`: `{rewardId, idempotencyKey}`. Rettighed: `redeem`.
- `POST /api/merchant/loyalty/correct`: tilføj eller fjern stempler, eller annullér en indløsning. Årsag er påkrævet. Rettighed: `correct`.

**Admin** (server actions og queries i `src/app/superadmin/loyalty/**`):
- Hent og gem indstillinger med revisionstjek, validering og en ændringslog med gammel og ny værdi.
- Oversigten: KPI'er og grafer ud fra filtrene.
- Medlemsliste, medlemsdetaljer og log.
- CSV-eksport via `GET /api/superadmin/loyalty/export?kind=members|log`, som kræver `members`/`log`.

**Automatisk stempling fra Orderfly-ordrer:** Den forberedes i datamodellen (kilde `order`, idempotensnøgle `order:{orderId}`, tilbageførsel ved refusion eller annullering), men **aktiveres ikke**. Der er ingen kobling i checkout eller Stripe-webhook i fase 1.

**Job:** `runLoyaltyExpiry(db, deadline)` kører i det eksisterende heartbeat (`/api/internal/feedback/send` og `/api/internal/marketing/sync`). Det udløber kort og belønninger, logger hver hændelse og sletter intet.

**Samtykke tilbagekaldt i Omnisend:** Når marketing-workeren sætter en kontakt til `suppressed`, og kontakten tilhører et medlem, logges `samtykke trukket tilbage`. Medlemskabet bevares.

### C5. Navigation og sider

```
Loyalitet  (ny hovedgruppe i sidebaren, efter Promotions)
 ├─ Oversigt      /superadmin/loyalty                               orderfly.stamp_cards:overview
 ├─ Stempelkort   /superadmin/loyalty/stamp-card?tab=settings|members|log   settings / members / log
 │                /superadmin/loyalty/stamp-card/members/[memberId]          members (korrektion: correct)
 └─ Kundescore    /superadmin/loyalty/score                         orderfly.customer_score:view  (flyttet fra /superadmin/loyalty)
```
- `/superadmin/loyalty` viste tidligere kundescoren. Bogmærker til den gamle side sendes videre til `/superadmin/loyalty/score`, hvis brugeren kun har kundescore-rettighed.
- Punktet "Loyalty" fjernes fra Promotions.

- Sidebaren får en ny gruppe `loyalty` i `allGroups`. Den filtreres med `filterNavigation`, og ruterne kommer i `navigation.ts`. Gruppen skjules i `merchantPortal`, ligesom kundescoren er det i dag.
- **Filterlinjen:** De eksisterende `FiltersBar`/`useSAFilters` udvides med tenant (kun superuser), flere brands, faste perioder (i dag, 7 og 30 dage, denne og sidste måned, valgfri), kanal og medarbejder (kun log og rapporter). Valget gemmes i URL'en og i `sessionStorage`, så det huskes mellem fanerne under Loyalitet.
- **Oversigten:** 8 KPI-kort (`Card`-gitter som på salgsdashboardet), 2 grafer (`ui/chart.tsx`), "Seneste aktivitet" (20 rækker), "Stempler og indløsninger pr. medarbejder", genveje og et statusbanner, der viser om programmet er aktivt eller inaktivt.

### C6. Migrationer og udrulning

- **Ingen datamigration.** Der overføres ikke papirstempler. Programmet starter med `active:false`.
- **Orderfly:** Firestore-indekser. Ingen ny hemmelighed og ingen ændring i reglerne.
- **Orderfly `mpanel-launch.ts`:** Kundescorens startside flyttes til `/superadmin/loyalty/score`, og `orderfly.stamp_cards:overview` → `/superadmin/loyalty` tilføjes.
- **Esmeralda (parret PR):** labels og modulgruppe i mPanel, genbygget bundle samt skabelonen `orderfly.stamp_card.login_link` (migration, enqueue-liste og template-kontrakt).
- **Efter deploy (drift):** Føj de nye rettigheder til eksisterende eller nye roller i mPanel. Udfyld indstillingerne, og slå programmet til. Work skriver ikke i produktionsdata.

### C7. Testpunkter

**Unit-tests** (`node --test tests/unit/loyalty-stamp-card*.cjs`, Firestore i hukommelsen som i de eksisterende tests) dækker alle punkter i spec §12:

| §12 | Test |
|---|---|
| Under minimum, Wolt/Uber, rabatflag begge veje | `rules`: afvisning og accept ved grænserne (99,99 / 100,00 kr.) |
| N'te stempel → belønning og nyt kort; flere stempler pr. køb | `store`: overløb, `programVersion` på kort og belønning |
| Idempotens for stempel og indløsning; dobbelt indløsning | Parallelle og gentagne kald med samme nøgle. Samme nøgle med andet indhold giver 409 |
| Udløb logges | Job med fast tid, nulstilling ved nyt stempel, intet slettes |
| Indstillinger kun fremadrettet | Ændring af N og gyldighed rammer ikke eksisterende kort og belønninger. Ændringslog med gammel og ny værdi |
| Hver rettighed afviser, også ved direkte kald | Hvert API og hver action uden den specifikke rettighed giver 403, og der sker ingen I/O før tjekket |
| Inaktiv medarbejder | Native session afvist eller `principal.active=false` giver 401/403 på merchant-API'erne |
| Tenant- og brandgrænser, korrekte tal | To brands og to companies; filtre og KPI'er på fast testdata |
| Samtykke krævet og logget med version; afmelding bevarer medlemskab; Omnisend begge veje | Tilmelding uden samtykke giver 400. Hændelse i `marketingConsents` med version. Afmelding sendes til Omnisend. Afmelding i Omnisend giver loghændelse |
| Kundematch uden dublet | Eksisterende kunde, alias og samtidig tilmelding |
| Login-link én gang og 15 minutter | Genbrug, udløb, rate limit og neutralt svar |
| Udløbet eller ændret QR-token | Udløbet, ukendt, allerede brugt, andet brand og et ældre screenshot afvises |

**Playwright** (opfanget netværk, ingen produktionsdata, desktop og 390 px): oversigt, indstillinger (validering, gem og genåbn), medlemmer (søg, sortér, CSV), log (filtre) og navigation efter rettighed. `access-navigation.cjs` udvides med de nye ruter.

**Øvrigt:** `npm run typecheck` og `docs:check` i Esmeralda. Esmeraldas egne preflight- og risikoklasseregler gælder (R3 på grund af auth og permissions).

### C8. Små PR'er (trin 3, efter godkendelse)

1. **Rettigheder, migration og regler:** `FEATURES`, legacy-alias og `migratePermissions`, navigation, `mpanel-launch`, `rules.ts` og unit-tests, plus parret mPanel-PR (modulgruppe, labels og migrationsknap).
2. **Datamodel og merchant-backend:** stempel, indløsning, korrektion, opslag, QR-validering og udløbsjob.
3. **Medlemskab:** tilmelding, samtykke, Omnisend begge veje, login-link, session og sletning, plus parret mail-skabelon-PR.
4. **Admin – Stempelkort:** indstillinger, medlemmer, log og CSV.
5. **Admin – Loyalitet:** ny hovedgruppe, oversigt, filterudvidelse og flytning af kundescoren.
6. **Oprydning (release 2):** aliaset `orderfly.loyalty` fjernes efter verificeret migration.

Hver PR opdaterer `docs/` (`firestore-schema.md`, `api-overview.md`, `security-rbac.md`, `FILE-MAP.md` og en ny `docs/stempelkort/README.md` med driftsvejledning).

### C9. Genbrug – samlet

| Behov | Genbruges fra |
|---|---|
| Medarbejderidentitet og inaktiv-tjek | `verifiedOrderflyIdentity`, `orderflySession` (`orderfly-session.ts`, `opsfly-login.ts`) |
| Rettigheder | `policy.ts` `FEATURES`, `requireOrderflyAccess`, `orderflyReadGrants`, `authorizeTransaction`, `mutateScopedDocument`, `navigation.ts` |
| Brand- og afdelingsvalg ved kassen | `merchant/redeem/page.tsx`-mønstret |
| Idempotens og audit | `redeemMerchantGameCode` (deterministisk `tx.create` og `auditLogs`) |
| Kundematch | `findCheckoutCustomer`, `customerIdentityKey`, `normalizeEmail` |
| Samtykke og Omnisend | `marketingConsents`/`Outbox`/`Contacts`, `runMarketingWorker`, `Omnisend`-provider |
| Mail | `NotificationPlatformClient` plus ny skabelon |
| Rate limit | `gamePlayLimits`-mønstret |
| Job | Det eksisterende heartbeat |
| UI | `admin-ui.css`, `ui/*`, `FiltersBar`/`useSAFilters`, `AdminDateRange`, `AdminSelectField`, `Card`-KPI'er, `ui/chart.tsx`, `*-form-page.tsx` og zod |
