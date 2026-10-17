# Fase 2 – Stempelkort: kundeportal – analyse og plan

Status: **Udkast til ejerens godkendelse (2026-10-17).** Der er ikke ændret applikationskode.
Grundlag: `main` @ `0f3aab9` (Orderfly-v2), hvor fase 1 PR 1–6 er merget.
Spec: [fase-2-stempelkort-kundeportal.md](fase-2-stempelkort-kundeportal.md). Bygger på [fase 1](fase-1-stempelkort-backend.md) og [fase 1-planen](fase-1-analyse-og-plan.md).

---

## Del A – Analyse

### A1. Kundens API'er fra fase 1 (findes allerede)

Alle ligger under `/api/loyalty/{brandSlug}/` (`src/app/api/loyalty/[brandSlug]/*`) med logikken i `src/lib/loyalty/stamp-card/membership.ts` og HTTP-laget i `portal-http.ts`.

| Kald | Bruges til (spec) | Bemærkning |
|---|---|---|
| `GET program` | §4.1 tilmelding, §4.5 vilkår | Programstatus, navn, antal stempler, belønning, samtykke- og vilkårstekst med versioner. Teksterne er tomme, når programmet er slået fra. |
| `POST signup` | §4.1 | Kræver begge afkrydsninger og præcis den viste tekstversion. Svaret er altid neutralt, og et eksisterende medlem får et login-link. |
| `POST login-link` | §4.2 | Neutralt svar. Rate limit pr. e-mail og IP. |
| `POST verify` | §4.2 | Bruger tokenet én gang og sætter sessionscookien. Skelner mellem `link_expired` og `link_invalid`, så vi kan vise den rigtige besked. |
| `GET me` | §4.3, §4.4, §4.5 | Kort (X af N, udløb), belønninger, historik (op til 100 hændelser, uden medarbejdere og årsager), profil og nyhedsbrevsstatus. |
| `GET qr` | §4.3 | Nyt tilfældigt token, gyldigt i 60 sekunder og kun én gang. Et nyt token ugyldiggør det forrige. Højst 20 pr. minut pr. medlem. |
| `POST consent` | §4.5 | Afmeld/tilmeld nyhedsbrev. Synkroniseres til Omnisend. Medlemskab og stempler bevares. |
| `POST logout`, `POST delete` | §4.5 | Sletning kræver `{confirm:true}` og tilbagekalder alle sessioner. |

**Sikkerhed, der allerede er på plads:** brandet findes ud fra adressen (aldrig et ID fra browseren), ændringer skal komme fra samme side som JSON, svar caches ikke, og sessionen ligger i en HttpOnly-cookie (`__Host-orderfly-loyalty`), som JavaScript ikke kan læse.

**Konklusion:** API'erne dækker hele fase 2. **Jeg forventer ingen ændringer i `src/lib/loyalty/stamp-card/` eller i datamodellen.** Al forretningslogik (hvem der må tilmelde sig, stempler, udløb, belønninger, samtykke) bliver i backend. Portalen viser kun data og kalder API'erne.

### A2. Adresse og routing

- Fase 1 har allerede lagt login-linket fast på **`https://{slug}.orderfly.dk/club/login`** (`portalLoginUrl` i `membership.ts`), fx `https://esmeralda.orderfly.dk/club/login`. Login-mailen er udrullet med det link.
- Brand-subdomæner (`docs/brand-subdomains.md`) omskriver `esmeralda.orderfly.dk/club` til den interne side `/esmeralda/club`. Portalen skal derfor ligge i `src/app/[brandSlug]/club/`, ligesom resten af de kundevendte sider.
- Next.js prioriterer en fast mappe (`club`) over afdelingssider (`[locationSlug]`). En afdeling med adressen `club` ville derfor blive skjult. I dag tjekkes afdelingsadresser ikke mod reserverede ord.
- Sessionscookien gælder kun på den adresse, der satte den. Kunden skal derfor altid bruge subdomænet.

### A3. Design: hvad brandindstillingerne indeholder i dag

| Spec kræver | Hvad koden har i dag |
|---|---|
| Logo fra brandindstillinger | Ét `logoUrl` pr. brand. Der findes **ingen** varianter (fx hvidt logo til sort baggrund). |
| Farver fra brandindstillinger | `appearances.colors` (primær, sekundær, baggrund, tekst, kant, knaptekst). Bruges allerede af webshoppen. |
| Skrifttyper fra brandindstillinger | Kun **ét** felt, `appearances.typography.fontFamily` (et navn, ingen fil). Ingen opdeling i overskrift og brødtekst. |
| Esmeralda: Bourton og Brandon, hvidt logo på sort | Esmeraldas udseende er en **fast forudindstilling i koden** for slug'en `esmeralda` (`src/styles/commerce-ui.css`: sort baggrund, guld knapper, Bourton til overskrifter, Brandon til tekst). Selve skriftfilerne indlæses kun på feedback-siderne (`src/lib/feedback/brand-styles.ts`), ikke i webshoppen, så webshoppen viser i praksis reserveskrifterne. |

**Det strider mod specifikationen:** Spec §3 siger, at logo, farver og skrifttyper skal hentes fra brandindstillingerne. Brandindstillingerne kan i dag ikke rumme to skrifttyper eller en logovariant. Se spørgsmål 1.

### A4. Den eksisterende ramme for kundevendte sider

`src/app/[brandSlug]/layout.tsx` giver alle brandsider:
- brandets farver som CSS-variabler og Esmeralda-forudindstillingen (`data-brand-slug`),
- webshoppens header (med kurv og levering), footer, cookie-banner og brandets tracking (GA/GTM, kun efter cookie-samtykke).

`layout-client.tsx` beslutter, hvilken header der vises, ud fra adressen. `/club` ville i dag blive behandlet som en menuside uden header. Den logik skal have en lille undtagelse for `club`.

**Tracking:** Login-linket bærer sit engangstoken i adressens `#`-del. Tredjeparts-tracking bør ikke køre på portalens sider (personlige data og QR-kode). Planen er at slå `BrandTracking` fra på `/club`-sider og fjerne tokenet fra adressen, før noget andet sker.

### A5. QR-kode og hjemmeskærm

- Der er **intet QR-bibliotek** i projektet. Der skal tilføjes en lille afhængighed til at tegne QR-koden i browseren (forslag: `qrcode`, ingen netværkskald). Det ændrer `package.json`/`package-lock.json`, som fase 3 måske også ændrer (scanner). Se Del D.
- Der er ingen webapp-manifest eller hjemmeskærmsikoner i projektet. Ikonet skal være kvadratisk; brandets logo er ofte bredt. `sharp` er allerede installeret og kan lave et kvadratisk ikon af logoet på brandets baggrundsfarve.
- **Kendt risiko på iPhone:** En app, der er lagt på hjemmeskærmen, og et link åbnet fra en mail-app (fx Gmail) kan have hver sin "cookie-krukke". Kunden kan derfor blive bedt om at logge ind igen inde i hjemmeskærm-appen. Det kan ikke løses i frontend alene. Planen tester det på rigtige enheder og viser vejledningen *efter* login (så sessionen findes, når appen lægges på skærmen). Viser testen et reelt problem, kommer jeg tilbage med et forslag, før der ændres i backend.

### A6. Test i projektet

- Kundens API'er er dækket af unit-tests (`tests/unit/loyalty-membership.cjs`, `loyalty-portal-routes.cjs`).
- Browsertests følger mønstret i `tests/unit/*-browser.cjs` (Playwright med Chromium, synteseret backend, ingen produktionsdata), fx `loyalty-admin-browser.cjs`. De køres i `.github/workflows/work-quality-gate.yml`.

---

## Del B – Spørgsmål til ejeren

Jeg har brug for svar på disse, før jeg bygger. Mit forslag står ved hvert spørgsmål.

| # | Spørgsmål | Mit forslag |
|---|---|---|
| 1 | **Design fra brandindstillinger.** Brandindstillingerne har kun ét skriftnavn og ét logo. Skal portalen (A) genbruge Esmeraldas eksisterende forudindstilling i koden plus de skriftfiler, feedback-siderne allerede bruger, og for andre brands bruge farver, skriftnavn og logo fra brandindstillingerne? Eller (B) skal brandindstillingerne udvides med overskrifts-/brødtekstskrift og logovarianter (ændring i datamodel og brandformular, større opgave)? | **A.** Det følger "arv det eksisterende design" og ændrer ikke datamodellen. B kan komme senere. |
| 2 | **Esmeraldas hvide logo.** Er det `logoUrl` i Esmeraldas brandindstillinger det hvide logo til sort baggrund? Feedback-siderne bruger `esmeralda-logo.png` fra Webflow. | Jeg bruger brandets `logoUrl` og tjekker visuelt. Er det det forkerte, bruger jeg feedback-sidernes logo i Esmeralda-forudindstillingen. |
| 3 | **Adresse (spec spørgsmål 1).** Fase 1 har lagt login-linket fast på `esmeralda.orderfly.dk/club`. Er det godkendt? En side direkte på esmeraldapizza.dk (Webflow) kræver en proxy eller indlejring og er ikke med i planen. | **`https://esmeralda.orderfly.dk/club`**, med links fra esmeraldapizza.dk, nyhedsbreve og kvitteringer. `orderfly.dk/esmeralda/club` sendes videre til subdomænet. |
| 4 | **Telefonnummer (spec spørgsmål 2).** | **Nej** i fase 2. Det kræver ændring af backend og datamodel (fælles kode med fase 3). |
| 5 | **Skilt-QR til disken (spec spørgsmål 3).** | Ja: en QR-kode til tilmeldingssiden (`…/club/tilmeld`) leveres som SVG-fil i `docs/stempelkort/` til tryk. Selve trykket er drift. |
| 6 | **Hjemmeskærmsikon.** Har Esmeralda et kvadratisk app-ikon? | Ellers laver jeg ikonet automatisk ud fra logoet på brandets baggrundsfarve. |
| 7 | **Reserveret afdelingsadresse.** Må jeg forhindre, at en afdeling får adressen `club`? Det er en lille ændring i afdelingsformularen (uden for `/club`-mappen). | Ja. |

---

## Del C – Plan

### C1. Sider (alle under `src/app/[brandSlug]/club/`)

Adresserne er på brandets subdomæne, fx `esmeralda.orderfly.dk/club/…`.

| Adresse | Indhold (spec) |
|---|---|
| `/club` | Er kunden logget ind: **Mit stempelkort** (§4.3). Ellers en kort introduktion med "Bliv medlem" og "Log ind". Er programmet slået fra: en venlig besked. |
| `/club/tilmeld` | Tilmelding (§4.1): navn, e-mail, to afkrydsninger (ikke forudafkrydsede), link til vilkår, "Bliv medlem". Derefter "Tjek din e-mail". |
| `/club/login` | Login (§4.2): e-mail → "Tjek din e-mail". Åbnes siden fra mailen (`#token=…`), fjernes tokenet straks fra adressen, og det sendes til `verify`. Udløbet link: tydelig besked og knap til at få et nyt. |
| `/club/historik` | Historik (§4.4): stempler, belønninger, indløsninger og udløb med dato og kanal (på dansk). Ingen medarbejdernavne (backend sender dem ikke). |
| `/club/profil` | Profil (§4.5): navn og e-mail, nyhedsbrev til/fra med forklaring, vilkår, log ud, slet medlemskab med bekræftelse. |
| `/club/vilkaar` | Programmets vilkår (fra `GET program`). |

**Sådan hentes data:**
- Siderne bygges på serveren med de samme funktioner som API'erne (`resolveBrand`, `programForPortal`, `readSession`, `memberView`). Det giver hurtig første visning uden ventespinner i køen. Der skrives intet fra serverens sidevisning.
- Alle handlinger (tilmeld, login, samtykke, log ud, slet, QR) går gennem de eksisterende API'er fra browseren.
- Udløbet eller manglende session → kunden sendes til `/club/login`.

### C2. Mit stempelkort og QR-koden

- Logo og programnavn, stemplerne som X af N (fx 8 felter, 5 fyldt) med skærmlæsertekst "5 af 8 stempler".
- "3 stempler til {belønningsbeskrivelse}" (kun tekst sat sammen af tal fra backend, ingen regler i frontend).
- Udløbsdato: "Dine stempler udløber, hvis du ikke har fået et nyt stempel inden {dato}". Vises kun, når kortet har en frist.
- Optjente belønninger med beskrivelse, udløbsdato og "Vis QR-koden ved kassen for at indløse".
- **QR-koden:**
  - Stor, sort på hvid med hvid kant, uanset brandets farver, så den kan scannes ved lav lysstyrke.
  - Hentes ved visning og fornyes automatisk ca. hvert 45. sekund, og straks når kunden vender tilbage til fanen eller appen.
  - Udløbstiden beregnes ud fra serverens tid (svarets `Date`-header), så et forkert ur på telefonen ikke holder en udløbet kode synlig.
  - Er koden udløbet, og kan en ny ikke hentes: QR-koden fjernes og erstattes af "Ingen forbindelse – QR-koden kan ikke vises" og en "Prøv igen"-knap. En gammel kode vises aldrig som gyldig.
  - Fornyelsen holder sig under backendens grænse på 20 koder pr. minut.
  - Skærmen holdes tændt, mens QR-koden vises, hvor browseren understøtter det.
- Bemærk: Hvis kunden har portalen åben i to faner, ugyldiggør den ene den andens kode (backendens regel "kun nyeste kode gælder"). Den aktive fane henter en ny, når den vises igen.

### C3. Design og ramme

- Portalen bruger brandlayoutet (farver, Esmeralda-forudindstillingen, cookie-banner og footer), men med en **enkel portal-header** (logo og menu: Kort, Historik, Profil) i stedet for webshoppens header med kurv.
- Ændring i `src/app/[brandSlug]/layout-client.tsx`: `club` får sin egen header. Ændring i `src/components/brand-tracking.tsx`: ingen tracking på `/club`-sider.
- Esmeralda (forudsat svar A på spørgsmål 1): Bourton til overskrifter og Brandon til brødtekst, indlæst med de skriftfiler, der allerede bruges på feedback-siderne, og kun på `/club`-siderne. Andre brands: farver, skriftnavn og logo fra brandindstillingerne.
- Mobil først (390 px), også tablet og computer (indholdet centreres i en smal kolonne).
- Tilgængelighed: overskrifter i rigtig rækkefølge, labels på alle felter, fejlbeskeder læses op, synlig fokus, kontrast mindst 4,5:1, tekst mindst 16 px, knapper mindst 44 px høje.
- Ydeevne: ingen store biblioteker, QR-tegning kun på kortsiden, ingen tracking.

### C4. Tilføj til hjemmeskærm

- Webapp-manifest pr. brand (`/club/manifest.webmanifest`) med brandets navn ("Esmeralda Club"), farver og start på `/club`.
- Ikoner i 180, 192 og 512 px laves på serveren ud fra brandets logo (eller app-ikon, se spørgsmål 6).
- iPhone-felterne (`apple-touch-icon`, `apple-mobile-web-app-title`).
- Diskret vejledning første gang efter login ("Tryk på Del → Føj til hjemmeskærm" på iPhone, browserens egen knap på Android). Den kan lukkes og huskes i browseren.
- Ingen service worker og ingen offline-lagring af kortet eller QR-koden (gamle koder må ikke vises).

### C5. Fejl og beskeder (alle på dansk)

| Situation | Besked |
|---|---|
| Programmet er slået fra | "Esmeralda Club er ikke åben lige nu. Kig forbi igen senere." |
| Tekster ændret under tilmelding (`program_changed`) | Formularen genindlæses med de nye tekster, og kunden bedes sætte flueben igen. |
| For mange forsøg (`rate_limited`) | "Du har prøvet mange gange. Vent lidt og prøv igen." |
| Udløbet link | "Linket er udløbet" + knap "Send mig et nyt link". |
| Ugyldigt eller brugt link | "Linket virker ikke længere" + samme knap. |
| Netværksfejl | "Ingen forbindelse" + "Prøv igen". |

Tilmelding og login viser altid samme "Tjek din e-mail", uanset om e-mailen kendes.

### C6. Ændringer uden for `/club` (fælles filer)

| Fil | Ændring | Risiko for konflikt med fase 3 |
|---|---|---|
| `src/lib/loyalty/stamp-card/*` | **Ingen** | – |
| Datamodel / Firestore / indekser | **Ingen** | – |
| `src/app/[brandSlug]/layout-client.tsx` | Egen header for `club` | Lav (webshoppen, ikke admin) |
| `src/components/brand-tracking.tsx` | Ingen tracking på `/club` | Lav |
| Afdelingsformular og servervalidering | Adressen `club` reserveres (spørgsmål 7) | Lav |
| `package.json` / `package-lock.json` | Ny afhængighed `qrcode` | **Mellem**, hvis fase 3 også tilføjer et bibliotek. Løses ved at merge `main` ind og køre `npm install`. |
| `.github/workflows/work-quality-gate.yml` | Nye tests tilføjes testlisten | **Mellem** (samme linje). Samme løsning. |
| `docs/stempelkort/README.md`, `docs/api-overview.md`, `docs/FILE-MAP.md` | Status og dokumentation | **Mellem**. Jeg tilføjer et separat afsnit "Fase 2" og rører ikke fase 3's afsnit. |

### C7. Test

**Browsertests** (`tests/unit/loyalty-portal-browser.cjs`, Playwright, 390 px og desktop, opfangede API-kald, ingen produktionsdata):
- Tilmelding: knappen virker ikke uden begge flueben; ingen er forudafkrydset; samme "Tjek din e-mail" for kendt og ukendt e-mail; programmet slået fra viser beskeden.
- Login: token fjernes fra adressen; udløbet og brugt link viser rigtig besked og knap til nyt link.
- Kort: X af N, tekst om næste belønning, udløbsdato, belønninger.
- QR: fornyes automatisk; forsvinder ved udløb uden forbindelse og viser "Prøv igen"; viser aldrig en udløbet kode.
- Historik uden medarbejdernavne; profil: afmeld/tilmeld nyhedsbrev, log ud, slet med bekræftelse.
- Tilgængelighed: labels, fokus og kontrast (axe-tjek, hvis det kan køre uden ny afhængighed; ellers manuelle tjek i testen).
- Manifest og ikoner findes og har brandets navn.

**Unit-tests:** manifest og ikon pr. brand; reserveret afdelingsadresse; ingen tracking på `/club`.

**Backendens regler** (én gang, 15 minutter, samtykke, Omnisend, sletning) er allerede testet i fase 1. Fase 2's tests bekræfter, at portalen viser dem rigtigt.

**Manuel test på rigtige enheder før accept** (staging, testbrand): iPhone (Safari og hjemmeskærm) og Android (Chrome og hjemmeskærm), inkl. login fra Gmail-appen og lav skærmlysstyrke ved scanning. Resultatet skrives i PR'en.

Desuden `npm run typecheck`, `npm run lint` og de eksisterende loyalty-tests.

### C8. Små PR'er (efter godkendelse)

1. **Ramme og tilmelding/login:** `/club`-layout og header, Esmeralda-skrifttyper, ingen tracking, reserveret `club`, `/club`, `/club/tilmeld`, `/club/login`, `/club/vilkaar`, tests.
2. **Mit stempelkort og QR:** kortet, belønninger, QR-fornyelse og offline-håndtering, tests.
3. **Historik, profil og hjemmeskærm:** `/club/historik`, `/club/profil` (nyhedsbrev, log ud, slet), manifest, ikoner og vejledning, skilt-QR i `docs/`, tests.

Hver PR merger `main` ind før merge og opdaterer `docs/stempelkort/README.md` og de øvrige docs. Jeg merger ikke selv og kører ikke Esmeralda-deploy.

### C9. Drift før brug (ingen kode)

- Programmet skal være slået til med tekster i admin (fase 1).
- Login-mailen kræver brandets mail-opsætning (fase 1, README).
- `*.orderfly.dk` skal være koblet på i App Hosting (`docs/brand-subdomains.md`). Det kunne jeg ikke verificere herfra (netværket er spærret).
- Links fra esmeraldapizza.dk, nyhedsbreve, kvitteringer og skiltet på disken sættes op af ejeren.
