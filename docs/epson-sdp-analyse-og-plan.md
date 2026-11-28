# Epson-printere – analyse og plan

Status: **Analyse og plan klar til godkendelse (2026-11-28).** Der er ikke ændret applikationskode.
Grundlag: `main` @ `3bb3d98` (Orderfly-v2, release 1.1.1). Esmeralda-repoet berøres ikke.

Byggeriet starter først, når ejeren har godkendt planen og besvaret spørgsmålene i afsnit 6.

---

## 1. Kort fortalt

- Epson har en cloud-funktion, **Server Direct Print (SDP)**. Den virker som Star CloudPRNT: printeren spørger selv vores server hvert par sekunder, om der er noget at printe. Der skal ikke åbnes porte i restaurantens netværk, og der skal ikke være en PC.
- SDP passer på jeres nuværende printarkitektur. Kø, job-status, adgangskoder, leases, udløb, routing, automatisk print og genudskrift kan genbruges. Det nye er:
  - selve Epson-protokollen;
  - en konvertering fra vores bon-billede (PNG) til Epsons XML-format;
  - en udvidelse af printerkonfigurationen.
- **Anbefalet første version:** TM-m30II- og TM-m30III-familien med 80 mm papir, leveret som én release (1.2.0) bag de eksisterende printflag.
- **Uden for første version:** USB-printere, TM-T20-serien uden SDP, TM-T88-serien (anden opløsning) og at én Epson-printer videresender til andre printere. De er beskrevet i afsnit 7.

## 2. Hvilke Epson-printere kan bruges

Epsons officielle liste over modeller med Server Direct Print (manual Rev.U, 2023-08-21) indeholder bl.a.:

| Gruppe | Modeller |
|---|---|
| m-serien | TM-m30II-H, TM-m30II-NT, TM-m30II-S, TM-m30II-SL, TM-m30III, TM-m30III-H, TM-m50, TM-m50II, TM-m50II-H |
| T88-serien | TM-T88VI, TM-T88VI-iHUB, TM-T88VII |
| Øvrige | TM-L100, TM-H6000V samt de ældre TM-i/TM-DT "intelligent"-modeller |

**Ikke på listen:**
- almindelig TM-m30 (første generation);
- TM-m30II uden endelse;
- TM-m10;
- TM-T20II/III/X;
- TM-T82III.

TM-T20III findes med Ethernet. Den kan printe lokalt via ePOS, men ikke hente job fra skyen. USB-modellerne kan ingen af delene.

**Opløsning:** Vores bonner tegnes i 203 dpi med 576 punkters bredde til 80 mm og 384 punkter til 58 mm (`src/lib/receipts/print-layout.ts:44`).
- m-serien bruger 203 dpi, så bonnerne kan bruges uændret.
- TM-T88VI/VII bruger 180 dpi og 512 punkter. De kræver skalering og er derfor ikke med i første version.

Begge dele skal bekræftes i Epsons tekniske referenceguide for hver model.

## 3. Protokollen (Server Direct Print)

Ud fra Epsons SDP-manualer (uddrag; den fulde manual er ikke læst, se afsnit 6):

1. **Printeren spørger:** Med det interval, der er sat i printeren (typisk 5 s), sender den `POST` som `application/x-www-form-urlencoded` til den adresse, der er indtastet i printerens Web Config. Feltet `ConnectionType=GetRequest` betyder "har du noget til mig?", og `ID` er printerens indstillede enheds-id.
2. **Serveren svarer:** Svaret er tomt, hvis der ikke er noget job. Ellers er det XML med `<PrintRequestInfo Version="2.00">` og én `<ePOSPrint>`, som indeholder:
   - `<Parameter>` med `devid` (`local_printer`), `timeout` og `printjobid`. Vi bruger vores claim-token som `printjobid`.
   - `<PrintData>` med ePOS-Print XML: `<image>` med bonbilledet og `<cut type="feed"/>`.
3. **Printeren melder resultatet:** Den sender et nyt `POST` med `ConnectionType=SetResponse` og `ResponseFile`. Det er XML med `<PrintResponseInfo Version="2.00">`, der for hver `printjobid` angiver `success="true|false"` og eventuelt en fejlkode, fx `EPTR_REC_EMPTY` (papir slut) eller `EPTR_COVER_OPEN`.
4. **Billedformat:** `<image width height color mode="mono">` indeholder base64-kodet rasterdata med 1 bit pr. punkt og 1 = sort. Rækkerne er udfyldt til hele bytes, og bredden bør være deling med 8. Vores bredder (576/384) opfylder det.
5. **Adgang:** Printeren sender over HTTPS. Den skal kunne godkende vores certifikatkæde (Google-administreret certifikat på App Hosting). Printerens SDP-opsætning har felter til ID og adgangskode, som vi forventer sendes som HTTP Basic. Begge dele skal verificeres på en rigtig printer.

### Forskellen fra CloudPRNT

CloudPRNT bruger tre kald: poll, GET af jobbet og DELETE med resultatet. SDP bruger ét kald, hvor jobbet ligger direkte i svaret, og resultatet kommer i et senere kald.

## 4. Analyse af koden

### 4.1 Kan genbruges uændret
Følgende er neutralt i forhold til printerprotokollen:
- køen: `outbox.ts`, `queue-*.ts` og `printJobId`;
- reglerne for, hvilke ordrer der må printes: `domain.ts`;
- claims, leases og udløb af ikke-sendte job og tilbud: `native-claim.ts`, `unsent-print-expiry.ts`, `expired-offer-cleanup.ts`;
- historik og digests: `print-result-native.ts`;
- livscyklus og køgennemgang: `lifecycle.ts`, `queue-review.ts`;
- adgangskoder til printere (udstedelse, rotation, tilbagekaldelse): `device-credentials-*.ts`, `device-auth*.ts`;
- forbindelsesstatus: `connection-status.ts`;
- poll-begrænsning: `cloudprnt-poll-admission.ts`;
- bon-layoutet (SVG til 1-bit PNG): `print-layout.ts`, `print-raster.ts`;
- feature-flagene.

Den eksisterende Basic-adgangskode (brugernavn `orderfly`, 43 tegn) kan også bruges til Epson, hvis printeren sender Basic auth.

### 4.2 Skal gøres generelt (i dag låst til Star)
1. **Konfiguration:** `domain.ts:9-11` og `configuration.ts:7,17,19,22-29` udvides til
   ```
   manufacturer: 'star' | 'epson'
   model: 'mc-print2' | 'mc-print3' | 'tm-m30ii' | 'tm-m30iii'
   transport: 'cloudprnt-http' | 'cloudprnt-mqtt' | 'epson-sdp'
   ```
   En regel sikrer, at kombinationerne passer sammen: Epson-modeller kun med `epson-sdp`, og i første version kun 80 mm.
   - Der kommer **ingen nye felter**, så grænsen på 10 nøgler i `device-auth-native.ts:60` overholdes.
   - Gemte Star-printere valideres uændret.
2. **Én fælles regel for "printeren henter selv sine job":** Omkring 15 steder tjekker i dag `manufacturer === 'star' && transport === 'cloudprnt-http'`. De erstattes af én funktion i `configuration.ts`, så logikken ikke kopieres. Det gælder blandt andet:
   - `manual-print-native.ts:36-38` og `manual-print-request.ts:51`;
   - `ordinary-output-policy.ts:78,163-164,182-184` og `automatic-output-policy.ts:20`;
   - `receipt-print-content.ts:146` og `merchant-reprint.ts:39,47`;
   - `intent-target-policy.ts:184` og `pilot-status.ts:55`;
   - `pilot-qualification-consumption.ts:68` og `direct-test-print.ts:55-57`;
   - klientfiltrene i `kitchen-reprint.tsx:63` og `reprint-controls.tsx:72`.
3. **Registrering af resultater:** I dag tager `recordOrdinaryPrintResult` (`ordinary-print-native.ts:212`), `recordManualPrintResult` (`manual-print-native.ts:155`) og `prepareCloudPrntPrintConfirmation` (`print-result-native.ts:162`) imod en CloudPRNT-query. De ændres til at modtage et neutralt `{ token, outcome: 'confirmed' | 'reported_failure' | 'uncertain' }`. Selve fortolkningen af CloudPRNT-queryen flyttes ud i `ordinary-print-http.ts`, så Star-ruten opfører sig præcis som før.
4. **Navngivning:** `verifyCloudPrntHttpDevice` og `createCloudPrntClaimAttempt` er reelt neutrale. De omdøbes til printer-neutrale navne i samme ændring; alle kaldere opdateres, og de gamle navne slettes.
5. **Billeddata:** Jobbet fryses fortsat som PNG, og PNG'ens sha256 er fortsat jobbets identitet i dispatch, levering, historik og resultater. Epson-ruten omsætter PNG'en til 1-bit raster i det øjeblik, jobbet sendes. Til det bruges `sharp`, som allerede er en afhængighed. Det betyder ingen schemaændring i Firestore og ingen ny frosset repræsentation.
6. **Brugerflader i SuperAdmin:** Star-tekster og -valg skal udvides med Epson i:
   - `printer-connection-form.tsx`, `printer-configuration-form.tsx` og `printer-overview.tsx`. `readPage` afviser i dag alt andet end Star, og det skal udvides.
   - `routing-editor.tsx`, hvor klientvalideringen er låst til `'star'`.
   - `printer-credentials-panel.tsx`, `printer-activation-panel.tsx` og `pilot-controls.tsx`.
   - `printer-pilot-address.tsx`. Den bygger CloudPRNT-adresser og skal vise SDP-adressen og en kort opsætningsguide til Web Config: TM-i Settings → Services → Server Direct Print, URL, interval 5 s, ID/adgangskode og Device ID `local_printer`.

### 4.3 Nyt
| Del | Placering (forslag) | Indhold |
|---|---|---|
| Protokol | `src/lib/printing/epson-sdp.ts` | Ren, afgrænset parsing af formular-POST (størrelsesgrænse, ukendte og dublerede felter afvises), parsing af `ResponseFile`-XML til neutrale udfald og opbygning af `PrintRequestInfo`-svaret. Ingen I/O. |
| ePOS-billede | `src/lib/printing/epos-image.ts` | 1-bit PNG til base64-raster (1 = sort, rækker udfyldt til hele bytes) og `<image>` + `<cut type="feed"/>`. |
| HTTP | `src/lib/printing/epson-sdp-http.ts` | Kræver HTTPS og Basic auth og bruger poll-begrænsningen. `GetRequest` henter og leverer jobbet i ét skridt, med samme rækkefølge af manuelle og ordinære job som Star. `SetResponse` registrerer resultatet. Kontakt registreres i `connection-status`. |
| Ruter | `src/app/api/epson-sdp/[brandId]/[locationId]/[printerId]/route.ts` og `.../epson-sdp-pilot/...` | Samme flag og samme opdeling i test og live som CloudPRNT-ruterne. |
| Pilot | `pilot-qualification.ts` | Star kvalificeres med en firmwareforespørgsel (`stario_firmware_query`). SDP sender ikke firmware, så Epson kvalificeres med en ny metode, `epson_sdp_testbon`: en syntetisk testbon, som printeren selv har meldt `success="true"` på. |
| Test | `tests/unit/printing-epson-sdp.cjs`, `printing-epos-image.cjs`, `tests/helpers/epson-sdp-simulator.cjs` | Se afsnit 5.3. Tilføjes i `scripts/ci/steps.mjs`. |
| Docs | `docs/printing-epson-sdp.md`; opdatering af `printing.md`, `printing-simple-setup.md` og `FILE-MAP.md` | Protokoldelmængde, kilder og opsætningsguide. |

### 4.4 Sikkerhedsregler, der bevares
Epson-ruten følger de samme forsigtige regler som Star:
- **Mistet svar:** Hvis vi har sendt et job, men aldrig fået et resultat, bliver det `uncertain`. Det blokerer nye job og kan ikke gentages automatisk, så der ikke printes dobbelt.
- **Fejl fra printeren:** En fejlmelding gør dispatchen `failed` og blokerer printeren. Det er ikke bevis for, at der ikke kom papir ud.
- **Svar for forkert job:** Et `SetResponse` for et ukendt eller fremmed `printjobid` afvises.
- **Identifikation er ikke adgang:** MAC-adresse og ID identificerer kun printeren og giver aldrig adgang. Adgang kræver altid den hemmelige adgangskode og kontrol af brand og afdeling i samme transaktion.
- **Ingen output uden flag:** Der printes intet, før de eksisterende flag tillader det.

## 5. Plan

### 5.1 Parallelle agenter
Ja, efter et fælles første skridt.

| Trin | Hvem | Indhold |
|---|---|---|
| 0 | Mig | Bekræft protokollen mod Epsons fulde manual (afsnit 6, spørgsmål 3). |
| 1 | Mig | Konfiguration og den fælles regel for "henter selv" (4.2 punkt 1–2) samt neutrale resultater (4.2 punkt 3–4). Det rører køens kerne og skal ligge først, så de andre dele bygger på det. |
| 2a | Agent A | Protokol, ePOS-billede og simulator med unit-tests (4.3, rene moduler uden afhængigheder). |
| 2b | Agent B | SuperAdmin-brugerflader, opsætningsguide og browser-tests (4.2 punkt 6). |
| 3 | Mig | HTTP-lag og ruter, der binder 2a på trin 1, plus pilotkvalificering og dokumentation. |
| 4 | Mig | Slank kode-gennemgang (ingen duplikater eller døde stier), `npm run ci` på det endelige head, uafhængig review, merge, deploy og live-verifikation. |

Alt samles i én branch og én release.

### 5.2 Release
- Én release, **1.2.0** (minor, ny funktion), med `package.json`, `docs/releases.md` og en ikke-teknisk releasemail.
- Der oprettes et GitHub-issue med acceptkriterier, før byggeriet starter.
- **Live-verifikation efter deploy:** kun læsning og afvisninger.
  - `/api/health` viser 1.2.0.
  - Epson-ruten afviser kald uden adgangskode (401) og over HTTP.
  - De eksisterende Star-ruter og deres tests er uændrede.
- **Fysisk print er et separat pilottrin bag flaget**, ligesom for Star. Det markeres ikke som bestået, før en rigtig printer har printet en testbon og en ordre.

### 5.3 Test
- **Protokol:**
  - gyldige og ugyldige formularer;
  - for store og dublerede felter;
  - `GetRequest` uden job (tomt svar) og med job (korrekt XML og token);
  - `SetResponse` med succes, med fejl og for et ukendt job;
  - mistet svar, der giver `uncertain` og blokerer;
  - gentagne resultater for samme job (idempotent) og modstridende resultater (afvises).
- **Billede:** referencebillede med kendte pixels, bredde 576, korrekt inversion og byte-udfyldning samt grænsen for maksimal størrelse.
- **Regressioner:** De fire tests, der i dag kræver at Epson afvises, ændres til at kræve at ukendte producenter afvises. Hele Star-suiten skal være grøn uændret.
- **Brugerflader:** oprettelse af Epson-printer, visning af SDP-adresse og opsætningsguide, og at routing-editoren og genudskrift viser Epson-printere.

## 6. Spørgsmål til ejeren

1. **Modeller:** Hvilke Epson-modeller har jeres kunder? Forslaget er TM-m30II (-NT/-S/-SL/-H) og TM-m30III med 80 mm. Skal TM-m50/TM-m50II eller 58 mm-papir med i første version?
2. **Testprinter:** Kan I skaffe en TM-m30III (eller en anden model fra listen) til det fysiske pilottrin? Uden en rigtig printer kan certifikat, Basic auth og billedudskrift ikke bekræftes.
3. **Epsons manual:** Epsons fulde SDP-manual (`files.support.epson.com`) er tilladt i netværket, men download blev afvist af tilladelsesreglerne i sessionen. Tillad download, eller upload PDF'en ("Server Direct Print User's Manual"), så protokollen kan bekræftes før trin 1.
4. **USB-kunder:** Er det i orden, at USB-printere og TM-T20 uden SDP ikke understøttes i denne release, og at kunderne i stedet anbefales en TM-m30III?

## 7. Uden for denne release (mulige senere trin)

- **TM-T88VI/VII:** 180 dpi kræver skalering til 512 punkter i rasteriseringen.
- **Videresendelse:** En SDP-printer kan sende job videre til andre Epson-netværksprintere (fx TM-T20III Ethernet) via `devid`. Det giver ældre køkkenprintere mulighed for at være med.
- **USB-printere:** Kræver en lokal agent på en PC (fx PrintNode eller QZ Tray) eller en anden printer. Det anbefales ikke at bygge vores egen agent.
- **Epsons statusmeldinger:** Ikke nødvendige, fordi forbindelsesstatus allerede følger af printerens poll.

## Kilder

- Epson, *Server Direct Print User's Manual Rev.U*, modelliste (download3.ebz.epson.net, ov_SDP_um_en_revU.pdf).
- Epson, *Server Direct Print User's Manual* Rev.J/K, uddrag om GetRequest/SetResponse og PrintRequestInfo (files.support.epson.com/pdf/pos/bulk/).
- Epson, *ePOS-Print XML reference*, `<image>` og `<response>` (download4.epson.biz/sec_pubs/pos/reference_en/epos_print/).
- Epson TM-m30III firmware-noter (Server Direct Print-rettelser) og TM-m30III/m50II Web Config-guide.
- Odoo, *Epson Server Direct Print* (opsætning: Device ID `local_printer`, interval 5 s).
