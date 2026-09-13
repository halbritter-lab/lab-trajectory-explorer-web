# Configurable trend projection

Status: interface concept and generalizable scope accepted in conversation on
2026-09-13. This document makes the implementation boundaries explicit.

## Scope and architecture

Project a fitted linear trajectory to configurable targets. A target has a
stable ID, editable label, finite threshold, direction (`below` or `above`),
and explicit outcome/unit binding. G4 and G5 boundary presets are data entries
for compatible eGFR series; the calculator contains no stage names or renal
threshold constants. Adding a preset copies its definition into the settings.
Custom targets work for any supported numeric series with a fitted linear model.

Use a generic pure calculator, a mixed-model profile adapter and a reusable
projection editor/result component. A renal-only implementation would defeat
the requested scope; a general formula language would add unnecessary risk.
No user-provided strings become executable expressions.

The initial model integration is a fixed-effect profile: explicit categories
and raw numeric factor values, defaulting to fitted references and fitted
centers. It is not a patient-specific random-effect prediction. All selected
profile terms contribute to intercept and slope as configured. Profile controls
must use the fitted population's available categories; absent terms/centers
produce an unavailable result instead of silently assuming zero.

The current runtime uses an internal response column named `eGFR`. Preserve
that compatible wire format but carry the actual response name and unit in
the adapter, UI and export. Verify non-eGFR series end to end before claiming
general applicability. No other outcome receives renal presets automatically.

## Time and calculation

For y(t) = a + b*t, time is in years since model origin. Controls expose
reference time r (default 0) and horizon H after that reference (initial editable
value 20 years, an interface starting value rather than a clinical limit).
Calculate the boundary intersection t* = (threshold - a)/b and remaining time
t* - r. Never substitute the last observed value for the fitted value.

Validate finite inputs, nonnegative r and positive finite H. Require matching
outcome and units; no implicit unit conversions. Validate y(r) and derived
times for overflow. If y(r) already satisfies the requested strict inequality,
report `already_met`, without claiming a historical first-crossing date.
Equality is a boundary touch: a trend toward the requested side returns a
zero-time intersection; a flat/away trend is not a future crossing. Classify
flat, away, beyond-horizon and invalid inputs separately. A crossing exactly
at the horizon is included. Preserve small finite slopes; do not invent a
clinical flatness cutoff. Do not present infinity as a numeric result.

Label results as projected boundary intersections conditional on continuation
of the fitted trend. A group model's origin is each patient's first retained
measurement, not a shared calendar date. Export both absolute model time and
remaining years with r. Do not invent a common calendar date or age.

## Presentation and provenance

The dialog contains the selected response/unit, editable profile, targets,
reference time and horizon; results list target, status and projected time.
Show editable presets alongside custom target creation/removal. Use generic
labels. A threshold crossing is not evidence of confirmed clinical staging.

Keep projection settings separate from model-fit configuration: changing a
target or profile does not refit the model. Use only identity-matched fitted
results. Changing fitted data/config invalidates projections with their source.
Export a projection sheet containing target definition, profile, outcome/unit,
source fit identity, a, b, r, H, status and available crossing times. Export
the settings used for the displayed projection, including disabled/failed
result states where applicable, rather than silently omitting them.

The current result contract has marginal coefficient intervals but no full
fixed-effect covariance. Initial projection output must explicitly state that
time uncertainty is not estimated. Do not transform slope CI endpoints into
a purported crossing CI. A covariance/bootstrap-based uncertainty extension
requires a separate numerical design and validation.

## Compatibility and deferred work

Leave existing single-patient latest-measurement projections and numeric parity
fixtures unchanged; label the new model-curve anchor explicitly. Shared-core
migration of those legacy projections is a separate behavior change.
Time-to-event analysis remains a possible later extension in issue #4; its
event definition and follow-up questions do not block this feature.

## Acceptance examples

- a=60, b=-3, r=0, H=20: below-30 boundary at 10 years; below-25 at
  35/3 years; below-15 at 15 years.
- Same model, r=2: below-30 boundary remains at model year 10, with 8 remaining.
- Generic rising outcome a=80, b=5, above-100: 4 years, without renal labels.
- Below-15 with H=10: beyond horizon; no in-horizon numeric prediction.
- Flat, wrong-direction, already-met, boundary equality, malformed inputs,
  incompatible units, tiny slopes and nonfinite derived values are covered.
- Nonreference genotype and noncentered numeric profiles modify a and b using
  every configured main/interaction effect; stale fits cannot be exported.
