# Method reference: Bounded measurements

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Bounded measurements (2026-10-06)

Imported `<x` and `>x` rows retain their raw text, numeric limit and operator.
They remain in measurement tables and charts and count toward raw dated numeric
counts (`nNumeric`) and the raw span (`spanDays`), and through that span can
remove the `span_too_short` reason of a series whose exact values span less
than 365 days. They never enter individual OLS or Theil-Sen fits, rolling
or segmented slopes, cohort screening and slope lines, endpoint evaluation or
prediction, AKI detection, or cohort mixed-model datasets. Derived eGFR from a
bounded creatinine source retains the reversed inequality for display and is
also excluded from these calculations. This policy is independent of optional
clinical-event censoring and AKI fit windows.

Filtering is by row operator before fitting, aggregation and endpoint order,
not by date. An exact value on the same date as a bound remains eligible. A
bound alone cannot start, confirm, interrupt or recover an observed endpoint;
it cannot establish an AKI episode. For a series that is not itself an eligible
creatinine series and not a computed eGFR (which uses its own source series),
the patient's creatinine series with the most exact dated
numeric values supplies the AKI episodes (first in row order on a tie); bounds
do not win source selection by inflating row count.
Bound-only series retain their displayed
points and raw count but have zero fitted points, no fitted slope or line and no
observed endpoint. A bound does not supply an age anchor or mixed-model time
origin. For example, exact 60 and `<10` on 2020-01-01 followed by exact 50 on
2021-01-01 fits the two exact values, while all three remain visible. The
numeric limits are shown as limits and are not estimates of the unknown values.
If a series has only one exact value and a fit exclusion window removes it,
`nFitted` is zero; a disabled fit also reports zero regardless of how many
exact and bounded values are visible. Raw counts remain unchanged.

Regression evidence: [censored measurement tests](../../tests/core/censoredMeasurements.test.ts)
and [workspace chart/table tests](../../tests/workspace/trajectories.test.tsx).

