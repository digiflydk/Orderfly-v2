# Købsstempler: bonnummer og onlinebetaling

## Adfærd

Personalet skal angive både ordrenummer fra POS-bonen og beløb ved stempling.
Ordrenummer normaliseres til store bogstaver og accepterer 1–64 tegn: bogstaver,
tal, punktum, bindestreg og underscore. Det gemmes sammen med kunde-ID,
medlems-ID, beløb og afdeling på stempelhændelsen og vises i loggen og CSV.
Det er en sporbar bonreference, ikke en integration der henter ordrelinjer fra NemPOS.

Samme bonnummer kan kun give stempler én gang pr. afdeling og kalenderdag i
København, også ved et andet medlem eller en ny anmodningsnøgle. POS-numre kan
genbruges næste dag. Samme idempotensnøgle returnerer den oprindelige kvittering;
ændret indhold afvises. Orderfly-numre med `ORD-` henvises til automatisk stempling.
Historiske stemplinger uden bonnummer kan ikke kontrolleres mod nye registreringer.

Betalte Orderfly-ordrer får købsstempler i samme Firestore-transaktion som
betalingens overgang til `Paid`. Dette gælder Stripe og betaling ved afhentning.
Et aktivt medlem findes via ordrens centrale kunde-ID, med kontrol af brand,
virksomhed, afdeling og kortets ejerskab. E-mail bruges ikke som løs fallback.
Medlemmer uden nyhedsbrevssamtykke kan fortsat optjene stempler.

Programmets aktuelle indstillinger afgør ordretyper, minimumsbeløb, rabatter,
dagsgrænse, antal stempler og afdeling. Beløbet er den betalte ordretotal inkl.
moms efter rabatter. Personligt rabatkort giver aldrig købsstempler.
Ugyldig/udenlandsk medlemskobling giver ingen stempler, men blokerer ikke en ellers
gyldig betaling. Databasefejl ruller hele transaktionen tilbage og kan genforsøges.
Et gentaget webhook giver aldrig ekstra stempler eller belønninger.

Ingen efterregistrering af allerede betalte ordrer. Et medlem skal findes, når
betalingen registreres. En senere refundering/annullering tilbagefører ikke automatisk
stempler i denne ændring; personalets eksisterende korrektion med begrundelse bruges.
Det gælder også en betalt leveringsordre, der senere afvises af leverandøren.

## Teknik og release

- `order-stamps.ts` forbereder alle læsninger og rapporterer præcist skriveantal.
  Først i settlement-planens skrivefase anvendes stemplingen. Printerplanens
  læsninger og grænsen på 500 skrivninger bevares.
- Onlinehændelse: `hashKey('order-stamp', brandId, orderId)`.
- Manuel hændelse: `hashKey('counter-purchase', brandId, locationId, day, orderNumber)`.
  Den samme hændelse fungerer som lås mod dobbeltregistrering.
- Nye valgfrie hændelsesfelter: `orderNumber`, `orderId` (online), `customerId`.
- Kun eksisterende samlinger og enkeltfeltsindekser bruges. Ingen migration,
  nye produktionsregler eller ændringer i aktive programindstillinger kræves.
- Standardvilkår version `stamp-card-da-2026-11-06` forklarer onlineoptjening.
  Eksisterende offentliggjorte brandtekster overskrives ikke. De kan opdateres
  via den eksisterende funktion til at gendanne standardtekster. `orderTypes`
  indgår nu i versionsnøglen for vilkår.
- Dully-linket i medlemsportalen er uændret efter PM's ønske.

Release følger AGENTS.md: featuregren → PR → CI/Playwright og review → accept
eller automatisk merge efter alle gates → deploy → read-only livekontrol.
Ingen produktionstest må oprette køb, medlemskaber eller stempler uden særskilt aftale.

## Verifikation

`loyalty-stamp-card-counter.cjs`: krævet bonnummer, normalisering, dobbelt bon,
forskellige medlemmer, næste dag, kortets afdeling/ejerskab, levering, udløb,
belønningsoptjening og præcist skriveantal.

`settlement-preparation.cjs`: faktiske Stripe/afhentningsindgange, gentagne
webhooks, native transaktionsretry, rollback ved fejl, ugyldigt betalingsbevis,
minimum, ordretype, rabatkort, dagsgrænse og medlem/brand/virksomhedsgrænser.

`loyalty-counter-browser.cjs`: obligatorisk ordrenummer og beløb, request-indhold,
gentagelse efter netværksfejl og tablet-/mobilvisninger.

TypeScript og relevante øvrige Club-/betalings-/printertests skal bestå.
