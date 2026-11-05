# @halbritter-lab/kidney-trajectories

The kidney-function analysis logic of the
[Lab Trajectory Explorer](../../README.md) as a library for Node and bundlers:
eGFR equations, KDIGO creatinine AKI detection, per-patient slope fits with the
reliability rule, observed CKD endpoints with the linear G5 projection, fit
presets and the workbook loader.

**Research use only. Not for clinical decisions.** Results are descriptive
summaries of laboratory series. They are not a diagnosis or a prognosis.

The package adds no logic of its own. `src/index.ts` re-exports the web app's
`src/core/` functions (and the DOM-free workbook reader in `src/io/`)
unchanged. The package and the app therefore give identical numbers. Every
rule, boundary convention and worked example is specified in the
[method reference](../../docs/method-algorithms.md).

## Status

The package is not published to npm or any other registry, and `package.json`
is marked `"private": true` so that it cannot be published by accident.
Publication needs the owner's explicit approval (issue #36). The package name
is provisional.

## Build

From the repository root:

```sh
pnpm install
pnpm build:kidney   # packages/kidney/dist: index.js (ESM) and types/
pnpm test:kidney    # Node tests and a NodeNext type check against dist
```

The build bundles the core into one ESM file. SheetJS (`xlsx`) stays an
external runtime dependency. Declarations are emitted by `tsc` with explicit
`.js` extensions, so they resolve under `moduleResolution` `NodeNext` and
`Bundler`. Node 20 or later is required. The package is ESM only. Its
`exports` map has a `default` condition, so `require()` also works where Node
can load ES modules synchronously (Node 20.19 and 22.12 or later).

## Use from another local project

Build first, then add the package from its folder or from a tarball:

```sh
# from the consuming project
pnpm add file:../lab-trajectory-explorer-web/packages/kidney

# or produce a tarball and install that
pnpm --dir packages/kidney pack --pack-destination /tmp
pnpm add /tmp/halbritter-lab-kidney-trajectories-0.1.0.tgz
```

A `file:` install copies the built files. Rebuild and reinstall after the core
changes.

```ts
import { readFileSync } from 'node:fs'
import {
  ckdEpi2021,
  findKdigoAkiEpisodes,
  fitGlobal,
  isUnstableSlope,
  loadDatasetFromWorkbook,
} from '@halbritter-lab/kidney-trajectories'

// eGFR in ml/min/1.73 m²; creatinine in mg/dl. NaN for unknown sex, age < 18
// or non-positive creatinine.
ckdEpi2021({ scrMgdl: 1.2, ageYears: 60, sex: 'm' }) // 69.231128…

// KDIGO creatinine AKI episodes from one series (mg/dl, sorted or not).
const episodes = findKdigoAkiEpisodes([
  { date: new Date('2024-01-01T00:00:00Z'), value: 1.0 },
  { date: new Date('2024-01-02T00:00:00Z'), value: 1.6 },
]) // one stage 1 episode, criterion 'absolute_0_3_mg_dl_48h'

// OLS slope per year.
const fit = fitGlobal([
  { date: new Date('2020-01-01T00:00:00Z'), value: 60 },
  { date: new Date('2021-01-01T00:00:00Z'), value: 55 },
  { date: new Date('2022-01-01T00:00:00Z'), value: 50 },
]) // fit.slope ≈ -5

// Workbook or CSV from disk: a Node Buffer, Uint8Array or ArrayBuffer.
const dataset = loadDatasetFromWorkbook(readFileSync('labs.xlsx'))
dataset.rows        // LabRow[]
dataset.events      // validated clinical events (Events sheet)
dataset.diagnostics // import warnings and rejected rows
```

### The cohort pipeline the web app runs

```ts
import {
  buildCohortRows,
  ckdProgressionConfig,
  clinicalEventsByPatient,
  cohortExportRecords,
  cohortSeriesSpec,
  computeAnalysisResult,
  computedEgfrName,
  COMPUTED_EGFR_UNIT,
  creatinineSourceOptions,
  defaultAnalysisSettings,
  defaultCreatinineSource,
  loadDatasetFromWorkbook,
} from '@halbritter-lab/kidney-trajectories'

const { rows, events, patientAttributes } = loadDatasetFromWorkbook(data)

// Dataset modules: demographics, computed eGFR (off by default), events.
const source = defaultCreatinineSource(creatinineSourceOptions(rows))
const settings = { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021' as const, source } }
const analysis = computeAnalysisResult({ rows, events, patientAttributes, manualDemographics: {}, settings })

// One series spec per parameter; here computed eGFR with the CKD-progression preset.
const parameter = { bezeichnung: computedEgfrName('ckd-epi-2021'), einheit: COMPUTED_EGFR_UNIT }
const spec = cohortSeriesSpec(parameter, ckdProgressionConfig(parameter), {
  clinicalEventsByPatient: clinicalEventsByPatient(events),
  fitInputs: analysis.fitInputs,
})
const patientIds = [...new Set(analysis.rows.map((r) => r.patientId))]
const cohort = buildCohortRows(analysis.rows, patientIds, [spec])
const records = cohortExportRecords(cohort) // one flat record per patient and series
```

`fitPresetCatalog` and `fitPresetById` list every preset the app offers;
`preset.buildConfig(parameter)` returns its `FitConfig`.

## What is included

| Area | Exports |
| --- | --- |
| Import | `loadDatasetFromWorkbook`, `readWorkbook`, `readWorkbookSheets`, `loadLabRows`, `loadLabRowsWithDiagnostics`, `REQUIRED_COLUMNS`, `normalizeClinicalEvents`, `validateClinicalEvents` |
| eGFR and units | `ckdEpi2021`, `mdrd4`, `ekfc2021`, `appendComputedEgfr`, `creatinineSourceOptions`, `defaultCreatinineSource`, `isSerumCreatinineSource`, `normaliseSex`, `isUnrecognisedSex`, `normaliseUnit`, `computedEgfrName`, `EGFR_FORMULA_LABELS`, `COMPUTED_EGFR_UNIT`, `SERUM_CREATININE_UNITS`, `MGDL_PER_UMOLL` |
| Series classification | `isCreatinineName`, `isUrineName`, `isSerumCreatinineSeries`, `isKdigoCreatinineSeries`, `isEgfrUnit`, `mentionsEgfr` |
| AKI and exclusion windows | `findKdigoAkiEpisodes`, `kdigoStage`, `episodesForSeries`, `akiExclusionWindows`, `fitAkiAware`, `applyExclusionWindows`, `exclusionReasonsAt`, `fixedLengthWindow`, `windowContains`, `KDIGO_ABSOLUTE_RISE_MGDL`, `KDIGO_RELATIVE_RISE_RATIO`, `DEFAULT_AKI_EXCLUSION_DAYS` |
| Slopes | `fitGlobal` (OLS), `fitTheilSen`, `fitOls`, `datesToYears`, `balanceSeriesPoints`, `summarizeByBezeichnung`, `isUnstableSlope` |
| Endpoints and projection | `computeCkdEndpoints`, `projectLinearThreshold`, `projectedCrossingTime`, `CKD_G4_EGFR_THRESHOLD`, `CKD_G5_EGFR_THRESHOLD`, `DEFAULT_CONFIRMATION_DAYS`, `DEFAULT_RAPID_EGFR_DECLINE` |
| Fit presets | `generalExplorationConfig`, `theilSenConfig`, `ckdProgressionConfig`, `acuteReviewConfig`, `STANDARD_PRESETS`, `NEPHROLOGY_PRESETS` |
| Cohort pipeline (experimental) | `computeAnalysisResult`, `defaultAnalysisSettings`, `defaultColumnModuleSettings`, `parseAnalysisSettings`, `fitPresetCatalog`, `fitPresetById`, `cohortSeriesSpec`, `clinicalEventsByPatient`, `patientBirthAnchor`, `exactBirthDateByPatient`, `demographicWarningsByPatient`, `buildCohortRows`, `cohortCellFlags`, `cohortExportRecords`, `cohortSheetRecord`, `EXPORT_DISCLAIMER_ROWS` |
| Shared | `patientIdKey`, `comparePatientIds` and the types `LabRow`, `RawRow`, `PatientId`, `OlsFit`, `SeriesPoint`, `FitConfig`, `CohortRow`, `CohortCell`, `CkdEndpoints`, `AkiEpisode` and related |

`test/built-package.node.mjs` pins this list. A change to it is a change to
the public API.

### Experimental: the cohort pipeline

The cohort-pipeline exports, with their types (`AnalysisSettings`,
`AnalysisResult`, `CohortSeriesSpec`, `CohortRow`, `CohortCell`,
`CohortExportRecord` and related), mirror the web app's internal pipeline:
settings objects, cohort cells that carry chart overlays, and export records
with the app's column names (`Bezeichnung`, `Einheit`). They are marked
`@experimental` in `src/index.ts`. They will change with the domain decoupling
in issue #23, without a deprecation period. The equation, AKI, slope, endpoint
and projection functions above them are the stable part.

## What is not included

- Mixed models. They run in webR, which needs a browser worker.
- Charts, PNG/SVG/XLSX export, downloads, IndexedDB storage and the React
  workspace.
- The bundled demo-data fetchers, which load from the web app's `public/`
  folder.

## Pitfalls carried over from the core

These are documented at their call sites and in the method reference:

- `fitGlobal` returns the exact slope with `r2 = 1` and `reason: null` for
  exactly two points. Use `isUnstableSlope` before acting on a slope.
- `summarizeByBezeichnung` reports `reason: 'n_below_threshold'` whenever the
  fit model is `'none'`, regardless of the point count.
- `nNumeric` counts raw measurements before censoring, AKI exclusion and time
  balancing. Use `nFitted` for anything about the fit.
- Imported dates are midnight UTC. Pass UTC dates to the fit functions as well.

## License

MIT, as the repository. SheetJS is licensed separately under Apache-2.0.
