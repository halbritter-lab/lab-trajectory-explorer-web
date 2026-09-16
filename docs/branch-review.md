# Vollständiger Branch Review: feat/workspace-real-data

Stand: 16. September 2026
Branch: `feat/workspace-real-data` (Basis: `main` @ `609e257`)

---

## 1. Technischer & Architektonischer Branch Review

### 1.1 Zusammenfassung & Scope
Der Branch verbindet echte Patientendaten, Laborzeitreihen, klinische Ereignisse und Patientenattribute mit dem neuen flexiblen Analyse-Arbeitsplatz (`workspace.html` & `src/workspace/`). Er löst die alte Beschränkung auf maximal drei parallele Messreihen auf und ersetzt die feste Sidebar durch eine moderne, horizontale Arbeitsplatz-Architektur.

- **Diff-Statistik**: 46 geänderte/neue Dateien, +4.465 Zeilen, -10 Zeilen.
- **Einstiegspunkte**: Autarker Einstiegspunkt `workspace.html` koexistiert sauber neben der Bestandsanwendung `index.html`.

### 1.2 Architektur und Komponentenstruktur

```
src/workspace/
├── main.tsx                      # Einstiegspunkt für workspace.html
├── WorkspaceApp.tsx              # Shell mit Navigation (Data, Trajectories, Models, Methods) & History-API
├── DataWorkspace.tsx             # 3-Schritt-Vorbereitung: Import, Demografie/Qualität, eGFR-Ableitung
├── TrajectoriesWorkspace.tsx     # Hauptarbeitsbereich: Tabelle, Overlay, Patientendetail, Filter, Scope
├── WorkspaceAnalysisSettings.tsx # Presets & Advanced Pipeline Settings (Shared vs. Per-Column Overrides)
├── WorkspacePlot.tsx             # Observable Plot Wrapper (Baseline/Calendar/Age, Zoom, Export)
├── WorkspaceSparkline.tsx        # Micro-Charts für Matrix-Tabellenzellen
├── WorkspaceExports.tsx          # Export-Schaltflächen (XLSX, SVG, PNG)
├── workspace-analysis.ts         # Preset-Katalog (ANALYSIS_CATALOG), FitSettings, Badges
├── workspace-data.ts             # Reaktive Schnittstelle zum Zustand, Spaltendefinitionen
└── workspace-export.ts           # Multi-Sheet-Serialisierung (labs, demographics, fit_summary, provenance)
```

- **App-Shell (`WorkspaceApp.tsx`)**: Header-Navigation mit Zustandsspeicherung per History-API (`window.history.pushState` / `popstate`), Tastatur-Fokus-Management (`tabIndex={-1}`, `mainRef.current?.focus()`).
- **Datenvorbereitung (`DataWorkspace.tsx`)**: 
  - Multi-Sheet-Import (Labs, Events, Attributes) mit Vorlagendownloads und strukturierter Diagnose-Aufschlüsselung.
  - Qualitätsprüfung der Demografie: Konflikterkennung und Modal-Dialog zur manuellen Korrektur (Verankerung am ersten Messdatum).
  - eGFR-Ableitung: Auswahl der Formel (CKD-EPI 2021, MDRD-4, EKFC 2021) und Quelle mit Kollisionserkennung und Live-Vorschau.
- **Trajektorien-Explorer (`TrajectoriesWorkspace.tsx`)**:
  - Unbegrenzte Parameterauswahl in einer horizontal scrollbaren Matrix-Tabelle.
  - Sparklines und Kennzahlen je Zelle (letzter Wert, Messwertanzahl, OLS/Theil-Sen/Rolling/Segmented Steigung, $R^2$, Qualitätswarnungen, KDIGO AKI-Badges, CKD G5 Endpunkte, Rapid Decline).
  - Spaghetti-Overlay mit flexiblen Zeitachsen (Baseline, Kalenderzeit, Alter) und Attribut-Gruppierung mit stabiler Farbpalette.
  - Detailansicht mit tabellarischer Messwerthistorie und Kennzeichnung von Zensierungsgründen.
- **Analyse-Einstellungen (`WorkspaceAnalysisSettings.tsx` & `workspace-analysis.ts`)**:
  - Trennung in globale Defaults und spaltenspezifische Overrides.
  - Voreinstellungen (`ANALYSIS_CATALOG`) und erweiterte Regler für Trendmodelle, Zeitaggregation, klinische Zensierung und AKI-Fenster.
- **Exporte (`workspace-export.ts` & `WorkspacePlot.tsx`)**:
  - Scoped Multi-Sheet-Excel-Export (`labs`, `demographics`, `fit_summary`, `provenance_and_settings`).
  - Standalone-SVG- und hochauflösender PNG-Export der Diagramme mit vollständigen Metadaten.

### 1.3 Verifikations- und Testergebnisse
- **Vitest**: 832 von 832 Tests in 97 Dateien erfolgreich (100% grün).
- **Playwright E2E**: 19 von 19 Tests erfolgreich (Chromium, responsive Viewports ab 390px, History-Navigation, Downloads, UTC-Zeitzonen).
- **Production Build**: `tsc -b && vite build` ohne Fehler. Sauberes Chunk-Splitting (Workspace-App ~73 kB / 22 kB gzip).

---

## 2. Modularitätsanalyse: Erweiterbarkeit für weitere medizinische Disziplinen

### 2.1 Stärken des bestehenden Cores (Disziplin-agnostisch)
1. **Statistischer Rechenkern (`src/core/stats/`)**: OLS, Theil-Sen, Rolling OLS, Segmented OLS arbeiten rein mathematisch auf Zeitreihen $(t_i, y_i)$.
2. **Linear Mixed Effects Models (`src/core/mixedModel/`)**: WebR-basiertes LMM (`lme4::lmer`) schätzt beliebige kontinuierliche Laborparameter mit frei wählbaren Kovariaten.
3. **Lineare Trendprojektion (`src/core/projection/`)**: Berechnet Schwellenwertschnitte abstrakt für beliebige Zielwerte.
4. **Datenmodell (`src/core/types.ts`, `src/core/attributes/`)**: `LabRow` und `patientAttributes` sind offen für beliebige Parameter und klinische Merkmale (z. B. NYHA-Klasse, Tumorstadium, Biomarker).
5. **Preset-Katalog (`workspace-analysis.ts`)**: `ANALYSIS_CATALOG` und spaltenweise Settings erlauben disziplinspezifische Konfigurationen pro Laborwert.

### 2.2 Hardgecodete Engpässe (Nephrologie-Kopplung)
1. **Klinische Ereignisse & Zensierung (`src/core/events/events.ts`, `src/core/fitPipeline/types.ts`)**:
   - `ClinicalEventType` ist limitiert auf `'kidney_transplant' | 'dialysis' | 'other'`.
   - `FitConfig['censoring']` enthält starre Nieren-Flags (`censorAfterKidneyTransplant`, `censorAfterChronicDialysis`, etc.).
   - *Bedarf anderer Fächer*: Kardiologie benötigt z. B. Myokardinfarkt, Bypass, PCI, TAVI; Onkologie benötigt Rezidiv, Chemo-Zyklus, Bestrahlung.
2. **Analyse-Registry (`src/core/analysis/types.ts`)**:
   - `AnalysisSettings` ist statisch auf `{ egfr, aki, rapidEgfrDecline }` festgelegt.
3. **Abgeleitete Parameter**:
   - Bislang ist nur eGFR implementiert. Es fehlt eine Registrierung für weitere Scores (z. B. FIB-4 / MELD in der Hepatologie, Friedewald LDL-C in der Kardiologie, DAS28 in der Rheumatologie).
4. **Endpunkte (`src/core/endpoints/ckdEndpoints.ts`)**:
   - Endpunkte prüfen hart auf CKD Stadium G5 (< 15 ml/min/1,73m²). Andere Disziplinen benötigen konfigurierbare Schwellenwerte (z. B. HbA1c > 7%, Thrombozyten < 50 G/l).

### 2.3 Empfohlene Architektur: "Discipline Plugin"
Einführung einer deklarativen Modul-Schnittstelle:
- `DisciplineEventRule`: Ereignistypen mit Standard-Zensierungsregeln.
- `DerivedParameterDefinition`: Berechnungsformeln mit Input-Validierung.
- `DisciplineEndpointDefinition`: Schwellenwertdefinitionen mit Richtung (`<` / `>`) und Badges.
- `MedicalDisciplineModule`: Gruppierung zu Fachbereichen (z. B. Nephrologie, Kardiologie, Onkologie).

---

## 3. Funktionsabgleich: Alte UI vs. Neuer Workspace

| Funktionsbereich | Alte UI (`src/App.tsx` & Sidebar) | Neuer Workspace (`src/workspace/`) | Status |
| :--- | :--- | :--- | :--- |
| **Importformate** | XLSX, XLS, CSV | XLSX, XLS, CSV | ✅ Vollständig |
| **Multi-Sheet & Templates** | Labs, Events, Attributes, CSV-Vorlagen | Labs, Events, Attributes, CSV-Vorlagen | ✅ Vollständig |
| **Ergänzender Import** | Events & Attributes nachträglich | "Replace events" & "Replace attributes" | ✅ Vollständig |
| **Diagnostik & Demografie** | Fehleranzeige, manueller Edit in Sidebar | Diagnostik-Akkordeon, Modal mit Referenzdatum | ✅ Verbessert |
| **eGFR-Ableitung** | CKD-EPI 2021, MDRD-4, EKFC 2021 | Formeln, Quellenauswahl, Live-Vorschau, Kollisionsschutz | ✅ Verbessert |
| **Parameterauswahl** | Max. 3 Reihen (`SeriesStrip`) | Unbegrenzt, Multi-Select, Suchfilter, Spalten-Sprung | ✅ Verbessert |
| **Tabellenansicht** | Tabelle mit Mini-Sparklines | Matrix-Tabelle mit Sparklines, Kennzahlen, Badges | ✅ Vollständig |
| **Tabellensortierung** | ID, Slope, |Slope|, n, Dauer, letzter Wert | ID (asc/desc), letzter Wert, Slope, |Slope|, n, Dauer + Header-Cycling | ✅ Vollständig |
| **Einzelpatienten-Ansicht** | Plot, Messtabelle, Ausschlussgründe, Vor/Zurück | Plot, Messtabelle mit Ausschlussmarkierung, History-Back | ✅ Vollständig |
| **Spaghetti-Overlay** | Überlagerung, 3 Achsen, Gruppierung | Überlagerung, 3 Achsen, Attribut-Gruppierung, Highlighting, LMM-Overlay | ✅ Verbessert |
| **Trendmodelle & Pipeline** | OLS, Theil-Sen, Rolling, Segmented; Zensierung, AKI | Vollständig als Presets & Advanced Settings je Spalte | ✅ Verbessert |
| **Endpunkte & Rapid Decline** | % Abfall, G5 beobachtet, G5 projiziert, Schwelle | Vollständig in Zellen-Badges und Exporten | ✅ Vollständig |
| **Graphik-Exporte** | Single Plot SVG/PNG | Standalone-SVG & PNG mit Legende und Skala | ✅ Verbessert |
| **Tabellen-Exporte** | Patienten-XLSX, Kohorten-XLSX | Scoped Multi-Sheet XLSX (`labs`, `demographics`, `fit_summary`) | ✅ Vollständig |
| **Theorie & Methodik** | Eigene Page | Eigene Page mit Workspace-Fokus & Gesamtreferenz | ✅ Vollständig |
| **Lokale Persistenz** | IndexedDB ("Remember on this device", 7 Tage) | Nicht vorhanden (Session-only) | ❌ Lücke (geplant) |
| **Kohortenmodelle (LMM)** | WebR-In-Browser-Fitting (`lme4`), Kovariaten | Vollständig angebunden via `CohortModelsWorkspace` (lazy loaded) | ✅ Vollständig |
| **Trend-Projektionen** | LMM-Zielwertprojektionen mit Profil-Editor | Vollständig angebunden via `ModelProjectionPanel` | ✅ Vollständig |

---

## 4. Umgesetzte Roadmap-Punkte (Items 1 & 2)

### ✅ Item 1: Erweiterte Sortierfunktionen im Trajectories Workspace
- **Sortierkriterien**:
  - `id`: Patient-ID aufsteigend
  - `id:desc`: Patient-ID absteigend
  - `${paramKey}:latest`: Letzter gemessener Wert
  - `${paramKey}:slope`: Steigung der Trendlinie (stärkster Abfall / rapid decline zuerst)
  - `${paramKey}:absSlope`: Betrag der Steigung (dynamischste Verläufe zuerst)
  - `${paramKey}:n`: Anzahl der Messpunkte
  - `${paramKey}:duration`: Beobachtungszeitraum (Dauer in Tagen)
- **UI & Interaktion**:
  - Sortier-Dropdown mit allen Metriken pro ausgewähltem Parameter.
  - Interaktive Sortier-Buttons in den Tabellen-Headern (`Patient` und Parameter-Spalten) zum schnellen Durchklicken (`↓ val` → `↑ slope` → `↓ |slope|` → `↓ n` → `↓ dur` → `id`).
  - Barrierefreiheit durch explizite `aria-label`s auf den `<th>`-Elementen sichergestellt.

### ✅ Item 2: Anbindung der Kohortenmodelle & Trend-Projektionen
- **`CohortModelsWorkspace.tsx`**:
  - Vollständige Integration des population-level Linear Mixed Models (WebR / `lme4`).
  - Parameter-Auswahl und Attribut-Gruppierung (Kovariaten wie Genotyp, Alter, Geschlecht).
  - Lazy Loading des WebR-Workers und `CohortModelPanel` (spart Ladezeit und Bandbreite bei initialem Aufruf).
  - LMM-Ergebnistabelle mit Koeffizienten, Konfidenzintervallen und AIC/BIC.
  - Integriertes `ModelProjectionPanel` für zielwertbasierte Modellprojektionen.
- **Overlay-Integration (`WorkspacePlot.tsx`)**:
  - Checkbox `"Show model line in overlay"` zur Einblendung der gefitteten Populationskurve als dunkle gestrichelte Trajektorie im Spaghetti-Plot.
- **Test-Abdeckung**:
  - Unit- und Integrationstests in `tests/workspace/cohort-models.test.tsx` und `tests/workspace/trajectories.test.tsx`.
  - Alle 98 Vitest-Testsuiten (836 Tests) sowie alle 19 Playwright E2E-Tests erfolgreich.
