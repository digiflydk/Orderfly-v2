# Sletning af testordrerne fra live-testen 2026-10-18

Engangsoperation i produktion (`orderfly-39325`), besluttet af PO/PM 2026-10-19. Migration: `scripts/migrations/delete-e2e-test-orders-2026-10-18.mjs`. Den kører gennem **Firestore data migration** som beskrevet i [firestore-operations.md](firestore-operations.md).

## Hvad der slettes
Ordrerne ORD-385369, ORD-389910, ORD-244989, ORD-489552 og ORD-859925 på Esmeralda (`oeypKaMyYcQjIwaa1PtV`). Hver ordre skal have præcis det kundenavn, der blev skrevet i testen. ORD-859925 har "TEST E2E-kunde 2", de øvrige "TEST E2E-kunde". Ellers planlægges intet.

For hver ordre sker følgende i én transaktion:
- Ordren og de jobs, der er knyttet til den, slettes. Det gælder `orderNotificationJobs` (bekræftelse og afhentning), `marketingOrderOutbox` og `gameConversions`.
- Kundens `totalOrders`, `totalSpend` og `discountUsage` rulles tilbage for betalte ordrer. `lastOrderDate` rulles kun tilbage, hvis den stadig peger på testkøbet. Den sættes da til kundens seneste rigtige betalte ordre, eller `null` hvis der ingen er.
- Checkout-kapaciteten rulles tilbage: `paid`/`held` for kunde, rabat og par, samt `firstTimeHeld`. Rabattens `usedCount` rulles også tilbage.
- Konverteringer på verificerede upsells rulles tilbage, men kun for tilbud, som afregningen talte med (samme brand og lokation). Preview låser, hvilke tilbud det gælder. Ændres et tilbuds brand eller lokationer før apply, stopper apply.

Desuden slettes Esmeraldas `analytics_events` med samme `orderId`. Events fra andre brands med samme ordrereference bevares.

## Hvad der bevares bevidst
- `invoiceCounters`: fakturanumrene INV-2026-000011 og -000012 genbruges ikke, så der er et hul i nummerrækken.
- Audit-logs, `dataMigrationAudit` og selve kundeposten.

## Sikkerhed
Migrationen stopper uden at skrive noget, hvis et af disse tilfælde gælder:
- ordren ikke er testordren,
- kunden eller rabatten hører til et andet brand,
- ordren brugte et gavekort fra spil,
- ordren eller et af dens upsell-tilbud er ændret siden preview, fx kunde, betaling, rabat eller lokationer,
- et tilknyttet job eller en konvertering ikke længere hører til testordren og Esmeralda.

Planen indeholder kun id'er, beløb og tidspunkter.

## Kørsel
1. Kør preview på branchen og kontrollér planen. Den seneste preview gav 7 ændringer: 5 ordrer og 2 analytics-events.
2. Merge PR'en.
3. Kør preview fra `main`, og notér `manifest_sha256`.
4. Kør apply fra `main` med `manifest_sha256`, og godkend i miljøet `production`.

## Fejl undervejs
Hver ordre er sin egen transaktion. Stopper apply ved en ordre, er de foregående helt slettet, og resten er urørt. Kørslen står som `failed` i `dataMigrationAudit`. Ret årsagen, og kør preview og apply igen. Allerede slettede ordrer planlægges ikke igen, så intet tælles dobbelt.

## Verifikation efter apply
- En ny preview fra `main` planlægger 0 ændringer.
- I admin under Salg → Ordrer findes ingen af de fem ordrer.
- Testkundens totaler er 0 kr. og 0 ordrer.
- `dataMigrationAudit` har status `completed` med 7 anvendte items.
