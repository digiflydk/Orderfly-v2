# Standardtekster for samtykke og vilkår – analyse og plan

Status: **Afventer godkendelse.** Der er ikke ændret applikationskode.
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
| `{opbevaring_efter_ophør}` | **findes ikke**, ny indstilling `retentionMonths` (se spørgsmål 3) |
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

---

## Del C – Plan

### C1. Skabelon og udfyldning (rene funktioner, ingen I/O)

Ny fil `src/lib/loyalty/stamp-card/texts.ts`:

- `TEXT_TEMPLATE_VERSION = 'stamp-card-da-2026-10-19'` og `TEXT_TEMPLATES = { consentText, consentHelp, termsAccept, terms }`, ordret efter opgavens afsnit 5–7. Overskriften "Vilkår for {programnavn}" er ikke en del af `terms`, fordi siden `/club/vilkaar` allerede viser den.
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
- `renderProgramTexts(...)` samler det hele og giver de fire udfyldte tekster, samlet `missing` og en hash af den udfyldte tekst.

### C2. Datamodel (`loyaltyPrograms.settings`, bagudkompatibel)

| Felt | Type | Bemærkning |
|---|---|---|
| `consentText`, `terms` | findes | Indeholder nu skabelontekst med pladsholdere. Maks. længde uændret. |
| `consentHelp` | ny, tekst (maks. 2.000) | Forklaringen under samtykkefeltet (skabelon 5, del 2). Standard `''` ved læsning af ældre versioner. |
| `termsAccept` | ny, tekst (maks. 300) | Teksten ved andet afkrydsningsfelt. Standard ved læsning: "Jeg accepterer vilkårene for {programnavn}.", så ældre programmer viser det samme som i dag. |
| `minimumAge` | nyt tal (13–99), standard 15 | `{aldersgrænse}` |
| `retentionMonths` | nyt tal (1–120) | Kun hvis spørgsmål 3 godkendes. |
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

### C6. Kundeportal og samtykkelog (fase 2-filer)

- `programForPortal` og `memberView` returnerer de **udfyldte** tekster: `consentText`, `consentHelp`, `termsAccept`, `terms`, samt `textVersion` og `textEffectiveFrom`.
- `consentVersion` og `termsVersion` bliver en hash af den **udfyldte** tekst (`textVersion('consent', rendered)`). Den eksisterende kontrol "kunden så den aktuelle tekst" i `signup` og `setNewsletterConsent` dækker dermed også ændrede indstillinger og brandoplysninger. Ændres noget, mens kunden står på siden, får kunden `program_changed` og skal sætte flueben igen (det findes allerede).
- Samtykkeloggen (`marketingConsents.wording`) gemmer den udfyldte samtykketekst, som i dag. Nyt: medlemmet og `member_joined`-hændelsen får `termsTextVersion` (tallet), `termsHash` og en reference til `loyaltyProgramVersions/{brandId}_{version}`, så den viste vilkårstekst kan genskabes præcis. Den udfyldte vilkårstekst gemmes ikke pr. medlem, fordi den er op til 20.000 tegn. Den kan genskabes fra versionssnapshottet og brandets data, og hashen beviser, at det er den samme tekst. **Alternativ:** gem hele den udfyldte vilkårstekst pr. tekstversion i et nyt uforanderligt dokument `loyaltyTermsTexts/{hash}`. Det er mere robust, hvis brandets stamdata ændres senere. Jeg anbefaler alternativet.
- `signup-form.tsx`: accept-teksten og forklaringen kommer fra programmet. Den hardkodede tekst fjernes. Ordet "vilkårene" i accept-teksten bliver et link til `/club/vilkaar`.
- `/club/vilkaar` viser de udfyldte vilkår. Linjen "Version {version}, gældende fra {gældende_fra}" er en del af skabelonen.

### C7. Advarsel om 30 dages varsel

- Når et **aktivt** program gemmes med en ændret vilkårstekst, viser formularen før gemning en bekræftelse: "Væsentlige ændringer af vilkårene kræver 30 dages varsel til medlemmerne (vilkårenes afsnit 10). Nye medlemmer ser den nye tekst med det samme." Ændringen gemmes først, når brugeren bekræfter.
- Det samme gælder, når en indstilling, der indgår i vilkårene, ændres (minimumsbeløb, antal stempler, belønning, gyldighed, rabatflaget, afdelinger, aldersgrænse og opbevaring).

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
| "Gendan standardtekst" | Ændret tekst → gendan → gem giver skabelonen og `templateVersion`. Besked ved ældre skabelonversion. |
| Ingen data på tværs af brands | Se C8. |

Desuden: de eksisterende tests `loyalty-stamp-card-*.cjs`, `loyalty-portal-pages.cjs` og `loyalty-portal-browser.cjs` opdateres (tilmelding viser forklaring og linket accept-tekst). Browser-testen af admin udvides med forhåndsvisning, manglende felter og bekræftelsen ved 30 dages varsel. `npm run typecheck`.

### C10. PR'er

1. **Standardtekster** (denne opgave): C1–C9 i én afgrænset PR. Docs: `docs/stempelkort/README.md`, `docs/firestore-schema.md` (nye felter) og denne plan.
2. **Opbevaring efter ophør** (kun hvis spørgsmål 3 godkendes): indstilling og sletningsjob i heartbeat i en separat PR. Indtil den er merget, indeholder skabelonen ikke afsnittet med `{opbevaring_efter_ophør}`. Jeg foreslår i stedet "sletter dem, når medlemskabet ophører, medmindre lovgivningen kræver andet", eller at sætningen venter.

Ingen hemmeligheder, Firestore-regler, indekser eller produktionsdata ændres.
