# Configurable Mixed Model Modal Design

## Goal

Extend the cohort mixed model from a fixed formula into a deliberately constrained model configuration flow. The first implementation should support baseline-age adjustment and random-effect selection without exposing arbitrary formula editing.

The feature remains a cohort-level analysis. It must not become a patient-level fit mode.

## Product Decision

Add a `Configure...` action to the existing `Cohort mixed model` panel. The panel stays compact and shows the current model summary, fit command, result metrics, warnings, and overlay toggle. The detailed model settings live in a modal.

The modal is the right surface because model options require context: formula preview, data availability, random-effect tradeoffs, and the active data policy. Putting all controls directly in the panel would make the cohort table feel crowded and would hide the distinction between data filtering and statistical model structure.

## Supported Model Settings

### Time Axis

Initial option:

- `Years since baseline`

Default:

- `Years since baseline`

`Years since baseline` answers: how does eGFR change over follow-up time after each patient's first included model point?

Age as the primary time axis is deferred. It answers a different scientific question, requires a different result shape, and needs separate overlay semantics.

### Covariates

Initial options:

- `None`
- `Baseline age`

Default:

- `Baseline age`

`Baseline age` means age at the first included model point for that patient under the active data policy. It is a between-patient adjustment term, not a replacement for follow-up time.

`Sex` should not be included in the first implementation unless demographic completeness and encoding are already reliable enough for the active cohort. It can be added later as a disabled or unavailable option with a clear data-availability message.

### Random Effects

Initial options:

- `Patient intercept`
- `Patient intercept + patient slope`

Default:

- `Patient intercept + patient slope`

The random slope applies to `time_since_baseline` in the first implementation.

## Model Formulas

No arbitrary formula editor in the first implementation.

Allowed formula families for the first implementation:

```text
eGFR ~ time_since_baseline + (1 | patient_id)
eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)
eGFR ~ time_since_baseline + baseline_age + (1 | patient_id)
eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id)
```

Recommended default:

```text
eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id)
```

The modal must show a formula preview derived from the selected settings.

## Modal Layout

The modal title is `Configure cohort mixed model`.

Sections:

- `Outcome`
  - Read-only active series, initially eGFR-like only.
- `Time`
  - Read-only `Years since baseline` in the first implementation.
- `Covariates`
  - Checkbox or segmented option for `Baseline age`.
- `Random effects`
  - Segmented option for intercept-only versus intercept-plus-slope.
- `Data policy`
  - Read-only summary of active selected patients, censoring, AKI exclusions, and time balancing.
- `Formula preview`
  - Monospace formula string.

Actions:

- `Cancel`
- `Apply settings`
- `Fit model`

`Apply settings` updates the configured model without running the worker. `Fit model` applies settings and starts the fit.

## Cohort Panel Changes

The panel should show:

- `Configure...` action.
- Current formula summary.
- Current model row and patient counts.
- Existing `Fit cohort model` action.
- Existing result metrics.
- Existing details disclosure.

The current formula summary should be short enough to scan, for example:

```text
Model: eGFR ~ time_since_baseline + baseline_age + random patient intercept/slope
```

## Data Model

Introduce a typed mixed-model configuration object:

```ts
type MixedModelTimeAxis = 'time_since_baseline' | 'age'
type MixedModelCovariate = 'baseline_age'
type MixedModelRandomEffects = 'intercept' | 'intercept_slope'

interface MixedModelConfig {
  timeAxis: MixedModelTimeAxis
  covariates: MixedModelCovariate[]
  randomEffects: MixedModelRandomEffects
}
```

Default:

```ts
{
  timeAxis: 'time_since_baseline',
  covariates: ['baseline_age'],
  randomEffects: 'intercept_slope',
}
```

The configuration belongs in app state near `mixedModelResult` and `showCohortMixedModelLine`. Changing the config invalidates the current mixed-model result and turns off the overlay line.

Although the type reserves `age` for a future model family, the first implementation must only expose and accept `time_since_baseline`. Passing `age` to the formula builder or worker returns a structured unsupported-config failure until the age-axis phase is designed.

## Model Dataset

The current `MixedModelSpikeRow` only supports:

```ts
patient_id
eGFR
time_since_baseline
```

The configurable model needs a production row shape that can include:

```ts
patient_id
eGFR
time_since_baseline
baseline_age
```

Rows should still be generated from the same model-ready dataset path, after selected-patient filtering, series filtering, clinical event censoring, AKI exclusions, and time balancing.

Baseline age is computed per patient from the first included model point after all active data-policy rules.

Baseline age uses finite `patientAgeAtLab` from the first included model point. It must not be backfilled from later points in the first implementation, because the covariate is defined at the model baseline after filtering/censoring. If the first included point lacks finite `patientAgeAtLab`, validation blocks fitting when `baseline_age` is selected.

## Worker Protocol

The worker should receive:

- model rows
- model config
- generated formula key/string
- fit config hash

The TypeScript formula builder is the single source of truth. It derives one of the allowed formulas from the config and passes the generated formula key/string to the worker. The worker validates that formula/config pair against the allowed set before constructing R code. The UI must never send arbitrary user-entered formula text.

Result metadata should include:

- formula
- model config
- dataset hash
- fit config hash
- engine
- package versions

## Overlay Behavior

The overlay line is shown only when the fitted model can be represented on the active overlay x-axis.

Rules:

- If model time axis is `time_since_baseline`, show the mean line only on overlay x-axis `Years since baseline`.
- Do not show a model line on `calendar_time`.
- If the model includes `baseline_age`, use the patient-weighted mean baseline age over modeled patients for the fixed-effect line and label the line accordingly in details. Do not row-weight this value, because `baseline_age` is a patient-level covariate repeated across rows.

The line remains a visual plausibility aid, not the primary result.

## Validation And Errors

Before fitting:

- require at least 3 patients
- require at least 2 included measurements per modeled patient
- require within-patient variation in `time_since_baseline`
- reject non-finite model values
- reject required covariates with missing values at baseline
- reject duplicate patient/time-axis rows unless upstream aggregation has resolved them

Failure messages should be user-facing and tied to the selected config, for example:

```text
Baseline age is required for this model but is unavailable for 2 modeled patients.
```

## Result Shape

Extend normalized fixed effects from the current hard-coded shape:

```ts
fixedEffects: {
  intercept: number
  timeSinceBaseline: number
}
```

to include optional named terms:

```ts
fixedEffects: {
  intercept: number
  timeSinceBaseline: number
  baselineAge?: number
}
```

The primary slope metric in the panel remains `timeSinceBaseline`, labelled as mean eGFR slope per year since baseline. When `baselineAge` is present, show it in the details area as the baseline-age adjustment coefficient, not as the main slope.

The worker result normalization must reject missing required coefficients for the selected formula.

## Modal Actions And State

The modal edits a draft config.

- `Cancel` closes the modal and discards draft changes.
- `Apply settings` validates the draft, writes it to app state, closes the modal, invalidates the current result, turns off the overlay line, and aborts any in-flight mixed-model job.
- `Fit model` validates the draft, writes it to app state, closes the modal, invalidates the current result, turns off the overlay line, and starts a new fit with the applied config.
- Invalid draft settings cannot be applied or fitted; show the validation message in the modal.

Changing mixed-model config through app state must invalidate the current result just like changing selected patients or data policy.

## Identity And Hashing

The mixed-model dataset hash must include every value that can affect the fitted model. For the configurable row shape this includes:

```ts
patient_id
eGFR
time_since_baseline
baseline_age
```

when `baseline_age` is present or required by the selected config. Manual demographic changes that alter baseline age must therefore change result identity and invalidate stored results even if eGFR and follow-up time are unchanged.

The fit config hash must include the mixed-model config and the generated formula key/string, but must not include endpoint-only settings.

## Testing

Core tests:

- Formula builder maps every allowed config to the expected formula.
- Model-ready rows include `baseline_age` when available.
- Validation blocks baseline-age covariate when baseline age is missing.
- Dataset hash/result identity changes when `baseline_age` changes.
- Fit config hash changes when mixed-model config changes.
- Endpoint-only settings do not change mixed-model identity.
- Unsupported `age` time-axis config returns a structured unsupported-config failure.

Worker tests:

- Worker receives config and generated formula.
- lme4 extraction still returns fixed effects, random effects, warnings, and metadata.
- Unsupported or invalid config returns a structured failure, not a crash.

UI tests:

- `Configure...` opens the modal.
- Modal shows formula preview and active data policy.
- Applying settings updates the panel formula summary and invalidates previous results.
- `Fit model` applies settings and starts fitting.
- Overlay line appears only on compatible x-axis.
- Baseline-age option is blocked when required age data is unavailable.

Manual verification:

- Fit default baseline-age-adjusted model on synthetic eGFR cohort.
- Change to intercept-only and verify formula/result metadata update.
- Remove age data from a small fixture and verify fitting is blocked with a clear message.

## Out Of Scope

- Arbitrary formula editing.
- Age as the primary model time axis.
- More covariates beyond baseline age in the first implementation.
- Interactions such as `time_since_baseline * baseline_age`.
- Patient-specific fitted random-effect lines in the overlay.
- Backend fitting.
- Clinical decision support.
