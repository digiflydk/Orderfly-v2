# Produktspecifikke tilvalg (#721)

Produktformularens Tilvalgsgrupper indeholder en søgbar, pagineret gruppeliste. Valgte grupper vises i kundens rækkefølge med tastaturbetjente Op/Ned-knapper. Hver gruppe kan åbnes til en tabel med søgning og 10 tilvalg pr. side.

- `toppingOverrides` sendes som JSON med tilvalgs-ID som nøgle.
- Tom pris betyder arv. Prisen `0` er en eksplicit gratis pris.
- Standardvalg og tilgængelighed er tretrinsvalg: arv, ja og nej. Et aktivt fravalg af et nedarvet standardvalg gemmes som `false`.
- Standardantal er et helt tal fra 1 til tilvalgets maksimum og bruges kun, når tilvalget er et standardvalg.
- Fravalgsgrupper viser kun tilgængelighed. De er gratis, uden automatiske standardvalg. Produktet kan skjule ingredienser, det ikke indeholder.
- Gruppeafkobling fjerner dens produktspecifikke overrides og betingelsen for selve gruppen. Betingelser i andre grupper med afhængighed til et fjernet valg skal fortsat rettes eksplicit; den eksisterende validering blokerer en ugyldig gemning.
- En afvist gemning bevarer formularens indhold. Adminvalidering deler schema med serverhandlingerne fra #719. Serveren er fortsat autoritativ.

Typer, serverhandlinger, købsflow og katalogscope ejes af de øvrige delopgaver i #716. Alle testdata er syntetiske. Ingen produktionsændringer eller GitHub Actions kræves af denne formularleverance. Koordinatoren håndterer separat review, merge, deployment og liveaccept.
