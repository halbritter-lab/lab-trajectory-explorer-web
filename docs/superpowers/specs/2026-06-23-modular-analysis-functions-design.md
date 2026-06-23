# Modular Analysis Functions Design

## Context

Lab Trajectory Explorer currently has several analysis features, but they are wired through feature-specific paths:

- computed eGFR appends synthetic `LabRow` records from `src/core/egfr/*`
- AKI detection contributes plot and cohort overlays from `src/core/aki/*`
- AKI-aware slope fitting is selected as a slope mode but depends on AKI episode detection
- rapid eGFR decline contributes cohort flags from `src/core/cohort/screening.ts`
- the UI store calls eGFR computation directly through `displayRows()`

This makes adding another analysis function possible, but each new feature would likely add more top-level store fields, sidebar-specific branching, and view-specific logic. This branch should introduce a shared analysis module boundary so future analyses can be added in one predictable shape.

## Goals

- Add a static in-code analysis module registry.
- Support general analysis features, not only computed lab series.
- Keep the first implementation small enough to review and squash cleanly.
- Preserve current behavior for eGFR, AKI display, rapid eGFR decline flags, exports, and existing tests.
- Migrate the existing eGFR, AKI, and rapid eGFR decline analyses into the new boundary.
- Include AKI-aware fitting in the AKI analysis boundary so episode detection and exclusion semantics have one owner.
- Provide typed extension points for future computed rows, overlays, cohort flags, messages, and export metadata.

## Non-Goals

- No dynamic plugin loading.
- No user-authored modules.
- No module marketplace, versioning, sandboxing, or remote execution.
- No full redesign of the sidebar or chart views.
- No change to clinical or statistical formulas.

## Architecture

Introduce `src/core/analysis/` as the domain boundary for registered analysis modules.

The central types are:

```ts
export interface AnalysisContext {
  rows: LabRow[]
  manualDemographics: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
}

export interface AnalysisContribution {
  rows?: LabRow[]
  messages?: AnalysisMessage[]
  cohortFlags?: CohortFlagContribution[]
  overlays?: AnalysisOverlayContribution[]
  fitInputs?: AnalysisFitInputContribution[]
}

export interface AnalysisModule<TSettings> {
  id: string
  label: string
  defaultSettings: TSettings
  apply: (ctx: AnalysisContext, settings: TSettings) => AnalysisContribution
}

export interface AnalysisResult {
  rows: LabRow[]
  messages: AnalysisMessage[]
  cohortFlags: CohortFlagContribution[]
  overlays: AnalysisOverlayContribution[]
  fitInputs: AnalysisFitInputContribution[]
}
```

The registry is static and contains the existing analysis features:

```ts
export const analysisModules = [
  egfrModule,
  akiModule,
  rapidEgfrDeclineModule,
] as const
```

The pipeline applies active modules to the current context and merges their contributions into a single `AnalysisResult`.

## Settings Model

The first implementation keeps settings explicit and typed:

```ts
export interface AnalysisSettings {
  egfr: EgfrModuleSettings
  aki: AkiModuleSettings
  rapidEgfrDecline: RapidEgfrDeclineModuleSettings
}
```

This avoids a loosely typed `Record<string, unknown>` in the store while still moving feature settings under a shared analysis namespace. Future modules add their own keyed settings.

The eGFR settings preserve current behavior:

```ts
export interface EgfrModuleSettings {
  formula: FormulaName | 'off'
  source: Source | null
}
```

Manual demographics remain shared context because they may be useful to multiple future modules.

AKI and rapid eGFR decline settings preserve current behavior:

```ts
export interface AkiModuleSettings {
  showOverlays: boolean
  exclusionDays: number
}

export interface RapidEgfrDeclineModuleSettings {
  threshold: number
}
```

## eGFR Module

The eGFR module wraps the current eGFR behavior:

- applies manual demographics before eGFR computation
- returns original rows unchanged when eGFR is off
- appends computed eGFR rows when enabled and eligible
- keeps the current formula names and source selection behavior
- preserves the computed-row label and unit

The existing `src/core/egfr/series.ts` formula and source helpers stay in place. The module composes them rather than moving all eGFR internals into the registry file.

## AKI Module

The AKI module wraps the current KDIGO creatinine-based episode detection:

- detects AKI episodes from creatinine series using the existing `src/core/aki/*` helpers
- contributes episode overlays and exclusion bands for plots and cohort sparklines
- contributes fit input metadata for `aki-aware` slope calculations, including episode-derived exclusion windows and excluded point indexes
- keeps the current `showAki` behavior through `analysisSettings.aki.showOverlays`
- preserves current AKI-aware slope behavior and exclusion-day defaults
- continues to support cross-series display, where computed eGFR can show creatinine-derived AKI episodes

The module should not change KDIGO logic. It should move ownership of AKI-derived analysis outputs and AKI-aware fit inputs out of chart and cohort view code into the analysis result.

AKI-aware fitting remains a slope mode, but it should consume AKI module output instead of independently rediscovering episodes in multiple places.

`showOverlays` only controls visual display. The AKI module must still provide fit inputs when overlays are hidden, because `aki-aware` slope fitting depends on the same episode detection and exclusion semantics.

## Rapid eGFR Decline Module

The rapid decline module wraps the current cohort-level eGFR flag:

- uses the existing eGFR-unit detection and threshold semantics
- contributes `cohortFlags` for patient/series cells where decline is faster than the configured threshold
- keeps `threshold <= 0` as disabled
- preserves export behavior for the `rapid_progression` column

The module should not recompute cohort slopes independently. It should consume the cohort cell data or expose a small helper that applies the flag criterion at the cohort boundary. This avoids duplicating slope calculation logic.

## Store Integration

The store should stop importing `appendComputedEgfr` directly. Instead it should expose:

- `analysisSettings`
- `setEgfrFormula`
- `setEgfrSource`
- `setShowAki`
- `setRapidEgfrThreshold`
- `analysisResult()`
- `displayRows()` as a compatibility wrapper returning `analysisResult().rows`

This keeps the initial UI diff small while creating the new domain boundary.

The existing cache can be replaced by or adapted into an analysis-result cache keyed by:

- `rows` reference
- `analysisSettings` reference
- `manualDemographics` reference
- `annotations` reference

## UI Integration

The sidebar can keep the same visible controls in the first pass:

- Compute eGFR select
- Creatinine source picker
- manual demographics dialog
- AKI toggle
- rapid eGFR threshold input

The difference is internal: eGFR controls read and write `analysisSettings.egfr`, AKI controls read and write `analysisSettings.aki`, and rapid decline controls read and write `analysisSettings.rapidEgfrDecline`.

Views can continue using `displayRows()` for series rows, but charts and cohort views should consume the richer `analysisResult()` where they need AKI overlays or rapid decline flags.

## Cohort Flags And Overlays

The new result shape includes slots for general analysis outputs and should be populated by the migrated current modules.

`cohortFlags` should represent patient/series-level annotations such as rapid eGFR decline:

```ts
export interface CohortFlagContribution {
  id: string
  patientId: number
  seriesKey?: { bezeichnung: string; einheit: string | null }
  label: string
  severity?: 'info' | 'warning'
}
```

`overlays` should represent reusable visual analysis output such as AKI episodes or exclusion bands:

```ts
export interface AnalysisOverlayContribution {
  id: string
  patientId: number
  seriesKey?: { bezeichnung: string; einheit: string | null }
  kind: 'event' | 'band'
  label: string
  start: Date
  end?: Date
}
```

`fitInputs` should represent analysis-derived inputs to fitting modes such as AKI-aware slope fitting:

```ts
export interface AnalysisFitInputContribution {
  id: string
  patientId: number
  seriesKey: { bezeichnung: string; einheit: string | null }
  kind: 'aki-aware'
  exclusionDays: number
  episodes: AkiEpisode[]
}
```

The first implementation should migrate current AKI and rapid decline consumers onto these types. Direct AKI or rapid-decline helper usage should remain only inside modules or low-level pure helpers that modules call.

## Testing

Add focused tests for:

- the analysis pipeline returns original rows when no module contributes rows
- eGFR module off mode preserves the original row reference when no manual-demographics remapping is applied
- eGFR module enabled mode matches existing `appendComputedEgfr` behavior
- AKI module contributes the same episodes/bands currently rendered in plot and cohort views
- AKI-aware fitting uses AKI module fit inputs and preserves current slope/excluded-point behavior
- rapid eGFR decline module contributes the same flags currently rendered and exported by cohort views
- store `displayRows()` still returns computed eGFR rows when enabled
- existing UI tests for eGFR source selection and computed series continue to pass

The implementation should also run the existing core and UI test suites touched by the change.

## Migration Sequence

1. Add analysis types, registry, and pipeline.
2. Add the eGFR module using current eGFR core helpers.
3. Add the AKI module using current AKI core helpers.
4. Add the rapid eGFR decline module using current cohort flag helpers.
5. Move store analysis settings under `analysisSettings` while preserving existing setter names.
6. Change `displayRows()` to use the analysis pipeline.
7. Update charts, cohort view, and exports to consume module contributions for the migrated analyses.
8. Add pipeline and module tests.
9. Run affected tests and fix regressions.

## Open Extension Path

After the existing analyses are migrated, new modules should follow the same pattern:

- computed lab series contribute rows
- event or interval analyses contribute overlays
- patient or patient-series classifications contribute cohort flags
- module-specific caveats contribute messages and export metadata

Future modules should not add top-level store fields or view-specific helper calls unless the analysis boundary is explicitly extended first.
