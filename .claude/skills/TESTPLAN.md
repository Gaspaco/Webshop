# Testplan – MeloStudio

**Project:** MeloStudio – Browser-based DAW (Digital Audio Workstation)  
**Ontwikkelaar:** Gaspaco  
**Datum:** 27 mei 2026  
**Branch:** Niko  

---

## Wat is MeloStudio?

MeloStudio is een webapplicatie waarmee gebruikers muziekprojecten kunnen aanmaken, beheren en delen. De app bevat een studio (DAW), een bibliotheek met projecten, en een profielpagina.

---

## Stap 1 – Testplan

### Wat ga ik testen?

| Test ID | Functionaliteit | Wat test ik? | Verwacht resultaat |
|---|---|---|---|
| T01 | Registreren | Nieuw account aanmaken met e-mail + wachtwoord | Account wordt aangemaakt, gebruiker komt op dashboard |
| T02 | Registreren | Registreren met een e-mail die al bestaat | Foutmelding: e-mail al in gebruik |
| T03 | Registreren | Leeg formulier verzenden | Foutmelding: velden zijn verplicht |
| T04 | Login | Inloggen met juiste gegevens | Gebruiker komt op dashboard |
| T05 | Login | Inloggen met verkeerd wachtwoord | Foutmelding zichtbaar |
| T06 | Login | Inloggen met Google | Gebruiker wordt doorgestuurd en komt op dashboard |
| T07 | Uitloggen | Uitlogknop gebruiken | Gebruiker wordt uitgelogd en teruggestuurd naar homepagina |
| T08 | Project aanmaken | Nieuw project aanmaken via "New project" knop | Project verschijnt in de bibliotheek |
| T09 | Project aanmaken | Project aanmaken zonder naam | Standaard naam "New Project" wordt gebruikt |
| T10 | Project hernoemen | Bestaand project een nieuwe naam geven | Naam wordt bijgewerkt in de lijst |
| T11 | Project verwijderen | Project naar prullenbak verplaatsen | Project verdwijnt uit actieve lijst, staat in Trash |
| T12 | Project herstellen | Project terugzetten vanuit de prullenbak | Project staat weer in de actieve bibliotheek |
| T13 | Project permanent verwijderen | Project definitief verwijderen uit de prullenbak | Project is volledig weg |
| T14 | Zoeken | Zoeken naar een project op naam | Alleen overeenkomende projecten worden getoond |
| T15 | Studio openen | Klikken op een project in de bibliotheek | Studio wordt geopend met het juiste project |
| T16 | Project opslaan | Wijzigingen opslaan in de studio | Projectversie wordt opgeslagen in de database |
| T17 | Navigatie dashboard | Wisselen tussen Overview, Library en Profile tabbladen | Juiste inhoud wordt getoond per tabblad |
| T18 | Responsive design – mobiel | Website openen op mobiel scherm (≤480px) | Layout blijft bruikbaar, mobiele navigatie zichtbaar |
| T19 | Responsive design – tablet | Website openen op tablet (768px) | Layout past zich correct aan |
| T20 | Profielpagina | Profielfoto uploaden | Foto wordt bijgewerkt en getoond in de kaart |
| T21 | Studiotijd | Studiotijd teller bijhouden op dashboard | Teller loopt live op, reset niet bij pagina vernieuwen |
| T22 | Wachtwoord vergeten | Wachtwoord reset aanvragen | Bevestigingsmelding zichtbaar |
| T23 | Gedeeld project bekijken | Publiek gedeeld project openen via link | Project wordt getoond zonder login |
| T24 | Edge case – leeg zoekvel | Zoekbalk leeg laten | Alle projecten worden getoond |
| T25 | Edge case – internet weg | Verbinding verbreken tijdens gebruik | App crasht niet, foutmelding of fallback zichtbaar |

---

## Stap 2 – Testresultaten

### T01 – Registreren met e-mail + wachtwoord

**Verwacht resultaat:** Account aangemaakt, gebruiker op dashboard  
**Werkelijk resultaat:** Account wordt aangemaakt. Gebruiker wordt doorgestuurd naar dashboard.  
**Status:** ✅ Geslaagd

---

### T02 – Registreren met bestaande e-mail

**Verwacht resultaat:** Foutmelding: e-mail al in gebruik  
**Werkelijk resultaat:** Foutmelding wordt getoond: "Email already in use"  
**Status:** ✅ Geslaagd

---

### T03 – Leeg registratieformulier verzenden

**Verwacht resultaat:** Foutmelding: velden zijn verplicht  
**Werkelijk resultaat:** Browser validatie voorkomt verzending, velden worden gemarkeerd  
**Status:** ✅ Geslaagd

---

### T04 – Login met juiste gegevens

**Verwacht resultaat:** Gebruiker komt op dashboard  
**Werkelijk resultaat:** Gebruiker wordt correct ingelogd en doorgestuurd naar dashboard  
**Status:** ✅ Geslaagd

---

### T05 – Login met verkeerd wachtwoord

**Verwacht resultaat:** Foutmelding zichtbaar  
**Werkelijk resultaat:** Foutmelding getoond: "Invalid credentials"  
**Status:** ✅ Geslaagd

---

### T06 – Login met Google

**Verwacht resultaat:** Gebruiker wordt doorgestuurd en komt op dashboard  
**Werkelijk resultaat:** Google OAuth werkt, gebruiker komt op dashboard  
**Status:** ✅ Geslaagd

---

### T07 – Uitloggen

**Verwacht resultaat:** Gebruiker wordt uitgelogd en teruggestuurd naar homepagina  
**Werkelijk resultaat:** Sessie wordt beëindigd, gebruiker wordt teruggestuurd  
**Status:** ✅ Geslaagd

---

### T08 – Nieuw project aanmaken

**Verwacht resultaat:** Project verschijnt in de bibliotheek  
**Werkelijk resultaat:** Project wordt aangemaakt en direct zichtbaar in de lijst  
**Status:** ✅ Geslaagd

---

### T09 – Project aanmaken zonder naam

**Verwacht resultaat:** Standaard naam "New Project" wordt gebruikt  
**Werkelijk resultaat:** Naam "New Project" wordt automatisch ingevuld als het veld leeg is  
**Status:** ✅ Geslaagd

---

### T10 – Project hernoemen

**Verwacht resultaat:** Naam wordt bijgewerkt in de lijst  
**Werkelijk resultaat:** Naam wordt direct bijgewerkt na opslaan  
**Status:** ✅ Geslaagd

---

### T11 – Project naar prullenbak

**Verwacht resultaat:** Project verdwijnt uit actieve lijst, staat in Trash  
**Werkelijk resultaat:** Project verdwijnt uit "All" en "Mine", verschijnt onder "Trash"  
**Status:** ✅ Geslaagd

---

### T12 – Project herstellen

**Verwacht resultaat:** Project staat weer in de actieve bibliotheek  
**Werkelijk resultaat:** Project wordt hersteld en is weer zichtbaar in de bibliotheek  
**Status:** ✅ Geslaagd

---

### T13 – Project permanent verwijderen

**Verwacht resultaat:** Project is volledig weg  
**Werkelijk resultaat:** Project wordt permanent verwijderd uit de database  
**Status:** ✅ Geslaagd

---

### T14 – Zoeken op projectnaam

**Verwacht resultaat:** Alleen overeenkomende projecten worden getoond  
**Werkelijk resultaat:** Lijst filtert live mee terwijl je typt  
**Status:** ✅ Geslaagd

---

### T15 – Studio openen

**Verwacht resultaat:** Studio wordt geopend met het juiste project  
**Werkelijk resultaat:** Studio laadt het geselecteerde project correct  
**Status:** ✅ Geslaagd

---

### T16 – Project opslaan in studio

**Verwacht resultaat:** Projectversie wordt opgeslagen in de database  
**Werkelijk resultaat:** Opslaan werkt, versie wordt toegevoegd aan project_versions tabel  
**Status:** ✅ Geslaagd

---

### T17 – Navigatie tussen tabbladen

**Verwacht resultaat:** Juiste inhoud wordt getoond per tabblad  
**Werkelijk resultaat:** Overview, Library en Profile wisselen correct  
**Status:** ✅ Geslaagd

---

### T18 – Responsive design mobiel (≤480px)

**Verwacht resultaat:** Layout blijft bruikbaar, mobiele navigatie zichtbaar  
**Werkelijk resultaat:** Mobiele bottombar verschijnt, layout past zich aan  
**Status:** ✅ Geslaagd  
**Opmerking:** "New project" tekst was eerder niet zichtbaar op mobiel (bug gevonden en opgelost — zie verbeteringen)

---

### T19 – Responsive design tablet (768px)

**Verwacht resultaat:** Layout past zich correct aan  
**Werkelijk resultaat:** Layout werkt correct op tabletformaat  
**Status:** ✅ Geslaagd

---

### T20 – Profielfoto uploaden

**Verwacht resultaat:** Foto wordt bijgewerkt en getoond  
**Werkelijk resultaat:** Foto wordt geüpload en direct getoond in de profielkaart en topbalk  
**Status:** ✅ Geslaagd

---

### T21 – Studiotijd teller

**Verwacht resultaat:** Teller loopt live op, reset niet bij pagina vernieuwen  
**Werkelijk resultaat:** Teller liep eerst terug naar begintijd bij vernieuwen (bug gevonden)  
**Status:** ✅ Geslaagd na fix  
**Bug gevonden:** `mountedAt` werd gereset bij elke pagina refresh  
**Oplossing:** `sessionStorage` gebruiken om starttijd op te slaan

---

### T22 – Wachtwoord vergeten

**Verwacht resultaat:** Bevestigingsmelding zichtbaar  
**Werkelijk resultaat:** E-mail wordt verstuurd, bevestiging getoond  
**Status:** ✅ Geslaagd

---

### T23 – Gedeeld project via publieke link

**Verwacht resultaat:** Project wordt getoond zonder login  
**Werkelijk resultaat:** Gedeelde projectpagina is toegankelijk zonder account  
**Status:** ✅ Geslaagd

---

### T24 – Leeg zoekveld

**Verwacht resultaat:** Alle projecten worden getoond  
**Werkelijk resultaat:** Alle projecten worden getoond wanneer het zoekveld leeg is  
**Status:** ✅ Geslaagd

---

### T25 – Internet wegvallen

**Verwacht resultaat:** App crasht niet, foutmelding zichtbaar  
**Werkelijk resultaat:** App blijft draaien, API-calls mislukken stil (geen crash), maar geen expliciete foutmelding aan gebruiker  
**Status:** ⚠️ Gedeeltelijk geslaagd  
**Bug gevonden:** Geen zichtbare foutmelding bij offline status  
**Verbetervoorstel:** Offline-detectie toevoegen met gebruiksvriendelijke melding

---

## Gevonden bugs en verbeteringen

| Bug ID | Omschrijving | Status | Oplossing |
|---|---|---|---|
| B01 | "New project" knop tekst brak af op twee regels op mobiel | ✅ Opgelost | `white-space: nowrap` toegevoegd + tekst in `<span>` gewikkeld zodat het verborgen kan worden op mobiel |
| B02 | Studiotijd teller resetde naar begintijd bij elke pagina refresh | ✅ Opgelost | `sessionStorage` gebruikt om starttijd bij te houden across page refreshes |
| B03 | Avatar zichtbaar op Overview én Profile tab (onnodig) | ✅ Opgelost | Avatar alleen zichtbaar op Library tab |
| B04 | Teller voor "10 projects" kon afbreken op kleine schermen | ✅ Opgelost | `white-space: nowrap` toegevoegd aan count element |
| B05 | Library items hadden te veel linkse witruimte op mobiel | ✅ Opgelost | Padding teruggebracht naar `0.25rem` |
| B06 | Geen foutmelding bij offline gebruik | 🔲 Open | Verbetervoorstel: `navigator.onLine` event listener toevoegen |

---

## Gebruikerstest

**Tester:** Klasgenoot (extern, geen developer)  
**Methode:** Tester gebruikte de app zonder uitleg  

**Observaties:**
- Tester begreep direct hoe in te loggen
- Tester vond de "New project" knop snel
- Tester was in verwarring over wat "Trash" deed → label verduidelijkt via tooltip zou helpen
- Tester miste feedback na het opslaan in de studio ("is het opgeslagen?")

**Verbetervoorstel uit gebruikerstest:**
- Opslaan-bevestiging ("Saved ✓") toevoegen in de studio
- Tooltip bij Trash knop: "Verwijderde projecten"

---

## Logboek – reflectie

**Wat heb ik getest?**  
Ik heb functionele tests uitgevoerd op alle kernfuncties van MeloStudio: authenticatie, projectbeheer, navigatie, responsive design en de studiotijd-teller.

**Wat ging goed?**  
De meeste functionaliteiten werkten correct vanaf het begin. De authenticatieflow (e-mail, Google) was robuust en gaf de juiste foutmeldingen.

**Welke bugs heb ik gevonden?**  
Twee relevante bugs: de studiotijd teller die resette bij vernieuwen, en de "New project" knop die tekst afbrak op mobiel. Beide zijn opgelost.

**Welke feedback heb ik gekregen?**  
Uit de gebruikerstest bleek dat de Trash-knop verwarring gaf en dat opslaan-feedback in de studio mist.

**Welke verbeteringen heb ik doorgevoerd?**  
- `white-space: nowrap` fix voor "New project" knop  
- `sessionStorage` fix voor studiotijd teller  
- Mobiele layout verbeteringen (padding, avatar zichtbaarheid)  
- Ticket kaart layout: foto gecentreerd op mobiel  

**Wat heb ik hiervan geleerd?**  
Testen laat zien dat details die je als ontwikkelaar vanzelfsprekend vindt, voor echte gebruikers verwarrend kunnen zijn. De studiotijd-bug was pas zichtbaar na écht testen (pagina vernieuwen), niet tijdens het bouwen.

---

*Testplan bijgehouden in Git – branch: Niko*
