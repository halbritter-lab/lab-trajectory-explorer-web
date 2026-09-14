# Arbeitsplatz mit echten Daten

Entwicklung auf `feat/workspace-real-data`, aufbauend auf dem Entwurf in PR #15.
Start: `pnpm dev --host 127.0.0.1`, dann
`http://127.0.0.1:5173/workspace.html` öffnen.
Für Tests des gebauten Stands: `pnpm build` und `pnpm preview`.

Der Arbeitsplatz verwendet die vorhandenen Import-, Demografie-, eGFR- und
OLS-Funktionen. Er hat einen eigenen Einstieg; die bisherige Anwendung unter
`index.html` und der synthetische Entwurf bleiben zum Vergleich erhalten.
Die Daten bleiben in dieser Browsersitzung. Neuladen oder ein Wechsel zur
bisherigen Anwendung erfordert erneuten Import.

## Erster Bedienweg

1. Unter **Daten** eine XLSX-/CSV-Datei oder die mitgelieferten Beispieldaten laden.
   `labs`, `attributes` und `events` können in einem Workbook stehen. Vorlagen
   zeigen die vorhandenen Eingabeformate; frei wählbare Spaltenzuordnung ist
   weiterhin eine spätere Erweiterung.
2. Importmeldungen und fehlende/widersprüchliche Demografie prüfen. Bei manuellen
   Angaben den angezeigten Altersbezug beachten. Betroffene Person öffnen.
3. Eine eGFR-Ableitung mit expliziter Kreatininquelle und Formel konfigurieren,
   Vorschau prüfen und übernehmen. Die Quellmessungen bleiben erhalten.
4. Unter **Verläufe** Parameter anhand ihrer Namen und Einheiten auswählen.
   Personen suchen/auswählen, in Tabelle und Überlagerung vergleichen und einzelne
   Personen mit Vor/Zurück ansehen. Verschiedene Einheiten bleiben getrennt.
5. Den ausgewählten Patientenumfang als Workbook exportieren; einzelne Grafiken
   als SVG/PNG herunterladen. Sichtbare Kennzahlen und Export verwenden dieselbe
   vorbereitete Auswertung.

## Bewusste Grenzen dieses Pakets

- Einzelverläufe nutzen zunächst die bestehende allgemeine OLS-Konfiguration.
  Der vollständige Editor für Fit-Presets, Ausschlüsse, Zeitbalancierung und
  weitere Kennzahlen ist das nächste Integrationspaket.
- Die neue Seite **Kohortenmodelle** bietet keine Beispielberechnung auf
  Forschungsdaten an. Die Anbindung der vorhandenen echten Modelle und ihrer
  Projektionen folgt als eigener vollständiger Bedienweg.
- Keine automatische Speicherung oder Übernahme einer früher gespeicherten
  Patientendatei. Vollständige gespeicherte Projekte sind nicht Teil dieses Pakets.
- Keine Freigabe für klinische Entscheidungen und keine Ereigniszeitanalyse.

Alle verbleibenden Anforderungen stehen im
[Anforderungsabgleich](requirements-reconciliation.md) und im
[Funktionsinventar](../prototypes/analysis-workspace/feature-audit.md).

## Abnahmeprotokoll

Die konkrete technische und manuelle Prüfung dieses Branches wird nach der
Integration hier eingetragen. Eine bestandene technische Prüfung ersetzt nicht
die Abnahme mit repräsentativen Forschungsdaten und eine Release-Freigabe.
