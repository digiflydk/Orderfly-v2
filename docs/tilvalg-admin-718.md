# Tilvalg: administration i tabeller (#718)

Tilvalgsgrupper og Tilvalg vises i hver sin tabel under samme arbejdsområde. Tabellen viser højst 25, 50 eller 100 rækker pr. side. Søgning og filtre arbejder på hele det indlæste, autoriserede katalog, ikke kun den aktuelle side. Der er fælles brand- og lokationsfiltre, og tilvalg kan desuden filtreres efter gruppe og aktiv-status. Navne sorteres alfabetisk. Filtrering nulstiller siden, så et nyt resultat ikke skjules af en gammel sideposition.

Et klik på Åbn eller navnet åbner den eksisterende separate redigeringsside. Gruppen viser egne tilvalg og links til de produkter, der bruger gruppen. Sletning ligger på redigeringssiden med eksplicit bekræftelse, og gruppeknappen er deaktiveret ved kendt produktbrug. Serverens reference- og rettighedskontrol er stadig afgørende. Kopiér opretter gennem en autoriseret serverhandling og åbner kopien; fejl vises i arbejdsområdet.

Formularerne har faste topknapper, tre kolonner på større skærme, danske labels og kontrollerede input, som bevares efter serverafvisning. Gruppens interne navn adskilles fra visningsnavnet; tomt visningsnavn arver det interne navn. Reglerne skelner mellem valg af én/flere typer og minimum/maksimum for samlet antal. Fravalg har gratis pris, minimum nul, højst ét af hver ingrediens og ingen standardmarkering.

Tilvalg kan forbindes med et aktivt produkt uden egne tilvalgsgrupper. Produktet skal være tilgængeligt på alle valgte lokationer og høre til det valgte brand. Det aktuelle produkt leverer navn og pris; tabelvisningen markerer derfor Produktpris i stedet for at vise en potentielt forældet kopi. Priser og standardvalg pr. moderprodukt redigeres i produktformularen. En eksisterende, utilgængelig produktreference vises eksplicit og skal frakobles eller løses, ikke fjernes lydløst.

Ruter, katalog-identiteter og historiske ordredata ændres ikke. De to gamle form-importstier bruger nu samme implementering.

## Integration

Katalogagent #719 leverer `getToppingUsage`, `getToppingProducts`, `duplicateToppingGroup` og `duplicateTopping`. Sidekomponenterne indlæser disse gennem serverhandlinger, med samme eksisterende katalogautorisation. Formularerne sender de additive felter fra #717/#719. Publicering og release styres af koordinator #716.

## Lokal verifikation

`tests/unit/tilvalg-admin-browser.cjs` kører de virkelige React-komponenter mod syntetiske props og stubbed serverhandlinger. Fire scenarier dækker 60 grupper/tilvalg, sidevalg, brand/status/søgning, tabskift, links til separate sider, produktreferencer, klientbeskyttelse af sletning, lokationsdækning og bevarelse af input efter afvist gemning. Mobil 390 px og desktop 1280 px indgår med kompileret Tailwind og admin-CSS. Begge skærmbilleder er visuelt gennemgået, og testen kontrollerer, at tabellen ruller inden for siden uden horisontalt side-overløb. Dette er isoleret browseradfærd, ikke produktions-live-QA eller fysisk printtest.

Ingen GitHub Actions eller produktionsdataændringer udføres af denne delopgave. Det samlede typecheck skal køres efter integration af #717/#719, og read-only liveaccept skal registreres separat før lukning.
