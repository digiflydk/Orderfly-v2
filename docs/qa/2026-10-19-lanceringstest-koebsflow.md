# Lanceringstest af købsflowet (2026-10-19)

Gennemgang før lancering 1. november: købsflow fra start til slut, ordrer på salgssiden, kundeoprettelse, cookie-samtykke (ja/nej), kurv, kassen og mail. Live kørte release `016e3e6`.

## Hvad er testet
- **Hele testsuiten** (`tests/unit`, 128 filer) med Chromium. 116 filer bestod. 12 fejlede, og de samme 12 fejlede på en ren `main`, så fejlene skyldtes ikke ændringerne her. De tre, der rammer checkout, er rettet (se nedenfor).
- **Købsflowet** (30 filer, 466 tests, alle grønne efter rettelserne):
  - Kurv: genberegning, gendannelse og annullering.
  - Kassen: browser, route, prisvalidering, forsøg og session.
  - Stripe: livscyklus og webhook-afregning.
  - Betaling ved afhentning.
  - Ordre- og afhentningsmail.
  - Kundeidentitet og kundeoprettelse.
  - Cookie-banner, samtykke og rapport.
  - Omnisend ved betalt ordre.
  - Tracking-samtykke.
- **Kodegennemgang:**
  - Kassen (`src/app/checkout/actions.ts`): kunden oprettes eller opdateres, før der laves ordre og Stripe-session.
  - Webhook og afregning (`settle-checkout.ts`): ordren sættes til Betalt, og faktura, kundens totaler og mailjob oprettes i én idempotent transaktion. Beløb, valuta, brand og lokation kontrolleres.
  - Salgssiden bruger `paidAt`.
  - Mailworkeren.
- **Read-only på live:**
  - Svartider (TTFB):

    | Side | Svartid |
    |---|---|
    | `/esmeralda` | 1,2–1,5 s |
    | `/esmeralda/amager` | 0,5–1,0 s |
    | Kassen | 0,8–1,5 s |
    | Cookietekster | 0,3–1,1 s |

  - Mail-heartbeat (Supabase cron `notification-worker-every-minute`): kørt 1440/1440 gange på 24 timer.

## Live-portalen esmeralda.orderfly.dk
Lanceringsadressen er testet i Chromium på desktop og som iPhone 13. Alle skrivninger blev opfanget i browseren og sendt ikke til serveren: gemning af cookievalg, analytics, spil-events og `/api/checkout/session`. Der er derfor ikke oprettet ordrer, kunder eller samtykker.

**Kode for subdomænet:**
- Middleware og `brand-subdomain.ts` sender `/`, `/{lokation}` og `/{slug}/…` til Esmeraldas egne sider.
- Kassen bygger Stripes `success_url` og `cancel_url` ud fra den adresse, kunden står på. Samtykke-ruten sammenligner afsender med samme adresse. Cookien `of_consent_identity` gælder kun for subdomænet, og kassen kaldes på samme adresse.
- Der er ingen hårdkodede `orderfly.dk`-adresser i købsflowet.

**Resultater på live:**

| Område | Resultat |
|---|---|
| Forside, restaurantvalg og menu | Virker. Menuen vises 1,1 s efter klik, og et genindlæst link virker. Både `/esmeralda-pizza-amager` og `/esmeralda/esmeralda-pizza-amager` virker. |
| Cookie: afvis | Alle valgfrie kategorier sendes som `false`, og der sættes ingen session- eller attributionscookies. Banneret er væk efter genindlæsning. |
| Cookie: accepter | Alle kategorier er `true`. Tracking-cookies sættes først herefter. |
| Cookie: tilpas og skift senere | Gemmes og vises igen korrekt. Et nyt valg sendes med højere `choice_revision`. |
| Kurv og priser | 2 × Margherita med svampe og kylling = 208 kr. Pose 4 kr., i alt 212 kr. og moms 42,40 kr. Levering: 168 + 49 + 4 = 221 kr. |
| Minimum ved levering | Under 100 kr. vises "Tilføj varer for 21,00 kr.", og "Til kassen" er spærret. |
| Kassen | Den tomme formular kan ikke sendes. Forkert e-mail og manglende accept af handelsbetingelser giver danske fejlbeskeder. En gyldig ordre sender brand, lokation, varer, priser og `esmeralda`/`esmeralda-pizza-amager`, hvilket giver retur til `esmeralda.orderfly.dk`. Både online betaling og betaling ved afhentning er afprøvet. |
| Mobil | Hele flowet virker uden vandret scroll. "Se kurv" vises nederst. |
| Bekræftelses- og annulleringsside | Vises på subdomænet med danske beskeder, når ordren ikke findes. |
| Fejl i browseren | Ingen JavaScript-fejl. |

**Bemærkninger:**
- Logoet ligger på `i.postimg.cc`, som testmiljøet ikke kunne nå. Kontrollér selv logoet på en telefon. Flyt det gerne til jeres egen lagring, fordi en gratis billedtjeneste er en risiko ved lancering.
- `/api/public/games/config` svarer 404, når der ikke er et skrabelod på siden. Det er forventet.

## Fundet og rettet
1. **Cookie ja/nej blev ikke opdateret på kundekortet.** En kunde, der allerede var knyttet til et samtykke, beholdt sit første valg på profilen. Det gjaldt også, når kunden senere skiftede fra ja til nej. Nu får profilen det nyeste valg, men et ældre valg fra en anden browser overskriver ikke et nyere. Se `docs/cookie-consent-management.md`.
2. **Restaurantlisten sendte et indlejret billede på ca. 390 KB to gange** (776 KB af i alt 797 KB HTML på `/esmeralda`). Billedet serveres nu som komprimeret billed-URL ligesom resten af butikken. Se `docs/storefront-performance.md`.
3. **Checkout-tests, der var gået i stykker uden at nogen opdagede det.** CI kørte dem ikke.
   - `checkout-reliability` "kundefejl stopper betalingen" testede ikke længere fejlen, fordi kunden nu skrives i en transaktion.
   - `checkout-recovery-regressions` og `promotion-review` (rabatreservationer og dobbeltkunder) manglede mocks.
   - Rettet, og de er nu med i CI-trinnet "Checkout, customer and order mail regression" sammen med de øvrige kernetests for checkout, så de ikke går i stykker igen.

## Åbne punkter (ikke rettet her)
- **Ingen gennemført betaling på live i denne test** (kassen er testet frem til afsendelse). Reglerne forbyder skrivning til produktionsdata uden en kontrolleret plan, og live-testen 2026-10-18 brugte Stripe i testtilstand. Før 1. november bør I lave et kontrolleret køb på https://esmeralda.orderfly.dk:
  - Stripe i den tilstand, I lancerer med.
  - Én afhentningsordre og én leveringsordre.
  - Én ordre med betaling ved afhentning.
  - Én ordre, hvor cookies er afvist.

  Kontrollér for hver: ordren på salgssiden, kundekortet (navn, e-mail, telefon, adresse, cookie-samtykke), bekræftelsesmailen inden for 1–2 minutter og fakturaen. Bagefter skal testordrerne ryddes op som i `docs/test-order-cleanup-2026-10-18.md`.
- **Mail-heartbeatet får timeout hos Supabase i ca. 5 % af kaldene** (36 af 720 på 6 timer). `pg_net` venter kun 5 sekunder, mens ruten må køre i op til 60 sekunder. Ruten arbejder sandsynligvis færdig, men det bør ses efter i App Hosting-loggen. Det kan forsinke en mail med et minut.
- **9 testfiler uden for købsflowet fejler stadig.** De samme fejl findes på `main`:
  - `combo-image`, `legacy-promotion-details`, `order-flow-71` (én test om upsell), `product-page-browser`, `superadmin-promotion-pages` og `checkout-availability`. `checkout-availability` hænger efter test 7, som handler om nyhedsbrevsrabat.
  - `admin-overview-browser`, `games-editor-browser` og `vendor-tracking-browser` fejler af miljøårsager: skrifthøjde og browserversion.
