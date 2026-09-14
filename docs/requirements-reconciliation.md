# Anforderungen, Entscheidungen und offene Probleme

Abgleich vom 14.09.2026. Dieser Index verbindet frühere Analysen, GitHub-Issues,
Umsetzungsnachweise und den aktuellen UI-Entwurf. Er ersetzt keine Fachdefinition
und erklärt technisch integrierte Funktionen nicht automatisch für abgenommen.

## Quellen und Reichweite

Geprüft wurden die fünf vorhandenen Issues **#1, #2, #3, #4, #6** einschließlich
ihrer Updates (keine Kommentare vorhanden bei #2/#4/#6), die gemergten PRs #5,
#7–#14, die einschlägigen Modell-, Projektions-, Demografie-, Import- und
Architekturdokumente unter `docs/superpowers`, der Endpoint-Readiness-Bericht,
Theil-Sen-Referenzbefunde sowie README und Funktionsinventar des Prototyps.
Die UI-Entscheidungen aus dem verfügbaren Gespräch sind unten zusammengeführt.

Zusätzlich wurden ältere Entwürfe im benachbarten Python-Repository
`janpower/lab-trajectory-explorer` (lokaler Stand
`36a2e6492d65387af296de108d6eed329213f371`) herangezogen: Fit-Methoden-Exploration
vom 20.05., krankheitsspezifische Algorithmen vom 22.05. und Browser-Port vom
11.06.2026. Deren Vorschläge sind keine pauschal genehmigten Web-Anforderungen.

Eigenständige Originalberichte der externen Anwendungsanalysen wurden in den
geprüften Repository-Dokumenten nicht gefunden. Ihr verfügbares Abbild sind die
paraphrasierten Findings in den Issues. Deshalb bezieht sich Vollständigkeit auf
diese zugänglichen Quellen, nicht auf unbekannte Anhänge oder nicht überlieferte
Gespräche. Externe Rückmeldungen werden hier nicht wörtlich veröffentlicht.

Weiterführende Quellen:

- [Forschungsmodell und genehmigtes Faktorbeispiel](superpowers/specs/2026-09-13-research-models-proposal.md)
- [Projektionsvertrag und Grenzen](superpowers/specs/2026-09-13-configurable-trend-projection-design.md)
- [Theil-Sen-Vergleich](../tests/goldens/theil_sen.md)
- [Web-Aufbereitung und Ereignisregeln](superpowers/specs/2026-06-24-rrt-event-schema-and-fit-pipeline-design.md)
- [Historische Fit-Exploration](https://github.com/janpower/lab-trajectory-explorer/blob/36a2e6492d65387af296de108d6eed329213f371/docs/superpowers/specs/2026-05-20-fit-method-expansion-exploration.md)
- [Historischer Algorithmenentwurf](https://github.com/janpower/lab-trajectory-explorer/blob/36a2e6492d65387af296de108d6eed329213f371/docs/superpowers/specs/2026-05-22-disease-specific-algorithms-design.md)
- [Ursprünglicher Browser-Port](https://github.com/janpower/lab-trajectory-explorer/blob/36a2e6492d65387af296de108d6eed329213f371/docs/superpowers/specs/2026-06-11-browser-typescript-port-design.md)

## Nachverfolgung der Analysebefunde

| Bereich / Quelle | Gesicherter Stand | Verbleibende Arbeit / Zuständigkeit |
| --- | --- | --- |
| [#1: Qualität und Import](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/1), PR #5 | Geschlossen: Gründe für fehlende Endpunkte, Fit-Qualität in Tabelle/Person, Fit-Methode im Export, Methodenhilfe, englische Geschlechtswerte, Vorlagen und CI implementiert. | Beim UI-Umbau erhalten. Qualitätsregel muss die tatsächlich gefitteten Punkte berücksichtigen; zwei Punkte mit R²=1 sind kein verlässlicher Fit. Overlay-Erweiterung bleibt #2. |
| [#3: Eingabe/Demografie](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/3), PRs #8/#9 | Geschlossen: gemeinsame Header-Aliase, Workbook/Einzeldateien, Demografie-Auflösung, Konfliktmeldungen, Geburtsdatumsabgleich und manuelle Altersvorbelegung implementiert. | Datenbereich muss diese Wege vollständig übernehmen. Priorität manuell > Attribute > Labor darf Konflikte nicht unsichtbar machen; Alter hat einen datierten Bezugspunkt. |
| [#2: Navigation und Exporte](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/2) | Offen. Arbeitsplatz mit drei Hauptbereichen und kontextbezogenen Einstellungen im Prototyp ausgearbeitet; Sidebar ist keine Vorgabe mehr. | Echte Daten anbinden; direkt am Einstieg erklären, welche Frage jeder Bereich beantwortet. Bedienbarkeit mit fachfremden Erstnutzern prüfen. |
| #2: Overlay und Informationsdichte | Individuelle OLS-Linien und Overlay-Steuerung in Demo vorhanden. | Instabile Fits auch im Overlay kennzeichnen; SVG/PNG für alle Plots; Qualitäts-, AKI-, Endpunkt- und Rapid-Decline-Hinweise ohne versteckte wichtige Information darstellen. |
| #2: Rechenaufwand | Issue benennt erneuten Kohortenaufbau in `OnePatientView` allein für Qualitätsfelder. | Gemeinsame vorbereitete Ergebnisse nutzen; keine zweite vollständige Auswertung nur für Labels. Mit realistischen Patientenzahlen prüfen. Nicht durch pauschales Entfernen von Qualitätsanzeigen lösen. |
| [#4: Forschungsmodelle/Endpunkte](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/4), PRs #11/#12/#13 | Patient-level Faktoren und generische Modellkurven-Projektionen technisch in main integriert. | Neue Oberfläche anbinden und mit repräsentativen Forschungsdaten abnehmen. Beobachtete G4/G5-Endpunkte und ältere individuelle Projektionen bleiben gesonderte Arbeit. |
| #4: beobachtete Endpunkte | Bekannte G5-Logik kann einen früher bestätigten Verlauf durch spätere Erholung verwerfen und verwendet das letzte passende Bestätigungsdatum. | Vor Wiederverwendung als erstes Ereignis Definition entscheiden; nicht stillschweigend umdeuten. G4/G5-Grenzwert-Presets der Projektion erfüllen diese Aufgabe nicht. |
| [#6: Theil-Sen](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/6), PR #10 | Numeric Tests und begrenzte Python-Vergleiche integriert; ursprünglicher Titel „no numeric test coverage“ ist veraltet. | Mindestpunktzahl 2/3, Intercept-Konvention und fehlendes Web-Konfidenzintervall bleiben offen. Kein vollständiger Paritätsnachweis; Numerik nicht im UI-Umbau ändern. |

Detailzuordnung sämtlicher aktueller Bestandsfunktionen zur neuen Oberfläche:
[Funktionsinventar](../prototypes/analysis-workspace/feature-audit.md).
Bestandslücken dort bleiben auch dann offen, wenn ihr altes Implementierungsissue
geschlossen ist: der Entwurf hat die produktiven Bedienwege noch nicht übernommen.

## Gesicherte Produktentscheidungen

| Thema | Entscheidung und Konsequenz |
| --- | --- |
| Navigation | **Daten / Verläufe / Kohortenmodelle**. Tabelle, Person und Spaghetti-Plot sind Ansichten derselben Verlaufsarbeit. Keine neue globale Einstellungs-Sidebar. |
| Patientenvergleich | Personen browsen, suchen und auswählen; mehrere Parameter mit ihren jeweiligen Einheiten nebeneinander vergleichen. Zweistellige Parameterauswahl berücksichtigen; kein Zusammenspiel aus innerem Vertikalscrollen und Pagination wie im verworfenen Entwurf. |
| Auswertungen | Berechnete Kennzahlen und Linien in Einzelverläufen und Tabelle einblendbar. Komplexe Einstellungen zentral als benannte Konfigurationen verwalten; lokale „Anzeige“ weist diese zu. |
| Ableitungen | Quellmessungen → abgeleitete Messgröße → benannte Auswertung → Darstellung. eGFR ist ein Beispiel; Parameter, Quellen, Einheiten, Attribute und Ziele werden nicht als feste Demo-Listen übernommen. |
| Kohortenarbeitsplatz | Konfiguration über Ergebnis, nach Berechnung einklappbar. Modellgrafik und Grenzwerte nebeneinander, ohne zusätzliche Ergebnis-Tabs oder verschachtelte Einstiegskarten. |
| Spaghetti-Plot | Gemeinsame Personen-/Parameterauswahl mit Tabelle, getrennte Diagramme je Parameter. Alter/Kalenderzeit/Baseline, Gruppierung, Legende, Hervorhebung, Punkte/Linien/Ereignisse erhalten. Sichtbarkeit darf Einschluss oder Fit nicht still ändern. |
| Assoziationen | Gene und Behandlungen/Interventionen sind zentrale Forschungsfragen. Gemeinsames adjustiertes Modell und separate beschreibende Gruppenfits unterscheiden. Kein automatischer Schluss auf kausale Behandlungseffekte. |
| Faktorbeispiel | Genotyp, **Ausgangsalter und Geschlecht jeweils für Niveau und jährliche Änderung**. Pro Variable einstellbar; keine universelle Pflichtauswahl. Geschlecht als Eingabe einer Ableitungsformel und als erklärender Faktor bleiben nachvollziehbar getrennt. |
| Eingabeorganisation | Kein extern vorgeschriebenes Format. Bestehendes `labs`/`attributes`/optional `events` plus Einzeldateien als Ausgangspunkt. Behandlung als Patientenattribut enthält keinen Behandlungsbeginn. |
| Zeit bis Grenzwert | Zuerst bedingte Trendfortschreibung. Fitted-curve-Anker, explizites Profil, Bezugszeit und Horizont; generische Ziele mit Einheit/Richtung. Zeitunsicherheit ist im ersten Modellschritt nicht geschätzt. |
| Veröffentlichung | Entwicklungsbranches und PRs; main ist Integrationsstand. Nur ein reguläres Release nach Abnahme vollständiger Bedienwege veröffentlicht. 0.3.0 ist vorgeschlagen, nicht freigegeben. |

## Offene Entscheidungen, ohne bereits Entschiedenes erneut aufzumachen

| Frage | Wann / wer entscheidet? | Blockiert den ersten Import-/Vergleichsweg? |
| --- | --- | --- |
| Welche repräsentativen Datensätze und Forschungsfragen dienen als Abnahmebeispiele? | Fachliche Abnahme durch Nutzer/Projekt; technische Grenzfall-Fixtures autonom vorbereiten. | Technische Anbindung nein; Forschungsabnahme ja. |
| Erste beobachtete Grenzüberschreitung oder bestätigtes Ereignis; Datum, Erholung, Follow-up und konkurrierende Ereignisse? | Fachliche Definition vor Ereigniszeitanalyse; Fragen im [Readiness-Dokument](research-endpoint-readiness.md). | Nein. |
| Soll die alte individuelle Fortschreibung ab letztem Messwert auf den Schnitt der Fit-Linie umgestellt werden? | Explizite Verhaltensentscheidung mit Vergleichsbeispielen; #4. Prototyp und alter Produktpfad haben derzeit unterschiedliche Anker. | Nein; Ergebnisse eindeutig benennen und unverändert halten. |
| Welche Theil-Sen-Konvention gilt künftig? | Statistik-/Paritätsentscheidung #6; Tests liefern bereits die Unterschiede. | Nein. |
| Wie werden Beginn, Ende, Wechsel und wiederholte Interventionen erfasst; Niveau-/Steigungsänderung ab wann? | Vor zeitabhängigen Interventionsmodellen, mit konkretem Datensatz. | Nein. |
| Welche weiteren Ableitungen, freie Spaltenzuordnung oder vollständigen gespeicherten Projekte werden gebraucht? | Spätere konkrete Anwendungsfälle; keine freie Formelsprache ohne eigenen Entwurf. | Nein. |
| Wie werden komplexe Setups und viele Gruppen im Alltag lesbar? | Autonom einen konsistenten Bedienweg bauen; anschließend Nutzungsabnahme. | Teil des UI-Pakets. |

## Wiedergefundene ältere Themen

- **Messgrenzen `<`/`>` versus zeitliche Zensierung:** ältere Python-Entwürfe
  diskutieren Ausschluss bzw. optionale Verwendung als Punktschätzung. Die spätere
  Web-Pipeline-Spezifikation schließt solche Werte aus Median-Fitpunkten aus.
  Diese Texte sind keine Freigabe für eine neue globale Behandlung. Vor Änderungen
  tatsächliches Verhalten pro Fitpfad charakterisieren; begrenzte/nichtnumerische
  Messwerte in Import, Anzeige und Export erhalten. Zuordnung: Aufbereitung/#4,
  Darstellung/#2. Nicht mit Transplantations-/Dialysezensierung verwechseln.
- **AKI sehen versus vom Fit ausschließen:** getrennte Funktionen, Quelle muss zur
  Erkennung passen. Ältere Wünsche nach Vorfenster/Mindeststadium oder allgemeiner
  Regelverwaltung sind Erweiterungskandidaten, keine vorhandenen UI-Regler.
- **Weitere Fit-Verfahren:** Change-Point-Erkennung, Plateau-/Regimewechsel,
  spezielle Behandlung begrenzter Werte und lokale Dichtegewichtung bleiben
  frühere Explorationen bzw. explizit zurückgestellte Erweiterungen. Kein Auftrag,
  sie im aktuellen UI-Paket einzubauen. Literaturbehauptungen aus diesen Entwürfen
  wurden in diesem Dokumentationsabgleich nicht neu fachlich validiert.
- **Architektur:** bestehende typisierte Analyse-Registry und gemeinsame
  Vorbereitung wiederverwenden. Allgemeine Konfigurierbarkeit verlangt keine
  Laufzeit-Plugins oder ausführbaren benutzerdefinierten Formeln.
- **Browserbetrieb:** Verarbeitung im Browser erhalten. Ältere WebR-Spike-Gates
  zu Ladezeit, Browsern und Fehlerfällen sind keine durch Chromium allein erledigte
  Produktabnahme. Keine beliebigen stillen Modellvereinfachungen bei Fehlschlägen.

## Aufgelöste Statuswidersprüche

- PRs #10/#11/#12 sind gemergt, zusammengeführt durch #13; #14 stellt Release-only
  Deployment bereit. Ältere Formulierungen „offener PR“/„Draft“ beschreiben den
  damaligen Stand. Produkt-/Forschungsabnahme bleibt davon unabhängig offen.
- Ältere Modal-/Sidebar-Spezifikationen dokumentieren frühere UI-Schritte; die
  neue Platzierung folgt dem Arbeitsplatz-Prototyp. Ihre numerischen Verträge
  und Nachvollziehbarkeitsanforderungen bleiben relevant.
- Das frühere Forschungsbeispiel mit Alter/Geschlecht nur als Haupteffekt ist
  durch das genehmigte Beispiel mit Zeitinteraktionen ergänzt und überholt.
- G4/G5 als Projektionsziele sind implementiert; beobachtete G4/G5-Ereignisse
  sind damit nicht generalisiert. Die verbleibende Arbeit in #4 bleibt offen.
- Theil-Sen ist inzwischen numerisch getestet; die drei Konventionsunterschiede
  bleiben offen. Alte Testzahlen in PRs sind historische Nachweise.
- Der Python-Entwurf schloss EKFC zunächst aus; die Webanwendung bietet EKFC
  inzwischen an. Das aktuelle Funktionsinventar hat für Bestandsübernahme Vorrang.

Die bestehenden Issue-Bodies enthalten weiterhin historische Abschnitte. Dieser
Abgleich ändert ihren Remote-Text nicht; aktuelle Zustände wurden am 14.09.2026
gelesen. Keine neuen Issues sind für diese Sicherung nötig.

## Nächster überprüfbarer Schritt

Den Entwurf einschließlich dieses Index als Draft-PR sichern. Danach den ersten
[vollständigen Bedienweg](../prototypes/analysis-workspace/feature-audit.md#umsetzung-in-abnehmbaren-bedienwegen)
auf einem Implementierungsbranch konkret planen: echter Import, Qualität und
Demografie, Ableitungen, Patientenvergleich und Export. Fehlende Bestandsfunktionen
bleiben bis zur Abnahme explizit offen. Keine Veröffentlichung aus diesem Abgleich.
