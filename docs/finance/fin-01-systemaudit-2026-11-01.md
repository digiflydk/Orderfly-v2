# FIN-01 Systemaudit – Esmeralda Finance Agent (1. november 2026)

Skrivebeskyttet audit. Ingen produktionsdata er ændret. Kilde: Supabase-projekt
`bdemvarwpfcxyczunchx`, organisation `aaa94d25-3ca6-4ebf-a673-164608db6c55`.

## Fund

| # | Område | Fund | Status |
|---|--------|------|--------|
| 1 | Fakturabilag (P0) | 70 aktive fakturaregistreringer med fakturanummer; **0** har `invoice_object_path`. Bucket `finance-invoices` indeholder **0** filer. | Bekræftet mangel: ingen originalbilag kan åbnes i Finance |
| 2 | Fakturadubletter | 0 dubletter på (leverandør, fakturanummer) blandt aktive poster. | OK |
| 3 | COGS uden fakturanummer | Aug: 21 af 37, okt: 1 af 30 (sep: 0 af 25). | Skal gennemgås i FIN-02 |
| 4 | NemPOS 31/10 | Findes i Finance (kilde `manual`, 5 kanaler): 19.322,60 kr. ekskl. moms / 24.153,25 kr. inkl. moms. Svarer til rapporterede tal. | OK, men ikke automatisk import |
| 5 | Salgsdubletter | 8 (dato, kanal) med flere aktive salgsposter, bl.a. Wolt 6/9, 13/9, 20/9 (x3), 26/9 (`historical_import` + `manual`), Wolt 5/10 (x2 manual), frozen 31/8 (x4). | Mulig dobbeltregistrering, skal afklares i FIN-04/05 |
| 6 | NemPOS-automatik | Ingen Supabase-cronjob for NemPOS og ingen tilsvarende Routine på kontoen. Kun `notification-worker-every-minute` og `hr-auto-close-stale-shifts`. | Kører ikke automatisk fra disse systemer |
| 7 | Finance-statusmail (P1) | `finance-admin` er nu v16. Ingen notifikationsskabelon til Finance/salg i `notification_templates`. | Ikke implementeret |
| 8 | Indkøbsordrer | 16 åbne PO'er (7 kladder, 4 sendt, 2 bestilt, 3 delvist modtaget), bl.a. PO-20261027-000078 Dagrofa (kladde) og PO'er fra september, der stadig er åbne. | Skal gennemgås i FIN-03 |
| 9 | Dagrofa mælk 665759 | Varenummeret findes ikke i `production_supplier_items`. | Prisopdatering kan ikke være gemt; varen skal oprettes eller tilknyttes |
| 10 | Rutiner | Faktura Agent (12.00), NemPOS Agent (22.30) og Bankafstemningskoordinator (:40) er ikke synlige som Routines på denne konto. De kan ligge lokalt i Cowork. | Placering skal oplyses af PM |

## Adgang, der mangler i denne session

- `faktura@esmeraldapizza.dk` (one.com-mail): ingen forbindelse
- e-conomic (aftale 1739275): ingen forbindelse
- NemPOS: ingen forbindelse
- Repo `digiflydk/esmeralda-restaurant-operations`: ikke tilknyttet. Kildekoden til `finance-admin` ligger ikke i Orderfly-v2

## Næste skridt (afventer godkendelse)

1. FIN-02: Plan for at uploade de originale PDF'er til `finance-invoices` og knytte dem til de eksisterende 70 poster (ingen nye fakturaer). Kræver mailadgang.
2. FIN-04: Afklar de 8 mulige salgsdubletter. Annullering (`voided_at`) sker først efter godkendelse.
3. FIN-07: Finance-skabelon i den eksisterende notifikationskø med modtagere ud fra Finance-rettigheder. Kræver operations-repoet.
