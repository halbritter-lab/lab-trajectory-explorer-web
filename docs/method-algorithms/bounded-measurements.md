# Method reference: Bounded measurements

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Bounded measurements (2026-10-06)

*Changed on 2026-11-22 (issue #73): the individual fits of a column now follow
its bounded-value setting, described in the next section. Under the setting
`exclude` this section still describes the fits exactly; the rules for
endpoints, AKI detection and cohort models apply under every setting.*

Imported `<x` and `>x` rows retain their raw text, numeric limit and operator.
They remain in measurement tables and charts and count toward raw dated numeric
counts (`nNumeric`) and the raw span (`spanDays`), and through that span can
remove the `span_too_short` reason of a series whose exact values span less
than 365 days. Under the setting `exclude` they never enter individual OLS or
Theil-Sen fits, rolling or segmented slopes, cohort screening and slope lines.
Under every setting they never enter endpoint evaluation or prediction, AKI
detection, or cohort mixed-model datasets. Derived eGFR from a
bounded creatinine source retains the reversed inequality for display and is
treated as a bound in all of these. This policy is independent of optional
clinical-event censoring and AKI fit windows.

Filtering is by row operator before fitting, aggregation and endpoint order,
not by date. An exact value on the same date as a bound remains eligible. A
bound alone cannot start, confirm or recover an observed endpoint; since
2026-11-22 a conclusive bound can interrupt an unconfirmed G4 or G5 candidate
(see [Bounds and endpoints](#bounds-and-endpoints-2026-11-22)). It cannot
establish an AKI episode. For a series that is not itself an eligible
creatinine series and not a computed eGFR (which uses its own source series),
the patient's creatinine series with the most exact dated
numeric values supplies the AKI episodes (first in row order on a tie); bounds
do not win source selection by inflating row count.
Under `exclude`, bound-only series retain their displayed
points and raw count but have zero fitted points, no fitted slope or line and no
observed endpoint. A bound does not supply an age anchor or mixed-model time
origin. For example, under `exclude`, exact 60 and `<10` on 2020-01-01 followed
by exact 50 on 2021-01-01 fits the two exact values, while all three remain
visible. The numeric limits are shown as limits and are not estimates of the
unknown values. If a series has only one exact value and a fit exclusion
window removes it, `nFitted` is zero; a disabled fit also reports zero
regardless of how many exact and bounded values are visible. Raw counts
remain unchanged.

Rows with the operator `range` or `unparseable` that still carry a number are
not bounds: they enter no fit under any setting, are not counted in
`n_bounded` and reset no endpoint candidate.

Regression evidence: [censored measurement tests](../../tests/core/censoredMeasurements.test.ts)
and [workspace chart/table tests](../../tests/workspace/trajectories.test.tsx).

## Bounded values in individual fits (2026-11-22)

Owner decision of 2026-11-21, implemented 2026-11-22 (issue #73; method
decision row `bounded` of 2026-11-22). Each parameter has the setting
**Bounded values (<x, >x)** under Calculation settings, saved with the shared
or the parameter's own settings and exported as `boundedValues`, the last
entry of `fit_config` in the settings sheet (and in `column_settings`):

| Setting | `<x` enters at | `>x` enters at |
| --- | --- | --- |
| `limit` (default) | x | x |
| `half-limit` | x / 2 | x |
| `exclude` | not at all | not at all |

**What follows the setting.** Every fit and line of the column: the scalar
slope (OLS, Theil–Sen, the global OLS behind rolling and segmented OLS), the
rolling windows and segments, the drawn trend lines, the before/after
comparison at an anchor event (each side) and the trend on log values of a
logarithmic axis. The log fit takes the natural logarithm of the substituted
value (ln(x/2) for `<x` under `half-limit`); a substituted value of zero or
less is left out like an exact one. A bound that enters is treated like an
exact value everywhere in the pipeline: clinical-event censoring and AKI
windows remove it by date, time balancing puts it into its month's or
quarter's median, it counts toward `nFitted`, `nFittedDates`,
`fittedSpanDays`, `index_date` and the reliability rule. In the measurement
table it reads "Available before time balancing; bounded value, enters the
fit at its limit (x)" or "… at half its limit (x/2)"; under `exclude` it reads
"Excluded: censored value (limit, not exact)" as before.

**What does not follow it (decided 2026-11-22).** Endpoints and the
individual projection, AKI detection and cohort mixed models exclude bounds
whatever the setting; the setting is therefore not part of the cohort model's
preparation key or fit-configuration hash. The `first_eligible_value` and
`last_eligible_value` columns and the decline baseline stay on exact values.

**`n_bounded`.** Every fit counts its bounded fitted points: `nBounded` of the
cell, `n_bounded` as the last column of the cohort record and, before `group`,
of the cohort or slopes sheet. It is counted on the points the scalar fit
consumed, after censoring and exclusion windows, time balancing and (slope
mode `chronic-ckd`) the run-in, and for event-driven fits on the reported
segment. **Median bins (decided here):** under monthly or quarterly time
balancing a fitted median counts as bounded when its month or quarter holds at
least one bound that entered, whichever value is the median, because the
median can rest on the substituted value. This is the conservative reading: it
can only raise the count. Under `exclude`, and without a fit, `n_bounded` is 0
(**Open decision OD-60**).

**The 20 % warning.** A fit with `n_bounded` ≥ 20 % of `n_fitted` (compared
in whole numbers as 5 · n_bounded ≥ n_fitted, so 1 of 5 and 3 of 15 warn, 1 of
6 does not; never with `n_fitted` 0 or fit model none) shows the caution
"*p* % bounded" in every cell layout and in the patient view, with *p* rounded
to a whole percent. The export has no separate warning column; the share
follows from `n_bounded` and `n_fitted`.

**Caveat.** Substituting the limit (or half of it) for a censored value is a
convention, not an estimate. Hornung and Reed (Appl Occup Environ Hyg
1990;5:46–51, doi:10.1080/1047322X.1990.10389587) showed that such
substitution biases estimates, the more so the larger the censored share;
Hughes (Biometrics 1999;55:625–629, PMID 11318225) showed for mixed models with
a detection limit that substitution and exclusion both bias slopes at high
censoring fractions and proposed a censored likelihood instead. The 20 %
warning marks where this bias can matter; it does not correct it. The cohort
model workbook's `r_script` sheet ends with a commented censored mixed-model
sketch (`lmec`, or `brms` with `cens()`) for a sensitivity analysis; see
[Cohort mixed models](cohort-models.md#cohort-mixed-models).

**Saved and exported settings without the entry.** Settings saved on the
device or written to an export before 2026-11-22 have no `boundedValues`;
they load and apply with the default `limit`, so slopes of series with bounds
differ from those the old export reports. "Apply settings from an export"
names each such parameter under "not applied" (**Open decision OD-63**).

### Example (issue #73)

Demo workbook (`public/test_labs.xlsx`), patient 2, Albumin/Kreatinin-Quotient
in mg/g: `<30` on 2022-01-01, 45 on 2022-07-01, 120 on 2023-01-01, `>300` on
2023-07-01 and 2024-01-01. General exploration (OLS, raw):

| Setting | Values in the fit | Slope per year | 95 % interval | n_bounded | Warning |
| --- | --- | --- | --- | --- | --- |
| `limit` | 30, 45, 120, 300, 300 | +159.06 | [56.67, 261.46] | 3 | 60 % bounded |
| `half-limit` | 15, 45, 120, 300, 300 | +165.06 | [68.09, 262.02] | 3 | 60 % bounded |
| `exclude` | 45, 120 | +148.88 (exact two-point line, R² = 1) | none | 0 | none |

The issue listed `exclude` as "not fittable". The app gives the exact
two-point line, as it does for every two-point OLS series, and flags it "n < 3"
(unstable, reliability rule); under Theil–Sen the same two points give no slope
(`n_below_threshold`). Quarterly medians change nothing here: every quarter
holds one value. Theil–Sen gives +159.27 under both `limit` and `half-limit`:
the median pairwise slope does not involve the first value here.

Median-bin example: exact 10 (2020-01-10), 12 (2020-02-10), `<5` (2020-03-10),
exact 20 (2020-05-10) and `>40` (2020-08-10), quarterly medians, `limit`: the
first quarter's median is 10, an exact value, but the quarter holds `<5`, so
two of the three fitted medians are bounded (67 %, warning). Under `exclude`
the fit has two medians and `n_bounded` 0.

Regression evidence: [bounded-value policy tests](../../tests/core/boundedValuePolicy.test.ts).

## Bounds and endpoints (2026-11-22)

Decided 2026-11-22 (row `bounded`): a bound may reset a G4/G5 candidate when it
is logically conclusive, but never establishes a crossing or a decline. The
observed-endpoint logic already clears an unconfirmed candidate at a
non-crossing value (rule 3 under
[Observed G4/G5](endpoints-and-projection.md#observed-g4g5)), so the reset is
implemented there:

- A bound is offered to observed G4 and G5 when it passes the same event
  filter as exact rows (before the first kidney transplant or chronic
  dialysis, outside complete acute dialysis intervals). AKI windows do not
  remove it, as they do not remove exact rows from observed G4/G5.
- It is **conclusive** for a crossing below a threshold T when it reads `>x`
  with x ≥ T: the true value exceeds x and so is not below T. `>30` and `>60`
  are conclusive for G4 (< 30) and G5 (< 15); `>20` only for G5; `>29.5` not
  for G4; a `<x` bound never is. (For a crossing above a threshold, `<x` with
  x ≤ T would be conclusive; no endpoint of the app uses that direction.)
- A conclusive bound before the next exact observation clears an unconfirmed
  candidate; the next low exact value starts a new one. On the date of an
  exact observation it counts as a non-crossing value of that observation, so
  the observation clears the candidate and cannot start or confirm one.
- Bounds never start, confirm or expire a candidate, and are not recorded as
  recovery after a confirmed event (**Open decision OD-61**). Inconclusive bounds
  are ignored.
- The 40 % and 57 % decline events, the total percent change, the decline
  baseline and the projection ignore bounds (**Open decision OD-62**). The
  projection's check for a confirmed G5 uses the same reset rule as observed
  G5.

Example: eGFR 12 on 2020-01-01, `>60` on 2020-03-01, 11 on 2020-06-01
(default 90 days). Before, the `>60` was ignored and 11 confirmed G5 (and G4)
152 days after the first value. Now `>60` clears the candidate of 2020-01-01
and 11 starts a new one, which nothing confirms: no G4 or G5 event. With
`>20` instead, only the G5 candidate is cleared: G5 has no event, while G4 is
still confirmed on 2020-06-01 with first crossing 2020-01-01. Values 25 (2020-01-01), 24 (2020-06-01), 23 (2020-09-01) with
`>60` on 2020-03-01 give G4 first crossing 2020-06-01, confirmed 2020-09-01
(92 days).

Regression evidence: [bounded-value policy tests](../../tests/core/boundedValuePolicy.test.ts).
