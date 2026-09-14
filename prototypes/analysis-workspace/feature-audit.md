# Funktionsabgleich: bestehende Anwendung und neuer Arbeitsplatz

Stand: 13.09.2026, Entwurfsbranch `design/analysis-workspace-prototype`,
Codebasis des Abgleichs: `97110be`. „Original“ bezeichnet hier die bestehende
Webanwendung unter `src/`, nicht die frühere Python-Anwendung.
Dies ist eine Quellcode-Inventur und Umsetzungsreihenfolge, keine erneute
Laufzeitabnahme oder Freigabe zum Veröffentlichen.

Ergänzt am 14.09.2026 durch den [Abgleich früherer Analysen und Issues](../../docs/requirements-reconciliation.md).
Zusätzliche offene Anforderungen aus #2: instabile Fits ausdrücklich auch im
Overlay kennzeichnen; SVG/PNG für alle Plots anbieten; die passende Tätigkeit
am Einstieg erklären; Badge-Dichte verbessern und doppelte vollständige
Kohortenberechnungen nur für Qualitätslabels vermeiden. Diese Punkte gehören
zur Integration und Abnahme, nicht zu bereits fertigen Demo-Funktionen.

## Ergebnis

Die Navigation **Daten → Verläufe → Kohortenmodelle** trägt die vorhandenen
Funktionen. Die Sidebar muss dafür nicht zurückkehren. Der Entwurf ist aber
noch kein funktionaler Ersatz: Import, vollständige Datenaufbereitung,
Qualitätskennzahlen, echte Kohortenmodelle und produktive Exporte fehlen.
Bedienbare Beispieloberflächen zählen nicht als produktive Anbindung.

Die folgenden Tabellen sind das aktuelle Inventar. „Demo“ bedeutet synthetische
Daten; „Kern angebunden“ bedeutet nur, dass der Entwurf dafür vorhandene
Rechenfunktionen nutzt. Keine fehlende Bestandsfunktion ist damit gestrichen.

## Daten und Arbeitsstand

| Funktion im Original | Stand im Entwurf | Ziel und offene Arbeit |
| --- | --- | --- |
| XLSX/XLS/CSV, Workbook mit Labor-, Ereignis- und Attributblättern; separate Ereignis-/Attributdateien | Nur synthetische Beispieldaten; Importhinweis | **Daten / Quellen:** vorhandene Loader anbinden; Dateiwechsel, Ladefehler und erneuten Import vollständig behandeln. |
| Beispiel- und Vorlagendownloads | Nicht angebunden | Direkt bei den jeweiligen Quellen anbieten. |
| Normalisierte bekannte Spaltennamen; Diagnostik für Ereignisse/Attribute, Ladefehler | Rollenübersicht und zwei fehlende Altersangaben | **Daten / Qualität:** vorhandene Diagnostik zugänglich machen; betroffene Personen öffnen. Freie Spaltenzuordnung wäre eine Erweiterung, kein bereits vorhandener Importdialog. |
| Demografie-Konflikte, fehlende Angaben, manuelle Korrektur | Fehlendes Alter sichtbar, keine Korrektur | Qualität und Korrektur zusammenführen; Herkunft und Auswirkungen einer Korrektur zeigen. |
| eGFR an/aus, CKD-EPI 2021/MDRD-4/EKFC 2021, Kreatininquelle, Demografie-Abhängigkeiten | CKD-EPI 2021/MDRD-4 mit Kern angebunden; Quellen fest | **Daten / Abgeleitete Parameter:** EKFC 2021, echte Quellauswahl, Einheitenprüfung und deaktivierbare Definitionen anbinden. Keine freie Formel-Engine voraussetzen. |
| Optionale lokale Speicherung des Datensatzes mit Ablauf nach sieben Tagen; wenige Einstellungen; Löschen | Zustand geht beim Neuladen verloren | **Daten / Arbeitsstand:** bisheriges Speichern/Löschen erhalten. Vollständige Projekte mit Ereignissen, Attributen und versionierten Konfigurationen sind zusätzliche Arbeit. |

Belege: [App](../../src/App.tsx), [Loader](../../src/ui/data/loadDataset.ts),
[Header](../../src/io/headers.ts), [Sidebar](../../src/ui/shell/Sidebar.tsx),
[Persistenz](../../src/io/persistence.ts), [Ableitungsdemo](derived-parameters.js).

## Verläufe: Tabelle, Person und Überlagerung

| Funktion im Original | Stand im Entwurf | Ziel und offene Arbeit |
| --- | --- | --- |
| Suchbare Auswahl nach Parameter und Einheit, höchstens drei Reihen; fehlende Auswahl bleibt kenntlich | Zwölf feste Parameter, Mehrfachauswahl, horizontale Tabelle | **Verläufe / Parameter:** datengetriebener Katalog ohne feste Dreiergrenze; unterschiedliche Einheiten nicht vermischen; fehlende Reihen weiter erklären. |
| Patientenwahl, Einzelansicht, Kohortentabelle, alle/ausgewählte Personen | Gemeinsame Auswahl, ID-Suche, Vor/Zurück und Direktwahl in der Demo | Mit echten IDs und unregelmäßigen Messreihen verbinden; Auswahl und Rücksprungposition erhalten. |
| Sortierung nach Steigung, absoluter Steigung, Anzahl, Dauer und ID; Qualitäts-/AKI-/Endpunktmarkierungen | ID oder letzter Messwert; einfache OLS-Kennzahlen | **Verläufe / Tabelle:** vorhandene Sortierungen und Markierungen ergänzen; Kennzahlen über Anzeige je Parameter einblenden. |
| Miniaturgröße S/M/L | Feste Diagrammgrößen | Kompakte Darstellungsoption ergänzen; große Kohorten und zweistellige Parameterzahlen separat auf Bedienbarkeit und Leistung prüfen. |
| Überlagerung mit Alter, Kalenderzeit oder Zeit seit Ausgangspunkt | Alle drei Achsen mit Demo verbunden | Echte Messdaten und fehlendes Alter übernehmen; Achsenwechsel darf keine Auswertung stillschweigend ändern. |
| Gruppierung nach frei benannten Patientenattributen, Gruppen ausblenden, Hervorhebung und Person öffnen | Genotyp/Geschlecht/keine, Legende und Hervorhebung bedienbar | Attribute aus Daten beziehen; ausgeblendete Legende betrifft nur Darstellung. Mehrere Parameter bleiben in getrennten Diagrammen. |
| Punkte verbinden, Ereignisse, ausgeschlossene Messungen und Verlaufsteile | Punkte/Linien und illustrative Ereignisse; Ausschlüsse deaktiviert | Echte Ereignisse und Ausschlussgründe in Diagramme übernehmen; Anzeige und statistische Verwendung getrennt halten. |
| Passende gepoolte/Gruppen-Modelllinien aus echten Kohortenfits | Individuelle OLS-Linien; Kohortenmodelllinie deaktiviert | In Überlagerung nur Ergebnisse mit passender Daten-, Parameter- und Konfigurationsidentität anbieten; individuelle Fits eindeutig von Kohortenlinien unterscheiden. |

Belege: [Parameterwahl](../../src/ui/seriesStrip/SeriesStrip.tsx),
[Einzelansicht](../../src/ui/patient/OnePatientView.tsx),
[Kohortentabelle](../../src/ui/cohort/CohortView.tsx),
[Original-Overlay](../../src/ui/cohort/CohortTrajectoryOverlay.tsx),
[Patientenbrowser](patient-browser.js), [neues Overlay](overlay-view.js).

## Auswertung und Modelle

| Funktion im Original | Stand im Entwurf | Ziel und offene Arbeit |
| --- | --- | --- |
| Fit-Presets; kein Fit, OLS, Theil–Sen, Rolling OLS und Segmented OLS | Benannte/kopierbare OLS-Konfigurationen mit Zeitfenster | **Verläufe / Konfigurationen verwalten:** vollständige vorhandene Verfahren und ihre tatsächlich wirksamen Optionen anbinden. **Anzeige** weist nur Konfiguration und sichtbare Ergebnisse zu. |
| Transplantation/chronische Dialyse zensieren, akute Dialyse ausschließen, unbekannte Dialyse behandeln, AKI-Fenster, monatliche/quartalsweise Mediane | Fehlt | In derselben benannten Konfiguration als Datenaufbereitung verwalten; vor Übernahme eingeschlossene/ausgeschlossene Messungen und Gründe zeigen. |
| Fit-Qualität, Konfidenzintervalle, AKI, rascher eGFR-Abfall, prozentualer Abfall, beobachtetes G5 und projiziertes G5-Alter | Steigung, R² und generischer Grenzwertschnitt aus Kernfunktionen auf Demo | Kennzahlen in Tabelle/Person zuordnen, Definitionen und Einheiten sichtbar halten. Rohanzahl und Fit-Anzahl unterscheiden; R² ersetzt keine Qualitätsregel. Klinische Kennzahlen bleiben parameterabhängig. |
| Experimenteller echter Mixed-Model-Lauf, zufälliger Intercept oder Intercept+Steigung, gepoolte und gruppierte Fits | Feste Beispielgeraden, kein Fit | **Kohortenmodelle:** vorhandenen Lauf und Ergebnisdarstellung anbinden, einschließlich Fortschritt, Fehlern und unbrauchbaren Fits. Engine-Konfiguration am vorhandenen Kern prüfen, keinen bereits vorhandenen UI-Engine-Schalter voraussetzen. |
| Datenabhängige Faktoren, numerisch/kategorial, Referenzkategorie, Niveau/Steigung; Populationsvorschau und Formel | Fester Genotyp, Alter/Geschlecht umstellbar | Generische Faktorauswahl übernehmen. Alter/Geschlecht mit Niveau + jährlicher Änderung als vereinbartes Beispiel, nicht globale Pflichtkonfiguration. |
| Modellidentität und veraltete Ergebnisse; Koeffizienten und Intervalle | Veraltet-Zustand illustriert, keine echten Koeffizienten | Konfiguration, Einschlusspopulation, Datenstand und Ergebnis verbinden; veraltete Ergebnisse nicht als aktuelle exportieren. |
| Projektion mit Faktorprofil, Bezugszeit, Horizont, mehreren benannten/aktivierbaren Grenzwerten und Presets | Ein Ziel, feste Profile und Jahr 0 | **Neben der Modellgrafik:** vollständige Profil-/Zielkonfiguration anbinden; mehrere Ziele übersichtlich listen. Individuelle Fortschreibung bleibt Ergebnis der Einzelverlaufs-Konfiguration. |

Belege: [Fit-Steuerung](../../src/ui/shell/Sidebar.tsx),
[Zustand und Lauf](../../src/ui/state/store.ts),
[Modellkonfiguration](../../src/ui/cohort/CohortModelPanel.tsx),
[Modellergebnisse](../../src/ui/cohort/CohortModelTable.tsx),
[Projektion](../../src/ui/cohort/ModelProjectionPanel.tsx),
[Demo-Auswertungen](series-evaluations.js), [Konfigurationsverwaltung](evaluation-presets.js).

## Export und Nachvollziehbarkeit

| Funktion im Original | Stand im Entwurf | Ziel und offene Arbeit |
| --- | --- | --- |
| Einzelgrafik SVG/PNG, Patienten-XLSX und ZIP mit Workbook/SVG | Fehlt | Export direkt an Person/Grafik, mit tatsächlich dargestellten Daten und Einstellungen. |
| Kohorten-XLSX und Modell-XLSX einschließlich Projektion/Metadaten | Illustrativer HTML-Bericht | Export an Tabelle bzw. Modellergebnis. CSV und SVG/PNG für jedes Overlay sind Erweiterungen; nicht als überall vorhandene Exporte verbuchen. |
| Methodikseite und Forschungshinweise | Kurze Prototyp-Hinweise | Erreichbare Hilfe ohne Sidebar; Methodik und Forschungshinweise auch in produktiven Exporten erhalten. |

Belege: [Patientenexport](../../src/ui/patient/OnePatientView.tsx),
[Kohortenexport](../../src/ui/cohort/CohortView.tsx),
[Modellexport](../../src/ui/cohort/CohortModelTable.tsx),
[Methodik](../../src/ui/pages/Methodology.tsx).

## Umsetzung in abnehmbaren Bedienwegen

1. **Echte Daten bis zum Patientenvergleich:** vorhandene Formate importieren,
   Diagnostik und Demografie prüfen/korrigieren, abgeleiteten Parameter definieren,
   beliebige Parameter in Tabelle/Person/Overlay vergleichen und Patientenexport
   herunterladen. Abnahme auch mit fehlenden Werten, wechselnden Einheiten,
   Ereignis-/Attributblättern und einem zweiten Datensatz. Keine festen Demo-IDs,
   Faktorlisten oder Zeitraster in diesem Weg.
2. **Nachvollziehbare Einzelverlaufsanalyse:** vollständige Fit-Konfiguration
   einschließlich Aufbereitung anwenden, Ausschlüsse prüfen und dieselben
   Kennzahlen in Tabelle, Person und Export wiederfinden. Klinische Markierungen,
   No-Fit-Fälle und Qualitätsregeln erhalten; Änderung einer Ableitung invalidiert
   abhängige Ergebnisse. Numerische Parität zum vorhandenen Kern prüfen.
3. **Echter Kohortenvergleich mit Trendfortschreibung:** Population und Faktoren
   wählen, Modell schätzen, Ergebnis/Fehler prüfen, Profile und mehrere Grenzwerte
   bearbeiten, passende Linie im Overlay zeigen und konsistent exportieren.
   Eine Änderung von Daten oder Konfiguration muss alte Ergebnisse erkennbar machen.
4. **Release-Abnahme des gesamten Arbeitsplatzes:** bestehende lokale Speicherung,
   Löschen, Hilfen und Vorlagen vervollständigen; große Kohorten, Tastatur,
   schmale Ansichten, Downloads und Wiederaufnahme prüfen. Offene Bestandslücken
   bewusst entscheiden, bevor die alte Oberfläche ersetzt wird.

Schritte dürfen intern über mehrere PRs integriert werden. Die produktive
Veröffentlichung erfolgt erst nach Abnahme vollständiger Bedienwege über ein
[reguläres Release](../../docs/release-process.md). Ein Merge oder grüne CI
veröffentlicht den Entwurf nicht und ersetzt keine Nutzungsabnahme.

## Bereits entschieden und spätere Ergänzungen

- Parameter, Einheiten, Attribute, Faktorrollen und Grenzwerte werden aus Daten
  und Konfiguration gespeist. eGFR ist ein wichtiges Beispiel, keine feste App-Struktur.
- Trendfortschreibung kommt zuerst. **Time-to-event / Ereigniszeitanalyse** bleibt
  als separate spätere Erweiterung vorgemerkt, mit eigener Ereignisdefinition,
  Zensierung und Modellierung.
- Patientenattribute erlauben zunächst Assoziationsvergleiche. Eine Behandlung
  mit Beginn/Ende oder Änderungen im Verlauf braucht zusätzlich passende
  zeitbezogene Eingabedaten und Modellierung; Ereignismarker allein leisten das nicht.
- Freie Spaltenzuordnung, weitere Ableitungsverfahren und vollständige gespeicherte
  Projekte werden bei ihrer Umsetzung konkretisiert. Sie sind keine Voraussetzung,
  um den ersten Bedienweg mit den bereits unterstützten Dateiformaten anzubinden.
