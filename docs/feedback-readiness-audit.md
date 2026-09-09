# Quality/feedback: gennemgang og driftsklarhed (#85)

Gennemgået 9. september 2026 fra main `0102a02`. Omfang: aktive Next-ruter under `src/app/feedback`, `src/app/superadmin/feedback`, spørgsmålsbyggeren, ordreknappen, bookinginvitationen, svarvalidering og integrationens kundehistorik. Ældre kopier under `src/feedback` er ikke aktive App Router-ruter.

## Konklusion

Modulet er **ikke klar til fuld drift**. PR'en retter reproducerede kodefejl i administration og besvarelse, men den færdiggør ikke afsendelse, den eksisterende identitets-/rettighedsmodel eller en kvalitetsrapport. Ingen mails/SMS, produktionsdata, merge eller deployment er udført under gennemgangen.

## Bekræftede fund og rettelser

| Fund | Konsekvens | Rettelse i PR |
| --- | --- | --- |
| Spørgsmålslisten læste `collectionGroup('questions')`; oprettelse skrev `feedbackQuestionsVersion` | Oprettede versioner manglede i listen eller gav forkerte redigeringslinks | Én fælles Admin-læser for liste, redigering og offentligt formularvalg |
| Feltnavne name/label/active matchede ikke versionLabel/isActive | Tomme kolonner og ukendt status | Tabellen viser den faktiske version, sprog og oplevelsestyper |
| Klient-Firestore på serversider og rå timestamps | Server-/serialiseringsfejl | Admin SDK og rekursiv konvertering ved server/klient-grænsen |
| Indlejret id kunne overskrive dokumentets id | Forkert feedback/version blev åbnet | Dokument-ID er autoritativt |
| Manglende/ugyldig receivedAt | Indbakke og detaljeside kunne crashe | Sikker datoformatering; dataløse poster udelades ikke længere af orderBy |
| Tomme spørgsmål, dublerede ID'er og ugyldige valgmuligheder kunne gemmes | Kunden fik en ubrugelig formular | Serverskema med begrænsninger for spørgsmål, muligheder, ID'er og min/max |
| createdAt blev overskrevet ved redigering | Mistet oprettelsesdato | Bevares ved update; manglende version kan ikke genoprettes ved en fejl |
| Flere aktive versioner for samme sprog/oplevelse | Vilkårligt formularvalg | Aktivering kontrolleres transactionelt med en fælles låsepost; konflikt afvises |
| Aktiv formular blev valgt uden sproghensyn | Kunden kunne få forkert sprog | Standard da, valgfri `?lang=en` mv.; eksisterende konflikter vælges deterministisk |
| null/false/tomme værdier kunne blive NPS=0 | Forurenede svar | Afvisning af ikke-numeriske værdier; ægte 0 bevares |
| Gentagen ordrebesvarelse oprettede nye poster | Dubletter og skæve ratings | Deterministisk kilde-ID og transaction; eksisterende legacy-svar respekteres |
| Bookingbesvarelse | Risiko for regression ved ændring af fælles motor | Invitation forbruges fortsat transactionelt; test for retry og ugyldig token |
| Moderation accepterede vilkårligt payload og brugte set/merge | Kunde/brand/rating kunne ændres; tomme feedbackposter kunne oprettes | Strengt whitelist-skema og update på eksisterende dokument |
| Netværksfejl i formularer/moderation var ikke håndteret | Fejl uden forklaring; UI viste forkert public-status | Bevar svar/kladde, vis fejl og rul optimistisk status tilbage |
| Debug-API returnerede rå data uden autentificering | Unødvendig offentlig dataadgang | Endpoint returnerer 404 uden databaselæsning |
| E-mailfunktion loggede kunde/link og returnerede simuleret succes | Administrator troede, at mail var sendt | Returnerer tydelig ikke-konfigureret status; ordreknappen er deaktiveret med forklaring |
| Feedback Settings var en formular med mockdata uden gemmefunktion | Falsk indtryk af gemt tidsplan/skabelon | Erstattet med ærlig status og link til spørgsmålsadministration |

## Mangler før fuld drift, prioriteret

### 1. Reel adgangskontrol (blokerer drift)

`src/lib/permissions.ts` returnerer fortsat true. De eksisterende `hasPermission`-kontroller er ikke autentificering. Superadmin læser feedback på tværs af brands, og opdatering/sletning kender ikke den indloggede administrators tilladte brands. PR'en validerer payload og referencer, men indfører ikke en ny loginmodel. Der skal etableres serververificeret session, roller og brandadgang, før modulet kan erklæres beskyttet. Firebase-regler for feedback, invitationer og konfigurationsdokumenter skal verificeres separat.

Legacy-ordrelinks bruger orderId + customerId. De to ID'er er ikke en signeret invitation eller bevis for en gennemført kundeoplevelse. Den eksisterende kontrakt bevarer disse links. Ordrefeedback bør flyttes til tidsbegrænsede invitationer, tilsvarende booking, med en aftalt overgang for gamle links og krav til gennemført/annulleret/refunderet ordre.

### 2. Rigtig afsendelse og automation (blokerer automatisk feedback)

Der findes ingen implementeret ordre-feedbackmailer, afsendelseskø, scheduler, reminder-stop efter svar eller autosvar i dette modul. Bookingintegrationen udsteder et link; den sender ikke i sig selv en invitation til kunden. Esmeraldas Omnisend-integration skal kobles til en konkret feedbackhændelse med afsender, skabelon, forsinkelse, remindergrænse, idempotens, retries og registreret leveringsstatus. Status må kun være sendt, når udbyderen har accepteret beskeden. Der er ikke foretaget nogen afsendelse i denne PR.

Settings kan først gemme meningsfulde driftsindstillinger, når den tilhørende afsendelsesfunktion bruger dem. En settings-database alene ville fortsat være en funktion uden virkning.

### 3. Skabelonpolitik og versionering

Spørgsmålsversioner er i dag globale på tværs af brands og er målrettet sprog + pickup/delivery/booking. Der er intet brandId på skabelonen. Beslut om platformen skal dele skabeloner eller tilbyde brand-/lokationsspecifikke versioner. Eksisterende aktive dubletter ændres ikke automatisk; gennemgå dem ved release. Aktivering af en ny konfliktende version afvises med besked om først at deaktivere den gamle. Nye versioner er kladder som standard.

Svar gemmer autoritative spørgsmålstekster og typer, så gamle besvarelser bevarer deres betydning. En fuld publicér/arkiv-model og idempotent oprettelse af admin-kladder ved tabt gemmesvar er endnu ikke implementeret.

### 4. Kvalitetsrapportering og offentlig visning

Der er en indbakke og en detaljeside, men ingen dedikeret kvalitetsrapport med perioder, svarprocent, udvikling, lokationssammenligning eller opfølgning på dårlige oplevelser. Når flere stjernespørgsmål besvares, gemmer den nuværende udtrækning den sidste rating som hovedrating. Definér samlet rating versus delratings og en NPS-beregning, før tallene bruges som KPI'er. Visning uden ratings må ikke fortolkes som en reel nulvurdering.

`showPublicly` gemmes som moderationsflag, men der blev ikke fundet en aktiv kundekomponent/API, som viser disse godkendte anmeldelser. `maskCustomerName` er derfor ikke dokumentation for færdig offentlig anonymisering. Offentlig visning skal særskilt begrænses til godkendte, relevante oplysninger og udelade interne noter/kundekontaktdata.

Indbakken indlæser fortsat hele datasættet og tilhørende kunder. Pagination, serverfiltre og rolle-/brandafgrænset indlæsning mangler til større datamængder. Der er ikke indført en opbevarings-/slettepolitik eller auditlog for moderation.

## Test og release

```sh
npm run typecheck
node --test tests/unit/feedback-readiness.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/feedback-browser.cjs
```

Desuden er den eksisterende `tests/esmeralda-feedback-integration.spec.ts` kørt alene med én worker uden webserver/deployment. Ingen bred CI-matrix eller workflow dispatch.

Tests anvender den faktiske spørgsmåls-/feedbackkode og reelle React-komponenter med en syntetisk Firestore/Storage-fri fixture. Browser dækker opret/list/genåbn/redigér, bevaret kladde og kundesvar ved transportfejl, besvarelse på 390/1280 px samt indbakke med manglende dato og rollback af moderation. Transaktionstesten erstatter Firebase I/O, så produktions-IAM, distribuerede Firestore-låse og rigtig maillevering kræver særskilt verifikation.

Proces: kodeaudit -> målrettede rettelser/tests -> uafhængigt review -> PO-accept -> merge/deployment hos releaseansvarlig -> kontrolleret liveverifikation. Issue #85 er ikke Done, før de relevante driftskrav er afklaret og verificeret. Ingen eksisterende feedback slettes eller migreres automatisk af denne PR.
