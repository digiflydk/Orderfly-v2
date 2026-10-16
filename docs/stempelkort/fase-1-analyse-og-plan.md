# Fase 1 – Stempelkort: analyse (trin 1) og plan (trin 2)

Status: **Forslag. Afventer godkendelse.** Der er ikke ændret applikationskode.
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

## Del B – Uoverensstemmelser og åbne spørgsmål (kræver svar før byg)

1. **Eksisterende "Loyalty".** `/superadmin/loyalty` ligger allerede under Promotions og viser den interne kundescore (`orderfly.loyalty:*`, #54). Spec'en vil have "Loyalitet" som stempelkortets oversigt.
   **Forslag:** `/superadmin/loyalty` bliver den nye oversigt. Kundescoren flyttes til `/superadmin/customers/score` under Customers og beholder sin nuværende rettighed. Alternativt kan scoren blive en fane under Loyalitet.
2. **Rettighedsnavne.** Se forslaget i B2 nedenfor.
3. **Login-mail.** Den kræver en ny skabelon (`orderfly.loyalty.login_link`) i Esmeraldas Notification Platform og dermed en parret PR i `esmeralda-restaurant-operations`. Er det i orden? Alternativet, Firebase Auth e-mail-link, kan ikke følge brandets design og er ikke det eksisterende mailmønster.
4. **Orderflys egne leveringsordrer (`Delivery`).** Spec'en nævner kun dine-in og takeaway.
   **Forslag:** Ved den senere automatiske stempling er det kun `Pickup` (takeaway), der kvalificerer. `Delivery` giver ikke stempel, før andet besluttes.
5. **Ny serverhemmelighed `LOYALTY_TOKEN_SECRET`.** Den bruges til at signere QR-tokens og skal oprettes i App Hosting af en operatør. Work må ikke selv ændre hemmeligheder.
   **Alternativ:** afled nøglen fra `MPANEL_PLATFORM_ADMIN_SECRET` med domæneseparation, som `opsfly-login.ts` gør. Det anbefales ikke.

**Antagelser, hvis du ikke siger andet:**
- **a.** Når "Gælder på tværs af afdelinger" er slået fra, er kortet bundet til den afdeling, hvor det første stempel blev givet. Belønningen kan kun indløses dér.
- **b.** I fase 1 er belønningstypen data til visning, rapportering og senere brug i webshoppen. Selve indløsningen registreres manuelt ved kassen uden kobling til kasseapparatet.
- **c.** Filteret "Kunde (tenant)" vises kun for platformens superusers.
- **d.** Sletning fjerner medlemskab, kort, belønninger og sessioner. Kunden i `customers` og Omnisend-kontakten bevares, fordi de ikke er en del af programmet. Loggen pseudonymiseres: medlems-ID'et erstattes af en tilfældig nøgle, og navn og e-mail fjernes.
- **e.** Standardrollerne Medarbejder, Leder og Admin oprettes i mPanel af en administrator efter deploy. Der skrives ikke i produktionsdata fra koden.

---

## Del C – Plan (trin 2)

### C1. Datamodel (Firestore, kun adgang fra serveren)

Alle dokumenter har `brandId` og `companyId` (snapshot til log og rapporter). Hvor relevant har de også `locationId`. Tidspunkter er `Timestamp`, beløb er heltal i øre.

| Collection | Nøgle | Indhold |
|---|---|---|
| `loyaltyPrograms` | `{brandId}` | Aktuelle indstillinger (alle parametre fra §6.1 plus "maks. stempler pr. dag"), `revision`, `version` (heltal), `termsText`/`termsVersion`, `consentText`/`consentVersion`, `updatedAt`/`updatedBy`. Standard er `active:false`. |
| `loyaltyProgramVersions` | `{brandId}_{version}` | Uforanderligt snapshot pr. gemning. Kort og belønninger refererer til `programVersion`, så ændringer kun gælder fremadrettet. |
| `loyaltyMembers` | tilfældigt id | `customerId`, `name`, `normalizedEmail`, `status` (`active`/`deleted`), `joinedAt`, `consent` (aktuel status og seneste `consentEventId`), `sessionEpoch` (bruges til at tilbagekalde alle sessioner), `currentCardId`. |
| `loyaltyMemberIdentities` | `sha256(brandId\nemail)` | Lås mod dubletter: `memberId`. Oprettes med `tx.create`. |
| `loyaltyCards` | tilfældigt id | `memberId`, `locationId \| null`, `programVersion`, `stampsRequired`, `stamps`, `status` (`active`/`completed`/`expired`), `startedAt`, `lastStampAt`, `expiresAt`. |
| `loyaltyRewards` | tilfældigt id | `memberId`, `cardId`, `programVersion`, snapshot af type, værdi og beskrivelse, `earnedAt`, `expiresAt`, `status` (`available`/`redeemed`/`expired`/`cancelled`), `redeemedAt`/`redeemedBy`/`redeemedLocationId`. |
| `loyaltyEvents` | `sha256(brandId, scope, idempotencyKey)` | **Append-only hændelseslog** med alle felterne fra §10: type, antal, beløb, kanal, kilde (`counter_qr`/`counter_search`/`order`/`portal`/`admin`/`job`), medarbejder (`actorId` plus `actorName`-snapshot), årsag, idempotensnøgle, `requestHash` og `createdAt`. Samme nøgle med andet indhold giver 409. |
| `loyaltyLoginTokens` | `sha256(token)` | `memberId`, `expiresAt` (15 minutter), `usedAt`. Engangsbrug sikres i en transaktion. |
| `loyaltySessions` | `sha256(token)` | `memberId`, `epoch`, `expiresAt` (indstilling, 180 dage), `revokedAt`. HttpOnly-cookie med eget navn, ikke `__session`. |
| `loyaltyRateLimits` | `sha256(scope, key, vindue)` | Tæller efter mønstret fra `gamePlayLimits`. |

- **Samtykke** genbruger `marketingConsents`, `marketingOutbox` og `marketingContacts`. `ConsentEvent.source` udvides med `'loyalty'`, og den versionerede tekst kommer fra `loyaltyPrograms`.
- **Indekser** dokumenteres i `docs/loyalty-firestore-indexes.json` efter mønstret fra feedback og games. Eksempler: events på (`brandId`, `createdAt`), (`brandId`, `type`, `createdAt`), (`brandId`, `actorId`, `createdAt`). Cards og rewards på (`status`, `expiresAt`). Members på (`brandId`, `joinedAt`).
- Firestore-reglerne er uændrede: alt fra browseren afvises.

### C2. Forretningsregler (rene funktioner)

`src/lib/loyalty/stamp-card/rules.ts` har ingen I/O og testes direkte:
- Kvalificerende køb: kanal, minimumsbeløb, rabatflag og maks. stempler pr. dag.
- Wolt, Uber Eats og alle andre ikke-tilladte kanaler afvises altid på typeniveau og med zod. Kanalerne er udelukkende `dine_in` og `takeaway`.
- Stempling: når kortet fyldes, oprettes en belønning, og et nyt kort startes (også hvis "stempler pr. køb" går ud over det fyldte kort).
- Udløbsfrist for kort: `lastStampAt + gyldighed`. Udløb af belønninger.

`src/lib/loyalty/stamp-card/store.ts` står for transaktionerne: tilmelding, stempling, indløsning, korrektion, udløb og sletning. Hver skrivning bruger `authorizeTransaction` eller en tilsvarende politiklæsning i samme transaktion og skriver en hændelse i `loyaltyEvents`.

### C3. Rettigheder (forslag, kræver godkendelse)

Den eksisterende `orderfly.loyalty` genbruges, og der tilføjes én ny feature, `orderfly.stamp_cards`, med handlinger, der svarer 1:1 til spec §9. Det følger præcedensen med `orderfly.games:redeem`.

| Spec | Rettighed | Navn i mPanel |
|---|---|---|
| Loyalitet – se oversigt | `orderfly.loyalty:view` (findes) | Loyalitet · Se |
| Stempelkort – kassevisning | `orderfly.stamp_cards:counter` | Stempelkort · Kassevisning |
| Stempelkort – indløs belønning | `orderfly.stamp_cards:redeem` | Stempelkort · Indløs belønning |
| Stempelkort – manuel korrektion | `orderfly.stamp_cards:correct` | Stempelkort · Manuel korrektion |
| Stempelkort – indstillinger | `orderfly.stamp_cards:settings` | Stempelkort · Indstillinger |
| Stempelkort – medlemmer | `orderfly.stamp_cards:members` | Stempelkort · Medlemmer |
| Stempelkort – log | `orderfly.stamp_cards:log` | Stempelkort · Log |

- Hvis spørgsmål 1 besluttes som foreslået, ændres den interne kundescores rettighed ikke. Den beholder `orderfly.loyalty:*` og flytter kun rute.
- `navigation.ts` får regler for de nye ruter, som ikke ender på `:view`, på samme måde som `/merchant/redeem` har sin egen regel.
- mPanel får en ny modulgruppe "Loyalitet" i `accessModules`, navne for `orderfly.games` og de nye handlinger, og bundlen genbygges.
- **Scope:** `counter`, `redeem` og `correct` tjekkes på den afdeling, hvor handlingen sker. `settings`, `members` og `log` kræver adgang til hele brandet. Medlemsdata er persondata, ligesom fulde kundeposter kræver adgang til hele virksomheden i dag.

### C4. API'er

Mønstret følger repoet: zod-validering, `Cache-Control: no-store`, saniterede fejlkoder og rettighedstjek ved hvert kald. Logikken ligger i `src/lib/loyalty/stamp-card/*`, og routes og actions er tynde lag ovenpå.

**Kunde (til fase 2).** Brandet findes ud fra værten eller slug'en og aldrig ud fra et `brandId` sendt af klienten.
- `POST /api/loyalty/signup`: navn, e-mail, samtykke (krævet, versioneret) og accept af vilkår. Svaret er altid neutralt, så det ikke afslører, om e-mailen findes. En eksisterende kunde kobles på uden dublet. Er e-mailen allerede medlem, sendes et login-link.
- `POST /api/loyalty/login-link`: neutralt svar med rate limit pr. e-mail og IP.
- `GET /api/loyalty/verify?token=`: tokenet bruges én gang og har 15 minutters levetid. Kaldet sætter sessionscookien og redirecter.
- `GET /api/loyalty/me`: kort, belønninger, historik (uden medarbejdernavne) og samtykkestatus.
- `GET /api/loyalty/qr`: et signeret token, der lever 60 sekunder (`v1.brandId.memberId.exp.nonce.HMAC`).
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
Promotions
 ├─ (eksisterende punkter)
 └─ Loyalitet                         /superadmin/loyalty                    orderfly.loyalty:view
     └─ Stempelkort                   /superadmin/loyalty/stamp-card         fanerne vises efter rettighed:
          ?tab=settings | members | log                                      settings / members / log
          /superadmin/loyalty/stamp-card/members/[memberId]                  members (korrektion: correct)
```

- Sidebaren bruger den eksisterende `children`-struktur og `filterNavigation`. Indløs kode og Loyalitet følger samme regler for `merchantPortal` som i dag.
- **Filterlinjen:** De eksisterende `FiltersBar`/`useSAFilters` udvides med tenant (kun superuser), flere brands, faste perioder (i dag, 7 og 30 dage, denne og sidste måned, valgfri), kanal og medarbejder (kun log og rapporter). Valget gemmes i URL'en og i `sessionStorage`, så det huskes mellem fanerne under Loyalitet.
- **Oversigten:** 8 KPI-kort (`Card`-gitter som på salgsdashboardet), 2 grafer (`ui/chart.tsx`), "Seneste aktivitet" (20 rækker), "Stempler og indløsninger pr. medarbejder", genveje og et statusbanner, der viser om programmet er aktivt eller inaktivt.

### C6. Migrationer og udrulning

- **Ingen datamigration.** Der overføres ikke papirstempler. Programmet starter med `active:false`.
- **Orderfly:** Firestore-indekser og App Hosting-hemmeligheden `LOYALTY_TOKEN_SECRET` (operatøropgave, se spørgsmål 5). Ingen ændring i reglerne.
- **Esmeralda (parret PR):** labels og modulgruppe i mPanel, genbygget bundle samt skabelonen `orderfly.loyalty.login_link` (migration, enqueue-liste og template-kontrakt).
- **Efter deploy (drift):** opret rollerne i mPanel, udfyld indstillingerne, og slå programmet til. Work skriver ikke i produktionsdata.

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
| Udløbet eller ændret QR-token | Udløbet, forkert signatur, andet brand og et ældre screenshot afvises |

**Playwright** (opfanget netværk, ingen produktionsdata, desktop og 390 px): oversigt, indstillinger (validering, gem og genåbn), medlemmer (søg, sortér, CSV), log (filtre) og navigation efter rettighed. `access-navigation.cjs` udvides med de nye ruter.

**Øvrigt:** `npm run typecheck` og `docs:check` i Esmeralda. Esmeraldas egne preflight- og risikoklasseregler gælder (R3 på grund af auth og permissions).

### C8. Små PR'er (trin 3, efter godkendelse)

1. **Rettigheder og regler:** `FEATURES`, navigation, `rules.ts` og unit-tests, plus parret mPanel-labels-PR.
2. **Datamodel og merchant-backend:** stempel, indløsning, korrektion, opslag, QR-validering og udløbsjob.
3. **Medlemskab:** tilmelding, samtykke, Omnisend begge veje, login-link, session og sletning, plus parret mail-skabelon-PR.
4. **Admin – Stempelkort:** indstillinger, medlemmer, log og CSV.
5. **Admin – Loyalitet:** oversigt, filterudvidelse og evt. flytning af kundescoren (spørgsmål 1).

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
