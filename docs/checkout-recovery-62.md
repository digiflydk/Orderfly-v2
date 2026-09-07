# #62 – Checkout navigation, cart recovery and promotion holds

Work Dev implementation, based on main `5f515ce09f0ed961bd5772e6049558bff7b91af3`. No merge, deployment, payment, customer message or production data mutation is included. Work Release handles independent review, PO acceptance, merge/deploy and records the active SHA. No GitHub Actions or broad platform suite.

See [cart behavior](cart-recovery-qa.md#62-menu-return-and-selected-toppings-after-cancellation) and [reservation policy](automatic-discounts.md#62-ordinary-checkout-after-a-reserved-first-order-offer).

## Focused verification

Four new regressions failed on the original code and pass with the fix: menu-valid optional groups, same-name/renamed toppings, ordinary checkout following a promotional hold, and settlement preserving the other order's hold. Related cart restore/cancel and promotion reservation/webhook fixtures remain included. TypeScript typecheck is required. Browser fixtures exercise the real CartProvider and checkout component with external I/O stubbed; they do not use production payments.

```sh
npm run typecheck
node --test tests/unit/checkout-recovery-regressions.cjs tests/unit/cart-restore.cjs tests/unit/cart-cancel.cjs tests/unit/promotion-review.cjs
node --test --test-name-pattern='cancel and menu return|full-page Stripe cancel|changed fulfillment or bag' tests/unit/cart-browser.cjs
node --test --test-name-pattern='Back to Menu|uncertain:|success:' tests/unit/checkout-browser.cjs
```

## Work QA prompt after deployment

Verification on the implementation: `npm run typecheck` passed; 22 targeted unit/reservation tests passed; 7 selected cart browser scenarios (including nested cases) and 3 checkout browser scenarios passed. Chromium 149 was provided through `CART_CHROMIUM_PATH` after the standard Playwright browser download failed. Browser tests used local synthetic fixtures and simulated external I/O. No live Stripe payment or production QA has been performed; release and live acceptance remain pending. No GitHub Actions were run.

Du er Work QA I eller II for Orderfly-v2 efter konkret tildeling. Start med #62 og kort titel. Læs issue, PR og deployment-evidence. Live: https://orderfly.dk. Registrér den aktive release-SHA; merge alene er ikke deployment.

Test kun egne synthetic data og egen session, mærket QA-I-62-<tid> eller QA-II-62-<tid>. Ingen Actions, bred suite, fælles betalingsskift eller ændring af den anden QA's data. Brug kun godkendt Stripe-testbetaling.

1. Fyld kurven med produkt, tilvalg og combo. Åbn checkout, tryk Back to Menu, og gå til checkout igen. Alle antal/tilvalg/combo-valg samt afhentning/levering og pose skal bevares. Gentag mobil/desktop. Navigation må ikke starte en betaling.
2. Åbn Stripe og annullér. Genindlæs annulleringssiden, vend tilbage til checkout og menu. Kurven og genberegnede beløb skal stemme. Ret antal og opret et nyt betalingsforsøg. Betal det godkendte testforsøg, og kontrollér Stripe-beløb, registreret ordre, bekræftelse og kvittering. Kun den matchende betalte kurv tømmes.
3. Luk fanen med en ubetalt kurv og åbn en ny på samme restaurant. Kurven skal huskes inden for 24 timer. Skift restaurant: ingen sammenblanding. Ny kurv må ikke slettes af en gammel betalingsbekræftelse.
4. På egne katalogfixtures: tilknyttet gruppe, der ikke udbydes på lokationen, samt en tom gruppe må ikke fjerne et ellers gyldigt produkt. To tilvalg med samme navn i forskellige grupper bevares med deres IDs. Omdøb et valgt tilvalg og kontrollér korrekt navn/pris efter reload. Inaktive/fjernede valgte tilvalg og brud på min/max i tilbudte grupper skal stadig håndteres som ugyldige med besked.
5. Reserver en egen førstegangsrabat uden at betale. Start et nyt checkout uden den rabat på samme testkunde. Det må ikke blokeres af First-order promotion already used or reserved. Den gamle reservation må ikke give adgang til endnu et førstegangstilbud. Annullering/betaling af det almindelige forsøg må ikke frigive den anden ordres rabat. Nye førstegangskrav efter et gennemført køb skal afvises. Kontrollér også normale personlige/globale rabatgrænser.
6. Forsøg ikke at ændre rigtige kunders tidligere ordrer/reservationer. Brug den normale annulleringssti til oprydning af egne test-sessioner; dokumentér alle egne ordre-id'er, refunderinger hvis relevante og fjernede testkatalogdata.

Rapportér release-SHA, PASS/FAIL/BLOCKED pr. scenarie, forventet/faktisk resultat og reproduktionstrin. Send fejl til Work Dev via issue-tråden. Angiv oprydning og om opgaven kan afsluttes. Manglende adgang eller deployment er BLOCKED.
