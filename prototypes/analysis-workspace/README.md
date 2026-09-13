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

1. **Daten:** Beispieldaten öffnen. 48 Personen / 288 Messungen, zwei fehlende
   Altersangaben und die betroffenen Personen finden.
2. **Verläufe:** Verläufe ansehen, Person 001 öffnen, zurück zur Kohorte.
   Zielgröße wechseln und als Analyse übernehmen.
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
| Zielgrößenauswahl, Personenauswahl, Einzelansicht | Verläufe / lokale Auswahl | Zwei Zielgrößen, eine Beispielperson |
| Kohortentabelle, Screening, Sortierung, Gruppierung, Patientenauswahl | Verläufe / Kohortenübersicht | Nur Gruppenillustration; Filter und Tabelle vorgesehen |
| Kohortenoverlay, individuelle Steigungen, Qualitätsmarkierungen | Verläufe / Grafik und Details | Vereinfachte Grafik; volle Darstellung vorgesehen |
| Miniaturgrafiken, Zoom, Punkte verbinden, Ereignismarker | Verläufe / Darstellungsoptionen | Vorgesehen |
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
