# CLAUDE.md

Følg altid `AGENTS.md` (engineering-regler for Orderfly Work). Den indlæses her:

@AGENTS.md

Udviklingsprocessen står i `docs/development-workflow.md`. Processen på `main` gælder altid: hooket `.claude/hooks/process-sync.sh` viser ved sessionstart (og højst hvert 15. minut under sessionen) de procesændringer på `main`, som din branch mangler. Når det melder en procesopdatering, følger du versionen fra `main` og merger `origin/main` ind i branchen før næste commit eller PR.

## Stempelkort (Esmeralda Club)

Specifikationerne for det digitale stempelkort ligger i `docs/stempelkort/` og skal altid følges:

- `docs/stempelkort/fase-1-stempelkort-backend.md` – backend, admin og rettigheder
- `docs/stempelkort/fase-2-stempelkort-kundeportal.md` – kundeportal
- `docs/stempelkort/fase-3-stempelkort-merchantportal.md` – merchantportal (kassevisning)
- `docs/stempelkort/fase-1-analyse-og-plan.md` – analyse og plan for fase 1 (godkendt 2026-10-16)
- `docs/stempelkort/README.md` – status og overblik over leverancen

Arbejd kun på den fase, der er godkendt. Analyse og plan godkendes før der bygges.
Hvis specifikationen strider mod koden eller er uklar: stop og spørg.
