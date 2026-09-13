# Arbeitsplatz-Prototyp

Branch: `design/analysis-workspace-prototype`.

Mit `pnpm dev --host 127.0.0.1` starten und
`http://127.0.0.1:5173/prototypes/analysis-workspace/index.html` öffnen.
Der Entwurf hat einen eigenen Einstieg und wird nicht in den regulären
Produktionsbuild aufgenommen. Keine Veröffentlichung oder Änderung am Rechenkern.

## Zweck und Grenzen

Die Navigation gliedert die Arbeit in **Daten → Verläufe → Kohortenmodelle**.
Konfiguration und Ergebnis stehen im Analysearbeitsplatz untereinander über
die volle Breite; es gibt keine Einstellungs-Sidebar. Nach dem Berechnen
klappt die Konfiguration zu einer kompakten Zusammenfassung zusammen. Das ist ein zu beurteilender Entwurf, keine
freigegebene neue Anwendungsoberfläche.

Alle Daten sind synthetisch. Die Kohortenmodellwerte sind illustrative Konstanten;
optionale Einzelverlaufswerte werden mit vorhandenen Rechenfunktionen daraus berechnet. Die Kohortenmodell-Bedienelemente ändern Konfiguration, Formel, Einschlusszahlen
und Ergebniszustand, schätzen aber kein gemeinsames Modell. Die Projektion berechnet lediglich Schnittpunkte der festen
Beispielgeraden. Import erklärt den vorgesehenen Ablauf; echte Dateien werden
hier nicht eingelesen. Neuladen setzt den Entwurf zurück.

Genotyp, Alter und Geschlecht illustrieren eine generische Faktorenkonfiguration.
Ihre feste Auswahl im Prototyp ist **keine Vorgabe für die Implementierung**:
dort stammen Faktoren, Kategorien, Referenzen, Zielgrößen und Einheiten aus den
Daten bzw. der vorhandenen Konfiguration. Das zweite Zielgrößenbeispiel
„Studienmarker“ demonstriert die Anwendung außerhalb von eGFR.

## Aktueller Rundgang: Daten, Konfiguration, Darstellung

1. **Daten → Abgeleitete Parameter:** eGFR-Definition bearbeiten. CKD-EPI 2021
   oder MDRD-4 wählen, Vorschau prüfen, übernehmen. Die Kreatininreihe in mg/dl,
   Alter und Geschlecht sind als Eingaben dokumentiert. Bei 047/048 fehlt das Alter;
   diese Personen bekommen keine erfundenen eGFR-Werte.
2. **Verläufe → Tabelle / Überlagerung:** dieselben Parameter, Filter und Personen.
   Jeder Parameter erhält ein eigenes Diagramm mit eigener Einheit. Eine Linie
   per Klick oder Tastatur öffnet die Person; Zurück führt zur Überlagerung.
3. **Konfigurationen verwalten:** benannte OLS-Konfigurationen bearbeiten oder
   kopieren. Zeitfenster und optionale Grenzwerte je Parameter festlegen, Vorschau
   prüfen und übernehmen. Änderungen wirken auf alle zugeordneten Parameter.
4. **Anzeige am Parameter:** nur Konfiguration und sichtbare Ergebnisse auswählen.
   Die komplexeren Einstellungen bleiben zentral. Tabelle und Einzelansicht zeigen
   dieselben Kennzahlen; die Überlagerung zeigt Messreihen und optionale Fit-Linien.
5. **Abhängigkeiten prüfen:** eGFR-Formel ändern und zurück zu Verläufe wechseln.
   Berechnete Werte und OLS-Auswertungen aktualisieren sich in allen Ansichten.
   Rohdaten bleiben unverändert. Das illustrative Kohortenmodell bleibt separat.

Der Prototyp hat einen begrenzten Verfahrenskatalog: zwei eGFR-Formeln, OLS,
Zeitfenster und parameterbezogene Grenzwerte. Er enthält keine freie Formel-Engine,
keine frei zuordenbaren Quelldateien und noch keine Ereignisausschlüsse oder
Zeitbalancierung in der neuen Konfigurationsverwaltung. Das sind weiterhin
Anforderungen an die produktive Integration, keine gestrichenen Funktionen.

Die Datenkette ist **Quellmessungen → abgeleitete Messgröße → benannte Auswertung →
Darstellung**. Die eGFR-Beispieldaten kommen jetzt tatsächlich aus der synthetischen
Kreatininreihe und den Demografieangaben, mit unveränderten Kernfunktionen. 46 von
48 Personen sind berechenbar. Neuladen setzt Definitionen und Konfigurationen zurück.

## Kurzes manuelles Testprotokoll

1. **Daten:** Beispieldaten öffnen. 48 Personen / 288 Messungen je Quellparameter (276 berechenbare eGFR-Werte), zwei fehlende
   Altersangaben und die betroffenen Personen finden.
2. **Verläufe:** Verläufe ansehen. Parameter als Spalten ein-/ausblenden,
   nach ID suchen und nach letztem Parameterwert sortieren. Person öffnen,
   vor/zurück blättern oder direkt wählen. Zur Tabelle zurückkehren: Auswahl,
   Sortierung und die Position der aktuellen Person bleiben erhalten. Die Analyse
   ist über die Hauptnavigation erreichbar; das Modellbeispiel bleibt unabhängig
   vom Patientenbrowser und übernimmt keine seiner Filter.
3. **Kohortenmodell:** Bei eGFR Alter und Geschlecht auf „Niveau + jährliche Änderung“
   belassen. Formel öffnen; beide Faktoren haben eine Wechselwirkung mit Zeit.
   Beispiel berechnen. Alter ausschließen: 48 statt 46 Personen,
   Bisheriges Ergebnis bleibt sichtbar und wird als veraltet markiert; Export
   ist bis zum erneuten Berechnen gesperrt.
4. **Grenzwerte:** Bei eGFR Grenzwert 30 / Horizont 10 / Richtung abwärts:
   Genotyp A erreicht nach 10 Jahren, B nach 9 Jahren. Grenzwert 40 ergibt
   6,7 bzw. 6,5 Jahre. Horizont 5 ergibt „Nicht innerhalb des Horizonts“.
   Ein leeres Zahlenfeld muss einen Hinweis zeigen und Export sperren.
5. **Export:** Direkt nach Änderung eines Grenzwerts Bericht exportieren.
   Vorschau und HTML-Download müssen die aktuelle Konfiguration, Ausschlüsse,
   Grenzwerte und den deutlichen Hinweis auf illustrative Ergebnisse enthalten.
6. **Bedienbarkeit:** Mit Tastatur und bei 390 px Breite wiederholen. Navigation
   und Ergebnisauswahl behalten den Fokus; Tabellen dürfen die Seite nicht verbreitern.

Vor produktiver Umsetzung beurteilen: Sind die drei Bereiche verständlich?
Sind Konfiguration, Datenbasis und Ergebnis eindeutig zuzuordnen? Sind die
wichtigsten Einstellungen gut erreichbar, auch auf schmalen Bildschirmen?

## Funktionsinventar für die spätere Umsetzung

Basis: `src/ui/shell`, `src/ui/patient`, `src/ui/cohort`, `src/ui/pages`.
„Vorgesehen“ bedeutet: im bestehenden Produkt vorhanden oder bereits geplant,
im Klick-Prototyp noch nicht umgesetzt. Keine dieser Zeilen ist eine Streichung.

| Bestehende Funktion | Neuer Platz | Im Prototyp |
| --- | --- | --- |
| Workbook, Beispieldaten, Vorlagen, Ereignis- und Attributimport | Daten / Quellen | Beispieldaten; Importablauf erklärt |
| Spaltenzuordnung, abgelehnte Zeilen, Importwarnungen | Daten / Zuordnung und Qualität | Rollenübersicht; weitere Prüfungen vorgesehen |
| Demografie-Konflikte, fehlende Angaben, manuelle Korrektur | Daten / Qualität | Zwei fehlende Altersangaben illustriert |
| eGFR-Formel und Kreatininquelle | Daten / abgeleitete Zielgrößen | Vorgesehen |
| Zielgrößenauswahl, Personenauswahl, Einzelansicht | Verläufe / lokale Auswahl | 48 Beispielpersonen, zwölf wählbare Parameter, Vor/Zurück und Direktwahl |
| Kohortentabelle, Screening, Sortierung, Gruppierung, Patientenauswahl | Verläufe / Kohortenübersicht | Graphentabelle, ID-Suche, Gruppenfilter, Sortierung und durchgehende Liste; Screening und Mehrfachauswahl vorgesehen |
| Kohortenoverlay, individuelle Steigungen, Qualitätsmarkierungen | Verläufe / Grafik und Details | Vereinfachte Grafik; volle Darstellung vorgesehen |
| Miniaturgrafiken, Zoom, Punkte verbinden, Ereignismarker | Verläufe / Darstellungsoptionen | Kleine Graphen und gemeinsame Skalen je Parameter; weitere Optionen vorgesehen |
| OLS, Theil–Sen, Fit-Presets, Zeitbalancierung | Analysen / Einzelverlauf-Konfiguration | Vorgesehen |
| AKI-Fenster, Dialyse, Transplantation, Zensierung | Analysen / Datenaufbereitung | Vorgesehen, mit sichtbarer Ausschlussübersicht |
| Individuelle CKD-Endpunkte und Fit-Qualität | Analysen / Einzelverlauf-Ergebnisse | Vorgesehen; getrennt von Gruppenprojektionen |
| Mixed Model, Engine, Zufallseffekte, Modelllinie | Analysen / Gruppenmodell | Feste Beispielwerte; keine Engine |
| Beliebige Faktoren, Interpretation, Referenz, Niveau/Steigung | Analysen / Einflussfaktoren | Alter und Geschlecht umstellbar; weitere Faktoren vorgesehen |
| Modellpopulation, fehlende Werte, Formel, Fehlerzustände | Analysen / Konfiguration und Nachvollziehen | Einschlusszahlen, Formel, veraltetes Ergebnis |
| Projektionsprofile, Bezugszeit, Horizont, mehrere benannte Ziele | Analysen / Grenzwerte | Ein Ziel, Richtung und Horizont; feste Profile und Jahr 0 |
| Ergebnis-CSV, Patientenausgabe, SVG/PNG, Modellmetadaten | Kontextbezogener Export | Illustrativer HTML-Bericht; übrige Formate vorgesehen |
| Methodik, Forschungszweck, Herkunft, Einschränkungen | Nachvollziehen / Hilfe und Berichte | Prototyp-Hinweise; vollständige Methodik vorgesehen |
| Lokale Persistenz und Zurücksetzen | Daten / Arbeitsstand | Nur flüchtiger Zustand |

Time-to-event / Ereigniszeitanalyse bleibt eine mögliche spätere Erweiterung.
Sie benötigt ein eigenes Modell und ist kein anderer Name für die hier gezeigte
Trendfortschreibung.

Die eigentliche Umsetzung kann nach Beurteilung dieses Entwurfs in vollständigen
Bedienwegen erfolgen. Vor einem Release müssen sämtliche vorgesehenen Funktionen
bewusst eingeordnet und die echten Import-, Analyse- und Exportwege abgenommen
sein; der Prototyp ersetzt diese Abnahme nicht.

## Prüfung am 13.09.2026

- Chromium: Daten → Einzelverlauf → Gruppenanalyse; kein Übertrag der
  Einzelansicht in die Ergebnisgrafik.
- Einflussfaktor geändert: Export gesperrt bis Aktualisierung.
- Grenzwert, Richtung, Horizont und leere Eingabe geprüft.
- HTML-Datei tatsächlich heruntergeladen und auf aktuelle Werte geprüft.
- Tastaturfokus nach Laden und Ergebniswechsel geprüft.
- 1440 px und 390 px visuell geprüft; keine Seitenüberbreite bei 390 px.
- Keine JavaScript-Laufzeitfehler im geprüften Ablauf.
- Unabhängiges Code-Review; Fokus- und Eingabeprobleme behoben.
- `pnpm test`: 782 Tests erfolgreich; `pnpm build` erfolgreich.
- Produktive Nutzbarkeit und Vollständigkeit stehen noch zur Beurteilung aus.


## Überarbeitung: Patientenbrowser

Der Einstieg unter Verläufe ist eine Matrix: Personen als Zeilen, frei wählbare
Parameter als Spalten. Eine reine Einzelansicht macht den Vergleich über Personen
unnötig aufwendig; eine gemeinsame Grafik für unterschiedliche Einheiten wäre
schwerer zu lesen. Deshalb stehen kleine Einzelgrafiken nebeneinander, mit
identischer Zeitachse und einer festen Werteskala je Parameter über alle Personen.
Die Detailansicht vergrößert dieselben Verläufe und bietet Vor/Zurück innerhalb
der gefilterten, sortierten Auswahl. Die Tabelle bleibt über einen Rückweg erreichbar.

Die zwölf Parameter sind illustrative Datensatz-Metadaten. Ein Plot-Renderer
verarbeitet sie gleichermaßen, ohne eGFR-Sonderfall. Die spätere produktive Liste
muss aus den importierten Daten kommen. Der bestehende Analyseentwurf mit festen
Gruppenwerten ist weiterhin ein separates Beispiel, kein Fit dieser Messpunkte.

Zusätzliche Prüfschritte: Suche ohne Treffer; keine ausgewählten Parameter;
Filter mit 24 Personen; Blättern an Anfang/Ende; Rückweg nach langem Scrollen;
Sortierung nach einem anschließend ausgeblendeten Parameter; mobile Tabelle
horizontal scrollen bei fixierter Personenspalte. 48 Personen × 6 Zeitpunkte
× 12 Parameter ergeben 3.456 illustrative Messwerte.


Browserprüfung der ersten Überarbeitung: Person 009 → 010,
Rückkehr mit Fokus auf 010, Gruppenfilter (24 Personen), leere Suche,
Sortierung und Entfernen der Sortierspalte, keine Parameter, erste/letzte
Person, Direktwahl und mobile Ansichten ohne Seitenüberbreite erfolgreich.
Alle sechs Messwerte sind auch in der zugänglichen Grafikbeschreibung enthalten.
Der separate Analyseablauf wurde erneut geöffnet und geprüft. Unabhängiges
Review ergab keine blockierenden Logikfehler; beide Detailhinweise wurden behoben.


## Überarbeitung: Viele Patienten und Parameter

Die Tabelle zeigt alle 48 Personen ohne Pagination und ohne eigenen vertikalen
Scrollbereich. Vertikales Scrollen bewegt die Seite. Die Tabelle scrollt nur
horizontal; eine angeheftete Spaltennavigation bietet Pfeile und einen direkten
Sprung zu jedem ausgewählten Parameter. Die Patientenspalte bleibt links stehen.
285 px pro Parameterspalte halten die Graphen auch bei zwölf Parametern lesbar.
Die Parameternamen wiederholen sich klein pro Zelle zur Orientierung weiter unten.

„Parameter auswählen“ öffnet einen durchsuchbaren Dialog mit Name und Einheit,
Auswahlzähler, Alle/Keine sowie Übernehmen/Abbrechen. Änderungen sind zunächst
Entwürfe; Escape und Abbrechen erhalten die ursprünglichen Spalten. Die kompakte
Zusammenfassung außerhalb des Dialogs nennt höchstens drei Namen plus Restanzahl.

Chromium geprüft mit zwölf ausgewählten Parametern: 48 Zeilen, 285 px Spalten,
kein inneres vertikales Scrollen, kein Seitenüberlauf auf 390 px. Suche, Abbrechen,
Escape, leere Auswahl und Wiederherstellung der Auswahl funktionieren. Rückweg
von Person 030 → 031 stellt Fokus und horizontale Position der Tabelle wieder her.
Für produktive große Datensätze bleibt Zeilenvirtualisierung vorgesehen; die
48 Beispielpersonen benötigen keine eigene Paging- oder Nachladelogik.


## Überarbeitung: Analyse ohne Sidebar

Die Seite besteht aus einer kompakten Zusammenfassung, der aufklappbaren
Konfiguration in voller Breite und dem Ergebnis darunter. Zielgröße, Datenbasis
und Modell stehen oben in der Konfiguration; Einflussfaktoren stehen als Tabelle
mit Auswahl für Niveau / Niveau und jährliche Änderung / ausgeschlossen.

„Beispiel berechnen“ aktualisiert das illustrative Ergebnis, klappt die
Konfiguration ein und fokussiert die Ergebnisüberschrift. „Einstellungen
bearbeiten“ öffnet sie erneut. Ein bisheriges Ergebnis bleibt während der
Bearbeitung sichtbar. Bei Änderungen trägt es einen deutlichen Veraltet-Hinweis;
Zielgröße, Formel, Population und Projektion bleiben dem bisherigen Stand
zugeordnet. Export ist gesperrt, bis neu berechnet oder verworfen wird.

Ergebnisaktionen liegen am Ergebnis: Einstellungen bearbeiten,
Trendfortschreibung öffnen, Bericht exportieren. Es gibt keinen neuen Assistenten
und keine zusätzliche Seitenfolge. „Änderungen verwerfen“ stellt die zuletzt
berechnete Konfiguration einschließlich aktueller Projektionswerte wieder her.

Browserprüfung: Konfiguration ein-/ausklappen, Zielgröße und Alter ändern,
Snapshot von Formel und Einschlusszahlen, Export-Sperre, Verwerfen und Neuberechnen.
Desktop 1440 px und Mobile 390 px ohne Seitenüberbreite; keine Laufzeitfehler.
Unabhängiges Review: Snapshot für live geänderte Projektionswerte ergänzt.


## Vereinfachung: Eine Karte für die Analyseeinstellungen

Die separate Zusammenfassungsleiste entfällt. Die einzige Karte
„Analyseeinstellungen“ bleibt beim Ein-/Ausklappen bestehen: eingeklappt mit
Zielgröße, Modell, Vergleich und Personenzahl; geöffnet mit denselben Einstellungen
wie bisher. „Einstellungen bearbeiten“ und „Einstellungen einklappen“ sind zwei
Zustände desselben Schalters. Berechnen klappt den Inhalt innerhalb der Karte ein.
Der doppelte Bearbeiten-Button am Ergebnis entfällt. Entwürfe bleiben beim
manuellen Einklappen erhalten; veraltete Ergebnisse und die Export-Sperre bleiben
sichtbar. Nur Berechnen oder explizites Verwerfen übernimmt bzw. verwirft Änderungen.


## Gemeinsames Ergebnis: Verlauf und Grenzwerte

Überblick und Grenzwerte haben keine separaten Tabs mehr. Links steht die Grafik,
rechts die zugehörige Grenzwertprojektion. Unter 900 px stehen beide untereinander.
„Modell und Datengrundlage“ liegt als aufklappbarer Bereich darunter. Die separate
Aktion zum Öffnen der Trendfortschreibung entfällt, da sie unmittelbar sichtbar ist.

Die Grafik zeigt die festen Beispieltrends bis Jahr 5 durchgezogen und eine
Fortschreibung darüber hinaus gestrichelt. Grenzwertlinie und Schnittpunkte
reagieren sofort auf Grenzwert, Richtung und Horizont. Markiert werden nur
zukünftige, in der gewählten Richtung erreichbare Schnittpunkte innerhalb des
Horizonts. Bereits am Ausgangspunkt erfüllte Bedingungen stehen als Status in
der Tabelle; sie erhalten keinen irreführenden späteren Eintrittsmarker.

Geprüft: zwei Standardschnittpunkte (A: 10, B: 9 Jahre), synchrones Ändern auf
Grenzwert 40, Horizont 5 ohne Marker, leere Eingabe mit gesperrtem Export,
Richtungswechsel, erhaltenes bisheriges Ergebnis bei Modelländerung, zweites
Zielgrößenbeispiel sowie Desktop und Mobile ohne Seitenüberbreite.


Die aktuellen Überschriften verdeutlichen die Zugehörigkeit zum selben Modell:
„Gruppenvergleich konfigurieren“ → „Ergebnis des Gruppenvergleichs“ →
„Grenzwerte aus diesem Modell“. Die Zielgröße bleibt in der Ergebnisbeschreibung
sichtbar. Die Grenzwertprojektion ist eine Auswertung des dargestellten Modells,
keine unabhängige Modellschätzung.


## Einblendbare Auswertungen je Verlauf

Unter „Verläufe“ öffnet jeder Parameterkopf „Auswertungen“. Dieselbe Auswahl ist
in der Einzelansicht verfügbar. Die Einstellung gilt je Parameter für alle
Patienten und bleibt beim Wechsel zwischen Tabelle und Einzelansicht erhalten.
Trendlinie, jährliche Änderung, R² und Grenzwertzeitpunkt sind unabhängig wählbar.
Grenzwert, Richtung und Horizont sind frei einstellbar; ein Grenzwert wird nicht
anhand des Parameternamens vorgegeben. Abbrechen/Escape verwerfen Entwürfe.

Der Prototyp verwendet dafür unverändert `fitOls` und `projectLinearThreshold`
aus dem bestehenden Kern, ausschließlich mit synthetischen Verläufen. Er enthält
keine zweite numerische Implementierung. Der Einzelverlaufs-Projektionsbezug ist
der letzte Messzeitpunkt (Jahr 5), ausgewertet am **angepassten Trend**; die
Restzeit ist relativ dazu. Eine erreichbare Grenze außerhalb des Datenzeitraums
wird als Kennzahl angezeigt, die kleine Grafik bleibt auf den Messzeitraum begrenzt.
R² beschreibt die Anpassung und ist kein Prognosesicherheitsmaß.

Die zwölf Parameter sind weiterhin Beispielmetadaten; dieselben Methoden und
Renderer funktionieren für alle. Der Methodenkatalog ist ausdrücklich eine
Softwarefunktion, Parameter und Zielkonfiguration sind davon getrennt. Die spätere
produktionsseitige Anbindung muss Methodenverfügbarkeit, fehlende Messwerte,
Zeitfenster, Ausschlüsse und weitere bestehende Fit-Optionen berücksichtigen.
Der Prototyp demonstriert zunächst OLS; keine neue Freigabe aller produktiven Wege.

Tab 3 heißt „Kohortenmodelle“ und öffnet direkt die Konfiguration des gemeinsamen
Modells. Die zwei gleichartigen Einstiegskarten entfallen. Dessen Modellwerte
bleiben fest vorgegeben; Einzelverlaufs-Auswertungen benötigen diesen Bereich nicht.

Start weiterhin mit **Vite / pnpm dev**, kein reiner statischer Dateiserver: Der
Auswertungsadapter importiert bestehende TypeScript-Kernfunktionen, die Vite für
den Browser verarbeitet. Am produktiven Einstieg und Rechenkern wurde nichts geändert.

Geprüft: vier Auswertungen für eGFR auf 48 Zeilen; identische Werte in Tabelle
und Person 001; getrennte Einstellungen für Hämoglobin; Abbrechen; leere
Grenzwerte blockieren Übernehmen; Navigation erhält die Konfiguration; direkter
Einstieg in Kohortenmodelle und dessen Beispielberechnung; 390 px ohne Überbreite.


## Prüfung der Verwaltung und Überlagerung

Browser: 46 eGFR-Linien, 48 Linien je anderem Parameter, Gruppenfilter A mit
23 berechenbaren eGFR-Verläufen, Tastaturwechsel zur Person und zurück. Eigene
Konfiguration kopiert und zugeordnet; Zeitfenster 4–5 ergibt einen nachvollziehbaren
Hinweis statt eines vorgetäuschten Fits. Formelwechsel CKD-EPI → MDRD verändert
Personenwerte und Auswertungen nach Übernehmen. Fehlendes Alter bleibt sichtbar.
Desktop und Mobile geprüft; Dialog und Seite ohne horizontale Überbreite.

Unabhängiges Review der neuen eGFR-Komponente sowie der Integration. Fehlender
Rücksprungfokus bei nicht darstellbaren Linien und unzureichende Fit-Punkte behoben.


## Plot-Einstellungen aus dem ursprünglichen Overlay

Direkt über dem Spaghetti-Plot: Zeit seit erster Messung / Alter / synthetisches
Kalenderdatum, Färbung nach Genotyp / Geschlecht / ohne Gruppierung und einzelne
Person hervorheben. Unter Darstellung: Messpunkte, Verbindungslinien und illustrative
Studienbesuche. Gruppen lassen sich über die Legende aus-/einblenden; das beeinflusst
nur den Plot, nicht die gemeinsame Patientenauswahl oder die berechneten Fits.

„Patienten auswählen“ erstellt eine explizite Auswahl, die Tabelle und Überlagerung
verwenden. „Alle 48 Personen“ stellt die vollständige Basis wieder her. Suche und
Genotypfilter grenzen diese Basis zusätzlich ein. Abbrechen und Escape verändern
keine Auswahl. Die Einzelansicht blättert durch dieselbe gemeinsame Auswahl.

Die Kalenderachse verwendet künstliche Startdaten 2015–2020 und den Zeitabstand der
Messungen. Für die Altersachse werden Personen ohne Ausgangsalter weggelassen und
gezählt. Fit-Fenster bleiben Jahre seit erster Messung; ihre Darstellung wird auf
die gewählte Achse transformiert. Färbung bleibt je Gruppe stabil über Parameter.

Die Ereignisse sind als Beispiel erzeugte Studienbesuche bei sechs Personen,
jeweils in Jahr 2,5. Sie bewirken keine Zensierung. „Ausgeschlossene Messungen“ ist
mangels Ausschlüssen deaktiviert; „Kohortenmodell-Linien“ mangels passendem berechneten
Modell. Beide sind ausdrücklich offene Integrationspunkte. Die festen Linien im
separaten Kohortenmodell-Beispiel werden nicht als passende Fits ausgegeben.

Browserprüfung: Altersachse mit 46 Personen, Kalenderachse, gruppenweises Ausblenden
bei unveränderten 48 Tabellenzeilen, reine Punktansicht mit 276 eGFR-Punkten,
Ereignismarker, gemeinsame Auswahl 001/047 und zwei Tabellenzeilen, mobile Breite.
Review: inaktive Hervorhebung zurückgesetzt und Gruppenfarben stabilisiert.
