# Tilvalg: måling af kundeoplevelsen

## Hændelser og privatliv

Det eksisterende samtykkestyrede analytics-flow måler `option_dialog_opened`, `option_selection_changed` og `option_product_added`. `interactionMode` skelner mellem `add` og `edit`: nye produkter vises i hovedkohorten, mens redigerede kurvvarer vises særskilt som åbnet/gemt og aldrig tæller som nye tilføjelser. Hver åbning får et tilfældigt `interactionId`; automatiske standardvalg tæller ikke som brugerændringer. Kun en gennemført kurvtilføjelse eller gemt redigering tæller som tilføjelse. Mersalg bruger de eksisterende `upsell_offer_shown`, `upsell_accepted` og `upsell_rejected`, nu med et tilsvarende visnings-ID.

Allowlisten tillader kun det begrænsede ID-format. Ingen ingrediensnavne, fritekst, email eller telefon tilføjes til målingen. Statistik uden samtykke sendes ikke til den interne collector. Eksisterende marketing-samtykke behandles fortsat særskilt. Serverens betalte ordrer er fortsat eneste grundlag for omsætning og gennemsnitsordre.

## Administration

Kundetragten viser et nyt kort, **Tilvalg og mersalg**, med antal åbninger, brugerændringer, tilføjelser/gemte redigeringer og åbninger uden målt tilføjelse. Tilføjelsesandelen matcher brand, lokation, session, produkt og samme åbning. Mersalgsaccept matcher samme tilbud og visning. Dubletter tælles én gang, uafhængigt af dashboardets generelle hændelses-/sessionstilstand. Eksisterende adgangskontrol og dato-, lokations-, enheds- og kildefiltre anvendes før beregning.

Nul målinger vises som **Endnu ikke målbart**, ikke som bevis på dårlig konvertering. Gamle hændelser uden interaktions-ID genskabes ikke. Manglende tilføjelse er ikke sikkert frafald: kunden kan stadig være i gang, have fravalgt samtykke eller fortsætte uden for datointervallet. Kortet angiver derfor begrænsningen. Accepteret mersalg er ikke nødvendigvis betalt salg.

## Vurdering af effekten

Sammenlign ens lokationer, enheder, ugedage og perioder efter tilstrækkelig indsamling. Se både tilføjelsesandel, tilbudsaccept, måledækning, betalte ordrer og gennemsnitsordre. Der hævdes ingen dokumenteret salgseffekt ved udgivelsen, og klientbaserede beløb anvendes ikke til at beregne mersalgsomsætning. Et egentligt kausalt løft kræver et kontrolleret eksperiment eller yderligere analyse.

## Kontrol og udgivelse

`node --test tests/unit/tilvalg-measurement.cjs` kontrollerer matches, dubletter, fremmede scopes, manglende historiske IDs, tomme datasæt og payload-privatliv. `tests/unit/analytics-loading-browser.cjs` renderer det rigtige dashboard med produktions-CSS og tester tomme/matchede kohorter, separat redigering, ingen NaN/Infinity, mobilkort uden overflow samt bevarede brand-/lokations-/dato-/kilde-/tællefiltre ved enhedsskift. Transporttesten går gennem collect-handleren og recordCommerceMetric med en lokal databaseadapter og bekræfter bevarede IDs/mode og fjernet fritekst. Komponenternes browsertests dækker samtykke og de konkrete brugerhandlinger. Typecheck, relevant browserkontrol og uafhængigt review kræves før merge; lokal kontrol erstatter GitHub Actions efter PM-instruks. Firebase-udrulning efterfølges af read-only live-kontrol; automatiske tests må ikke skrive produktionsdata.
