# Implemented method algorithms

This reference records numerical contracts and their test evidence. Approved
requirements and pending work are tracked in [method decisions](remaining-method-decisions.md).

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

Observed endpoints evaluate dated finite eGFR measurements in chronological
order, independently of display-fit exclusions and aggregation. G4 is strictly
below 30 and G5 strictly below 15 mL/min/1.73m². Equality is not below the
threshold. The default minimum confirmation interval is 90 elapsed UTC days;
configuration accepts positive whole days. Invalid values fall back to 90.

A low measurement starts a candidate. A subsequent low measurement confirms it
at the first timestamp at least the minimum interval later, unless a value at
or above the threshold intervenes. Such an intervening value clears the
candidate. Confirmation records the initial crossing and earliest confirmation
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

Individual endpoint prediction fits all dated numeric observations, including
post-event recovery, without display-fit censoring, AKI exclusion or time
aggregation. It uses global OLS, or Theil-Sen for a robust-trend selection;
rolling/segmented display fits retain the existing global OLS scalar convention.
No-fit disables prediction. Percent change likewise describes first to latest
raw eGFR. Display slopes can therefore differ from the endpoint prediction fit.

For `y(t)=a+b*t`, target q is reached at `t=(q-a)/b`, with time in years from
the first measurement. Future age equals age at the latest measurement plus
crossing time minus elapsed observed years. Require three points, at least one
year of follow-up, a finite declining fit, a future crossing and an available
age anchor. A confirmed observed G5 event retains precedence over a future G5
projection. If the fitted crossing is already at/before the latest measurement,
report no future crossing rather than a future age. Missing values remain
unavailable, never zero. New measurements may change a prediction; they cannot
revoke a previously confirmed event within the same measurement history.

Example: years [0,1,2], values [60,50,25] gives a=62.5, b=-17.5. Target15 is
reached 0.7142857 years after year2, rather than 0.5714286 from the former
last-measurement anchor. These intentionally replace the historical web rules;
they are owner-approved research definitions, not claims of clinical validation.
