+++
title = "Site Meeting: Key Features & Next Steps"
date = "2025-11-06T12:30:00+01:00"
draft = false
# cover = "/images/meeting-placeholder.jpg"
+++

Det här inlägget är en snabb sammanfattning av de nyckelfunktioner vi har implementerat för den nya hemsidan och några punkter för vårt möte idag.


<!--more-->
### 1. Implementerade Funktioner

Det här är vad vi kan visa upp just nu:

* **Dynamisk Hemsida:** Hemsidan är nu en central "hubb" och inte längre bara en statisk sida.
    * Den har en anpassad "hero"-sektion med länkar.
    * Den har ett horisontellt "Senaste Nyheter"-flöde som automatiskt hämtar de 3 senaste inläggen.
    * Den har en "Kommande Evenemang"-lista som automatiskt visar de 5 närmaste giltiga evenemangsdatumen.

* **Robust Evenemangssystem:** Vi har ett kraftfullt system för alla evenemang som i princip sköter sig självt.
    * **Återkommande Evenemang:** Vi kan skapa evenemang som "Bi-Weekly Meetup" med en fullständig lista över schemalagda datum för ett år framåt.
    * **one-off Evenemang:** Vi kan enkelt lägga till speciella evenemang som "Winter Warm-up Tournament."
    * **Cancelled dates:** Vi kan lägga till en lista över inställda datum, och sidan kommer automatiskt att hoppa över dem i "Kommande"-listan.

* **Anpassad Styling & Mobilvy:**
    * Layouten är helt responsiv. I mobilläge "staplas" de horisontella korten till en ren, vertikal lista med linjeavdelare.

### 2.  diskussionspunkter & Nästa Steg

* **Språk:** Ska vi ha support för flera språk? Och om inte, ska vi ha allt på engelska, allt på svenska, eller t.om en blandning?
        (t.ex alla "base" elements kanske kan vara på engelska men nyhetsinnehåll är på svenska(tror inte det är en särskilt bra lösning men
        just to give an example))

    * värt att tänka på är att det kan leda till att vi behöver översätta alla events/nyhetsposter när vi postar dem också.
    Kanske inte är det jobbigaste i världen, generellt sätt är de nog inte så långa och LLM:er är ju praktiskt taget gjort för sånt
    till att börja med. Så att skriva på svenska och sen köra den genom en llm för att översätta till engelska och fixa eventuella problem tar nog
    inte så mycket tid.

* **Overview:** Vi behöver ta en titt över sidan's innehåll generellt sätt.
    * Är de här sidorna/sidokategorierna rätt? Bör något kategori läggas till eller tas bort? t.ex Bli medlem, kanske kan tas bort
    och läggas i om oss eller dylikt.
    * Är namnen rätt? Byta nyheter mot poster eller dylikt?


* **Slutföra Innehåll:** Vi behöver fylla på resten av innehållet.
    * Skriva den slutgiltiga texten för sidorna "Om oss" och "Bli medlem".

* **Kända "Buggar" (och Våra Lösningar):**
    * Temats menysortering var trasig (vilket syntes på GitHub). Vi fixade det genom att prefixa menu identifiers med vilket nummer de sorteras efter.

* **Footer:** Den är väldigt kal för tillfället.
    * Kanske ha med länkar till main sidorna(nyheter,events bla bla), kontakt email
* **Domännamn:** Vad ska det vara för domännamn?
    * negativeedge.se


### 3. Direkta Åtgärder

Detta har vi klart för oss att det skall göras så snart som möjligt och är delegerat till en ansvarig person att hantera att det görs inför nästa möte/någon arbiträr tid/whatever.

* **Åtgärd:** Skriva klart texten för "Om oss".

    **Ansvarig:** (Fyll i namn)

    *rekommendation:* Segment: Generellt om föreningen, Historia, Styrelsemedlemmar och Kontaktinformation(?)
---

* **Åtgärd:** Fyll i Bli medlem sidan med all information som krävs för att någon ska kunna bli medlem i det nuvarande systemet.

    **Ansvarig:** (Fyll i namn)

---
* **Åtgärd:** Lägga in alla scheman för evenemang för det vi vet änsålänge.

    **Ansvarig:** (Fyll i namn)
---
* **Åtgärd:** Lägga in alla nyhetsposter från evenemang som vi haft nyligen (borås typ, kanske några fler).

    **Ansvarig:** (Fyll i namn)
---
* **Åtgärd:** Skriv nyhetspost för lanseringen av hemsidan.

    **Ansvarig:** (Fyll i namn)
---
* **Åtgärd:** Fixa domän.

    **Ansvarig:** (Fyll i namn) \
    *rekommendation:* Köp hos eurodns med föreningens organisationsnummer i whois:en. Sätt upp ett konto på cloudflare för att hantera DNS och peka om
    nameserver på eurodns entry:t till cloudflare nameservrarna. \
    *rekommendation2:* bara dra in feffe när ni fixar detta så kan jag guida er genom det. \
    *rekommendation3:* eurodns var valt lite arbiträrt baserat på att jag tidigare har hanterat chalmers.it t.ex via dem och det var lätt att hantera korrekt whois information om jag inte minns fel.
    andra domain registrars borde funka också.


### 4. Extra saker

Här skriver jag bara massa good to have, saker någon kanske vill börja fundera på osv.

* **Lightmode:** Jobbigt att implementera på våra custom components. Kan vara värt att fundera på. Är det viktigt nog?

* **Ny Bli medlem flow:** Sättet att bli medlem i föreningen kan nog förenklas en del. Fundera på andra flöden som hade passat.

* **Emails för den nya domänen:** Idk, kanske kan va nice, typ contact@negativeedge.se eller whatever. eller \<nick\>@negativeedge.se

* **Fundera över SEO förbättringar:** I have no fucking clue man typ se till att vi fyllt i alla saker google scrape:ar, robots txt whatever

nu fan ska jag äta min lunch ciaociao
