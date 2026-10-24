# Personlige rabatkortinvitationer (#571/#572)

Superadmin kan invitere en eksisterende kundetildeling eller en ny person med navn, e-mail, gruppe og valgfri kortgyldighed. Nye kunder oprettes først ved accept af det hemmelige engangslink. Invitationen er ikke en nyhedsbrevstilmelding og giver ingen stempelbonus.

Linket lever i 48 timer, bindes til brand, virksomhed, normaliseret primær e-mail og versionerne af funktion, gruppe og eksisterende tildeling. Ændringer eller geninvitation med ændrede oplysninger gør tidligere links ugyldige. Alias-konflikter, flere virksomhedsrelationer og slettede/inaktive identiteter afvises. Eksisterende medlemskab genbruges kun ved samme kundebinding; samtykke overskrives aldrig. Accept kræver den viste versionsbestemte rabatkorttekst og opretter den eksisterende Club-session.

POST `/api/loyalty/[brandSlug]/discount-invitation` viser betingelser, gyldighed og lokationer. POST på `/accept` aktiverer efter aktiv accept. Klienten fjerner tokenfragmentet fra adressefeltet straks. Begge bruger eksisterende same-origin og rate-limit-beskyttelse.

Outbox bruger mPanels `orderfly.discount_card.invitation`, stabil idempotens og den eksisterende stampekortworker. Tokens er hash-lagret; den nødvendige leverings-URL slettes efter afsendelse, annullering eller usikker levering. Retry efter usikkert udfald kræver operatørafklaring og sender ikke automatisk igen. Central kontrakt og additiv skabelon findes i mPanel #421; de skal deployes før funktionen aktiveres.

Verifikation: `node --test tests/unit/discount-card-invitations.cjs` og `CART_CHROMIUM_PATH=/tmp/chromium node --test tests/unit/discount-card-invitations-browser.cjs`; `npm run typecheck`. Browserchecks kører den faktiske komponent med isoleret transport ved mobil og desktop. Ingen produktionskunde, aktivering eller rigtig mail er oprettet. Endelig produktionstest og faktisk indbakkelevering er fortsat releaseacceptance.

Ved usikkert leveringsudfald eller afbrudt dispatch sker ingen automatisk genafsendelse. Superadmin kan eksplicit invitere igen; efter to minutter kan en afbrudt dispatch erstattes. Det tidligere link tilbagekaldes atomisk, før en ny outbox oprettes. Uændrede almindelige gentagelser forbliver idempotente.

Deployment skal oprette/verificere `docs/discount-card-firestore-indexes.json` med den eksisterende `scripts/firestore-indexes.mjs` før aktivering. Alias-kollisionstjek bruger brandId plus emailAliases-array og skal have READY-indeks; øvrige invitation/outbox queries bruger standard enkeltfeltsindekser.
