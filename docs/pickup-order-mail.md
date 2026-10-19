# Mail ved betaling ved afhentning

Kunder, der vælger "Betal ved afhentning", får en mail om, at ordren er modtaget. Før fik de kun bekræftelsen i browseren.

## Flow
1. Kassen godkender afhentningsordren (`src/app/checkout/actions.ts`). I samme transaktion, som sætter ordren til `Received`, oprettes ét job i `orderNotificationJobs`:
   - Id: sha256 af `['pickup-received', brandId, orderId]`.
   - `kind: 'pickupReceived'`.
   
   Kun en godkendt ordre får derfor et job, og jobbet kan ikke oprettes to gange.
2. Workeren (`src/lib/notifications/order-worker.ts`) kontrollerer ordren igen lige før afsendelse. Den sender kun, når alle disse betingelser er opfyldt:
   - Betaling ved afhentning.
   - Afhentning.
   - Ingen PSP.
   - Betalingsstatus `Pending`.
   - Hverken `Pending` eller `Canceled`.
   - Samme brand og lokation.
   - Gyldig e-mail.

   - Lokationen findes og hører til ordrens brand. Den læses før afsendelse, og en midlertidig læsefejl prøves igen.

   Ellers bliver jobbet `suppressed`. Ordren og lokationen kontrolleres igen i den transaktion, der låser jobbet til afsendelse. Bliver ordren betalt eller annulleret, eller flyttes lokationen, mens den læses, sendes mailen derfor ikke.
3. Mailen sendes via Esmeraldas Notification Platform med skabelonen `orderfly.order.received_pay_at_pickup` og disse variabler:
   - `orderId`, `customerName`, `brandName`, `locationName`, `deliveryTime`, `totalAmount`, `currency` (DKK).
   - `fulfillmentAddress`: restaurantens adresse, den samme som på fakturaen (`locationAddress` i `src/lib/order-invoice.ts`).

   Mailen indeholder ingen faktura og nævner ikke betaling som gennemført.
4. Når restauranten registrerer betalingen (kontant eller kort), opretter betalingen den almindelige `orderConfirmation`, som sendes som kvittering og faktura. Et `orderConfirmation`-job på en ubetalt ordre undertrykkes stadig.

## Afhængighed
Skabelonen skal være udrullet i Esmeralda (Notification Platform), før denne ændring går live. Ellers afviser broen nøglen med 400, og jobbet ender som `failed` uden ny afsendelse.

## Test
- `tests/unit/feedback-mail.cjs`: én mail mens ordren er godkendt og ubetalt, korrekte variabler og adresse, samtidige workers sender kun én gang. Betalt, annulleret, ikke-godkendt, levering og PSP undertrykkes, og et betalt-job på en ubetalt ordre sender ikke.
- `tests/unit/merchant-payment-methods.cjs`: præcis ét `pickupReceived`-job for godkendte afhentningsordrer og intet for online-betaling. Efter betaling i restauranten findes præcis ét `orderConfirmation` ved siden af.
