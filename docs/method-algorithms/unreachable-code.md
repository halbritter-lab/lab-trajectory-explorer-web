# Method reference: Code not reachable from the interface

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Fit code not reachable from the interface

The following exist in the source and in tests, but no interface path selects
them: the workspace derives the slope mode from the fit model only, and
`cohortSeriesSpec` sets no mode parameter. They are not live behaviour and are
not part of the method description above. The corresponding list for cohort
models is at the end of [Cohort mixed models](cohort-models.md#cohort-mixed-models).

- Slope mode `chronic-ckd`: removes fitted points up to and including the first
  fitted date plus a run-in of `cutoffDays` (default 90 days; only strictly
  later points stay), then runs the global fit. The mixed-model dataset has the
  matching "chronic run-in" branch, equally unreachable.
- Slope mode `event-driven`: splits the fitted points at event dates, fits each
  part with the global fit and reports the part with the largest absolute
  slope. The before/after comparison of 2026-11-22 does not use it: it
  reports both sides of one chosen anchor event as an additional result (see
  [before/after comparison](anchor-comparison.md#beforeafter-comparison-at-an-anchor-event-2026-11-22)).
- Slope mode `aki-aware`: applies AKI windows whatever the column's exclusion
  option says, and draws its line with the OLS kernel without the two-point
  case. Live AKI exclusion uses the column option "Exclude AKI windows from
  fit" with the `global`, `global-robust`, `rolling` or `gap-split` mode.
- `fitAkiAware` (`src/core/domains/nephrology/aki/akiAware.ts`): a standalone
  helper for the `aki-aware` fit; no application code calls it.
- `cutoffDays`: used in a calculation only by the `chronic-ckd` branches; it is
  also part of the mixed-model result identity, where it is always empty.
- `eventDates` and `eventDatesByPatient`: read only by the `event-driven`
  branches.
- `gapDays`, `windowDays` and `stepDays` as per-series overrides on the series
  specification, and `minNPerWindow` and `minNPerSegment` as parameters of
  `summarizeByBezeichnung`: nothing sets them, and the defaults 180, 730, 180,
  3 and 3 always apply (the trend-line code fixes the segment minimum at 3).
- `primaryExclusionReason` (`src/core/domains/nephrology/fitConfig.ts`): a
  precedence among exclusion reasons that no application code calls; the
  interface lists every reason of an excluded point.
- The `FitPipelineResult` summary fields and `BaseFitPoint.aggregate` in
  `src/core/fitPipeline/types.ts` (time bins, median and maximum gap, clustered
  measurement flag): declared types without an implementation.
