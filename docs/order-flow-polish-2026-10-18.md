# Ordreflow: rettelser efter live-test 2026-10-18

Live-test af købsflowet på Esmeralda Pizza Amager med Stripe i testtilstand: afhentning og levering, 3D Secure, afvist kort, annulleret betaling og betaling ved afhentning. Alle flows gennemførte. Rettelserne her fjerner de fejl og den friktion, testen fandt.

## Kurv
- **Falsk "Priser eller tilbud er opdateret":** Kurven genberegnes ved fokus og hvert 30. sekund. Serverens og browserens linjer blev sammenlignet med `JSON.stringify`, og felterne har forskellig rækkefølge, så beskeden kom ved hver genberegning, også uden ændringer. Nu sammenlignes kun det, kunden betaler for (`cartPriceSignature` i `src/lib/cart-utils.ts`): linje, antal, priser, tilvalg og combo-valg.
- Beskeden vises øverst på skærmen, så den ikke dækker "Se kurv" og betalingsknappen.
- Antal varer bøjes: "1 vare", "2 varer" (`itemCountLabel`).

## Kassen
- **Afkrydsning af handelsbetingelser og betalingsknap:** Blokken var en komponent defineret inde i render-funktionen. React så en ny komponenttype ved hver gengivelse og skiftede afkrydsningen og knappen ud, så et tryk under en opdatering kunne gå tabt. Blokken kaldes nu som en funktion og bevarer sine elementer.
- Tom kurv-teksten er på dansk.
- Kvitteringen for betaling ved afhentning havde to punktummer efter beløbet ("93,00 kr..").

## Restaurantvalg
"Choose restaurant", "Open | Closes at …", "Delivery", "Pickup", "Pre-order" og leveringsoplysningerne i hero-banneret er på dansk.

## Admin: ordrer
- Ordrelisten og ordresiden er på dansk, og status vises med de samme navne som ved kassen (`ORDER_STATUS_LABELS` i `src/lib/orders/presentation.ts`).
- Tidspunkter vises altid i dansk tid (`Europe/Copenhagen`) uanset browserens og serverens tidszone. Ordresiden formaterede før betalingstidspunktet på serveren i UTC.
- "View in Stripe" pegede på `#`. "Se i Stripe" åbner nu betalingen i Stripe Dashboard (test eller live efter checkout-sessionens id) og vises kun, når der er et betalings-id.
- "Export" havde ingen funktion og er fjernet.

## Ikke med her
- **Mail ved betaling ved afhentning:** Kunden får i dag kun bekræftelsen i browseren. Mailen kræver en ny skabelon i Esmeraldas Notification Platform, fordi `orderfly.order.confirmation` forudsætter betaling og faktura. Det kræver en parret ændring i Esmeralda-repoet.

## Test
`tests/unit/cart-browser.cjs` (uændret kurv giver ingen besked, en reel ændring gør, og beskeden ligger øverst), `tests/unit/checkout-browser.cjs` (afkrydsning og knap bevarer deres element under opdateringer), `tests/unit/commerce-p1.cjs` (vare/varer) og `tests/unit/merchant-payment-browser.cjs` (ingen "kr.."). De nye browsertests fejler uden rettelserne.
