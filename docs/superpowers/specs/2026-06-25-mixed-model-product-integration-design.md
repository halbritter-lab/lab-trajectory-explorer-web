# Mixed Model Product Integration Design

## Goal

Embed the browser mixed-effects model as a clear cohort-level analysis instead of a hidden debug panel, while keeping the cohort overlay useful for visual plausibility checks.

The model answers: what is the estimated mean eGFR trajectory for the currently selected cohort, after the same filtering, censoring, AKI exclusion, and time-balancing policy used by the active series configuration?

## Product Decision

The mixed model is not a patient-level fit mode. It must not appear as another option beside OLS, Theil-Sen, rolling OLS, or segmented OLS.

Its primary home is the cohort view as a cohort analysis result. The overlay plot may show the fitted mean line as an optional visual layer, but the overlay is secondary because it cannot carry all reproducibility metadata, warnings, and fit status clearly.

## User Experience

### Cohort Result Block

Replace the feature-gated raw debug panel with a product-oriented block above the cohort table for eligible eGFR-like series.

The block should expose a single command:

- `Fit cohort model`

When no fit has been run, the block shows the model-ready dataset size and whether the selected data can be fitted. If validation fails, the command is disabled and the reason is shown in plain language.

After a successful fit, the block shows:

- Mean eGFR slope, formatted as value units per year.
- Baseline estimate, formatted in the selected series unit.
- Patient count and measurement count.
- Model form: random intercept plus random slope by patient.
- Fit status: converged, warning, timeout, cancelled, or failed.
- Data policy summary: selected patients, active series, clinical event censoring, AKI exclusions, and time balancing.

Warnings are shown near the result, not hidden in raw JSON. Singular or boundary fits are allowed only when the engine reports a structured success and includes the warning.

Developer metadata remains available in a compact details disclosure for traceability:

- engine
- formula
- package versions
- dataset hash
- fit config hash
- runtime version
- optimizer
- REML setting
- tolerance

Raw JSON should not be the primary display.

### Overlay Model Line

For the cohort overlay plot, add an optional visual layer for the active eGFR-like series:

- Toggle label: `Cohort model line`
- Line label: `Mixed model mean`

The line represents the fixed-effect mean trajectory:

```text
eGFR = fixed intercept + fixed slope * time_since_baseline
```

The line is only available after a successful fit for the same active series and data policy. If the cohort selection, series, fit configuration, event data, or AKI-derived fit inputs change, the previous line is considered stale and should not be shown as current.

The line should be visually distinct from patient trajectories:

- stronger stroke than background patients
- dashed or otherwise clearly differentiated from individual trajectories
- no patient hover behavior

The overlay remains a plausibility view, not the primary result surface.

## Data Flow

The production path should keep one shared model-ready dataset builder:

```text
analysisResult.rows
selected cohort patient IDs
active eGFR-like series spec
clinicalEventsByPatient
analysisResult.fitInputs
-> mixedModelRowsFromCohortInputs
-> validateMixedModelRows
-> worker fit
-> normalized MixedModelResult
-> cohort result block and optional overlay line
```

The same `MixedModelResult` object should feed the result block and overlay line so the UI cannot display a line from a different run than the summarized result.

The result state needs enough identity metadata to detect staleness:

- active series index or stable series key
- selected patient IDs
- dataset hash
- fit config hash
- model row count
- patient count
- measurement count

If the active data identity changes, the UI should either clear the result or mark it as stale and require a new fit. Clearing is simpler and preferred for the first product integration.

## Error Handling

Validation failures should be shown before worker execution:

- too few patients
- too few measurements
- no within-patient time variation
- non-finite values
- duplicate patient/time rows if not aggregated upstream

Worker failures should map to concise states:

- runtime loading failed
- package loading failed
- fit failed
- timed out
- cancelled
- result extraction failed

The cohort table and overlay must remain usable after every failure state.

## Testing

Core tests:

- The model-ready dataset builder continues to honor selected patients, active series, censoring, AKI exclusions, and time balancing.
- Result identity changes when relevant inputs change.
- Fixed-effect overlay points are derived from intercept and slope over the active time range.

UI tests:

- The cohort view shows formatted result metrics instead of raw JSON after a successful run.
- The fit command is disabled with a clear reason when validation fails.
- Warnings are visible in the result block.
- The overlay line appears only after a successful current fit.
- Changing active series, patient selection, or fit configuration clears or invalidates the displayed model result.

Manual verification:

- Fit the controlled debug cohort and confirm patient/measurement counts match the model-ready rows.
- Toggle the overlay model line and visually confirm the mean line is distinct from patient trajectories.
- Change a censoring or time-balancing setting and confirm the previous result no longer appears current.

## Out Of Scope

- Adding mixed models as patient-level fit modes.
- Supporting arbitrary formulas in the UI.
- Showing patient-specific random-effect fitted lines in the overlay.
- Exporting mixed model results to XLSX in this first product integration.
- Backend execution.

