# Fase 3 – Digitalt stempelkort: merchantportal (kassevisning)

Del 3 af 3. Bygger på fase 1 (backend og rettigheder) og fase 2 (kundeportal med QR-kode).
Deadline for fase 1–3: færdig og testet senest **31. oktober 2026**.

---

## 0. Arbejdsgang for Claude Code

- Fase 1 og 2 skal være godkendt, før fase 3 bygges.
- **Analyse først:** Læs indløsningssiden fra PR #203 (Spin & Vind), medarbejderlogin fra timeloggen og mPanels rettighedstjek i frontend. Aflever en plan for, hvad der genbruges, og vent på godkendelse.
- Kassevisningen er **en visning i den eksisterende platform**, ikke en separat portal. Den bruger samme login, samme rollesystem og samme design som resten af administrationen.
- Al forretningslogik ligger i backend fra fase 1. Frontend viser og sender kun.
- Hvis dokumentet strider mod koden: stop og spørg.

---

## 1. Formål

Medarbejderen ved kassen kan på få sekunder scanne kundens QR-kode, give stempel og indløse belønninger på tabletten, også under travl service.

## 2. Afgrænsning

**I fase 3:** login og brugerskifte på tabletten, scanning, kundeopslag, giv stempel, indløs belønning, manuel korrektion (med rettighed) og fejlhåndtering.
**Ikke i fase 3:** overførsel af papirstempler (bygges ikke) og integration med NemPOS.

---

## 3. Én portal med roller

- Én portal og ét login. Det, brugeren ser, styres af rettighederne fra fase 1 i mPanel.
- En bruger med kun "Stempelkort – kassevisning" og evt. "indløs belønning" ser **kun** kassevisningen, ingen andre menuer.
- Ledere og admins kan skifte mellem administration og kassevisning.

---

## 4. Login og brugerskifte

- Medarbejderne logger ind med **deres eksisterende login fra timeloggen**.
- **Hurtigt skifte:** Tabletten deles, så det skal være muligt at skifte bruger hurtigt, fx med en personlig PIN-kode, efter det mønster der findes eller passer bedst ind i den eksisterende løsning.
- **Automatisk log ud** eller låsning efter en periode uden aktivitet. Perioden kan indstilles, fx 5 minutter.
- Inaktive medarbejdere kan ikke logge ind.
- Den aktive medarbejders navn vises altid øverst, så det er tydeligt, hvem der registrerer.

---

## 5. Skærmbilleder og flow

### 5.1 Startskærm

- Stor knap: **"Scan QR-kode"**. Den åbner tablettens kamera, og scanningen sker automatisk uden ekstra tryk.
- Alternativ: **"Søg kunde på e-mail"** til kunder, der har glemt telefonen.
- Brandvalg, hvis medarbejderen har adgang til flere brands. Ellers er brandet valgt på forhånd.
- Hvis programmet er slået fra, vises det tydeligt, og ingen handlinger er mulige.

### 5.2 Kundekort

Efter scanning eller søgning vises:
- Kundens navn
- Stempler X af N
- Optjente belønninger med beskrivelse og udløbsdato
- To store knapper: **"Giv stempel"** og **"Indløs belønning"**. Knappen til indløsning vises kun, hvis der er en gyldig belønning, og medarbejderen har rettigheden.

### 5.3 Giv stempel

- Medarbejderen vælger kanal: **Dine-in** eller **Takeaway**. Wolt og Uber Eats vises ikke.
- Medarbejderen indtaster købsbeløbet. Er beløbet under minimum, vises en tydelig besked, og stempel kan ikke gives.
- Er "rabat- og kampagneordrer giver stempel" slået fra: afkrydsning "Rabat eller kampagne brugt". Er den sat, gives intet stempel.
- Knap: **"Bekræft"**. Bagefter vises en tydelig kvittering, fx "Stempel givet – 6 af 8", i nogle sekunder, og skærmen vender tilbage til start.
- Når kortet bliver fyldt, vises det tydeligt: "Kortet er fyldt – belønning optjent".
- Knappen deaktiveres ved første tryk, og der bruges idempotensnøgle, så dobbeltklik ikke giver to stempler.

### 5.4 Indløs belønning

- Belønningens beskrivelse vises tydeligt, fx "Gratis pizza".
- Knap: **"Indløs"** og derefter et bekræftelsestrin.
- Bagefter vises en kvittering: "Belønning indløst".
- Idempotent som ved stempler.

### 5.5 Søg kunde på e-mail

- Søgning på e-mail. Resultatet viser navn og maskeret e-mail, så medarbejderen kan bekræfte kunden.
- Stempler givet via søgning markeres i loggen som "via søgning".

### 5.6 Manuel korrektion

- Vises kun for brugere med rettigheden "Stempelkort – manuel korrektion".
- Tilføj eller fjern stempler eller annullér en indløsning. **Årsag skal udfyldes.**
- Alt logges med medarbejderen.

---

## 6. Fejlbeskeder

Korte, tydelige beskeder på dansk, fx:
- "QR-koden er udløbet. Bed kunden opdatere siden."
- "Kunden findes ikke."
- "Beløbet er under 100 kr. og giver ikke stempel." (Beløbet hentes fra indstillingerne.)
- "Belønningen er allerede indløst."
- "Ingen forbindelse. Prøv igen." Der må ikke registreres noget, før backend har bekræftet.
- "Du har ikke adgang til denne handling."

---

## 7. Design og brugervenlighed på tabletten

- Arver det eksisterende design i administrationen med mPanel som reference. Ingen nye farver eller skrifttyper.
- Store knapper og stor tekst. Bygget til tablet på disken, både liggende og stående.
- Få trin: Et stempel skal kunne gives med højst tre tryk efter scanning (kanal, beløb, bekræft).
- Tydelig visuel bekræftelse efter hver handling.
- Hurtig indlæsning og ingen unødvendige animationer.

---

## 8. Test og accept

- [ ] Medarbejder logger ind med sit login fra timeloggen og ser kun kassevisningen.
- [ ] Inaktiv medarbejder kan ikke logge ind.
- [ ] Brugerskifte og automatisk log ud virker.
- [ ] Scanning af gyldig QR-kode åbner det rigtige kundekort.
- [ ] Udløbet QR-kode eller screenshot afvises.
- [ ] Søgning på e-mail finder kunden.
- [ ] Køb under minimum giver ikke stempel.
- [ ] Wolt og Uber Eats kan ikke vælges.
- [ ] Dobbeltklik giver kun ét stempel og én indløsning.
- [ ] Fyldt kort giver belønning, som kan indløses én gang.
- [ ] Indløsning kræver rettighed.
- [ ] Manuel korrektion kræver rettighed og årsag.
- [ ] Alle handlinger står i loggen med den rigtige medarbejder.
- [ ] Hele flowet er testet på restaurantens egen tablet.

---

## 9. Lanceringstjekliste (før 31. oktober)

- [ ] Fase 1–3 godkendt og deployet
- [ ] Indstillinger udfyldt: belønning, vilkår og samtykketekst
- [ ] Rettigheder tildelt i mPanel
- [ ] Testkunder og testdata fjernet
- [ ] Medarbejdere instrueret i scanning, stempel, indløsning og e-mail-søgning
- [ ] QR-kode til tilmelding på disken og link på hjemmesiden
- [ ] Programmet slået til
