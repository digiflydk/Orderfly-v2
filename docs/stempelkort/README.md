# Stempelkort (Esmeralda Club)

Specifikationer: [fase 1](fase-1-stempelkort-backend.md), [fase 2](fase-2-stempelkort-kundeportal.md) og [fase 3](fase-3-stempelkort-merchantportal.md).
Godkendt analyse og plan: [fase-1-analyse-og-plan.md](fase-1-analyse-og-plan.md).

## Status for fase 1

| PR | Indhold | Status |
|---|---|---|
| 1 | Rettigheder, migration af `orderfly.loyalty` og forretningsregler | Merget 2026-10-17 (#253, parret med Esmeralda #410) |
| 2 | Kassens backend (opslag, stempel, indløsning, korrektion, udløbsjob) | Merget 2026-10-17 (#255) |
| 3 | Medlemskab, samtykke, Omnisend, login-link og session | Merget 2026-10-17 (#257, parret med Esmeralda #412) |
| 4 | Admin: Stempelkort (indstillinger, medlemmer, log, CSV) | Merget 2026-10-17 (#259) |
| 5 | Admin: Loyalitet (hovedgruppe, oversigt, kundescore flyttes) | Merget 2026-10-17 (#261) |
| 6 | Oprydning: aliaset `orderfly.loyalty` fjernes | Efter verificeret migration |

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

Der oprettes ingen roller fra koden. Rettighederne føjes til eksisterende eller nye roller i mPanel. Migrationen af `orderfly.loyalty` er beskrevet i [freemium-rbac-139.md](../freemium-rbac-139.md).

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

Siden `/superadmin/loyalty/stamp-card` har tre faner. Hver fane vises kun med sin rettighed, og den rettighed skal gælde hele brandet:

- **Indstillinger** (`orderfly.stamp_cards:settings`):
  - Alle parametre fra spec §6.1, herunder kanaler pr. brand og belønningstype med produkt- eller kategorivalg.
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
