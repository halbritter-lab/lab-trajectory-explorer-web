# Arbeitsplatz-Prototyp

Branch: `design/analysis-workspace-prototype`.

Mit `pnpm dev --host 127.0.0.1` starten und
`http://127.0.0.1:5173/prototypes/analysis-workspace/index.html` öffnen.
Der Entwurf hat einen eigenen Einstieg und wird nicht in den regulären
Produktionsbuild aufgenommen. Keine Veröffentlichung oder Änderung am Rechenkern.

## Zweck und Grenzen

Die Navigation gliedert die Arbeit in **Daten → Verläufe → Analysen**.
Konfiguration und Ergebnis sind im Analysearbeitsplatz gemeinsam sichtbar;
es gibt keine globale Einstellungs-Sidebar. Auf schmalen Bildschirmen stehen
die Bereiche untereinander. Das ist ein zu beurteilender Entwurf, keine
freigegebene neue Anwendungsoberfläche.

Alle Daten und Modellwerte sind illustrative Konstanten. Die Bedienelemente
ändern Konfiguration, Formel, Einschlusszahlen und Ergebniszustand, schätzen
aber kein Modell. Die Projektion berechnet lediglich Schnittpunkte der festen
Beispielgeraden. Import erklärt den vorgesehenen Ablauf; echte Dateien werden
hier nicht eingelesen. Neuladen setzt den Entwurf zurück.

Genotyp, Alter und Geschlecht illustrieren eine generische Faktorenkonfiguration.
Ihre feste Auswahl im Prototyp ist **keine Vorgabe für die Implementierung**:
dort stammen Faktoren, Kategorien, Referenzen, Zielgrößen und Einheiten aus den
Daten bzw. der vorhandenen Konfiguration. Das zweite Zielgrößenbeispiel
„Studienmarker“ demonstriert die Anwendung außerhalb von eGFR.

## Kurzes manuelles Testprotokoll

1. **Daten:** Beispieldaten öffnen. 48 Personen / 288 Messungen je Parameter, zwei fehlende
   Altersangaben und die betroffenen Personen finden.
2. **Verläufe:** Verläufe ansehen. Parameter als Spalten ein-/ausblenden,
   nach ID suchen und nach letztem Parameterwert sortieren. Person öffnen,
   vor/zurück blättern oder direkt wählen. Zur Tabelle zurückkehren: Auswahl,
   Sortierung und die Position der aktuellen Person bleiben erhalten. Die Analyse
   ist über die Hauptnavigation erreichbar; das Modellbeispiel bleibt unabhängig
   vom Patientenbrowser und übernimmt keine seiner Filter.
3. **Analyse:** Bei eGFR Alter und Geschlecht auf „Niveau + jährliche Änderung“
   belassen. Formel öffnen; beide Faktoren haben eine Wechselwirkung mit Zeit.
   Beispielergebnis ansehen. Alter ausschließen: 48 statt 46 Personen,
   Ergebnis muss aktualisiert werden, Export ist bis dahin gesperrt.
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
