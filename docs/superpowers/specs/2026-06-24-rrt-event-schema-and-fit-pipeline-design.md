# RRT Event Schema And Modular Fit Pipeline

## Goal

Define the event schema and pipeline decisions needed to replace monolithic fit presets with separately configurable filtering, aggregation, fitting, and endpoint steps for CKD progression analysis.

This spec refines the CKD progression design for transplant and dialysis handling. It intentionally does not support legacy event schemas; demo data and fixtures should be migrated to the schema below.

This is for research and exploratory analysis only. Derived fits, censoring, and endpoints must not be presented as clinical decision support.

## Event Schema

Events are explicit structured rows. The application must not infer clinically meaningful RRT behavior from unstructured text during the fit pipeline.

Required fields:

```text
patientId
type
date
title
```

Optional fields:

```text
description
endDate
intent
```

Canonical CSV shape:

```csv
patientId,type,date,title,description,endDate,intent
10,kidney_transplant,2025-02-01,Kidney transplant,,,
9,dialysis,2024-04-15,Dialysis start,,,
12,dialysis,2021-03-01,Temporary dialysis during AKI,,2021-03-14,acute
20,other,2023-08-10,Study medication started,Optional note,,
```

Supported event types for this phase:

```text
kidney_transplant
dialysis
other
```

`kidney_transplant` is specific by design. A generic `transplant` type is not valid for CKD progression censoring because other organ transplants should not automatically imply native kidney endpoint handling.

`other` events are display-only. They appear in plots and tables with a subtle neutral marker and tooltip, but they must not affect filtering, censoring, fitting, aggregation, or endpoint calculations.

Use new event-specific types instead of extending the current `ValidAnnotation` shape in place. The current `patientId/referenceDate/label` annotation model conflicts with the structured `date/title/type/intent/endDate` semantics.

Target types:

```ts
type ClinicalEventType = 'kidney_transplant' | 'dialysis' | 'other'
type DialysisIntent = 'acute' | 'chronic' | 'unknown'

interface ClinicalEvent {
  patientId: number
  type: ClinicalEventType
  date: Date
  title: string
  description: string
  endDate: Date | null
  intent: DialysisIntent | null
  warning: '' | 'unknown_patient' | 'unknown_dialysis_intent' | 'unresolved_dialysis_interval'
}

interface RejectedClinicalEvent {
  patientId: number | null
  type: string | null
  date: Date | null
  title: string
  reason:
    | 'missing_required'
    | 'invalid_type'
    | 'invalid_intent'
    | 'invalid_date'
    | 'invalid_date_range'
    | 'unsupported_legacy_schema'
}
```

Unknown patient rows are imported as valid events with `warning=unknown_patient`, matching the current annotation behavior, because they can still be useful in event-table audit output. They must not affect patient-level plots or fits until a matching patient exists.

Validation rules:

- Missing required columns reject the file with: `Event file missing required column(s): patientId, type, date, title.`
- The old `PatientID,ReferenceDate,label` schema is rejected with: `Legacy annotation schema is no longer supported. Use patientId,type,date,title.`
- `type` must be one of `kidney_transplant`, `dialysis`, or `other`.
- `intent` is valid only for `type=dialysis`; non-empty intent on other event types is rejected.
- `endDate` is valid for dialysis interval metadata and display-only `other` intervals. `kidney_transplant` must not provide `endDate`.
- Invalid date ranges where `endDate < date` are rejected during import.

## Dialysis Intent

Supported dialysis intent values:

```text
acute
chronic
unknown
```

If `intent` is empty for a dialysis event, normalize it to `unknown`.

Rules:

- `dialysis` + `acute` + `endDate`: exclude measurements in the closed interval `[date, endDate]`.
- `dialysis` + `chronic`: censor native CKD progression from `date` onward. `endDate` is not required.
- `dialysis` + `unknown` + `endDate`: exclude measurements in the closed interval `[date, endDate]` by default, and flag the intent as unknown.
- `dialysis` + `unknown` without `endDate`: display and flag the event, but do not automatically exclude or censor.
- `dialysis` + `acute` without `endDate`: display and flag the event, but do not automatically exclude or censor because the interval cannot be resolved.

For `dialysis` + `chronic`, censoring starts at `date` and remains in effect for native CKD progression even if `endDate` is present. If `endDate` is supplied, retain it only as event metadata/display context and do not use it to resume native CKD progression fitting.

## Kidney Transplant Handling

`kidney_transplant` is a point event. In the CKD progression profile it censors native kidney progression from `date` onward.

This behavior is profile-controlled:

- CKD Progression: censor after kidney transplant by default.
- General Exploration: show kidney transplant by default, but do not censor unless the user enables RRT censoring.
- Acute Review: show kidney transplant as context only unless the user enables RRT censoring.

When censoring is active, post-transplant values remain visible in plots but are excluded from native CKD progression fits and endpoint calculations.

## No Legacy Import

The previous demo format:

```text
PatientID,ReferenceDate,label
```

should be replaced, not kept as a supported compatibility layer.

If a file lacks `type`, `date`, or `title`, event import should reject it with a clear validation message. Display-only events must use `type=other` explicitly.

## Optional Text Fields

`title` is the short graph/table label.

`description` is optional supporting text. In this phase it is shown in event tooltips and exported, but no pipeline logic may depend on it.

## Modular Fit Pipeline

Presets should become named defaults over a compositional configuration. Internally the analysis should use the explicit pipeline configuration rather than switching behavior directly on a single preset string.

The configuration is per selected series. A patient can have multiple configured series, each with its own `FitConfig`.

Target shape:

```ts
interface FitConfig {
  parameter: {
    bezeichnung: string
    einheit: string | null
  }
  preset: 'general_exploration' | 'ckd_progression' | 'acute_review' | 'custom'
  xAxis: 'age' | 'calendar_time' | 'time_since_baseline'
  censoring: {
    censorAfterKidneyTransplant: boolean
    censorAfterChronicDialysis: boolean
    excludeAcuteDialysisPeriods: boolean
    unknownDialysisPolicy: 'flag-only' | 'exclude-dated-interval' | 'censor-from-start'
  }
  exclusions: {
    excludeAkiWindows: boolean
    akiExclusionDays: number
  }
  timeBalancing: 'raw' | 'monthly-median' | 'quarterly-median' | 'local-density-weighted'
  fitModel: 'none' | 'ols' | 'theil-sen' | 'rolling-ols' | 'segmented-ols'
  endpoints: {
    percentDecline: boolean
    observedCkdG5: boolean
    projectedAgeToCkdG5: boolean
  }
}
```

Current modes map into this shape as follows:

```text
global -> fitModel=ols, timeBalancing=raw
global-robust -> fitModel=theil-sen, timeBalancing=raw
rolling -> fitModel=rolling-ols, timeBalancing=raw
gap-split -> fitModel=segmented-ols, segmentation source=gaps
chronic-ckd -> Data filter exclude first N days + fitModel=ols
aki-aware -> excludeAkiWindows=true + fitModel=ols
event-driven -> fitModel=segmented-ols, segmentation source=typed split events only
```

The existing `event-driven` behavior must be narrowed. Display-only `other` events, unknown dialysis without `endDate`, and acute dialysis without `endDate` must not split fits. Event-driven segmentation may only use explicitly fit-relevant events selected by the configuration.

Pipeline order:

```text
raw measurements
-> validate and normalize events
-> resolve RRT censoring and dialysis interval exclusions
-> resolve AKI exclusions
-> apply time balancing or weighting
-> fit model
-> derive endpoints
-> render/export included and excluded metadata
```

RRT censoring and dialysis interval exclusion must happen before monthly or quarterly aggregation, so pre-event and post-event values cannot be merged into one aggregate point.

## Pipeline Contract

Introduce a shared core pipeline result before adding UI and export features. One-patient plots, cohort mini-graphs, slope summaries, endpoints, and exports must consume the same inclusion/exclusion output.

Target point and result types:

```ts
type ExclusionReason =
  | 'aki'
  | 'acute_dialysis'
  | 'unknown_dialysis_interval'
  | 'post_chronic_dialysis'
  | 'post_kidney_transplant'

interface FitPoint {
  date: Date
  value: number
  operator: '=' | '<' | '>'
  x: number | Date
  xAxis: FitConfig['xAxis']
  included: boolean
  exclusionReasons: ExclusionReason[]
  sourceRowIndex: number
  aggregate?: {
    period: 'month' | 'quarter'
    nRaw: number
    start: Date
    end: Date
  }
}

interface FitPipelineResult {
  config: FitConfig
  events: ClinicalEvent[]
  rawPoints: FitPoint[]
  fitPoints: FitPoint[]
  excludedPoints: FitPoint[]
  fitLines: Array<{ date: Date; value: number }[]>
  summary: {
    nRaw: number
    nIncluded: number
    nExcludedByReason: Record<ExclusionReason, number>
    nTimeBins: number
    followupYears: number
    medianGapDays: number | null
    maxGapDays: number | null
    clusteredMeasurementsFlag: boolean
  }
}
```

A measurement may carry multiple exclusion reasons internally. Export count fields are multi-label counts, so their sum may exceed `n_raw - n_included`. For compact UI labels, use this primary-reason precedence:

```text
post_kidney_transplant
post_chronic_dialysis
acute_dialysis
unknown_dialysis_interval
aki
```

## X-Axis Semantics

`calendar_time` uses measurement dates.

`time_since_baseline` uses fractional years since the first included fit point for that patient/series/config. If no included fit point exists, the fit is unavailable.

`age` uses `patientAgeAtLab` when available. If only the first measurement age is available for a patient, age is propagated by adding elapsed years from that anchor date. If no age anchor is available, the series falls back to `calendar_time` for display and reports `x_axis_fallback=calendar_time` in export metadata. CKD Progression defaults to age when an age anchor is available; otherwise it must surface the fallback.

## Time Balancing

Time balancing operates on included points after RRT and AKI exclusions.

Definitions:

- `raw`: each included numeric measurement is a fit point.
- `monthly-median`: group included points by calendar month and use the median value per month.
- `quarterly-median`: group included points by calendar quarter and use the median value per quarter.
- `local-density-weighted`: deferred; keep the enum value only if the UI marks it unavailable, or omit it from the first implementation.

For median aggregation, the aggregate date is the median source date in the bin, not the bin midpoint. Censored operators `<` and `>` are retained for display but excluded from median fit-point calculation until a separate censored-value strategy is defined.

Acceptance fixture: when two values in the same month straddle a kidney transplant, chronic dialysis start, or acute dialysis interval, the excluded value must not contribute to the aggregate median and `n_time_bins` counts only bins with included fit values.

## Endpoint Semantics

Endpoints are computed only from included eGFR-like values after RRT censoring, dialysis interval exclusions, AKI exclusions, and time balancing.

Percent decline from baseline:

```text
baseline = first included eGFR fit point after censoring/exclusions
percent_decline = (baseline - current_or_threshold_value) / baseline * 100
```

Observed CKD G5 defaults to the strict rule:

```text
observed CKD G5 is true when:
  at least two included eGFR values are <15 ml/min/1.73 m2
  and the first and last qualifying values are at least 90 days apart
  and there is no included intervening eGFR >=15 after the first qualifying low value.
```

Post-transplant and post-chronic-dialysis values do not count for native CKD G5 classification.

Projected age to CKD G5 requires a negative fitted slope, at least 3 included fit points, and at least 1 year of included span by default. If observed CKD G5 is already satisfied, report observed CKD G5 instead of projecting. If uncertainty is not implemented, label the projection as a simple linear estimate.

## Presets

Presets should remain available as quick choices, but they are mappings to `FitConfig`, not independent code paths.

General Exploration:

```text
xAxis: calendar_time
censoring: disabled by default, events visible
exclusions: AKI visible but not excluded
timeBalancing: raw
fitModel: ols
endpoints: disabled
```

CKD Progression:

```text
xAxis: age
censorAfterKidneyTransplant: true
censorAfterChronicDialysis: true
excludeAcuteDialysisPeriods: true
unknownDialysisPolicy: exclude-dated-interval
excludeAkiWindows: true
timeBalancing: quarterly-median
fitModel: ols
endpoints: percent decline, observed CKD G5, projected age to CKD G5
```

Acute Review:

```text
xAxis: calendar_time
censoring: disabled by default, events visible
exclusions: none by default
timeBalancing: raw
fitModel: none
endpoints: disabled
```

## UI Direction

Keep a compact preset selector for normal use.

Expose an Advanced section with separate groups:

```text
Data filter
Aggregation
Fit model
Endpoints
```

Preset behavior:

- Selecting a preset resets all Advanced fields to that preset's default `FitConfig`.
- Editing any Advanced field changes the visible preset label to `Custom`.
- The UI should show changed groups with a subtle `modified` indicator.
- Export records the effective full config, not only the preset name.

The UI should show which points are excluded by which reason:

- AKI exclusion
- acute dialysis interval
- unknown dialysis interval
- post chronic dialysis censoring
- post kidney transplant censoring

Display-only `other` events should use a subdued neutral marker and tooltip. They should not create shaded exclusion regions.

Visual contract:

- `other`: neutral vertical marker, no shaded region, effect label `display only`.
- `dialysis` + `unknown` without `endDate`: warning marker, no shaded region, tooltip says `Unknown dialysis intent: not excluded from fit`.
- `dialysis` + `acute` without `endDate`: warning marker, no shaded region, tooltip says `Unresolved acute dialysis interval: not excluded from fit`.
- acute or unknown dialysis interval exclusion: shaded interval band, excluded points hollow/muted with reason tooltip.
- chronic dialysis censoring: event marker plus post-event shaded region.
- kidney transplant censoring: kidney transplant marker plus post-event shaded region.
- AKI: AKI-colored exclusion window and hollow/muted excluded points.

Event marker tooltips must include title, type, date, intent and endDate when present, effect on fit, and description when present.

Event tables must include patient, date, type, title, intent, endDate, status/effect, and warning.

Import status must show loaded, rejected, and warning counts. Invalid rows in a file should be rejected row-by-row; valid rows from the same file still load.

## Export Metadata

Exports should include enough metadata to audit the pipeline:

```text
n_raw
n_included
n_excluded_aki
n_excluded_dialysis_period
n_excluded_post_chronic_dialysis
n_excluded_post_kidney_transplant
first_censoring_event_type
first_censoring_event_date
time_balancing
n_time_bins
followup_years
median_gap_days
max_gap_days
clustered_measurements_flag
fit_model
x_axis
x_axis_fallback
preset
effective_fit_config_json
endpoint_percent_decline
endpoint_observed_ckd_g5
endpoint_projected_age_to_ckd_g5
```

Unknown or display-only events are exported in the event table, but they must not populate censoring metadata.

Workbook exports should include:

- `analysis_config` sheet with the full effective `FitConfig`.
- `events` sheet with all loaded events, warnings, and computed effect.
- `point_audit` sheet with patient, series, date, value, included, and exclusion reasons.
- Cohort/patient summary sheets with the compact metadata fields above.

## Implementation Phases

1. Event schema and validation: replace demo event data with the structured schema, introduce `ClinicalEvent`/`RejectedClinicalEvent`, and reject missing required fields.
2. Pipeline contract: introduce `FitConfig`, `FitPoint`, `ExclusionReason`, and `FitPipelineResult`; define adapter boundaries for `buildCohortRows`, `patientWorkbookSheets`, `SeriesPlot`, mini-sparklines, and exports.
3. RRT censoring core: compute included/excluded point sets and exclusion reasons.
4. Time balancing core: implement raw/monthly/quarterly fit point generation and density metadata.
5. FitConfig adapter: map current presets and current `SlopeMode` values into `FitConfig` while preserving existing behavior until Advanced UI is enabled.
6. Event-driven cleanup: ensure display-only and unresolved events do not split fits unless explicitly selected by config.
7. Advanced UI: expose Data filter, Aggregation, Fit model, and Endpoints controls with `Custom` state.
8. Endpoint core: percent decline, observed CKD G5, and projected age to CKD G5.
9. Visualization/export: excluded point styling, post-RRT shading, dialysis interval bands, and audit metadata.

## Acceptance Criteria

- Import rejects missing `type/date/title`, invalid type, invalid intent, invalid date, invalid `endDate < date`, non-dialysis intent, kidney transplant with `endDate`, and the legacy `PatientID,ReferenceDate,label` schema.
- Empty dialysis intent normalizes to `unknown`.
- Unknown dialysis without `endDate` and acute dialysis without `endDate` render warnings in import status, event table, and tooltip, and do not alter fits or endpoints.
- Unknown dialysis with `endDate` excludes its interval by default and remains flagged as unknown.
- `other` appears in plot, table, and export event sheet as display-only, with no shaded region, no excluded points, and no censoring metadata.
- CKD Progression defaults censor kidney transplant/chronic dialysis, excludes acute and unknown-with-endDate dialysis intervals, excludes AKI windows, uses quarterly median, and enables CKD endpoints.
- General Exploration and Acute Review show events without RRT exclusion by default.
- Advanced edits set preset to `Custom`, and switching presets resets all Advanced fields.
- Same-month pre/post-event aggregation tests prove excluded values do not contribute to monthly or quarterly medians.
- Export includes effective configuration, event effects, included/excluded counts, and point-level exclusion reasons or an explicit reason-precedence summary.

## Non-Goals

- No free-text RRT inference in the fit pipeline.
- No generic `transplant` type for censoring.
- No legacy event CSV support.
- No mixed cohort model implementation in this phase.
- No clinical treatment recommendation.
