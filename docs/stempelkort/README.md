# Stempelkort (Esmeralda Club)

Specifikationer: [fase 1](fase-1-stempelkort-backend.md), [fase 2](fase-2-stempelkort-kundeportal.md) og [fase 3](fase-3-stempelkort-merchantportal.md).
Godkendt analyse og plan: [fase-1-analyse-og-plan.md](fase-1-analyse-og-plan.md).

## Status for fase 1

| PR | Indhold | Status |
|---|---|---|
| 1 | Rettigheder, migration af `orderfly.loyalty` og forretningsregler | Klar til review (parret med Esmeralda `feature/stempelkort-fase-1-rettigheder`) |
| 2 | Kassens backend (opslag, stempel, indløsning, korrektion, udløbsjob) | Ikke startet |
| 3 | Medlemskab, samtykke, Omnisend, login-link og session | Ikke startet |
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
