# Onlinekøb i Club-historik — #598

## Årsag og leverance

Før rettelsen viste `/club/historik` kun `memberView.history`: en liste af stempel- og belønningshændelser fra `loyaltyEvents`. Der fandtes ingen ordrequery eller ordrevisning. Derfor kunne hverken almindelige onlinekøb eller køb med rabatkort vises, selv når kunde-ID og betaling var korrekte. Rettelsen tilføjer en særskilt, autentificeret ordreprojektion og sektionen **Onlinekøb**; den eksisterende stempelhistorik bevares. Det godkendte Club-design genbruges.

## Adgang og identitet

`loadOrderHistory` kaldes kun på historiksiden efter medlemslogin. Den læser den eksisterende host-only sessioncookie og bruger `readSession`. `memberOrderHistory` revaliderer i en read-only Firestore-transaktion sessionens udløb/tilbagekaldelse/epoch, aktivt medlem, aktuelt brand, præcis én aktiv virksomhedstilknytning samt kundens brand og verificerede e-mailbinding. Slettede/inaktive kunder og brands afvises. Klienten kan ikke vælge kunde-ID, e-mail eller lokation til queryen.

Alle ordresøgninger har `brandId` og en afgrænset identitetslighed:

- Nuværende format: `customerDetails.id` matcher medlemskabets aktuelle kunde-ID.
- Ældre importformat: topniveau `customerId` matcher samme ID.
- Ordre uden nogen eksplicit kunde-ID: `customerContact` matcher udelukkende sessionens verificerede e-mail. Kendte stavemåder med store/små bogstaver eller mellemrum fra den aktuelle kunde kan bruges, hvis de normaliserer til præcis denne adresse. Andre e-mailaliaser og telefonnummer anvendes aldrig som fallback.

Hvis begge ID-felter findes, skal begge matche. Et forkert, tomt, null eller fejlformet eksplicit ID afvises; en matchende e-mail må ikke overstyre det. Dubletter fra de overlappende queries fjernes. Hver ordres lokation skal eksistere og tilhøre samme brand; en slettet, manglende eller fremmed lokation afvises. Historik fra en inaktiv lokation inden for samme brand bevares. Rabatkortets aktuelle lokationsbegrænsning påvirker fremtidig rabat, ikke ejerskab til tidligere køb.

Projektionen indeholder kun ordrenummer, dato, lokationsnavn, ordrestatus og brutto/refunderet/netto-beløb. Adresser, kontaktoplysninger, betalingsreferencer, receipt/cancel-tokens, interne rabatdata og medarbejderidentitet returneres ikke. Ingen links udleder adgang til kvitteringer af et ordrenummer.

## Status og beløb

Den godkendte produktregel er **Paid** sammen med **Received**, **In Progress**, **Ready**, **Completed** eller **Delivered**. Pending, Failed, Error, Canceled, ukendte statusværdier og ubetalte afhentningsordrer vises ikke. En senere betalt afhentningsordre vises. En korrekt betalt nulordre (fx 100 % rabat) vises også; historik er ikke det samme som en positiv omsætnings-KPI.

Delvis og fuld refundering bevares, hvis ordren ellers har en gyldig Paid-status. UI viser netto samt refunderet beløb og oprindeligt totalbeløb. Total er DKK, refundering er heltalsøre; negative/ugyldige beløb eller refundering større end total afvises. Dato er gyldig `paidAt`, ellers legacy `createdAt` (Firestore Timestamp/seconds, Date eller gyldig serialiseret dato). Resultatet sorteres faldende på dato, derefter stabilt på ordrenummer, og de seneste 100 vises.

## Queries, drift og begrænsninger

Der er ingen brandbred ordrescan, ingen `orderBy(paidAt)` der udelukker gamle ordrer uden feltet, og ingen tidlig `limit` der kan skjule nyere gyldige køb bag andre statusser. Målrettede brand/identitetslighedsqueries læses først, derefter filtreres/sorteres resultatet og begrænses til 100. Antallet af returnerede rækker er begrænset; antal dokumentlæsninger afhænger af den konkrete kundes matchende historik. Dette svarer til eksisterende kundehistoriks målrettede queryform. En hård øvre læsegrænse med garanteret korrekt seneste historik ville kræve særskilt projektion/paginering eller indeksarbejde.

Der ændres ingen indekser, regler eller data. Equality-queries bruger Firestores eksisterende enkeltfeltsindekser/index merging; en eventuel konkret produktionsindeksfejl skal verificeres og behandles via særskilt gate, aldrig skjules som en tom historik. Vilkårlige historiske e-mailstavemåder, som ikke kan udledes af den verificerede aktuelle identitet, gættes ikke, og ordrer med modstridende gamle ID'er flyttes ikke automatisk. Ingen destruktiv backfill.

## Verifikation

Service/access-tests dækker almindelige/rabatkøb, de tre identitetsformer, konflikt/null/malformed ID, alias/telefonafvisning, session/epoch/company/brand/customer/location-grænser, aktive/inaktive lokationer, statusser, nulordrer, refundering, dato-fallback, dubletter og sortering før cap. Portal-page-tests verificerer sessioncheck før ordrequery. Chromium bruger de faktiske historikkomponenter ved 390 og 1440 px, med onlinekøb/refundering, bevarede stempler, escaping og overflowkontrol. Eksisterende portalbrowserregression køres også.

Tests foretager ingen produktionsskrivninger. Merge, CI, uafhængigt review og read-only liveverifikation af faktisk deployment er koordinatorens separate gates, før #598 kan lukkes.
