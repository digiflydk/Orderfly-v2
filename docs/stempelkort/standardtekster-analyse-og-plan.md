# Standardtekster for samtykke og vilkår – analyse og plan

Status: **Ejeren har besvaret spørgsmålene 2026-10-19 (se B1). Afventer godkendelse af den nye ordlyd i afsnit 8 (B2), før der bygges.** Der er ikke ændret applikationskode.
Grundlag: `main` @ `HEAD` 2026-10-19. Hører til fase 1 (backend og admin) og bruges i fase 2 (kundeportal).

---

## Del A – Analyse

### A1. Hvor brand- og tenantoplysninger ligger i dag

Alle oplysninger til pladsholderne findes allerede på **brand-dokumentet** (`brands/{brandId}`, typen `Brand` i `src/types/index.ts`). De redigeres i Brands → Rediger (`src/components/superadmin/brand-form-page.tsx`, gemmes af `src/app/superadmin/brands/actions.ts`). Tenanten (`company` i `platformAdminControl/access-v1`) har kun `id` og `name` og bruges ikke til juridiske data.

| Pladsholder | Felt i dag | Validering i brandformularen |
|---|---|---|
| `{brand_navn}` | `brand.name` | påkrævet |
| `{virksomhed_navn}` | `brand.companyName` | påkrævet (min. 2 tegn) |
| `{virksomhed_adresse}` | `brand.street`, `zipCode`, `city` (`country`) | påkrævet |
| `{cvr}` | `brand.companyRegNo` | påkrævet, 8 cifre, unik |
| `{kontakt_email}` | `brand.supportEmail` | **valgfri** |
| `{privatlivspolitik_url}` | `brand.privacyUrl` | **valgfri** |

**Der mangler ingen felter.** Der findes allerede et mønster for at bygge sælgeroplysninger ud fra brandet: `buildOrderInvoice` (`src/lib/order-invoice.ts`) bruger `companyName`, `companyRegNo`, adressen (`street`, `zipCode city`, `country`) og `supportEmail`. Adressen bygges der på samme måde.

Fordi `supportEmail` og `privacyUrl` er valgfri, og ældre brands kan mangle andre felter, skal stempelkortet selv tjekke dem ved aktivering og visning (se C4).

Fra stempelkortet (`programSettingsSchema` i `src/lib/loyalty/stamp-card/rules.ts`):

| Pladsholder | Indstilling i dag |
|---|---|
| `{programnavn}` | `name` |
| `{minimumsbeløb}` | `minimumAmountOre` (vises i kr.) |
| `{antal_stempler}` | `stampsRequired` |
| `{belønning}` | `rewardDescription` |
| `{belønning_gyldighed}` | `rewardValidityMonths` |
| `{stempel_gyldighed}` | `cardValidityMonths` |
| `{aldersgrænse}` | **findes ikke**, ny indstilling `minimumAge` (standard 15) |
| `{opbevaring_efter_ophør}` | **findes ikke**. Udgår efter beslutning B1.3. |
| `{#hvis rabat_giver_stempel}` | `discountedOrdersQualify` |
| `{#hvis flere_afdelinger}` | `crossLocation` og mere end én aktiv afdeling i `locations` (`brandId`, `isActive !== false`). `brand.locationsCount` er ikke pålidelig nok, så afdelingerne tælles. |
| `{version}`, `{gældende_fra}` | **findes ikke** som tekstversion. Se A3. |

### A2. Eksisterende skabeloner og pladsholdere

- **Der findes ingen generel pladsholdermotor i Orderfly.**
- **Mails** (ordrebekræftelse, feedback, Spin & Vind og stempelkortets login-mail) sender kun variabler (`variables: { brand_name, program_name, … }`) til Esmeraldas Notification Platform. Selve skabelonerne og deres udfyldning ligger i esmeralda-restaurant-operations. De kan ikke genbruges i Orderfly.
- **Samtykketekst i checkout** (`newsletterConsentText(brandName, version)` i `src/lib/marketing/consent.ts`): en fast, versioneret skabelon i koden. Brandnavnet indsættes, og versionen er en konstant (`checkout-email-da-2026-09-28`). Den viste tekst gemmes ordret i `marketingConsents.wording`. **Det mønster genbruges:** en central, versioneret skabelon i koden med en versionskonstant, og den udfyldte tekst gemmes i samtykkeloggen.
- **Cookietekster** (`/superadmin/settings/cookie-texts`, collection `cookie_texts`): tekster, som platformens superuser redigerer, med en versionskonstant (`APP_VERSION`) i koden. Det er præcedensen, hvis skabelonerne skal kunne redigeres i admin (se spørgsmål 1).
- **Navnekonventionen for variabler** i login-mailen er snake_case (`brand_name`, `program_name`). Spec'ens danske navne (`{brand_navn}` osv.) bruges i skabelonteksten, da den læses af brands.

### A3. Stempelkortets tekster i dag

- `settings.consentText` (maks. 2.000 tegn) og `settings.terms` (maks. 20.000 tegn) er fritekst. Standarden er tom (`defaultProgramSettings`), og et nyt program oprettes først, når indstillingerne gemmes første gang.
- Accept af vilkår er **hardkodet** i `signup-form.tsx`: "Jeg accepterer vilkårene for {program.name}." Det svarer præcis til skabelon 6. Forklaringen under samtykkefeltet (skabelon 5, del 2) findes ikke.
- **Version** er i dag en hash af den rå tekst (`textVersion('consent'|'terms', text)` i `membership.ts`). Tilmeldingen sammenligner hashen fra klienten med serverens for at sikre, at kunden så den aktuelle tekst. Samtykket logges med teksten og hashen i `marketingConsents`, og `member.termsVersion` gemmes.
- `program.version` (heltal) tælles op ved **hver** gemning, også når en tekst ikke er ændret. Det er ikke det samme som spec'ens tekstversion.
- Aktivering kræver i dag kun, at `terms` og `consentText` ikke er tomme (`superRefine`).
- `/club/vilkaar` viser selv overskriften "Vilkår for {program.name}". Skabelonens første linje er den samme overskrift, så den ville stå to gange.

### A4. Fund, der strider mod eller udfordrer opgaven

1. **`{opbevaring_efter_ophør}`** står som en indstilling, men den findes ikke, og platformen sletter ikke medlemsdata automatisk efter ophør. Sletning sker i dag kun på anmodning (`deleteMember`). Vilkårene ville love noget, systemet ikke gør. → spørgsmål 3.
2. **Version og ændrede indstillinger:** Spec'en siger både, at en ændret indstilling slår igennem med det samme, og at hver udgivet ændring af teksten får en ny version. Hvis minimumsbeløbet ændres, ændres den tekst kunden ser, uden at brandet har redigeret selve teksten. → spørgsmål 2.
3. **30 dages varsel:** Opgaven kræver kun en advarsel i admin. Der findes ingen funktion til at varsle medlemmerne, og en gældende-fra-dato i fremtiden understøttes ikke. Planen bygger kun advarslen. → spørgsmål 4.
4. **Rettighed til brandoplysninger:** Mangler fx CVR-nr., skal det rettes under Brands. Det kræver `orderfly.catalog:edit`, ikke `orderfly.stamp_cards:settings`. Admin viser derfor de manglende felter og et link, når brugeren har adgang, og ellers "Kontakt en platformsadministrator".

---

## Del B – Spørgsmål til godkendelse

| # | Spørgsmål | Anbefaling |
|---|---|---|
| 1 | **Hvor vedligeholdes standardskabelonen?** (a) I koden (`templates.ts` med versionskonstant, som checkoutsamtykket). Ændringer sker via PR og review. (b) I Firestore, med en side under Indstillinger for platformens superuser (som cookieteksterne). | **(a)** til fristen 31. oktober. Juridisk tekst bliver reviewet, versionen er entydig, og der skal ikke bygges en ekstra adminside. (b) kan bygges senere uden at ændre brandenes data. |
| 2 | **Hvornår får brandets tekst ny version?** (a) Kun når brandet ændrer skabelonteksten. (b) Hver gang den udfyldte tekst ændres ved en gemning i Stempelkort → Indstillinger, altså også når minimumsbeløb, belønning, gyldighed osv. ændres. | **(b).** "Version X" svarer så altid til de regler, der står i teksten. Ændringer i brandets stamdata (adresse, CVR) giver ikke ny version, men samtykkeloggen gemmer altid den udfyldte tekst, kunden så. |
| 3 | **`{opbevaring_efter_ophør}`:** Skal der laves en ny indstilling og et planlagt job, der sletter (pseudonymiserer) medlemmer N måneder efter ophør? Hvornår er et medlemskab "ophørt"? Og hvad er standarden? | Ny indstilling `retentionMonths` (forslag: 24) og **en separat lille PR med sletningsjobbet** i det eksisterende heartbeat. Ophør = medlemmet har slettet sig, eller der har ikke været aktivitet i N måneder. Uden jobbet bør sætningen ikke stå i vilkårene. |
| 4 | **30 dages varsel:** Er en advarsel i admin nok i denne leverance, eller skal gældende-fra kunne sættes 30 dage frem, og skal medlemmerne have en mail? | Kun advarslen nu (som opgaven siger). Varsling pr. mail kræver en ny mailskabelon i Esmeralda og er en selvstændig opgave. |
| 5 | **E-mailudbyder:** Platformen ved via `ORDERFLY_OMNISEND_BRANDS`, om et brand bruger Omnisend. Skal `{emailudbyder}` indføres? | Nej, behold "vores e-mailudbyder". Navnet ligger i en hemmelighed, og afsnittet er korrekt uden det. |
| 6 | **Eksisterende programmer** med egen fritekst (fx Esmeralda, hvis teksterne allerede er gemt): skal de beholde teksten? | Ja. De markeres "bruger ikke standardteksten" med knappen "Gendan standardtekst". Intet ændres automatisk. |

### B1. Beslutninger (ejeren, 2026-10-19)

| # | Beslutning |
|---|---|
| 1 | Standardskabelonen ligger **i koden**, og alle versioner bevares der. En side med en tabel over versionerne kan vise hver gammel version (se C5a). |
| 2 | **(b)** Brandets tekst får en ny version, hver gang den udfyldte tekst ændres ved en gemning. |
| 3 | **Ingen automatisk sletning nu.** Ophører et medlemskab, deaktiveres medlemmet. `{opbevaring_efter_ophør}` og indstillingen udgår. Sætningen i vilkårenes afsnit 8 omskrives, så den ikke lover en fast slettefrist (B2). |
| 4 | Kun en advarsel i admin om 30 dages varsel. |
| 5 | Admin viser de manglende brandfelter med et link til Brands. Uden adgang står der "Kontakt en platformsadministrator". |
| 6 | Versionssider: **både** en side for platformens superuser over standardskabelonens versioner **og** en fane over brandets udgivne tekstversioner. Begge har "Vis". |

Spørgsmål 5 (e-mailudbyder) og 6 (eksisterende programmer) følger anbefalingen.

### B2. Ny ordlyd i vilkårenes afsnit 8, tredje afsnit (til godkendelse)

Opgavens tekst:

> Vi opbevarer oplysningerne, så længe du er medlem, og sletter dem senest {opbevaring_efter_ophør} måneder efter, at medlemskabet er ophørt, medmindre lovgivningen kræver andet. Du har ret til …

Forslag:

> Vi opbevarer oplysningerne, så længe du er medlem. Lukker vi dit medlemskab eller programmet, bliver medlemskabet deaktiveret. Du kan til enhver tid slette dit medlemskab og dine oplysninger i {programnavn} eller ved at skrive til {kontakt_email}. Når du sletter dit medlemskab, fjerner vi dit navn og din e-mailadresse fra programmet. Hændelser som stempler og indløsninger gemmes uden oplysninger, der kan føre tilbage til dig. Du har ret til indsigt, berigtigelse, sletning, begrænsning, indsigelse og dataportabilitet og kan klage til Datatilsynet. Læs mere i vores privatlivspolitik ({privatlivspolitik_url}).

Det er status `deleted`, når medlemmet sletter sig. I dag findes der ingen funktion i admin til at deaktivere et medlem eller lukke et medlemskab ved misbrug (vilkårenes afsnit 7). Den bygges ikke i denne PR. Sætningen "Lukker vi dit medlemskab …" er derfor et løfte om, hvad der sker, når funktionen findes, eller når programmet slås fra.

Begrundelse: Teksten beskriver præcis det, platformen gør i dag. Sletning i portalen fjerner navn, e-mail og kundekobling, og loggen pseudonymiseres (fase 1, PR 3). Der kommer ingen slettefrist, systemet ikke overholder. Teksten bør gennemlæses juridisk før lancering.

**Bemærk:** "uden oplysninger, der kan føre tilbage til dig" er lidt stærkere end "pseudonymiseret". Loggen beholder medlemmets interne id, men det id kan ikke kobles til en person, når navn og e-mail er fjernet. Vil du være helt præcis, kan der stå "gemmes uden dit navn og din e-mailadresse".

---

## Del C – Plan

### C1. Skabelon og udfyldning (rene funktioner, ingen I/O)

Ny fil `src/lib/loyalty/stamp-card/texts.ts`:

- `TEXT_TEMPLATE_VERSION = 'stamp-card-da-2026-10-19'` og de fire tekster `consentText`, `consentHelp`, `termsAccept` og `terms`, ordret efter opgavens afsnit 5–7. Den eneste afvigelse er afsnit 8 (B2). Overskriften "Vilkår for {programnavn}" er ikke en del af `terms`, fordi siden `/club/vilkaar` allerede viser den.
- `renderText(template, values)`:
  - Pladsholdere `{navn}` og betingelser `{#hvis x}…{/hvis}` og `{#hvis ikke x}…{/hvis}`. Ingen indlejring, ingen kode og ingen HTML. Resultatet vises som ren tekst (`whitespace-pre-line`), som i dag.
  - Returnerer `{ text, missing: string[] }`. Mangler en værdi, kommer pladsholderen i `missing`, og teksten må ikke vises.
  - Linjer, der bliver tomme efter en betingelse, fjernes, så der ikke opstår huller i teksten.
- `parseTemplate(template)`: afviser ukendte pladsholdere, ukendte betingelser og ulukkede `{#hvis}`. Det bruges ved gemning, så en tastefejl som `{cvr_nr}` aldrig når kunden.
- `textValues(brand, settings, locationCount, textMeta)`: bygger værdierne:
  - Adressen bygges med samme funktion som fakturaen. `address()` i `order-invoice.ts` eksporteres og genbruges.
  - Beløb vises i kr. med dansk format (`100` eller `99,50`).
  - Datoer vises med `danishDate` (dansk tid). Funktionen flyttes fra portalens `texts.ts` til `src/lib`, så admin og portal bruger den samme.
  - `{belønning}` får lille forbogstav midt i sætningen, efter den regel der allerede bruges i `nextRewardText` ("Gratis pizza" → "gratis pizza", "VIP-menu" bevares). Reglen flyttes ud i en fælles hjælper.
  - Påkrævet: alle syv brand- og tenantfelter samt `programnavn`, `belønning`, `version` og `gældende_fra`. Talindstillingerne har altid en værdi.
  - `{opbevaring_efter_ophør}` findes ikke (B1.3).
- `TEXT_TEMPLATES` er en liste over **alle** versioner, hver med `version`, `publishedAt`, en kort ændringsnote og de fire tekster. Den nyeste er den aktuelle. En version ændres aldrig, når den er udgivet; en ændring er en ny version. En unit-test låser hashen af hver udgivet version, så en gammel version ikke kan ændres ved en fejl.
- `renderProgramTexts(...)` samler det hele og giver de fire udfyldte tekster, samlet `missing` og en hash af den udfyldte tekst.

### C2. Datamodel (`loyaltyPrograms.settings`, bagudkompatibel)

| Felt | Type | Bemærkning |
|---|---|---|
| `consentText`, `terms` | findes | Indeholder nu skabelontekst med pladsholdere. Maks. længde uændret. |
| `consentHelp` | ny, tekst (maks. 2.000) | Forklaringen under samtykkefeltet (skabelon 5, del 2). Standard `''` ved læsning af ældre versioner. |
| `termsAccept` | ny, tekst (maks. 300) | Teksten ved andet afkrydsningsfelt. Standard ved læsning: "Jeg accepterer vilkårene for {programnavn}.", så ældre programmer viser det samme som i dag. |
| `minimumAge` | nyt tal (13–99), standard 15 | `{aldersgrænse}` |
| `templateVersion` | `string \| null` | Den standardskabelon, teksterne er kopieret fra. `null` = egen tekst. |
| `textVersion` | heltal ≥ 0 | `{version}`. Tælles op, når den udfyldte tekst ændres ved en gemning (spørgsmål 2). |
| `textEffectiveFrom` | epoch ms \| null | `{gældende_fra}`. Sættes til gemmetidspunktet ved ny `textVersion`. |

- Felterne får `.default(...)` i zod, som `counterIdleMinutes` fik i fase 3, så gemte versioner stadig kan læses. Ingen datamigration.
- `loyaltyProgramVersions` gemmer som i dag et uforanderligt snapshot pr. gemning, nu også med de nye felter. Ændringsloggen (`settings_changed`) viser automatisk gammel og ny værdi for teksterne.

### C3. Oprettelse, redigering og "Gendan standardtekst"

- `readSettings` for et brand uden program (version 0) udfylder de fire tekster med `TEXT_TEMPLATES` og sætter `templateVersion` til den aktuelle. Det følger det eksisterende mønster, hvor programnavnet fyldes ud fra brandnavnet. Når indstillingerne gemmes første gang, er kopien brandets egen.
- Kortet **Tekster** i `settings-form.tsx` får fire tekstfelter (samtykke, forklaring, accept af vilkår og vilkår), en liste over tilladte pladsholdere og knappen **Gendan standardtekst** med en bekræftelse (`alert-dialog`). Knappen sætter felterne i formularen til den aktuelle skabelon. Der gemmes først, når brugeren trykker "Gem indstillinger", så det følger samme validering, versionstjek og log.
- `templateVersion` sættes til `null`, når brugeren selv ændrer en tekst, og til den aktuelle version ved gendannelse. Det afgøres på serveren ved at sammenligne med skabelonen.
- **Ny standardversion:** Er `templateVersion` ældre end `TEXT_TEMPLATE_VERSION`, viser kortet en besked: "Der er en ny version af standardteksten. Dine tekster er ikke ændret." med knappen "Gendan standardtekst". Programmer med `null` får en neutral oplysning.
- Kun brugere med `orderfly.stamp_cards:settings` for hele brandet. Det er det eksisterende tjek i `readSettings` og `saveSettings`.

### C4. Validering og aktivering

- **Ved hver gemning** (også et inaktivt program) afviser serveren skabeloner, som `parseTemplate` ikke godtager, med fejl på feltet.
- **Ved aktivering**, og når et aktivt program gemmes, renderes teksterne på serveren i transaktionen med brandets data og antallet af afdelinger. Mangler noget, afvises gemningen med `texts_incomplete` og en liste over de manglende felter. Det gælder både `saveSettings` og `setProgramActive`.
- Admin viser altid (også mens programmet er inaktivt) en boks med **manglende oplysninger**, fx "CVR-nr. mangler under Brands". Den linker til brandets redigeringsside, når brugeren har `orderfly.catalog:edit`, og skriver ellers "Kontakt en platformsadministrator". Aktivér-knappen i oversigten giver den samme besked.
- **Kunden ser aldrig en uudfyldt pladsholder:** Bliver et brandfelt slettet senere, mens programmet er aktivt, kan `programForPortal` ikke rendere teksten. Så behandles programmet som lukket for nye tilmeldinger (den eksisterende "klubben er ikke åben"-visning). Eksisterende medlemmer ser fortsat deres kort. Hændelsen logges med `console.error`, ligesom andre konfigurationsfejl.

### C5. Forhåndsvisning

- Kortet Tekster får fanen **Forhåndsvisning**, som viser tilmeldingsfelterne og vilkårene, som kunden ser dem.
- Den bruger **samme** `renderProgramTexts` som portalen, på de værdier der står i formularen. Brandets data og antallet af afdelinger sendes med fra `readSettings`. Manglende værdier vises som markerede felter i forhåndsvisningen (kun i admin) med en forklaring.
- Testen sammenligner forhåndsvisningen med portalens HTML for de samme data.

### C5a. Versionssider (B1.6)

**Standardskabelonens versioner** (`/superadmin/settings/stamp-card-texts`, kun platformens superuser via `requirePlatformSuperuser`, som cookieteksterne):
- En tabel (`ui/table`) med version, udgivet, ændringsnote, status (Aktuel/Tidligere) og antal brands, der bruger versionen (`templateVersion` på `loyaltyPrograms`).
- "Vis" åbner versionen (`…/stamp-card-texts/{version}`) med de fire tekster og pladsholderne fremhævet. Siden er skrivebeskyttet, fordi skabelonen ligger i koden.
- Menupunktet ligger under Indstillinger ved siden af Cookie-tekster.

**Brandets tekstversioner** (ny fane **Tekstversioner** under Stempelkort, `orderfly.stamp_cards:settings` for hele brandet):
- En tabel med version, gældende fra, udgivet af, standardskabelonen versionen bygger på (eller "Egen tekst") og antal medlemmer, der er tilmeldt på versionen.
- "Vis" åbner præcis den udfyldte tekst, kunden så: samtykke, forklaring, accept og vilkår.
- Kilden er den nye collection `loyaltyTextVersions/{brandId}_{textVersion}`. Den oprettes uforanderligt (`tx.create`) i samme transaktion som gemningen, når `textVersion` tælles op. Den indeholder de udfyldte tekster, hashen af dem, den rå skabelontekst, `templateVersion`, `effectiveFrom` og hvem der udgav den.
- Ændres brandets stamdata efter udgivelsen (fx adressen), afviger den udfyldte tekst fra snapshottet. Ved tilmelding gemmes den tekst, kunden faktisk så, derfor også i `loyaltyRenderedTexts/{hash}` (oprettes kun, hvis den ikke findes). Visningen viser snapshottet og en note, når medlemmer har set en variant med andre stamdata.
- Læsning tjekker brandet med `requireBrand`. Dokumenter fra et andet brand afvises med 404.

### C6. Kundeportal og samtykkelog (fase 2-filer)

- `programForPortal` og `memberView` returnerer de **udfyldte** tekster: `consentText`, `consentHelp`, `termsAccept`, `terms`, samt `textVersion` og `textEffectiveFrom`.
- `consentVersion` og `termsVersion` bliver en hash af den **udfyldte** tekst (`textVersion('consent', rendered)`). Den eksisterende kontrol "kunden så den aktuelle tekst" i `signup` og `setNewsletterConsent` dækker dermed også ændrede indstillinger og brandoplysninger. Ændres noget, mens kunden står på siden, får kunden `program_changed` og skal sætte flueben igen (det findes allerede).
- Samtykkeloggen (`marketingConsents.wording`) gemmer den udfyldte samtykketekst, som i dag. Nyt: medlemmet og `member_joined`-hændelsen får `textVersion` (tallet) og `textHash`. Hashen peger på `loyaltyRenderedTexts/{hash}` (C5a), som indeholder alle fire udfyldte tekster. Den viste tekst kan derfor altid genskabes ordret, også hvis brandets stamdata ændres senere. Den lange vilkårstekst gemmes én gang pr. variant og ikke pr. medlem.
- `signup-form.tsx`: accept-teksten og forklaringen kommer fra programmet. Den hardkodede tekst fjernes. Ordet "vilkårene" i accept-teksten bliver et link til `/club/vilkaar`.
- `/club/vilkaar` viser de udfyldte vilkår. Linjen "Version {version}, gældende fra {gældende_fra}" er en del af skabelonen.

### C7. Advarsel om 30 dages varsel

- Når et **aktivt** program gemmes med en ændret vilkårstekst, viser formularen før gemning en bekræftelse: "Væsentlige ændringer af vilkårene kræver 30 dages varsel til medlemmerne (vilkårenes afsnit 10). Nye medlemmer ser den nye tekst med det samme." Ændringen gemmes først, når brugeren bekræfter.
- Det samme gælder, når en indstilling, der indgår i vilkårene, ændres (minimumsbeløb, antal stempler, belønning, gyldighed, rabatflaget, afdelinger og aldersgrænse).

### C8. Tenant- og brandgrænser

- Brandoplysningerne læses altid ud fra det `brandId`, der allerede er autoriseret (`requireBrand` i admin, slug i portalen). Klienten sender aldrig brandoplysninger, og de udfyldte tekster bygges på serveren.
- Forhåndsvisningen får kun brandets egne oplysninger. Test: en admin for brand A kan ikke hente tekster eller brandoplysninger for brand B (403), og portalen for brand A viser aldrig brand B's værdier.

### C9. Test (`node --test tests/unit/…`)

| Accept (afsnit 4) | Test |
|---|---|
| Nyt stempelkort får standardteksterne | `readSettings` for version 0 giver skabelonerne. Første gemning gemmer dem med `templateVersion`. |
| Ændret minimumsbeløb vises straks | Gem 100 → 150 kr. Portalens vilkår viser "150 kr.", og `textVersion` er talt op. |
| Betingede afsnit | Rabatflag til/fra. `crossLocation` til/fra × 1 eller 2 aktive afdelinger. Ingen tomme linjer. |
| Kan ikke aktiveres med manglende felter | Hvert af de syv brandfelter mangler i tur og orden og giver `texts_incomplete` med feltnavnet, i både `saveSettings` og `setProgramActive`. |
| Kunden ser aldrig en uudfyldt pladsholder | Ukendt pladsholder afvises ved gemning. Brandfelt slettet efter aktivering lukker tilmeldingen. Portal-HTML indeholder aldrig `{`. |
| Forhåndsvisning = kundens visning | Samme input giver samme tekst i admin og portal (unit og browser). |
| Ny version og logget samtykke | `textVersion` og `textEffectiveFrom` ved tekstændring. Tilmelding logger den udfyldte tekst og versionen. Gammel hash giver `program_changed`. |
| Versionssider | Superuser-siden viser alle skabelonversioner og afviser andre end superusers. Brandets fane viser udgivne versioner med "Vis" af den udfyldte tekst. Et snapshot ændres aldrig. Hashen af hver udgivet skabelonversion er låst i en test. |
| "Gendan standardtekst" | Ændret tekst → gendan → gem giver skabelonen og `templateVersion`. Besked ved ældre skabelonversion. |
| Ingen data på tværs af brands | Se C8. |

Desuden: de eksisterende tests `loyalty-stamp-card-*.cjs`, `loyalty-portal-pages.cjs` og `loyalty-portal-browser.cjs` opdateres (tilmelding viser forklaring og linket accept-tekst). Browser-testen af admin udvides med forhåndsvisning, manglende felter og bekræftelsen ved 30 dages varsel. `npm run typecheck`.

### C10. PR

Én afgrænset PR med C1–C9 og C5a. Docs: `docs/stempelkort/README.md`, `docs/firestore-schema.md` (nye felter og collections), `docs/api-overview.md` og denne plan. Der kommer ingen PR med et sletningsjob (B1.3).

Ingen hemmeligheder, Firestore-regler, indekser eller produktionsdata ændres. De nye collections læses og skrives kun fra serveren, og opslag sker på dokument-id, så der skal ikke bruges nye indekser. Optællingen af medlemmer pr. tekstversion bruger `count()` på (`brandId`, `textVersion`). Viser den sig at kræve et sammensat indeks, tilføjes det i `docs/loyalty-firestore-indexes.json`.
