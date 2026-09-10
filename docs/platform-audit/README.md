# Orderfly Platform Audit og MVP-overblik

Status: I gang

Senest opdateret: 30. juli 2026

## Formål

Denne dokumentation kortlægger Orderfly-platformen sektion for sektion ud fra den faktiske kodebase. Målet er at skabe et samlet forretningsmæssigt og teknisk overblik, identificere fejl og mangler og definere en realistisk MVP, der kan lanceres stabilt.

## Aftalt status pr. hovedområde

| Nr. | Område | Overordnet status |
|---|---|---|
| 1 | Platform og adgang | Delvist implementeret |
| 2 | Restaurantopsætning | Delvist implementeret |
| 3 | Menu og produkter | Delvist implementeret |
| 4 | Ordresystem | Delvist implementeret |
| 5 | Salg og rapportering | Delvist implementeret |
| 6 | Kunder og markedsføring | Delvist implementeret |
| 7 | Brand Website | Ikke implementeret i den aktive MVP-kodebase |
| 8 | Abonnement og betaling | Ikke implementeret som færdigt forretningsflow |
| 9 | Integrationer | Ikke implementeret som samlet produktområde |
| 10 | Drift og kvalitet | Delvist implementeret |

Bemærkning: Der kan eksistere kode, komponenter eller tidligere branches relateret til områder markeret som ikke implementeret. Et område regnes først som implementeret, når et sammenhængende brugerflow virker i den aktive kodebase og kan testes.

## Auditmetode

Hver feature vurderes efter følgende felter:

- Forretningsformål
- Primær bruger
- Brugerflow
- Routes og UI
- Server actions og API
- Firestore-data
- Rettigheder og tenant-adskillelse
- Fejlhåndtering
- Testdækning
- Implementeringsstatus
- MVP-prioritet
- Anbefalet handling

## Statusdefinitioner

- **Fungerer:** Flowet kan gennemføres og gemmer korrekte data.
- **Delvist:** Centrale dele findes, men flowet har mangler eller er ikke verificeret.
- **Defekt:** Funktionen findes, men giver fejl eller forkerte resultater.
- **UI uden funktion:** Skærmbillede eller knap findes uden et færdigt backend-flow.
- **Mock:** Funktionen bruger faste testdata eller placeholder-logik.
- **Ikke implementeret:** Der findes ikke et sammenhængende brugbart flow.

## MVP-prioriteter

- **P0:** Blokerer lancering, datasikkerhed, betaling, adgang eller ordrebehandling.
- **P1:** Nødvendig for en brugbar MVP.
- **P2:** Vigtig kort efter lancering, men kan håndteres manuelt i starten.
- **P3:** Senere forbedring.

## Første dokumenterede fund

### A-001: Adgangskontrol er ikke dokumenteret eller verificeret som et rigtigt brugerflow

- Område: Platform og adgang
- Status: Delvist
- Prioritet: P0
- Observation: Superadmin-layoutet har historisk brugt et generelt `hasPermission('users:view')`-tjek. Det er ikke i sig selv dokumentation for autentificering, sessionshåndtering, rolleindlæsning eller per-route autorisation.
- Risiko: En bruger kan potentielt få for bred adgang, eller lovlige brugere kan blive afvist forkert.
- Næste handling: Kortlæg login, session, aktuelle brugerdata, permissions-kilde, middleware og server-side kontrol på alle administrative writes.

### A-002: Superadmin-forsiden har været en placeholder

- Område: Platform og adgang / Superadmin
- Status: Delvist
- Prioritet: P1
- Observation: `/superadmin` har tidligere vist en simpel baseline-side med teksten om, at basen kører og er klar til indhold.
- Forretningsmæssig konsekvens: Platformen mangler et klart startpunkt for drift og navigation, hvis dashboardet ikke er den reelle landingsside.
- Næste handling: Beslut om `/superadmin` skal redirecte til dashboard eller vise et faktisk drifts-overblik.

### A-003: Produktions- og dataprojekt har tidligere været blandet sammen

- Område: Drift og kvalitet
- Status: Rettet, men kræver regressionskontrol
- Prioritet: P0
- Observation: Firebase App Hosting og produktionsdata bruger forskellige projekter. Firebase Admin er ændret til en navngivet app, der eksplicit skal pege på produktionsdataprojektet.
- Risiko: Fejl i runtime secrets kan give tomme sider eller adgang til forkert Firestore-projekt.
- Næste handling: Health check skal indgå i launch checklist, og centrale serverflows skal testes i staging og produktion.

### A-004: Dobbelt source tree har skabt risiko for forældet kode i deployment

- Område: Drift og kvalitet
- Status: Rettet
- Prioritet: P0-regression
- Observation: Et ekstra `workspace/src`-træ indeholdt ældre kopier af routes og blev fjernet. Root `src/` er nu eneste source of truth.
- Risiko: Fremtidige kopier kan igen skabe forskel mellem lokal kode og deployment.
- Næste handling: CI-kontrol skal fejle, hvis `workspace/`, `src/workspace/` eller andre komplette source-kopier tilføjes.

### A-005: Salgsordrer afhænger af datointerval

- Område: Salg og rapportering
- Status: Delvist
- Prioritet: P1
- Observation: `/superadmin/sales/orders` anvender `from` og `to` i URL. Manglende værdier redirecter til dags dato. Der har været en kendt situation, hvor produktionsdata ikke blev vist, og brugeren ikke havde et tydeligt datofilter.
- Forretningsmæssig konsekvens: Ordrelisten kan se tom ud, selvom der findes ordrer. Det kan give forkert driftsoverblik.
- Næste handling: Verificer det aktive client-view, synligt fra/til-filter, tidszone, inklusive slutdato og URL-synkronisering.

### A-006: Ordrelisten blander serverfiltrering og clientfiltrering

- Område: Ordresystem / Salg
- Status: Delvist
- Prioritet: P1
- Observation: Dato, brand og lokation bruges ved server-fetch, mens søgning, ordrestatus og betalingsstatus historisk er filtreret lokalt på det allerede hentede datasæt.
- Risiko: Brugeren kan tro, at søgningen dækker alle ordrer, selvom den kun dækker det aktuelle serverudsnit. Store datasæt kan desuden give performanceproblemer.
- Næste handling: Definer én filterkontrakt og dokumenter hvilke filtre der er server-side. Tilføj pagination.

### A-007: Ordrestatus kan ændres fra ordrelisten

- Område: Ordresystem
- Status: Delvist
- Prioritet: P0/P1
- Forretningsfeature: Superadmin kan åbne ordre, se detaljer og ændre status, blandt andet til leveret eller annulleret.
- Uafklaret: Validering af lovlige statusskift, audit log, rettigheder, refundering ved annullering og samtidige opdateringer.
- Næste handling: Dokumenter statusmaskinen og håndhæv den server-side.

### A-008: Kundeprofil indeholder reelle analysefeatures, men flere handlinger kan være UI uden funktion

- Område: Kunder og markedsføring
- Status: Delvist
- Prioritet: P2, med GDPR-elementer som P0
- Eksisterende features: Kundeoplysninger, ordreoversigt, total spend, loyalitetsklassifikation, feedback, cookie consent og marketing consent.
- Uafklaret: Export- og anonymiseringsknapper, datakvalitet, kundesammenlægning og lovlig sletning/anonymisering.
- Risiko: GDPR-handlinger må ikke være dekorative knapper.
- Næste handling: Test export og anonymisering end-to-end og dokumenter databevaringsregler.

### A-009: Analytics har historisk anvendt mock brand i admin-view

- Område: Salg og rapportering
- Status: Mock/delvist
- Prioritet: P2
- Observation: En brand-admin analytics-side har brugt en fast `MOCK_BRAND_ID`.
- Risiko: Forkerte data og manglende tenant-adskillelse.
- Næste handling: Funktionen skal enten kobles til aktuel bruger/brand eller fjernes fra MVP-navigationen.

### A-010: Lokationsopsætning har et betydeligt eksisterende funktionsomfang

- Område: Restaurantopsætning
- Status: Delvist
- Prioritet: P1
- Dokumenterede features: Brandtilknytning, navn, slug, adresse, status, leveringsgebyr, minimumsordre, billede, smiley-link, pickup/delivery, åbningstider, preorder, klargøringstid, leveringstid, travlhedsfaktor og manuel tidsoverride.
- Uafklaret: Slug-unikhed, validering af åbningstider, tenant-rettigheder, adressevalidering, leveringsområder og brugerfeedback ved save.
- Næste handling: Test create, edit, deactivate og delete. Delete skal vurderes mod eksisterende ordrer.

### A-011: Tidsberegning for pickup og levering er forretningskritisk

- Område: Restaurantopsætning / Ordresystem
- Status: Delvist
- Prioritet: P0
- Eksisterende logik: 5-minutters intervaller, prep time, delivery time, travlhedsfaktor, manuel override, åbningstider over midnat og preorder til næste åbne dag.
- Risici: Tidszone, sommertid, tekst som altid siger `Tomorrow`, sidste bestilling før luk, ændring af leveringsmetode og mismatch mellem client- og serverberegning.
- Næste handling: Én fælles serverautoriseret tidsberegning og automatiserede tests for kanttilfælde.

### A-012: Menuområdet har mange funktioner, men skal opdeles i stabile kerneflows

- Område: Menu og produkter
- Status: Delvist
- Prioritet: P1
- Observerede features: Kategorier, produkter, aktive produkter, tilbud, standardrabatter, combo-menuer, produktgrupper, sortering, pickup/delivery-kontekst og aktiv kategorinavigation.
- Uafklaret: Datamodelens aktuelle source of truth, prisberegning, modifier/toppings, location overrides, lagerstatus, moms og validering af rabat-kombinationer.
- Næste handling: Kortlæg menuadministration separat fra kundens menu-rendering.

### A-013: Checkout og ordrebekræftelse findes som delvise flows

- Område: Ordresystem
- Status: Delvist
- Prioritet: P0
- Observerede features: Checkout-route, kundeoplysninger, pickup/delivery, tidsvalg, cart, subtotal, produktrabat, kurvrabat, leveringsgebyr, posegebyr, administrationsgebyr, moms, total og ordrebekræftelse.
- Uafklaret: Server-side prisgenberegning, betaling, idempotency, lager/tilgængelighed, mail, fejlflow og sikker adgang til en ordrebekræftelse via order ID.
- Næste handling: Dette bliver et selvstændigt P0-auditområde.

## Foreløbig MVP-afgrænsning

### Skal være med

- Sikker login og rollebaseret adgang
- Brand og lokationsopsætning
- Kategorier, produkter og nødvendige tilvalg
- Offentlig menu pr. aktiv lokation
- Pickup og eventuelt levering, afhængigt af valideret flow
- Kurv og checkout
- Sikker server-side prisberegning
- Ordreoprettelse
- Betalingsstatus eller klart manuelt betalingsflow
- Ordreoversigt og ordredetalje
- Kontrollerede statusskift
- Basal salgsoversigt og datofilter
- Logging, audit og kritiske tests

### Skal som udgangspunkt skjules eller udskydes, indtil det er færdigt

- Brand Website
- Abonnement og billing som SaaS-feature
- Samlet integrationscenter
- Analytics med mock-data
- Knapper uden backend-funktion
- Avanceret loyalitet og marketing automation
- Code review-modul med mock-data

## Næste audit-rækkefølge

1. Authentication, session og permissions
2. Route- og navigationsinventar
3. Brands og locations
4. Menuadministration og offentlig menu
5. Cart, checkout, prisberegning og ordreoprettelse
6. Ordrestatus og driftsflow
7. Salg og rapportering
8. Kunder, samtykke og GDPR
9. CI, test, logging og launch readiness

## Definition of Done for en auditeret sektion

En sektion er først færdiggjort, når:

- Alle relevante routes og centrale filer er registreret
- Forretningsflowet er beskrevet
- Firestore paths og nøglefelter er registreret
- Rettigheder er vurderet
- Kendte fejl og risici er prioriteret
- MVP-beslutning er taget
- Manglende tests er beskrevet
- Konkrete udviklingsopgaver kan oprettes uden yderligere analyse
