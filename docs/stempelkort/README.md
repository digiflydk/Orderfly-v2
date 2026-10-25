# Stempelkort (Esmeralda Club)

## Personlige rabatkort (#566)

Rabatkort er en separat fordel i den eksisterende Club. Første version administreres
kun af platformens superadmin under **Loyalitet → Rabatkort**. Funktionen er som
standard slået fra og aktiveres pr. brand for udvalgte eller alle brandets lokationer.
En kunde får en administratortildelt gruppe med fast procent ved kvalificerende
Orderfly-køb. Eksisterende stempler og belønninger bevares; rabatten er ikke den
eksisterende engangsrabat ved Club-tilmelding.

- [Datakontrakt og adgangskontrol](discount-card-contract.md)
- [Superadmin og invitation](discount-card-admin.md)
- [Kundekort og QR](discount-card-portal.md)
- [Acceptkriterier og releasebevis](discount-card-qa.md)

GitHub #566 og delopgaverne er autoritative for aktuel release-/acceptstatus.
Denne dokumentation er ikke i sig selv bevis for deployment eller aktivering.

## Esmeraldas hjemmesidedesign på club-siderne (#386)

Esmeraldas eksisterende kundeportal tilpasses direkte i Orderfly. Den flyttes ikke til Webflow, så login, host-only sessionscookie og versioneret samtykke fortsat bruger de eksisterende sider og API'er.

- Reference: den publicerede `https://www.esmeraldapizza.dk/bordbooking`, inspiceret 2026-10-21. Hvidt logo på sort navigation, Bourton/Brandon, mørk formularflade, gyldne knapper og hjemmesidens navigationslinks/footer.
- `src/app/[brandSlug]/club/portal-frame.tsx` viser Esmeraldas fulde ramme, en formularflade og en informationskolonne. Kortet efter login beholder en smallere visning. Antal stempler og belønningstekst kommer fra programmet.
- `esmeralda-club.css` afgrænser designet til Esmeraldas portal og footer. Andre brands beholder den kompakte portalramme. Webshoppen og admin får ikke club-styles.
- Navigation til hjemmesiden bruger absolutte `esmeraldapizza.dk`-links. Interne club-links bruger den eksisterende `portalBase`, så sessionen bliver på samme host. På mobil bruges en tastaturbetjenelig menu uden nyt script eller tracking.
- `BrandLayoutClient` vælger Esmeralda-footeren kun på Esmeraldas club-stier. Cookieindstillinger åbner stadig det eksisterende samtykkepanel. Der vises fortsat kun én `main`.
- Formularernes validering, login-token, afkrydsninger, samtykkeversioner, fejlbeskeder og neutrale svar ændres ikke.

Verifikation: portalens browser-fixture renderer den faktiske ramme og de eksisterende formularer. Den dækker 320/390/820/1440 px, mobilmenu, links, formularfarver, cookieknap, ingen utilsigtede API-kald og et andet brand, foruden de eksisterende login/tilmelding/QR/profil-regressioner. Fixture er ikke produktions-live-QA. Efter deployment kontrolleres release-SHA og login/tilmelding visuelt samt ufuldstændig formular uden at sende mail eller oprette et medlem.

Specifikationer: [fase 1](fase-1-stempelkort-backend.md), [fase 2](fase-2-stempelkort-kundeportal.md) og [fase 3](fase-3-stempelkort-merchantportal.md).
Godkendt analyse og plan: [fase 1](fase-1-analyse-og-plan.md), [fase 2](fase-2-analyse-og-plan.md) og [fase 3](fase-3-analyse-og-plan.md) (fase 3 bygges parallelt med fase 2 efter PM-beslutning 2026-10-17).

## Status for fase 1

| PR | Indhold | Status |
|---|---|---|
| 1 | Rettigheder, migration af `orderfly.loyalty` og forretningsregler | Merget 2026-10-17 (#253, parret med Esmeralda #410) |
| 2 | Kassens backend (opslag, stempel, indløsning, korrektion, udløbsjob) | Merget 2026-10-17 (#255) |
| 3 | Medlemskab, samtykke, Omnisend, login-link og session | Merget 2026-10-17 (#257, parret med Esmeralda #412) |
| 4 | Admin: Stempelkort (indstillinger, medlemmer, log, CSV) | Merget 2026-10-17 (#259) |
| 5 | Admin: Loyalitet (hovedgruppe, oversigt, kundescore flyttes) | Merget 2026-10-17 (#261) |
| 6 | Oprydning: aliaset `orderfly.loyalty` og migrationskommandoen fjernes | Merget og udrullet 2026-10-17 (#265) |

## Status for fase 3 (kassevisning)

| PR | Indhold | Status |
|---|---|---|
| 1 | Indstilling "Kassevisning: log ud efter inaktivitet" (standard 5 minutter) | Merget 2026-10-17 (#266) |
| 2 | Kassevisningen: adgang og menu, login og brugerskifte, automatisk log ud, scanning, søgning, stempel, indløsning og korrektion | Merget 2026-10-17 (#268) |

Adgang og selve kassevisningen er samlet i PR 2, så menupunktet aldrig peger på en side, der ikke findes.

## Kassevisning (fase 3)

Adressen er `/merchant/stamp-card`. Den kræver `orderfly.stamp_cards:counter`. Al logik ligger i kassens backend fra fase 1; skærmen viser og sender kun.

- **Hvem ser hvad:** En medarbejder, hvis eneste Orderfly-rettigheder er kassevisning, indløs og korrektion, ser kun kassevisningen i fuld skærm. Det gælder efter login, fra `/merchant` og fra mPanel-genvejen. Ledere har menupunktet **Kassevisning** under Loyalitet og knappen **Administration** i kassevisningen.
- **Login og brugerskifte:** Samme login som timeloggen (navn/e-mail og 6-cifret PIN). **Skift bruger** logger den aktive medarbejder ud. Tabletten husker navnene på de seneste 8 medarbejdere (aldrig PIN), så man trykker sit navn og taster PIN. Navne kan fjernes fra listen.
- **Automatisk log ud:** efter den indstillede periode uden aktivitet (Indstillinger → "Kassevisning: log ud efter inaktivitet", standard 5 minutter). Det gælder også, hvis tabletten har sovet eller siden genindlæses. Når udlogningen ikke nåede serveren (fx uden net), forbliver tabletten låst, og udlogningen prøves igen hvert 15. sekund og når nettet kommer tilbage. Næste medarbejders PIN sendes først, når den forrige udlogning er færdig, så den aldrig kan logge den nye medarbejder ud.
- **Brand og afdeling** vælges øverst, hvis der er flere; tabletten husker valget. Er programmet slået fra eller uden kassekanaler, vises det, og knapperne er slået fra.
- **Scanning:** kameraet åbner og scanner automatisk. Chrome på Android bruger browserens egen QR-læser; Safari på iPad bruger biblioteket `jsqr`. QR-koden skal indeholde præcis kundens token (64 tegn). Alt andet giver "Det er ikke en stempelkort-kode".
- **Giv stempel:** kanal (kun brandets kassekanaler; én kanal er valgt på forhånd), beløb og Bekræft. Under minimum eller med rabat (når rabatordrer ikke giver stempel) kan der ikke bekræftes. Kvitteringen vises i 4 sekunder.
- **Dobbeltklik og netværk:** Knappen låses ved første tryk, og hver handling har sin egen idempotensnøgle. Ved "Ingen forbindelse" kan kun samme handling prøves igen med samme nøgle, så den aldrig registreres to gange.
- **Indløs:** kun med gyldig belønning i afdelingen og rettigheden `…:redeem`, med et bekræftelsestrin.
- **Korrektion:** kun med `…:correct`. Ved kassen kan der tilføjes eller fjernes stempler med årsag. Annullering af en indløsning sker i admin under Medlemmer (PM-beslutning).
- **Test:** `tests/unit/loyalty-counter-browser.cjs` kører den rigtige skærm i Chromium ved 1180×820, 820×1180 og 390 px med syntetisk kamera og API.

**Drift før brug:** Tildel `orderfly.stamp_cards:counter` (og evt. `redeem`/`correct`) til kassepersonalets rolle i mPanel, og test hele flowet på restaurantens egen iPad og Android-tablet (spec §8, sidste punkt). Kameraet kræver, at browseren får lov at bruge det første gang.

## Rettigheder

| Rettighed | Giver adgang til |
|---|---|
| `orderfly.stamp_cards:overview` | Loyalitet-oversigten og rapporter |
| `orderfly.stamp_cards:counter` | Kassevisning: scan QR, søg kunde og giv stempel |
| `orderfly.stamp_cards:redeem` | Indløs belønning |
| `orderfly.stamp_cards:correct` | Manuel korrektion (med årsag) |
| `orderfly.stamp_cards:settings` | Programmets regler og tekster |
| `orderfly.stamp_cards:members` | Medlemsliste, detaljer og eksport |
| `orderfly.stamp_cards:log` | Hændelseslog og eksport |
| `orderfly.customer_score:*` | Intern kundescore (tidligere `orderfly.loyalty:*`) |

Der oprettes ingen roller fra koden. Rettighederne føjes til eksisterende eller nye roller i mPanel. Migrationen af `orderfly.loyalty` er kørt, og det gamle navn accepteres ikke længere (PR 6). Se [freemium-rbac-139.md](../freemium-rbac-139.md).

## Forretningsregler

`src/lib/loyalty/stamp-card/rules.ts` har ingen I/O og testes i `tests/unit/loyalty-stamp-card-rules.cjs`:

- **Indstillinger** (`programSettingsSchema`, `defaultProgramSettings`): standardværdierne fra spec §6.1. Programmet starter slået fra. Når det er aktivt, kræves belønning, beskrivelse, vilkår, samtykketekst og mindst én kanal.
- **Kanaler** er lukkede lister: ved kassen `dine_in`/`takeaway`, fra Orderfly `pickup`/`delivery`. Hvilke der giver stempel, vælges pr. brand. Wolt, Uber Eats og andre tredjepartskanaler kan hverken vælges eller sendes.
- **Kvalificerende køb** (`evaluatePurchase`): programmet skal være aktivt, kanalen slået til, beløbet (betalt inkl. moms efter rabat, i øre) mindst minimumsbeløbet, rabatflaget og den valgfri dagsgrænse skal være overholdt.
- **Fyldt kort** (`applyStamps`): giver belønning og nyt kort. Overskydende stempler overføres. Et igangværende kort beholder sit eget krav; nye kort bruger det aktuelle.
- **Udløb** (`cardExpiresAt`, `rewardExpiresAt`): kalendermåneder; hvert stempel nulstiller kortets frist.
- **Indløsning** (`canRedeem`) og **afdelingsbinding** (`stampLocation`): når kortet ikke gælder på tværs af afdelinger, bindes det til afdelingen for første stempel.

## Kassens backend (PR 2)

- **Logik:** `src/lib/loyalty/stamp-card/counter.ts`. Funktionerne er `lookupMember`, `grantStamp`, `redeemReward`, `correctMember` og `issueQrToken`.
- **Udløbsjob:** `src/lib/loyalty/stamp-card/expiry.ts`.
- **API:** routes under `src/app/api/merchant/loyalty/*` med et fælles HTTP-lag i `http.ts`. API'et er beskrevet i [api-overview.md](../api-overview.md), og datamodellen i [firestore-schema.md](../firestore-schema.md).

Sådan fungerer det:
- **Tjek pr. kald:** Hvert kald tjekker rettigheden for den konkrete afdeling i samme transaktion, som skriver data. Inaktive medarbejdere afvises af det eksisterende Opsfly-sessionstjek.
- **Idempotens:** Hver stempling, indløsning og korrektion har en idempotensnøgle. Gentages et kald med samme nøgle, returneres samme kvittering, men først efter det samme rettighedstjek som et nyt kald. Samme nøgle med andet indhold giver `idempotency_conflict`.
- **Kortet fryser sine regler:** antal stempler, gyldighed, belønning og afdelingsbinding. Ændrede indstillinger gælder kun nye kort.
- **QR-tokens:** Et QR-token gemmes kun som hash, gælder i 60 sekunder og kan kun bruges én gang. Kun medlemmets nyeste kode gælder; en ny kode ugyldiggør den forrige.
- **E-mail-søgning** viser maskeret e-mail. Opslag er begrænset til 60 pr. minut pr. medarbejder.
- **Udløb:** Udløbne kort og belønninger markeres og logges. Intet slettes. Et stempel efter fristen, men før jobbet har kørt, starter et nyt kort og logger udløbet.
- **Korrektion** kræver årsag og logges med medarbejderen. Stempler kan ikke tilføjes, mens programmet ikke er aktivt.

Før brug skal indekserne i `docs/loyalty-firestore-indexes.json` oprettes i dataprojektet `orderfly-39325`. Det sker med GitHub-workflowet **Firestore indexes**, som kun opretter manglende indexes og venter, til de er klar.

## Medlemskab og kundesession (PR 3)

- **Kode:** `src/lib/loyalty/stamp-card/membership.ts` (tilmelding, login-link, session, kortvisning, QR, samtykke, sletning, logout), `mail.ts` (login-mail) og `portal-http.ts`.
- **Routes:** `src/app/api/loyalty/[brandSlug]/*`.

Sådan fungerer det:
- **Tilmelding** kræver begge afkrydsninger og præcis den samtykke- og vilkårstekst, kunden fik vist (versioneret ud fra teksten).
  - En eksisterende kunde kobles på normaliseret e-mail via den fælles identitetsreservation. Det giver ingen dubletter.
  - Svaret er altid neutralt.
- **Samtykke** gemmes i den eksisterende samtykkelog med kilden `loyalty`, teksten og versionen, og synkroniseres til Omnisend.
  - Afmelding i portalen sendes som `unsubscribed`.
  - Afmelding i Omnisend registreres i den eksisterende afstemning og logges som `consent_withdrawn` på medlemmet. Det gælder også, når medlemmet er tilmeldt med en alias-adresse; kundens primære samtykke ændres kun for den primære adresse.
  - Medlemskab og stempler bevares i begge tilfælde.
- **Login-link:** kan kun bruges én gang og udløber efter 15 minutter. Kundens session varer som indstillet (standard 180 dage) og tjekkes ved hvert kald.
- **Sletning:** fjerner navn, e-mail og kundekobling og tilbagekalder alle sessioner. Ventende login-mails annulleres, og alle medlemmets mailjobs mister navn, e-mail og link. Loggen bevares pseudonymiseret.

**Drift før brug:**
- Indekserne i `docs/loyalty-firestore-indexes.json` skal være oprettet.
- Esmeralda-skabelonen `orderfly.stamp_card.login_link` skal være udrullet i versionen med `expires_at` (Esmeralda #412). Mailen sender linkets udløb med, og Notification Platform sender aldrig et udløbet link.
- Brandet skal have en mail-mapping i `ORDERFLY_LOYALTY_NOTIFICATION_BRANDS`, eller den eksisterende i `ORDERFLY_GAMES_NOTIFICATION_BRANDS`.

## Admin: Stempelkort (PR 4)

Menuen har fået hovedgruppen **Loyalitet** med punkterne **Stempelkort** og **Kundescore**. Kundescore er flyttet fra Promotions; adresse og oversigt kom i PR 5 (se nedenfor).

Siden `/superadmin/loyalty/stamp-card` har tre faner: Oversigt, Medlemmer og Log. Hver fane vises kun med sin rettighed, og den rettighed skal gælde hele brandet:

- **Oversigt** (`orderfly.stamp_cards:settings`), ændret 2026-10-18 efter PM-beslutning:
  - Siden åbner med en liste over de stempelkort, der er oprettet, med brand, virksomhed, programnavn, status (Aktiv/Inaktiv), antal aktive medlemmer og sidst ændret af hvem.
  - Der oprettes ikke automatisk et stempelkort pr. brand. **Opret stempelkort** vælger et brand uden stempelkort og åbner indstillingerne; først når de gemmes, findes programmet (inaktivt, indtil det aktiveres).
  - Filter på virksomhed og brand (det fælles filter) og på status.
  - **Rediger** åbner indstillingerne (`?tab=settings&edit={brandId}`).
  - **Aktivér/Deaktivér** kræver bekræftelse og gemmes som en ny version med samme validering, versionstjek og log som indstillingerne. Et program kan ikke aktiveres, før belønning, vilkår og samtykketekst er udfyldt.
- **Indstillinger** (åbnes fra oversigten, samme rettighed):
  - Alle parametre fra spec §6.1, herunder kanaler pr. brand og belønningstype med produkt- eller kategorivalg.
  - Er belønningstypen "Gratis produkt" uden valgt produkt eller kategori, gemmes belønningen som tom. Et inaktivt program kan derfor gemmes uden belønning (som ved oprettelsen); et aktivt afvises med "Skal udfyldes, når programmet er aktivt".
  - Fra fase 3: hvor mange minutter kassevisningen må være uden aktivitet, før den låses (1–60, standard 5). Ældre gemte indstillinger læses som 5 minutter.
  - Hver gemning bliver en ny version (`loyaltyProgramVersions`) og logges med medarbejder, tidspunkt og gammel og ny værdi.
  - Er indstillingerne ændret af en anden imens, afvises gemningen.
  - Ugyldige værdier, inaktive produkter og kategorier samt produkter fra et andet brand afvises på serveren. Vælgeren viser kun aktive produkter og kategorier.
- **Medlemmer** (`…:members`):
  - Navn, e-mail, tilmeldt, stempler X/N, optjente belønninger, næste udløb, nyhedsbrev og seneste aktivitet.
  - Søgning, sortering og CSV-eksport. Eksporten læses igen på serveren med samme rettighedstjek og indeholder op til 50.000 medlemmer pr. brand; når det loft nås, siger siden til.
  - Klik på et medlem åbner historikken (de seneste 500 hændelser, med besked når der er flere) med belønninger og samtykke.
  - Manuel korrektion vises kun med `…:correct` og kun for de afdelinger, rettigheden gælder for.
- **Log** (`…:log`):
  - Alle hændelser med filter på periode (dansk tid), kanal, medarbejder og type, samt CSV-eksport. Filtrene er en del af forespørgslen, så visningsgrænsen gælder de matchende hændelser (sammensatte indekser i `docs/loyalty-firestore-indexes.json`).
  - Loggen kan ikke redigeres eller slettes.

**Filterlinjen** er fælles for siderne under Loyalitet:
- Kunde (tenant) vises kun ved adgang til flere tenants.
- Brand er valgt på forhånd, når brugeren kun har adgang til ét.
- Periode, kanal og medarbejder kan vælges.
- Valget ligger i URL'en og huskes mellem siderne i samme browserfane.
- Medlemslisten følger tenant- og brandfiltret. Periode og kanal hører til hændelser og bruges derfor i loggen og på oversigten (del 5).

**Visningsgrænse:** Medlemslisten og loggen viser højst 5.000 rækker pr. brand og siger tydeligt til, når grænsen er nået.

## Admin: Loyalitet-oversigt og kundescore (PR 5)

Menuen **Loyalitet** har nu tre punkter: **Oversigt**, **Stempelkort** og **Kundescore**.

**Kundescore** har fået sin egen adresse, `/superadmin/loyalty/score`, og kræver `orderfly.customer_score:view` (eller superbruger). Gamle bogmærker til `/superadmin/loyalty` sender en bruger uden adgang til oversigten videre til kundescoren, hvis brugeren har adgang dertil.

**Oversigten** ligger på `/superadmin/loyalty` og kræver `orderfly.stamp_cards:overview` for hele brandet. Den viser kun brands, hvor rettigheden gælder, og alle tal følger den fælles filterlinje (tenant, brand, periode og kanal):

- Programstatus pr. brand (aktivt eller ikke aktivt).
- Nøgletal:
  - Aktive medlemmer (i alt) og nye medlemmer (i perioden).
  - Stempler givet i perioden. Kun køb ved kassen og ordrer tæller, ikke manuelle korrektioner. Kanalfiltret gælder her.
  - Belønninger optjent og indløst i perioden.
  - Optjente, ikke indløste belønninger lige nu.
  - Kort, der udløber inden for 30 dage.
  - Andel af aktive medlemmer med nyhedsbrevssamtykke.
- Grafer:
  - Stempler pr. dag og indløsninger pr. dag (dansk tid).
  - Stempler fordelt på dine-in og takeaway.
  - Hver graf har én serie i adminens primærfarve (ingen nye farver), og tallene kan vises som tabel.
- Seneste 20 hændelser (uafhængigt af perioden) med link til hele loggen.
- Stempler og indløsninger pr. medarbejder i perioden.
- Genveje til indstillinger, medlemsliste og log. Hver genvej vises kun med sin rettighed.

**Visningsgrænse:** Oversigten viser højst 366 dage; en længere valgt periode forkortes til de seneste 366 dage, og siden siger til. Den læser højst 20.000 hændelser pr. brand i perioden og siger også til, hvis den grænse er nået.

mPanel-genveje: `orderfly.stamp_cards:overview` åbner oversigten, og `orderfly.customer_score:view` åbner kundescoren.

## Standardtekster for samtykke og vilkår

Plan: [standardtekster-analyse-og-plan.md](standardtekster-analyse-og-plan.md) (godkendt 2026-10-19).

**Skabelonen** ligger i koden i `src/lib/loyalty/stamp-card/texts.ts` (`TEMPLATE_VERSIONS`).
- Der er fire tekster: samtykketekst, forklaring under samtykket, accept af vilkår og vilkår.
- En udgivet version ændres aldrig. En ændring tilføjes som en ny version sidst i listen og går gennem review.
- En test låser hashen af hver udgivet version.
- Platformens superuser ser alle versioner under System → **Stempelkort-tekster** (`/superadmin/settings/stamp-card-texts`): version, dato, ændring, status og hvor mange brands der bruger den. "Vis" åbner versionen. Siden kan kun læses.

**Pladsholdere** udfyldes, når kunden ser teksten, så en ændret indstilling slår igennem med det samme.
- Fra brandet (Brands → Rediger):
  - `{brand_navn}` (navn)
  - `{virksomhed_navn}` (juridisk navn)
  - `{virksomhed_adresse}` (gade, postnr. og by)
  - `{cvr}`
  - `{kontakt_email}` (support-e-mail)
  - `{privatlivspolitik_url}`
- Fra stempelkortet: `{programnavn}`, `{minimumsbeløb}`, `{antal_stempler}`, `{belønning}`, `{belønning_gyldighed}`, `{stempel_gyldighed}`, `{stempler_pr_køb}`, `{maks_stempler_pr_dag}` og `{aldersgrænse}` (ny indstilling, standard 15 år).
- Fra tekstversionen: `{version}` og `{gældende_fra}`.
- `{opbevaring_efter_ophør}` findes ikke (ejerbeslutning 2026-10-19). Vilkårenes afsnit 8 beskriver i stedet deaktivering og sletning på anmodning.
- Afsnit 10 lover ikke, at belønninger kan indløses i varslingsperioden, når programmet lukker, fordi "Deaktivér" stopper indløsning med det samme (ejerbeslutning 2026-10-20).

**Betingede afsnit:** `{#hvis rabat_giver_stempel}…{/hvis}` og `{#hvis ikke …}`. `flere_stempler_pr_køb` er sand, når et køb giver mere end ét stempel. Standardteksten bruger da flertal: "Du får N stempler", "Stemplerne registreres" og "fjernes de stempler".
- `dagsgrænse` er sand, når "maks. stempler pr. medlem pr. dag" er sat. Standardteksten nævner da grænsen.
- Kanalerne afgør, hvilken af tre sætninger afsnit 3 bruger: `restaurant_og_takeaway`, `kun_restaurant` eller `kun_takeaway`.
  - Restaurant er dine-in ved kassen.
  - Takeaway er takeaway ved kassen. Orderfly-ordrer (afhentning/levering) giver endnu ikke stempler og nævnes derfor ikke. Når den automatiske stempling slås til, skal skabelonen og tekstnøglen udvides.
  - Med begge kanaler er teksten den godkendte (ejerbeslutning 2026-10-20). `flere_afdelinger` er sand, når kortet gælder på tværs, og brandet har mere end én aktiv afdeling. Et betinget afsnit starter og slutter på samme linje. En linje, der bliver tom, fjernes.

**I admin** (Stempelkort → Rediger → Tekster, rettigheden `orderfly.stamp_cards:settings`):
- Et nyt stempelkort får en kopi af den aktuelle standardtekst.
- **Gendan standardtekst** sætter de fire tekster tilbage efter en bekræftelse. Det gemmes først med "Gem indstillinger".
- Kommer der en ny standardversion, vises en besked. Teksten opdateres aldrig automatisk.
- Ukendte pladsholdere og ulukkede betingelser vises med det samme og afvises på serveren, også for et inaktivt program.
- Mangler en værdi (fx CVR-nr.), vises den i en liste, og programmet kan ikke aktiveres (`texts_incomplete`).
  - Brandfelter rettes under Brands. Linket vises kun for platformens superuser, som er den eneste, der kan redigere brands.
  - Andre ser "Kontakt en platformsadministrator".
- **Forhåndsvisning** bruger samme funktion som portalen og viser teksten, som den bliver, når programmet er aktivt og gemt.
- Ændres teksterne eller en regel, som teksterne nævner, for et aktivt program, skal brugeren bekræfte en advarsel om 30 dages varsel (vilkårenes afsnit 10).

**Versioner og samtykkelog:**
- En ny tekstversion udgives, når et aktivt program gemmes med ændrede tekster eller ændrede regler, som teksterne nævner. Versionen gælder fra gemmetidspunktet.
- Ændringer i brandets stamdata (fx adresse) giver ikke en ny version.
- Hver version gemmes uforanderligt i `loyaltyTextVersions` og vises under fanen **Tekstversioner**: version, gældende fra, udgivet af, standardtekst og antal tilmeldte medlemmer. "Vis" viser præcis den udfyldte tekst.
- **Ved tilmelding:**
  - Samtykkeloggen gemmer den udfyldte samtykketekst inkl. forklaringen.
  - Medlemmet får `textVersion` og `textHash`.
  - De udfyldte tekster, kunden så, gemmes i `loyaltyRenderedTexts`. Er brandets oplysninger ændret siden udgivelsen, vises den variant også under versionen.
- **Ny tekst undervejs:** Ændres den udfyldte tekst, mens kunden står på siden, afviser serveren tilmeldingen (`program_changed`), og kunden skal sætte flueben igen.

**Kunden ser aldrig en uudfyldt pladsholder:** Mangler en brandoplysning i et aktivt program (fx hvis CVR-nr. slettes), lukkes tilmeldingen, og fejlen logges. Eksisterende medlemmer ser stadig deres kort.

**Portalen:**
- Tilmeldingen viser forklaringen under samtykkefeltet.
- Ordet "vilkårene" i accept-teksten er et link til `/club/vilkaar`.
- Profilen viser forklaringen ved ny tilmelding til nyhedsbrevet.

**Drift før brug:** Udfyld juridisk navn, adresse, CVR-nr., support-e-mail og link til privatlivspolitik på brandet under Brands. Vilkårene bør gennemlæses juridisk før lancering.

**Test:** `tests/unit/loyalty-stamp-card-texts.cjs` (skabelon, pladsholdere, betingelser, aktivering, versioner, samtykkelog, forhåndsvisning = portal og brandgrænser) og `tests/unit/loyalty-admin-browser.cjs` (forhåndsvisning, gendan, manglende oplysninger og advarsel om varsel ved 390 og 1440 px).

## Fase 2 – kundeportal

Plan: [fase-2-analyse-og-plan.md](fase-2-analyse-og-plan.md).

Alle tre PR'er er merget, men **fase 2 er ikke accepteret endnu**. Planen (C7) kræver test på rigtige enheder før accept.

**Før accept:**
- Manuel test på iPhone og Android: tilmelding og login, hjemmeskærm (også at kunden forbliver logget ind dér) og scanning af QR-koden ved lav lysstyrke. Resultatet noteres her.
- Visuelt tjek af skrifttyperne Bourton og Brandon.

**Før lancering:** `*.orderfly.dk` skal sættes op ([brand-subdomains.md](../brand-subdomains.md)), så login-mailens link og skiltets QR-kode virker. Login fra mailen kan først testes på enhederne, når det er gjort.

| PR | Indhold | Status |
|---|---|---|
| 1 | Ramme, tilmelding, login og vilkår | Merget 2026-10-17 (#267) |
| 2 | Mit stempelkort og QR-kode | Merget 2026-10-17 (#269) |
| 3 | Historik, profil, hjemmeskærm og skilt-QR | Merget 2026-10-17 (#270) |

**Adresse:** `https://{slug}.orderfly.dk/club`, fx `https://esmeralda.orderfly.dk/club`. Portalen virker også på `https://orderfly.dk/{slug}/club`, og der omdirigeres ikke, fordi `*.orderfly.dk` endnu ikke er sat op i drift. Login-mailens link peger altid på subdomænet, så login i drift kræver subdomænet ([brand-subdomains.md](../brand-subdomains.md)).

**Sider (PR 1)** i `src/app/[brandSlug]/club/`:
- `/club`: introduktion med "Bliv medlem" og "Log ind". Et logget ind medlem ser sit stempelkort (PR 2, se nedenfor). Er programmet slået fra, vises en venlig besked.
- `/club/tilmeld`: navn, e-mail og to afkrydsninger, som ikke er forudafkrydsede. Samtykketeksten og versionerne kommer fra programmet; ændres teksterne undervejs, skal kunden sætte flueben igen. Svaret er altid "Tjek din e-mail".
- `/club/login`: e-mail → login-link. Åbnes siden fra mailen, fjernes tokenet fra adressen, før det sendes til `verify`. Udløbet og brugt link har hver sin besked og en knap til et nyt link.
- `/club/vilkaar`: programmets vilkår.

**Sådan virker det:**
- Siderne læser på serveren med de samme fase 1-funktioner som API'et (`data.ts`) og skriver aldrig. Alle handlinger går gennem `/api/loyalty/{brandSlug}/*`. Der er ingen forretningslogik i frontend og ingen ændringer i `src/lib/loyalty/stamp-card/`.
- Portalen bruger brandlayoutet (farver, Esmeralda-forudindstillingen i `commerce-ui.css`, cookie-banner og footer) med sin egen header. Webshoppens header vises ikke.
- **Esmeralda** (`brand-preset.ts`): det hvide logo fra Esmeraldas egen side og skriftfilerne Bourton (overskrifter) og Brandon (brødtekst), som feedback-siderne også bruger. Andre brands bruger logo og farver fra brandindstillingerne. Senere skal det komme fra dynamiske brandindstillinger.
- **Ingen tracking:** Brandets tredjeparts-tracking (GTM, GA4, Meta) kører ikke på `/club`-sider (`brand-tracking.tsx`).
- Portalens sider er markeret `noindex`.
- En afdeling kan ikke få adressen `club`.

**Mit stempelkort (PR 2)** (`member-card.tsx`, `member-qr.tsx`):
- Stemplerne vises som X af N (fx 2 rækker á 4), med teksten "3 stempler til gratis pizza" bygget af tallene og belønningsbeskrivelsen fra API'et. Beskrivelsens første bogstav gøres kun småt, når det efterfølges af et lille bogstav ("Gratis pizza" → "gratis pizza"); forkortelser som "VIP-menu" bevares.
- Optjente belønninger med beskrivelse, udløbsdato og "Vis QR-koden ved kassen for at indløse".
- Kortets udløbsdato: "Dine stempler udløber, hvis du ikke har fået et nyt stempel inden [dato]". Datoer vises i dansk tid.
- Er programmet slået fra, ser medlemmet stadig sit kort med en besked om, at der ikke gives nye stempler.
- **QR-koden:**
  - Tegnes i browseren (pakken `qrcode`) som sort på hvid med hvid kant, uanset brandets farver.
  - Hentes fra `GET qr` og fornyes efter 45 sekunder, og straks når kunden vender tilbage til appen eller får forbindelse igen.
  - Kortet genindlæses ved hver fornyelse, så nye stempler fra kassen dukker op.
  - Koden skjules, så snart en ny kode bestilles, fordi backend ugyldiggør den gamle i samme øjeblik. Mens den nye hentes, står der "Henter QR-kode…".
  - Koden skjules senest 57 sekunder efter, at serveren udstedte den, målt med serverens `Date`-header og højst en kodes levetid. Et forkert ur på telefonen kan derfor ikke holde en gammel kode synlig.
  - Uden forbindelse vises "Ingen forbindelse – QR-koden kan ikke vises" og "Prøv igen".
  - En udløbet session sender kunden til login.
  - Skærmen holdes tændt, mens kortet er åbent, hvor browseren understøtter det. Låsen tages igen, når kunden vender tilbage til appen.

**Historik, profil og hjemmeskærm (PR 3):**
- **Menu:** Et logget ind medlem får menuen Kort, Historik og Profil under logoet.
- **`/club/historik`:** stempler, fjernede stempler, belønninger, indløsninger og udløb med dato og kanal (Spis her, Takeaway, Afhentning, Levering). Medarbejdere og årsager vises aldrig; API'et sender dem ikke.
- **`/club/profil`:**
  - Navn og e-mail.
  - Nyhedsbrev med status og knap til afmelding eller tilmelding. Ved tilmelding vises samtykketeksten, og dens version sendes med. Teksten forklarer, at medlemskab, stempler og belønninger bevares ved afmelding. Ændringen synkroniseres til Omnisend af fase 1.
  - Link til vilkår og "Log ud".
  - "Slet medlemskab" med et bekræftelsestrin, der forklarer, at stempler og belønninger går tabt.
  - Uden gyldig session sendes kunden til login.
- **Hjemmeskærm:**
  - Webapp-manifest pr. brand på `/club/manifest.webmanifest` med programmets navn, start på `/club`, visningen "standalone" og brandets baggrundsfarve.
  - Ikoner på `/club/ikon/180`, `/192` og `/512`. De laves på serveren med `sharp` ud fra logoet (60 % af fladen, inden for sikkerhedszonen for "maskable" ikoner) på brandets baggrundsfarve; Esmeralda får sort baggrund. Uden et brugbart logo bliver ikonet ensfarvet.
  - Logoet læses fra brandets gemte data. Et indlejret billede afkodes direkte. En adresse hentes kun fra kendte offentlige billedværter (Webflow-CDN og værterne i `next.config`), uden at følge videresendelser og højst 2 MB. Serveren kan derfor ikke lokkes til at kalde interne adresser.
  - iPhone får `apple-touch-icon` og titel.
  - En diskret vejledning på kortet vises på telefoner, indtil kunden lukker den eller åbner portalen fra hjemmeskærmen. På iPhone forklarer den Del → "Føj til hjemmeskærm". Android får browserens egen installationsknap, når den tilbydes, og ellers en vejledning.
- **Skilt til disken:** [skilt-qr-tilmelding.svg](skilt-qr-tilmelding.svg) er en QR-kode til `https://esmeralda.orderfly.dk/club/tilmeld` med høj fejlkorrektion, klar til tryk. Den virker først, når `*.orderfly.dk` er sat op.

**Test:** `tests/unit/loyalty-portal-pages.cjs` (stier, tekster, datoer, brandudseende og serverlæsning) og `tests/unit/loyalty-portal-browser.cjs` (tilmelding, login, links fra mailen, tracking, kortet QR-kodens fornyelse, udløb, offline og forkert ur, profil, sletning, menu og hjemmeskærm-vejledningen i Chromium ved 390 og 1440 px). `loyalty-portal-pages.cjs` dækker også historiktekster, manifest, ikoner og skilt-QR'en.

### Esmeraldas medlemsvisning efter login (#453)
Medlemskort, QR, belønninger, historik og profil følger nu også restaurantens mørke/gyldne design. Kort og QR står side om side på større skærme og under hinanden på mobil. Den aktive medlemsfane er gylden; stempelantal og fremdrift kommer fortsat fra kortets snapshot. QR-feltet beholder sort kode på hvid baggrund og eksisterende quiet zone, udløb og fornyelse. Andre brands beholder den kompakte præsentation.

`historik/history-view.tsx` er kun præsentation. Server-siden foretager stadig samme medlemskontrol og redirect, og der tilføjes ingen API- eller trackingkald. Profilens samtykke, logout og sletningsbekræftelse er uændrede.

Browserregressioner bruger de faktiske komponenter og syntetiske svar: medlemskort/historik/profil ved 320/390/820/1440 px, ti stempler på smal skærm, tom historik, aktiv navigation, QR-kontrast, brand-isolation samt de eksisterende QR-, samtykke- og fejlforløb. Dette er isolerede browsertests, ikke produktionsdata- eller fysisk hardwareaccept.

Live acceptance efter verificeret deployet release: log ind med autoriseret eksisterende medlemskonto, gennemgå Kort, Historik og Profil read-only, kontroller korrekt data og navigation samt QR-område uden at offentliggøre kode/token eller medlemsoplysninger. Undlad samtykkeændring, sletning og tildeling/indløsning af stempler. Engangs-loginlinks og QR-payloads må aldrig gemmes i GitHub eller screenshots. Autentificeret live acceptance skal dokumenteres særskilt før #453 lukkes.


## Loginmail ved hjemmesidekøb (#597)

Et hjemmesidekøb sender ikke en separat loginmail til kundeportalen. Det gælder også første Club-tilmelding og gentagen tilmelding i checkout: medlemskab, samtykke og eventuelle tilmeldingsbelønninger oprettes fortsat, men der oprettes hverken login-token eller loginmail-job. Ordre-, betalings- og kvitteringsmails følger deres eksisterende flows. Kunden kan selv bede om et loginlink fra Club-portalen; portalens tilmelding og login sender fortsat mail.

Årsagen var checkout → `prepareClubCheckoutSignup` → `signup` med `source: checkout`, hvor både nye og eksisterende medlemmer fik oprettet et loginlink og et mailjob. Rettelsen ligger i medlemskabstransaktionen før oprettelsen af token/outbox. Checkout kalder heller ikke maillevering. Dermed kan checkout-retries og mail-workerens heartbeat ikke skabe eller sende et nyt checkout-loginlink. Eksisterende eksplicit bestilte portal-mails berøres ikke. Der ændres ikke historiske produktionsjobs som del af deployment.

Regression: `loyalty-club-signup-integration.cjs` dækker nye og eksisterende medlemmer, samtidige retries, tom login-outbox og bevaret eksplicit portal-login/tilmelding. `club-checkout.cjs` dækker almindeligt køb for nye og eksisterende kunder. `loyalty-membership.cjs` og `loyalty-portal-routes.cjs` bevarer login-token-, mailleverings-, udløbs- og retry-kontrakterne. Tests bruger syntetiske data uden rigtig mail.
