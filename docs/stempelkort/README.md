# Stempelkort (Esmeralda Club)

Specifikationer: [fase 1](fase-1-stempelkort-backend.md), [fase 2](fase-2-stempelkort-kundeportal.md) og [fase 3](fase-3-stempelkort-merchantportal.md).
Godkendt analyse og plan: [fase-1-analyse-og-plan.md](fase-1-analyse-og-plan.md).

## Status for fase 1

| PR | Indhold | Status |
|---|---|---|
| 1 | Rettigheder, migration af `orderfly.loyalty` og forretningsregler | Merget 2026-10-17 (#253, parret med Esmeralda #410) |
| 2 | Kassens backend (opslag, stempel, indløsning, korrektion, udløbsjob) | Merget 2026-10-17 (#255) |
| 3 | Medlemskab, samtykke, Omnisend, login-link og session | Klar til review (bygger på PR 2, parret med Esmeralda-skabelon) |
| 4 | Admin: Stempelkort (indstillinger, medlemmer, log, CSV) | Ikke startet |
| 5 | Admin: Loyalitet (hovedgruppe, oversigt, kundescore flyttes) | Ikke startet |
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

Før brug skal indekserne i `docs/loyalty-firestore-indexes.json` oprettes i dataprojektet `orderfly-39325`.

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
