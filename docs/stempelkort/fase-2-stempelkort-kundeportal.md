# Fase 2 – Digitalt stempelkort: kundeportal

Del 2 af 3. Bygger på backend fra fase 1. Fase 3 er merchantportalen.
Deadline for fase 1–3: færdig og testet senest **31. oktober 2026**.

---

## 0. Arbejdsgang for Claude Code

- Fase 1 skal være godkendt, før fase 2 bygges.
- **Analyse først:** Læs, hvordan eksisterende kundevendte sider i Orderfly er bygget (bestillingsflow, brandindstillinger, logo, farver, skrifttyper, routing og hosting). Aflever en plan og vent på godkendelse.
- Kundeportalen bruger de API'er, der blev bygget i fase 1. Forretningslogik må ikke ligge i frontend.
- Kundeportalen skal **arve det eksisterende kundevendte design og brandets indstillinger** (logo, farver, skrifttyper). Der laves ikke et nyt designsprog.
- Følg best practice for sikkerhed, tilgængelighed og ydeevne på mobil.
- Hvis dokumentet strider mod koden: stop og spørg.

---

## 1. Formål

Kunden kan tilmelde sig Esmeralda Club, logge ind med et link på e-mail og vise sin QR-kode ved kassen. Portalen er bygget til mobil og skal kunne bruges hurtigt i køen.

## 2. Afgrænsning

**I fase 2:** tilmelding, login, stempelkort med QR-kode, belønninger, historik, nyhedsbrevsstatus, profil og sletning.
**Ikke i fase 2:** tilbud i portalen (fase 4), overførsel af papirstempler (bygges ikke) og kassevisningen (fase 3).

---

## 3. Design

- Brandets logo, farver og skrifttyper hentes fra brandindstillingerne, så portalen virker for alle brands på platformen.
- For Esmeralda betyder det: korrekt logo, **Bourton** til overskrifter og **Brandon** til brødtekst. Logovarianten skal passe til baggrunden, så det hvide logo bruges på sort baggrund.
- Udtrykket er enkelt og uden unødvendig pynt. Fokus er på kortet, stemplerne og QR-koden.
- Bygget til mobil først og skal også fungere på tablet og computer.
- Alle tekster er på dansk.
- Tilgængelighed: god kontrast, læsbare skriftstørrelser og fungerer med skærmlæser.

---

## 4. Sider og flow

### 4.1 Tilmelding

Felter:
- Navn (påkrævet)
- E-mail (påkrævet)
- Afkrydsning: samtykke til nyhedsbrev på e-mail (påkrævet, **ikke forudafkrydset**). Teksten hentes fra indstillingerne i fase 1.
- Afkrydsning: accept af programmets vilkår (påkrævet). Vilkårene kan læses via et link.
- Knap: "Bliv medlem"

Regler:
- Samtykket er først givet, når kunden har trykket "Bliv medlem".
- Findes e-mailen allerede som kunde i Orderfly, kobles medlemskabet på den eksisterende kunde.
- Er e-mailen allerede medlem, sendes et login-link i stedet. Portalen må ikke afsløre, om en e-mail findes i systemet.
- Efter tilmelding vises "Tjek din e-mail", og der sendes et login-link.
- Hvis programmet er slået fra, vises en venlig besked i stedet for formularen.

### 4.2 Login

- Kunden indtaster sin e-mail og får et login-link.
- Linket kan kun bruges én gang og udløber efter 15 minutter. Et udløbet link viser en tydelig besked og en knap til at få et nyt.
- Efter login forbliver kunden logget ind længe (se fase 1), så kortet åbner direkte næste gang.
- Login-mailen følger brandets design og indeholder ingen markedsføring.

### 4.3 Mit stempelkort (forside efter login)

- Brandets logo og programnavn
- Stemplerne vist visuelt som X af N, fx 5 af 8
- Tekst om næste belønning, fx "3 stempler til en gratis pizza" (bygges ud fra belønningsbeskrivelsen)
- **QR-kode** stor og tydelig. Den opdateres automatisk med et nyt token fra backend og skal virke selv ved lav skærmlysstyrke.
- Kortets udløbsdato med forklaringen "Dine stempler udløber, hvis du ikke har fået et nyt stempel inden [dato]"
- Optjente belønninger med beskrivelse og udløbsdato og teksten "Vis QR-koden ved kassen for at indløse"
- Hvis forbindelsen mangler: tydelig besked om, at QR-koden ikke kan vises, og en knap til at prøve igen. Gamle tokens må ikke vises som gyldige.

### 4.4 Historik

- Liste over stempler, belønninger, indløsninger og udløb med dato og kanal
- Ingen medarbejdernavne vises for kunden

### 4.5 Profil og indstillinger

- Navn og e-mail
- **Nyhedsbrev:** status vises, og kunden kan afmelde eller tilmelde sig igen.
  - Teksten forklarer, at medlemskab og stempler bevares ved afmelding.
  - Ændringen synkroniseres med Omnisend.
- Programmets vilkår
- Log ud
- Slet medlemskab: bekræftelsestrin, der forklarer, at stempler og belønninger går tabt

### 4.6 Tilføj til hjemmeskærm

- Portalen understøtter "Tilføj til hjemmeskærm" på iPhone og Android med brandets ikon og navn, efter best practice for webapps.
- En diskret vejledning vises første gang efter login.

---

## 5. Adgang til portalen

- Fast adresse pr. brand efter platformens eksisterende mønster for kundevendte sider. Se åbent spørgsmål 1.
- Der linkes til portalen fra hjemmesiden, nyhedsbreve, kvitteringer og en QR-kode på disken i restauranten.

---

## 6. Test og accept

- [ ] Tilmelding uden samtykke eller uden accept af vilkår er ikke mulig.
- [ ] Samtykkefeltet er ikke forudafkrydset.
- [ ] Eksisterende kunde kobles på e-mail uden dublet.
- [ ] Portalen afslører ikke, om en e-mail findes.
- [ ] Login-link virker én gang og udløber efter 15 minutter.
- [ ] Kunden forbliver logget ind og kan åbne kortet uden nyt login.
- [ ] QR-koden opdateres automatisk, og et screenshot virker ikke efter udløb.
- [ ] Stempler, belønninger og udløb vises korrekt efter reglerne i fase 1.
- [ ] Afmelding af nyhedsbrev bevarer medlemskabet og synkroniseres med Omnisend.
- [ ] Sletning fjerner medlemskabet efter bekræftelse.
- [ ] Brandets logo, farver og skrifttyper bruges. For Esmeralda: Bourton og Brandon og korrekt logovariant.
- [ ] Siden fungerer på iPhone og Android og kan føjes til hjemmeskærmen.
- [ ] Hurtig indlæsning på mobil.

---

## 7. Åbne spørgsmål til ejeren

1. **Adresse:** Hvilken adresse skal portalen have, fx en side under esmeraldapizza.dk eller en adresse under Orderfly?
2. **Telefonnummer:** Skal det kunne angives frivilligt ved tilmelding?
3. **QR-kode i restauranten:** Skal der laves en skilt-QR til disken, der fører til tilmelding?
