# Implemented method algorithms

This reference records numerical contracts and their test evidence. Approved
requirements and pending work are tracked in [method decisions](remaining-method-decisions.md).

## Bounded measurements (2026-10-06)

Imported `<x` and `>x` rows retain their raw text, numeric limit and operator.
They remain in measurement tables and charts and count toward raw dated numeric
counts (`nNumeric`), but never enter individual OLS or Theil-Sen fits, rolling
or segmented slopes, cohort screening and slope lines, endpoint evaluation or
prediction, AKI detection, or cohort mixed-model datasets. Derived eGFR from a
bounded creatinine source retains the reversed inequality for display and is
also excluded from these calculations. This policy is independent of optional
clinical-event censoring and AKI fit windows.

Filtering is by row operator before fitting, aggregation and endpoint order,
not by date. An exact value on the same date as a bound remains eligible. A
bound alone cannot start, confirm, interrupt or recover an observed endpoint;
it cannot establish an AKI episode. When multiple creatinine series are
available for AKI detection, the source with the most eligible exact dated
values is selected; bounds do not win source selection by inflating row count.
Bound-only series retain their displayed
points and raw count but have zero fitted points, no fitted slope or line and no
observed endpoint. A bound does not supply an age anchor or mixed-model time
origin. For example, exact 60 and `<10` on 2020-01-01 followed by exact 50 on
2021-01-01 fits the two exact values, while all three remain visible. The
numeric limits are shown as limits and are not estimates of the unknown values.
If a series has only one exact value and a fit exclusion window removes it,
`nFitted` is zero; a disabled fit also reports zero regardless of how many
exact and bounded values are visible. Raw counts remain unchanged.

Regression evidence: [censored measurement tests](../tests/core/censoredMeasurements.test.ts)
and [workspace chart/table tests](../tests/workspace/trajectories.test.tsx).

## KDIGO creatinine AKI and eGFR source conversion (2026-10-06)

AKI detection accepts the same eligible serum-creatinine name and unit pairs as
eGFR derivation: a name containing “Kreatinin” or “Creatinin”, excluding urine
names, with mg/dl or µmol/l (including common case, space and micro-sign
spellings). Only dated exact numeric rows enter detection. Each creatinine
series detects AKI on itself. For another analyte, the patient's eligible
creatinine pair with the most exact dated rows is used; ties retain the first
encountered pair. Rows with different names or units are never pooled into one
detection series. The selected eGFR derivation source is likewise one exact
name/unit pair, so other creatinine series do not supply its values.

Both calculations convert a selected µmol/l value to mg/dl by dividing by
**88.42 µmol/l per mg/dl** before evaluating it. Thus 97.262 and 123.788
µmol/l correspond to 1.1 and 1.4 mg/dl. AKI tests a rise of at least 0.3
mg/dl within 48 elapsed hours first; otherwise it tests a ratio of at least
1.5 to a positive baseline within seven elapsed days. The stage-1 floor and
stage-2/3 ratio and absolute thresholds use the same inclusive comparison.
Each numeric threshold comparison permits a **1e-12** tolerance in the
compared quantity (mg/dl for an absolute value, dimensionless for a ratio).
This includes mathematically exact decimal boundaries lost to binary rounding;
1.1 to 1.399999 mg/dl remains below the 0.3 rise threshold. Window times,
baseline minima, episode clustering, stage priority and exclusion-window
construction are unchanged. This is automated creatinine screening only;
urine-output criteria are not evaluated.

Regression evidence: [KDIGO boundary tests](../tests/core/aki/kdigo.test.ts),
[AKI source tests](../tests/core/aki/akiAware.test.ts) and
[eGFR source tests](../tests/core/egfr/series.test.ts).

## Theil-Sen (2026-09-23)

Inputs are dated numeric observations, sorted without mutating caller data. Time
is elapsed UTC milliseconds from the earliest date divided by 365.25 days/year.
At least three observations and two distinct timestamps are required. Retain
repeated-date observations but omit pairs whose time difference is zero.

The slope is the median of `(y[j]-y[i])/(x[j]-x[i])` over pairs with increasing
time. The intercept is `median(y) - slope * median(x)`. R² is unavailable.
For x=[0,1,2,3], y=[0,0,4,9], slope=3.5 and intercept=-3.25; the former web
median-residual convention produced -2.25 and has intentionally been replaced.

Slope confidence bounds follow the Python reference's SciPy `theilslopes`
default 95% convention. Let n be observation count and N the number of valid
pair slopes. For each repeated time or value group of size k, subtract
`k*(k-1)*(2*k+5)` from `n*(n-1)*(2*n+5)`; divide the result by 18 to obtain V.
With C=1.959963984540054*sqrt(V), use zero-based sorted-slope ranks
`max(roundEven((N-C)/2)-1,0)` and `min(roundEven((N+C)/2),N-1)`.
Exact half-integers round to even to match NumPy. Undefined variance/ranks
produce unavailable bounds. These are slope bounds, not confidence bounds for
the intercept or prediction intervals for individual future observations.

The kernel expects valid numeric points from preparation. The minimum applies
to the actual prepared observations when used for a display fit. All pairs are
enumerated, so time and temporary storage grow quadratically with point count.

References: [SciPy documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html),
[fixture provenance](../tests/goldens/theil_sen.md),
[full estimator parity tests](../tests/parity/theilSen.parity.test.ts).

## Observed G4/G5 and individual prediction (2026-09-23)

Observed endpoints evaluate dated finite exact eGFR measurements in chronological
order after endpoint event filtering, independently of display-fit AKI exclusions
and aggregation. Endpoint filtering removes values on or after the earliest
kidney transplant or chronic dialysis start, and values within a complete dated
acute dialysis interval, including its start and end dates. Later values after
acute dialysis remain eligible. Unknown-intent dialysis and incomplete or
invalid acute intervals do not censor endpoint input. Dates compare by UTC
calendar day. KRT is reported separately as kidney failure reached with type
and date, regardless of observed G5 toggle, for nonempty eGFR series even when
every lab is on or after KRT and no row is endpoint-eligible.
An earlier lab-confirmed G5 and later KRT can both be reported. G4 is strictly
below 30 and G5 strictly below 15 mL/min/1.73m². Equality is not below the
threshold. The default minimum confirmation interval is 90 elapsed UTC days;
configuration accepts positive whole days. Invalid values fall back to 90.

A low measurement starts a candidate. A subsequent low measurement confirms it
at the first timestamp at least the minimum interval later, unless a value at
or above the threshold intervenes. Such an intervening value clears the
candidate. Confirmation must also occur within 12 UTC calendar months of the
candidate, inclusive; month addition clamps to the last day of the destination
month. A later low value expires the old candidate and starts a new one there.
Confirmation records the initial crossing and earliest confirmation
dates and values. Subsequent recovery is recorded at its first measurement at
or above the threshold, without changing the confirmed event. G4 and G5 are
independent; a G5 recovery need not be a G4 recovery.

Missing dates and nonfinite values are ignored. At a shared timestamp, any value
at or above threshold interrupts an unconfirmed candidate: contradictory
same-time values cannot establish persistence. Among otherwise qualifying tied
measurements, retain source order for the associated value. Confirmation needs
a later timestamp; same-time repeats cannot satisfy a positive interval.

Example: January14, May13, November20 records a January G5 crossing, May
confirmation and November recovery. January14, March20, May13 has no confirmed
G5 event yet: May starts a new candidate.

Individual endpoint prediction fits the same endpoint-eligible exact numeric
observations, including recovery after an acute dialysis interval but not after
KRT, without display-fit AKI exclusion or time
aggregation. It uses global OLS, or Theil-Sen for a robust-trend selection;
rolling/segmented display fits retain the existing global OLS scalar convention.
No-fit disables prediction. Percent change likewise describes first to latest
endpoint-eligible exact eGFR. It is not shown for a single eligible measurement, where first and latest
coincide; exports keep the computed value. Display slopes can therefore differ
from the endpoint prediction fit.

Confirmed 40 % and 57 % eGFR decline are separate observed events. The 57 %
boundary serves as a serum-creatinine doubling surrogate. Their shared baseline
is the arithmetic mean of eligible exact eGFR rows from the first eligible
UTC date through 90 elapsed UTC calendar days inclusive; duplicate rows each contribute.
Only later rows can start a candidate. A baseline of zero or less yields no
decline event. Equality at either percentage threshold counts; a tiny 1e-12
percentage tolerance protects exact boundaries from binary rounding. Both use
the configured minimum elapsed-day interval and the inclusive 12-calendar-month
maximum. Same-time noncrossing values interrupt candidates, source order selects
associated qualifying values, and recovery remains visible without revoking a
confirmed event. The older first-to-latest percent change is a distinct metric.

Exports record provenance only for endpoints that were evaluated: the
confirmation interval and 12-month maximum when G4, G5 or percent decline was enabled, the input policy when any
endpoint was, and the prediction anchor and model when the G5 projection was.
Blank provenance means the endpoint was not evaluated for that series (for
example non-eGFR units or a preset with endpoints off), not that it was not met.
KRT type and date have separate export columns. When a future individual
projection is withheld after KRT, projected age, anchor and model are blank and
`endpoint_prediction_reason` records `kidney_failure_reached`. A prior observed
G5 retains its own lab dates alongside the KRT date.
The decline export columns append the shared mean baseline and, for each 40 %
and 57 % event, its met flag and first, confirmation and recovery dates and
eGFR values. Blank event provenance means no confirmed event or no evaluation;
the endpoint configuration and baseline distinguish those cases.
The earlier columns `endpoint_percent_decline`, `endpoint_observed_ckd_g5` and
`endpoint_projected_age_to_ckd_g5` keep their position; later endpoint columns
are appended after them.

For `y(t)=a+b*t`, target q is reached at `t=(q-a)/b`, with time in years from
the first measurement. Future age equals age at the latest measurement plus
crossing time minus elapsed observed years. Require three points, at least one
year of follow-up, a finite declining fit, a future crossing and an available
age anchor. A confirmed observed G5 event retains precedence over a future G5
projection. Once KRT is reached, no future G5 crossing is projected, even if
the pre-KRT fit would cross later. When there is no prior observed G5, the
reason is `kidney_failure_reached`. If the fitted crossing is already at/before the latest measurement,
report no future crossing rather than a future age. Missing values remain
unavailable, never zero. New measurements may change a prediction; they cannot
revoke a previously confirmed event within the same measurement history.

The endpoint-only OLS or Theil-Sen fit also supplies slope confidence bounds;
the cohort display-fit bounds do not control this prediction. A crossing is
reported only when both bounds are finite and ordered, and the interval is
strictly below zero. An interval touching or straddling zero gives
`slope_ci_includes_zero`; unavailable or inverted bounds give
`slope_ci_unavailable`. The future crossing must occur no more than 20 years
after the latest endpoint-eligible measurement, using 365.25-day years;
exactly 20 years is allowed and a later crossing gives
`beyond_projection_horizon`. The export includes the endpoint slope bounds,
20-year limit and reason. Observed G5, KRT and no-fit reasons take precedence.

Example: years [0,1,2], values [60,50,25] gives a=62.5, b=-17.5. Target15 is
reached 0.7142857 years after year2, rather than 0.5714286 from the former
last-measurement anchor. These intentionally replace the historical web rules;
they are owner-approved research definitions, not claims of clinical validation.
