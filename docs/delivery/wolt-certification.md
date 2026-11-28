# Wolt Drive-certificering – testmøde

Formål: gennemgå Wolts kravliste for Drive-integrationen og demonstrere hvert krav live i sandbox.
Status gælder leverancen pr. 2026-11-28. Alle tidligere "Rettes"-punkter er lukket; se generalprøven i afsnit 5.
Live-historik for sandbox findes i [native-browser-qa.md](native-browser-qa.md).

Statusnøgle: **OK** = på plads · **Delvist** = afklares med Wolt.

## 1. Kravtabel

Stier er relative til `src/` medmindre andet står.

### Oprettelse af levering

| Krav | Status | Hvor i koden | Demonstration |
|---|---|---|---|
| Leveringsmulighed valideres før ordren afgives | OK | `lib/delivery/providers/wolt/quote.ts` (shipment-promises), `lib/delivery/quotes/service.ts` | Scenarie 1–2: pris/tilgængelighed hentes før betaling; ingen pris → betaling blokeres |
| Tider vises som estimater | OK | `lib/delivery/customer-eta.ts` ("ca."/"Forventet"); teksten "Bekræftet afhentningsinterval" ændres til estimat-ordlyd | Scenarie 2 og 7: kunde- og kassevisning viser kun estimater |
| Drop-off-kommentarer adskilt | OK | Kassen har et separat felt "Etage/dør (valgfrit)" (`components/checkout/checkout-client.tsx`) adskilt fra leveringsinstruktionerne; det valideres på serveren (`lib/checkout-schema.ts`, maks. 60 tegn) og bliver `dropoff.unit` (`lib/delivery/quotes/address.ts`; tekst efter komma i adressen er kun reserve). `woltDropoffComment` (`lib/delivery/providers/wolt/provider.ts`) sender `Etage/dør: …` og `Besked: …` på hver sin linje | Scenarie 4: udfyld Etage/dør og instruktioner, og se begge felter adskilt i Wolt-sandbox |
| Fejlet levering → klar fejl til afsender, kunden får ikke forkert info | OK | `lib/delivery/providers/wolt/create.ts`; kunde: besked + automatisk refusion (se native-browser-qa.md, ORD-292972); merchant får danske fejltekster i stedet for rå koder | Scenarie 6 |
| Forudbestilling med leveringstid ≥ 60 min | OK | `lib/delivery/providers/wolt/schedule.ts` `woltTiming` (60 min – 7 dage, grænser i `schedule-limits.ts`); tidsvælgeren tilbyder kun planlagte tider ≥ 60 + 15 min og ≤ 7 dage − 15 min frem (`lib/delivery/public-schedule.ts`), serveren afviser tider < 60 + 5 min med `unsupported_schedule`; Hurtigst muligt er fortsat tilgængelig | Scenarie 3 |

### Pakkedetaljer (parcels)

| Krav | Status | Hvor i koden | Demonstration |
|---|---|---|---|
| Specificerede varer | OK | Parcels bygges ved booking (`lib/delivery/providers/wolt/provider.ts`, valideres i `create.ts`) | Scenarie 4 |
| Tilvalg (options) medsendt | OK | Tilvalg skrives i parcel-beskrivelsen | Scenarie 4 |
| Varepriser | OK | Pris pr. vare medsendes i parcel | Scenarie 4 |
| Antal varer | Delvist | Kun via antal pr. parcel; ingen samlet item count | Spørgsmål 1 |
| Antal poser (når kendt) | Delvist | Kendes ikke i dag og sendes ikke | Spørgsmål 2 |
| Ordrenummer / merchant-reference | OK | `merchant_order_reference_id` = ordrenummer `ORD-xxxxxx` (kun nye ordrer) | Scenarie 4: samme nummer i Orderfly og Wolt |

### Annullering

| Krav | Status | Hvor i koden | Demonstration |
|---|---|---|---|
| Cancel-endpoint understøttet | OK | `lib/delivery/providers/wolt/cancel.ts`, `components/delivery/delivery-cancel.tsx` | Scenarie 5 |
| Annullering vises hos venue | OK | Operatør- og kundevisning læser annulleringsrecorden (se native-browser-qa.md, ORD-929615) | Scenarie 5 |
| Klar fejl ved fejlet annullering | OK | `delivery-cancel.tsx`: "kan ikke længere annulleres", "resultatet er ukendt – start ikke en ny annullering" | Scenarie 5b |

### Tracking hos venue (webhooks)

| Krav | Status | Hvor i koden | Demonstration |
|---|---|---|---|
| Bruger webhooks | OK | `app/api/delivery/webhooks/wolt/[callbackKey]/route.ts`, `lib/delivery/providers/wolt/webhook-verify.ts` (HS256), `lib/delivery/events/wolt-inbox.ts` (durable inbox) | Scenarie 7 |
| Webhook-ETA behandles som estimat | OK | `customer-eta.ts`; kasseordlyd rettes jf. ovenfor | Scenarie 7 |
| Venue får tiden fra første webhook-opdatering | OK | `lib/delivery/providers/wolt/diagnostics.ts` `woltPickupEtaReliability`, `components/checkout/managed-delivery-tracking.tsx` | Scenarie 7: afhentnings-ETA skifter fra første verificerede webhook |

### Tracking for slutbruger og integrationstest

| Krav | Status | Hvor i koden | Demonstration |
|---|---|---|---|
| Wolt-trackingside vises | OK | `components/checkout/managed-delivery-tracking.tsx` (`trackingUrl`) | Scenarie 7 |
| Fejlhåndtering ved API-fejl | OK | `lib/delivery/providers/wolt/http.ts`, `create.ts`: ukendt udfald → afstemning via verificeret webhook/manuelt, ingen dobbeltbooking | Scenarie 6 |
| Alle påkrævede funktioner på plads | Delvist | Alle rettelser er live (#940 + denne release); afventer svar på spørgsmål 1–3 | Hele drejebogen |

## 2. Drejebog til testmødet (sandbox)

Opsætning: Esmeralda sandbox, afhentning **Borgergade 10**. Worldline/Bambora hosted checkout i testtilstand: brug "Brug testkort" og svar "Yes (Y)" på 3-D Secure-testsiden. Notér ordrenummer og
Wolt delivery-ID for hvert scenarie.

1. **Adresse uden for leveringsområdet**
   Indtast en adresse langt fra Borgergade (fx anden by).
   Forventet: ingen leveringspris, levering markeres utilgængelig, betaling kan ikke gennemføres. Ingen booking hos Wolt.
2. **ASAP-ordre**
   Gyldig adresse i København K, ASAP, betal.
   Forventet: pris fra shipment-promise før betaling; booking oprettes; kunden ser "ca."/"Forventet"-tider, aldrig en bekræftet tid.
3. **Forudbestilling**
   a) Åbn tidsvælgeren. Forventet: ingen planlagte tider under 60 min (+ margin) frem, kun Hurtigst muligt og senere tider. Hvis en for tidlig tid alligevel sendes, afvises den (`unsupported_schedule`, kunden ser "Vælg et senere leveringstidspunkt…"), ingen pris vises, ingen booking.
   b) Vælg leveringstid ≥ 60 min frem (≤ 7 dage). Forventet: accepteres; booking med planlagt tid hos Wolt.
4. **Ordre med tilvalg**
   Bestil varer med tilvalg og drop-off-kommentar (enhed + instruktion).
   Forventet i Wolt: varer, antal pr. parcel, tilvalg i beskrivelsen, varepriser, reference `ORD-xxxxxx`, drop-off-felter adskilt.
5. **Annullering før afhentning**
   a) Annullér fra kassevisningen før kurer har hentet.
   Forventet: Wolt bekræfter; kunde- og operatørvisning viser annulleret; ETA/tracking skjules. Betaling refunderes ikke automatisk (vises tydeligt).
   b) Forsøg igen / efter afhentning. Forventet: "kan ikke længere annulleres" eller "ukendt – start ikke ny annullering"; ingen ny cancel sendes.
6. **Fejlet oprettelse (fx udløbet quote)**
   Lad quoten udløbe før booking (jf. ORD-292972/ORD-769540: `quote_expired`).
   Forventet: merchant ser dansk fejltekst; kunden får besked om at levering ikke kunne bookes og fuld automatisk refusion; ingen dobbeltbooking.
7. **Webhook-statusflow + trackinglink**
   Følg en booket ordre gennem Wolts statusser.
   Forventet: signerede webhooks modtages og gemmes; status skifter i kasse- og kundevisning; afhentnings-ETA tages fra første verificerede opdatering og vises som estimat; kunden har link til Wolts trackingside.

## 3. Spørgsmål til Wolt

1. **Item count:** Er antal pr. parcel nok, eller kræves et samlet antal varer på ordren?
2. **Bag count:** Vi kender ikke antal poser i dag og sender det ikke. Er det acceptabelt, eller skal det være et felt merchant udfylder?
3. **Tilvalg i beskrivelsen:** Er det i orden at tilvalg står i parcel-beskrivelsen, eller ønsker I en anden struktur?
4. **Gamle ordrer:** Ordrer før denne leverance har en anden `merchant_order_reference_id` end `ORD-xxxxxx`. Er det et problem for certificeringen?

## 4. Forudsætninger

- Sandbox-credentials (merchant API-nøgle og venue-ID) konfigureret for Esmeralda; aldrig i repo, skærmbilleder eller logs.
- Webhook registreret hos Wolt mod `/api/delivery/webhooks/wolt/[callbackKey]` med separat signeringsnøgle, og `ORDERFLY_DELIVERY_CALLBACK_ENABLED=true` (se [wolt-callback.md](wolt-callback.md)).
- Levering/routing aktiveret for sandbox (se [customer-quote-boundary.md](customer-quote-boundary.md)); Geoapify-kvote ikke opbrugt.
- Testtelefon (kundens telefonnummer til Wolt og visning af trackinglink) og en gyldig dansk leveringsadresse nær Borgergade 10.
- Alle rettelser merget og verificeret live før mødet (generalprøve 2026-11-27, se afsnit 5).
- Annullering i sandbox kræver eksplicit godkendelse (mulig annulleringsgebyr skal accepteres).

## 5. Generalprøve i sandbox (2026-11-27)

Kørt via den offentlige kundeflade på esmeralda.orderfly.dk (release 0d3e888), Wolt sandbox, Worldline testbetaling.

| Scenarie | Resultat | Ordre |
|---|---|---|
| 1. Uden for området (Aarhus) | OK: `outside_area`, ingen pris, betaling spærret | – |
| 2+4. ASAP med combo, tilvalg og etage/dør | OK: booket; Wolt-webhooks returnerer `ORD-676278` som merchant-reference; tider vist som "ca."; trackinglink | ORD-676278 |
| 3a. Forudbestilling < 60 min | Afvist, men tidsvælgeren tilbød tiden og fejlteksten var generisk → rettet i denne release | – |
| 3b. Forudbestilling ≥ 60 min | OK: booket med planlagt tid | ORD-351834 |
| 6. Udløbet quote | OK: `quote_expired` før afsendelse, fuld automatisk refusion, ingen dobbeltbooking | ORD-110296 |
| 7. Webhooks og status | Delvist: received/handshake/ETA/pickup_started modtaget og vist; afhentet/leveret ikke nået i vinduet | ORD-676278 |
| 5. Annullering | Ikke kørt (kræver kasselogin og accept af muligt gebyr) – vises på mødet med ORD-676278 eller ORD-351834 | – |

Rettet efter generalprøven: tidsvælgeren tilbyder kun planlagte tider ≥ 60 min (+ margin) frem for Wolt; `provider_unsupported_schedule` giver "Vælg et senere leveringstidspunkt"; fejlet bekræftelse fjerner pris og succestekst; separat "Etage/dør"-felt; parcel-beskrivelser uden inkluderede standardvalg og uden gentagne varenavne; refunderede ordrer vises som "Refunderet" i superadmin og kassevisning.

Kendte forhold: den præcise Wolt create-forespørgsel gemmes ikke (kun input), så parcels dokumenteres via input + kode og Wolts reference-ekko. Ved ORD-351834 sendte Wolt sandbox en ETA ca. 36 min efter den valgte tid – spørg Wolt om det er sandbox-adfærd.

