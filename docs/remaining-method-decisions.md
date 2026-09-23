# Remaining method decisions

Prepared 2026-09-23. These examples clarify existing implementation differences;
they do not select a new statistical or endpoint policy. The autonomous workspace
completion package leaves the numerical core unchanged.

## Observed G4/G5 events — issue #4

The current observed-G5 code checks a value below 15, confirmation at least
90 days later and no subsequent recovery. The following synthetic sequence
illustrates why a first-event definition needs a separate decision:

| Date | Value | Consequence of the existing rule |
| --- | ---: | --- |
| 2020-01-01 | 14 | Candidate first crossing |
| 2020-05-01 | 13 | Qualifying confirmation |
| 2020-09-01 | 12 | Becomes the recorded confirmation date |
| 2020-11-01 | 20 | Invalidates that candidate despite the earlier confirmation |

Decide whether a confirmed event remains recorded after recovery; whether its
date is the first crossing or the first qualifying confirmation; and which
threshold/confirmation definitions apply independently to G4 and G5. Keep both
crossing and confirmation dates in the output if both are required. Existing
projection presets do not answer these observed-event questions.

Evidence: [implementation](../src/core/endpoints/ckdEndpoints.ts),
[current tests](../tests/core/endpoints/ckdEndpoints.test.ts),
[event-time questions](research-endpoint-readiness.md).

## Individual projection anchor — issue #4

Consider values 60, 50 and 25 at model years 0, 1 and 2. OLS gives intercept
62.5 and slope -17.5 per year; the fitted value at year 2 is 27.5.

For a target value of 15:

| Anchor | Remaining years after year 2 |
| --- | ---: |
| Latest measured value, 25 | (25 - 15) / 17.5 = 0.5714 |
| Fitted value at year 2, 27.5 | (27.5 - 15) / 17.5 = 0.7143 |

The legacy individual endpoint uses the latest-measurement anchor; the newer
mixed-model projection contract uses the fitted curve. Decide whether to keep
both explicitly named behaviors or migrate the individual path. A migration
changes existing numbers and needs corresponding export/methodology updates.

## Theil-Sen conventions — issue #6

| Decision | Current web behavior | Python reference behavior |
| --- | --- | --- |
| Minimum number of observations | Two | Three |
| Intercept | Median of y - slope*x | Median(y) - slope*median(x) |
| Slope confidence bounds | Unavailable | Non-parametric bounds |

For x = [0, 1, 2, 3] and y = [0, 0, 4, 9], both slopes are 3.5;
the intercept is -2.25 on the web and -3.25 in the Python reference. Agreement
on slope alone therefore does not establish agreement on plotted lines or
threshold crossings. Select the intended estimator contract before changing
minimum counts, intercepts or interval outputs.

Evidence and reproducible fixture provenance:
[Theil-Sen reference record](../tests/goldens/theil_sen.md).

## Research and product acceptance

The remaining input is a set of representative research files and intended
questions (including desired covariates and outcomes), plus first-user workflow
acceptance. The automated large-cohort check uses synthetic data; it does not
define adequate performance or statistical validity for a real research cohort.

Intervention models, event-time analysis, arbitrary input mapping, additional
derivations and complete saved projects still need their own concrete scope.
They are retained in the [completion backlog](workspace-completion-backlog.md),
not silently treated as finished or removed.
