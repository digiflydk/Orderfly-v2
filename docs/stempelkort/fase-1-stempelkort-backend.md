# Fase 1 – Digitalt stempelkort: backend, admin og rettigheder

Del 1 af 3. Fase 2 er kundeportalen, og fase 3 er merchantportalen (kassevisning).
Deadline for fase 1–3: færdig og testet senest **31. oktober 2026**, hvor papirstempelkortet udfases.

---

## 0. Arbejdsgang for Claude Code (læs først)

Stempelkortet er **ikke et nyt produkt**. Det er en udvidelse af den eksisterende platform (Orderfly, Opsfly og mPanel). Alt skal bygges med de mønstre, komponenter og moduler, der allerede findes i koden.

**Trin 1 – Analyse. Du må ikke ændre kode i dette trin.** Læs og beskriv i detaljer:

1. mPanel: rolle- og rettighedsmodulet. Hvordan roller og rettigheder defineres, gemmes og tjekkes i backend og frontend, og hvordan nye rettigheder tilføjes.
2. Medarbejderlogin fra timeloggen i Opsfly: login, sessioner, og hvordan inaktive medarbejdere håndteres.
3. Promotion-modulet i Orderfly: datamodel, navigation, gyldighedsperioder og hvordan promotions bruges på ordrer.
4. Multi-tenant-modellen: hvordan data afgrænses pr. kunde (tenant) og pr. brand, og hvordan eksisterende filtre i admin virker.
5. Kundemodellen i Orderfly: hvordan kunder matches på e-mail, og hvordan samtykke til markedsføring gemmes.
6. Omnisend-integrationen: hvordan kontakter og samtykke synkroniseres i dag.
7. Indløsningssiden fra PR #203 (Spin & Vind): hvad der kan genbruges.
8. Designsystemet: eksisterende komponenter, tabeller, filtre, KPI-kort, formularer og layout i admin.

**Trin 2 – Plan.** Aflever en plan med datamodel, nye rettigheder, API'er, navigation, migrationer og testpunkter. Planen skal pege på, hvilke eksisterende filer og mønstre der genbruges. **Vent på godkendelse, før du bygger.**

**Trin 3 – Byg** i små, afgrænsede PR'er.

**Principper**
- Genbrug eksisterende login, rollesystem, promotion-modul, kundemodel og designkomponenter. Byg ikke parallelle løsninger.
- Følg best practice for sikkerhed, idempotens, logning og datavalidering.
- Hvis dette dokument strider mod det, du finder i koden: **stop og spørg**. Gæt ikke.
- Alle tekster i brugerfladen er på dansk.

---

## 1. Afgrænsning

**I fase 1**
- Datamodel og forretningsregler for loyalitetsprogram, stempelkort, stempler, belønninger og indløsninger.
- Admin i Orderfly: Promotion → Loyalitet (oversigt) → Stempelkort (indstillinger, medlemmer, log).
- Nye rettigheder i mPanels rolle- og rettighedsmodul.
- Backend-API'er, som fase 2 (kundeportal) og fase 3 (merchantportal) bygger på, herunder login-link og QR-token.
- Samtykkehåndtering og synkronisering med Omnisend.
- Hændelseslog og rapportering.

**Ikke i fase 1**
- Kundeportalens brugerflade (fase 2) og kassevisningen (fase 3).
- Visning af tilbud i kundeportalen (senere fase 4, som udvidelse af promotion-modulet).
- Overførsel af stempler fra papirkort. **Det skal ikke bygges.** Alle starter forfra digitalt.
- Integration med NemPOS eller Dully. De hostes af tredjepart.

---

## 2. Begreber

| Begreb | Betydning |
|---|---|
| Kunde (tenant) | Virksomheden, der bruger platformen, fx Esmeralda. |
| Brand | Et brand under en tenant. Loyalitetsprogrammet konfigureres pr. brand. |
| Medlem | En slutkunde, der er tilmeldt loyalitetsprogrammet. |
| Loyalitetsprogram | Fx "Esmeralda Club". Én pr. brand. |
| Stempelkort | Medlemmets aktuelle kort med X af N stempler. |
| Stempel | Registrering af ét kvalificerende køb. |
| Belønning | Optjenes, når kortet er fyldt. Indløses ved kassen. |
| Indløsning | Medarbejderen registrerer, at belønningen er brugt. |

---

## 3. Placering i admin og navigation

```
Promotion
 ├─ (eksisterende promotions)
 └─ Loyalitet           ← oversigtsside
     └─ Stempelkort     ← indstillinger, medlemmer, log
```

- Menupunkterne vises kun for brugere med de relevante rettigheder (se afsnit 9).
- Layout, menu, ikoner og komponenter **arver det eksisterende design**. Der må ikke indføres nye farver, skrifttyper eller komponentstile i admin.

---

## 4. Filtre på kunde- og brandniveau

Alle sider under Loyalitet har en filterlinje øverst, bygget med de eksisterende filterkomponenter:

- **Kunde (tenant):** vises kun for platformsadministratorer, der har adgang til flere tenants.
- **Brand:** vælg ét eller flere brands. Hvis brugeren kun har adgang til ét brand, er det valgt på forhånd.
- **Periode:** i dag, 7 dage, 30 dage, denne måned, sidste måned og valgfri periode.
- **Kanal:** dine-in og takeaway.
- **Medarbejder:** kun på log og rapporter.

Krav:
- Alle data og indstillinger afgrænses af den eksisterende tenant- og brandmodel. En bruger ser aldrig data fra en tenant eller et brand, vedkommende ikke har adgang til.
- Filtervalget huskes, når brugeren skifter mellem siderne under Loyalitet.
- Indstillinger gemmes pr. brand.

---

## 5. Oversigtssiden "Loyalitet"

Når man trykker på Loyalitet, vises en oversigt over programmet. Alle tal følger filtrene.

**KPI-kort**
- Aktive medlemmer i alt
- Nye medlemmer i perioden
- Stempler givet i perioden
- Belønninger optjent i perioden
- Belønninger indløst i perioden
- Optjente, ikke-indløste belønninger
- Stempelkort, der udløber inden for 30 dage
- Andel medlemmer med aktivt nyhedsbrevssamtykke

**Grafer**
- Stempler og indløsninger pr. dag i perioden
- Fordeling på kanal (dine-in og takeaway)

**Lister**
- Seneste aktivitet (de 20 seneste hændelser) med link til fuld log
- Stempler og indløsninger pr. medarbejder

**Genveje**
- Til Stempelkort-indstillinger, medlemsliste og log
- Programmets status (aktiv eller inaktiv) vises tydeligt øverst

Grafer, KPI-kort og tabeller bygges med de komponenter, der allerede bruges i fx indkøbs- og salgsdashboards.

---

## 6. Siden "Stempelkort"

Siden har tre faner: **Indstillinger**, **Medlemmer** og **Log**.

### 6.1 Indstillinger (pr. brand)

Alle regler er parametre, som kan ændres i admin. Ingen regler må være hardkodet.

| Parameter | Standard | Beskrivelse |
|---|---|---|
| Program aktivt | Fra | Slås til ved lancering. Når det er slået fra, kan der hverken gives stempler eller indløses. |
| Programnavn | Esmeralda Club | Vises for kunden. |
| Stempler til belønning | 8 | Antal stempler for et fyldt kort. |
| Minimumsbeløb pr. køb | 100 kr. | Køb under beløbet giver ikke stempel. |
| Stempler pr. kvalificerende køb | 1 | |
| Kortets gyldighed ved inaktivitet | 6 måneder | Stemplerne udløber, hvis kunden ikke har fået et nyt stempel inden for perioden. Hvert nyt stempel nulstiller fristen. Se afsnit 7. |
| Belønningstype | Vælges i admin | Gratis produkt (vælg produkt eller kategori), fast rabat i kr. eller procentrabat. |
| Beskrivelse af belønning | Fritekst | Vises for kunden og ved kassen. |
| Belønningens gyldighed | 3 måneder | Tid fra optjening til belønningen skal være brugt. |
| Gælder på tværs af afdelinger | Til | Er den slået til, kan stempler gives og indløses i alle afdelinger under samme brand. |
| Rabat- og kampagneordrer giver stempel | Fra | Er den slået fra, giver køb med rabat eller kampagne ikke stempel. Kan slås til i admin. |
| Kundens login-session | 180 dage | Hvor længe kunden forbliver logget ind i kundeportalen. |
| Kanaler | Dine-in og takeaway | Wolt, Uber Eats og andre tredjepartskanaler kan **aldrig** give stempler og kan ikke vælges. |
| Vilkår | Fritekst | Programmets vilkår, som vises ved tilmelding. |
| Samtykketekst | Fritekst | Se afsnit 8. Ændringer versioneres. |

Krav:
- Ændringer gælder fremadrettet. Stempler og belønninger, der allerede er givet, beholder de regler, de blev givet under.
- Alle ændringer logges med medarbejder, tidspunkt, gammel og ny værdi.
- Validering: positive tal, gyldige produkter, og samtykke- og vilkårstekst må ikke være tomme, når programmet er aktivt.

### 6.2 Medlemmer

En tabel med alle medlemmer, der følger filtrene:
- Navn, e-mail, tilmeldt dato, stempler (X/N), optjente belønninger, næste udløb, nyhedsbrevsstatus og seneste aktivitet.
- Søgning på navn og e-mail, sortering og eksport til CSV.
- Klik på et medlem åbner detaljer med fuld historik over stempler, belønninger, indløsninger og samtykke.
- Manuel korrektion foretages herfra og kræver særskilt rettighed (se afsnit 9).

### 6.3 Log

Alle hændelser med filter på type, medarbejder, kanal og periode. Loggen kan eksporteres til CSV. Den kan ikke redigeres eller slettes.

---

## 7. Forretningsregler for stempler og belønninger

**Kvalificerende køb**
- Kanalen er dine-in eller takeaway, og beløbet er mindst minimumsbeløbet.
- Beløbet, der tæller, er **det betalte beløb inkl. moms efter rabat**.
- Hvis "rabat- og kampagneordrer giver stempel" er slået fra, giver køb med rabat eller kampagne ikke stempel.

**Kilder til stempler**
- **Manuelt via kassevisningen (fase 3):** Medarbejderen scanner kundens QR-kode eller søger kunden frem på e-mail og registrerer købet. Det er den primære metode, fordi NemPOS og Dully hostes af tredjepart.
- **Automatisk fra Orderfly-ordrer:** Forberedes i datamodellen, men aktiveres først, når takeaway kører i Orderfly. Reglerne følger salgsrapporteringen: `paidAt` styrer, og refunderede eller annullerede ordrer tilbagefører stemplet.

**Idempotens**
- Hver stempling har en unik idempotensnøgle. Dobbeltklik, genforsøg eller dårlig forbindelse må aldrig give to stempler for samme køb.

**Fyldt kort**
- Når antallet af stempler er nået, oprettes en belønning automatisk, og et nyt kort starter.

**Udløb**
- Stemplerne på et kort udløber samlet, hvis medlemmet ikke har fået et nyt stempel inden for den indstillede periode (standard 6 måneder). Hvert nyt stempel nulstiller fristen. Kunden ser én tydelig udløbsdato.
- Medlemskabet bevares, og kunden starter på et nyt kort ved næste køb.
- Belønninger udløber efter deres egen gyldighed (standard 3 måneder efter optjening).
- Udløb håndteres af et planlagt job. Hver udløbshændelse logges. Intet slettes.

**Indløsning**
- Kun en gyldig, ikke-indløst belønning kan indløses. Indløsningen er idempotent og logges med medarbejderen.

**Manuel korrektion**
- Tilføje eller fjerne stempler eller annullere en indløsning kræver rettigheden "manuel korrektion", og der skal angives en årsag. Alt logges.

**Grænser mod misbrug**
- Rate limiting på API'erne.
- Parameter "maks. stempler pr. medlem pr. dag" (standard: ingen grænse). Konfigureres i indstillinger.

---

## 8. Medlemskab, samtykke og kundedata

**Tilmelding kræver nyhedsbrevssamtykke**
- Tilmelding til loyalitetsprogrammet kræver et **aktivt samtykke** til nyhedsbrev på e-mail.
- Afkrydsningsfeltet må **ikke** være forudafkrydset. Samtykket er først givet, når tilmeldingen er gennemført.
- Samtykketeksten skal angive kanalen (e-mail), hvad nyhedsbrevet indeholder, og at kunden altid kan afmelde sig.
- Programmets fordele kan sidestilles med en rabat, og kunder uden for programmet kan købe til normalpris. Det er grundlaget for, at tilmelding må betinges af samtykke.

**Afmelding**
- Afmelder kunden nyhedsbrevet, **beholder kunden sit medlemskab, sine stempler og sine belønninger**.
- Afmelding skal kunne ske via et link i nyhedsbrevet, uden login, gennem Omnisend.
- Afmeldinger fra Omnisend skal synkroniseres tilbage til Orderfly.

**Samtykkelog**
- Der gemmes tidspunkt, kilde (fx kundeportal), versionen af samtykketeksten og relevant teknisk dokumentation efter best practice.

**Kundematch**
- Medlemmer matches med eksisterende kunder i Orderfly på normaliseret e-mail (små bogstaver, uden mellemrum). Der må ikke opstå dubletter.
- Eksisterende regel: at være registreret kunde er ikke det samme som at have givet samtykke. En booking eller en ordre giver ikke medlemskab eller samtykke.
- Bemærk: Kundesynkroniseringen med Omnisend er et kendt åbent punkt. Planen skal tage højde for kunder, der endnu ikke er importeret.

**Sletning**
- Et medlem kan anmode om sletning af medlemskab og data. Hændelseslog bevares i anonymiseret form efter best practice.

---

## 9. Roller og rettigheder i mPanel

Rettighederne tilføjes i **det eksisterende rolle- og rettighedsmodul i mPanel**, efter samme navngivning og mønstre som de eksisterende rettigheder. Der må ikke bygges et nyt rollesystem.

| Rettighed | Giver adgang til |
|---|---|
| Loyalitet – se oversigt | Oversigtssiden og rapporter |
| Stempelkort – kassevisning | Scanne QR, søge kunde og give stempel (fase 3) |
| Stempelkort – indløs belønning | Indløse belønninger (fase 3) |
| Stempelkort – manuel korrektion | Tilføje eller fjerne stempler og annullere indløsninger |
| Stempelkort – indstillinger | Ændre programmets regler og tekster |
| Stempelkort – medlemmer | Se medlemsliste og detaljer og eksportere |
| Stempelkort – log | Se og eksportere hændelseslog |

Forslag til standardroller (kan ændres i mPanel):
- **Medarbejder:** kassevisning og indløs belønning.
- **Leder:** alt undtagen indstillinger.
- **Admin:** alt.

Krav:
- Medarbejdere bruger **deres eksisterende login fra timeloggen**. Der oprettes ikke et nyt login.
- Inaktive medarbejdere mister automatisk adgang. Den eksisterende logik genbruges.
- Rettighederne tjekkes i backend på hvert API-kald, ikke kun i brugerfladen.

---

## 10. Hændelseslog

Hver hændelse gemmer: tenant, brand, medlem, type, antal, beløb, kanal, kilde, medarbejder (hvis relevant), årsag (ved korrektion), idempotensnøgle og tidspunkt.

Hændelsestyper: tilmeldt, stempel givet, stempel fjernet, belønning optjent, belønning indløst, indløsning annulleret, stempel udløbet, belønning udløbet, samtykke givet, samtykke trukket tilbage, indstilling ændret og medlem slettet.

---

## 11. Backend-API'er (overordnet)

Den konkrete udformning følger eksisterende API-mønstre.

**Kunde (bruges i fase 2)**
- Tilmelding med e-mail, navn, samtykke og accept af vilkår
- Anmod om login-link via e-mail
- Verificér login-link og opret session
- Hent eget stempelkort, belønninger og historik
- Hent QR-token
- Opdatér nyhedsbrevssamtykke og anmod om sletning

**Merchant (bruges i fase 3)**
- Slå medlem op via QR-token eller e-mail
- Giv stempel (med idempotensnøgle)
- Indløs belønning (med idempotensnøgle)
- Manuel korrektion

**Admin**
- Læs og gem indstillinger
- Oversigtstal og grafer efter filtre
- Medlemsliste, detaljer og log, inkl. CSV-eksport

**Sikkerhed i login og QR**
- Login-linket kan kun bruges én gang og udløber efter 15 minutter. Der er rate limiting på anmodninger.
- Sessionen varer som standard 180 dage (indstilling), så kunden ikke skal logge ind ved kassen.
- QR-tokenet er signeret, kortlivet og skifter løbende, fx hvert 60. sekund, så et screenshot ikke kan genbruges. Det valideres altid i backend.
- Login-mailen indeholder ingen markedsføring.

---

## 12. Test og accept

Fase 1 er godkendt, når mindst følgende er testet:

- [ ] Køb under minimumsbeløbet giver ikke stempel.
- [ ] Køb fra Wolt eller Uber Eats kan aldrig give stempel.
- [ ] Indstillingen for rabat- og kampagneordrer virker begge veje.
- [ ] Det N'te stempel opretter en belønning og starter et nyt kort.
- [ ] Gentagne kald med samme idempotensnøgle giver kun ét stempel og én indløsning.
- [ ] En belønning kan ikke indløses to gange.
- [ ] Udløb af stempler og belønninger sker korrekt og logges.
- [ ] Ændrede indstillinger gælder kun fremadrettet.
- [ ] Hver rettighed afviser kald fra brugere uden rettigheden, også direkte API-kald.
- [ ] Inaktive medarbejdere kan ikke logge ind eller kalde merchant-API'er.
- [ ] Data er afgrænset pr. tenant og brand, og filtrene viser korrekte tal.
- [ ] Tilmelding uden samtykke afvises, og samtykket logges med tekstversion.
- [ ] Afmelding af nyhedsbrevet bevarer medlemskab og stempler og synkroniseres med Omnisend.
- [ ] En eksisterende kunde matches på e-mail uden dublet.
- [ ] Login-link virker kun én gang og udløber efter 15 minutter.
- [ ] Et udløbet eller ændret QR-token afvises.
- [ ] Admin bruger eksisterende komponenter og design.

---

## 13. Afklarede beslutninger

1. **Udløb:** Stemplerne udløber ved 6 måneders inaktivitet. Hvert nyt stempel nulstiller fristen. Perioden kan indstilles.
2. **Beløbsgrundlag:** Betalt beløb inkl. moms efter rabat.
3. **Belønningens gyldighed:** Indstilling, standard 3 måneder.
4. **Afdelinger:** Indstilling, standard er, at kortet gælder på tværs af alle afdelinger under samme brand.
5. **Kundens session:** 180 dage.
6. **Rabat- og kampagneordrer:** Indstilling, standard er slået fra.
