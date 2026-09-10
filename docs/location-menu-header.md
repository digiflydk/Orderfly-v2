# Menuheader med lokationsoplysninger (#83)

Menuheaderen viser brandets logo øverst og et separat felt med den valgte lokations navn, adresse, dagens åbningstid, leveringspris og minimumsbestilling. Layoutet følger PO's reference med oplysninger oven på lokationens eget billede. Uden lokationsbillede bruges en mørk, ensfarvet baggrund. Adresse åbner kort i en ny fane.

På lokationsruter henter serverlayoutet lokationen ud fra brandets og lokationens URL-slugs. Headeren inklusive dagens åbningstider findes derfor allerede i første HTML-svar; serverens tidspunkt bruges også ved første hydration. En gammel kurv kan ikke overskrive rutens lokation, heller ikke inden for samme brand. En lokation med forkert brandId afvises. Kun den ældre checkout-rute uden lokationsslug bruger kurvkonteksten. Adressen sammensættes af street, zipCode og city med address som fallback. Dagens åbningstid følger Europe/Copenhagen og opdateres hvert minut. Der vises åbningstid, ikke en beregnet påstand om aktuelt åbent eller ledige bestillingstider. Manglende tider/priser udelades. Leveringspris vises kun, når lokationen understøtter levering.

Kun logolinjen er sticky og har en samlet højde på 64 px, så menuens eksisterende sticky kategorier fortsat passer. Lokationsfeltet scroller væk. Checkout beholder den kompakte logolinje med lokationsnavn og uden et navigerbart logo. Der tilføjes ikke login/profilfunktioner.

Leveringspris og en positiv minimumsbestilling vises kun, når lokationen faktisk tilbyder levering. Pickup-only lokationer viser derfor ikke leveringsspecifikke oplysninger, selv hvis en ældre minimumsværdi stadig findes på lokationen.

Validering: `npm run typecheck` og `node --test tests/unit/location-header-browser.cjs`. Testen bruger den faktiske komponent og genereret Tailwind CSS med syntetiske lokationsdata og billeder. Den dækker mobil/desktop, layout og sticky-adfærd, adresse/åbningstider/priser, fallback, forkert brand og checkout. Chromium kan vælges via CART_CHROMIUM_PATH. Visuel kontrol foretages på testens screenshots. Next billedoptimering og produktionsdata er ikke del af fixturetesten.

Ingen ændringer af produktionsdata. PR fra featurebranch -> tests -> uafhængigt review -> PO-accept -> merge/deployment i releaseprocessen -> liveverifikation. Work merger eller deployer ikke selv.
