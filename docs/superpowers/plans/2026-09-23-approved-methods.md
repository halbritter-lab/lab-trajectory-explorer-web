# Approved methods implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Track verified work below.

**Goal:** Implement the approved observed endpoint, fitted-curve prediction and Python-compatible Theil-Sen contracts.

**Architecture:** Keep numerical kernels in core, settings in existing FitConfig, and derive UI/export output from the same cohort results. Observed endpoints and individual endpoint predictions use raw dated numeric measurements, independently of optional display-fit preparation. Retain prepared display fits and explicitly distinguish their scope.

**Tech Stack:** TypeScript, React, Vitest, Playwright; existing Python/SciPy golden reference.

**Spec:** `docs/remaining-method-decisions.md`

## Global constraints

- English application copy and documentation; research use only.
- Preserve unrelated numerical contracts. Changes to approved methods require explicit parity documentation.
- Continue in the user's existing feature branch; user authorized autonomous execution.
- Commit verified packages; do not push, merge or release.
- Document substantive algorithms, configuration, examples and limitations alongside implementation.

## Review focus

- A recovery before confirmation restarts the candidate; recovery afterwards preserves both recorded dates.
- Missing/nonfinite values and tied dates must not invent confirmation or undefined regression estimates.
- Configured confirmation days must reach calculation, labels and exports rather than merely changing a control.
- Raw-data endpoint predictions must not silently reuse a slope from censored/aggregated display fits.
- Theil-Sen confidence bounds must account for repeated values/dates and remain distinct from prediction intervals.

## Task 1: Theil-Sen reference contract

Files: `src/core/stats/series.ts`, `tests/core/stats/theilSen.test.ts`, `tests/parity/theilSen.parity.test.ts`, `tests/goldens/theil_sen.md`, `src/ui/pages/Methodology.tsx`.
Interface: preserve `fitTheilSen(points: SeriesPoint[]): OlsFit`; provide finite `ciLow/ciHigh` for successful fits.

- [ ] Extend parity assertions to intercept and bounds, require three points, update direct numeric expectations. Regression example: `fitTheilSen(points([0,1,2,3],[0,0,4,9])).intercept === -3.25`.
- [ ] Run `pnpm test tests/core/stats/theilSen.test.ts tests/parity/theilSen.parity.test.ts --maxWorkers=2`; expect failures on old intercept, minimum and unavailable bounds.
- [ ] Implement separate medians and reference 95% rank-based slope interval with tie corrections; document exact convention and unavailable cases.
- [ ] Run focused tests and relevant stats/UI tests, expect all passing; commit package.

## Task 2: Observed endpoint and prediction kernels

Files: `src/core/endpoints/ckdEndpoints.ts`, `src/core/cohort/screening.ts`, `tests/core/endpoints/ckdEndpoints.test.ts`, cohort regression tests.
Interface: extend `CkdEndpoints` with independent G4 and recovery evidence; consume optional confirmation setting with default 90 days; preserve existing G5 fields while adding dates/values/provenance.

- [ ] Add failing regressions for January14/May13/November20 (preserved January event, May confirmation, November recovery), January14/March20/May13 (new candidate), exact interval boundary, G4 independent of G5 and invalid/tied dates.
- [ ] Add fitted-curve regression: `[60,50,25]` at years `[0,1,2]`, target15, remaining time `0.7142857143`; verify all-data input even when display-fit censoring is active.
- [ ] Run `pnpm test tests/core/endpoints tests/core/cohort --maxWorkers=2`; expect old behavior failures.
- [ ] Implement chronological confirmation state, raw endpoint preparation and raw fitted-curve prediction. Retain conservative unavailability reasons for no fit, no future crossing and missing age.
- [ ] Run focused endpoint/cohort suite, expect all passing; commit package.

## Task 3: Settings, presentation, exports and methodology

Files: `src/core/fitPipeline/types.ts`, `src/workspace/workspace-analysis.ts`, `src/workspace/WorkspaceAnalysisSettings.tsx`, `src/ui/shell/Sidebar.tsx`, cohort/quality labels, workspace/cohort export adapters, `src/ui/pages/Methodology.tsx`; associated component tests and `tests/e2e/workspace.e2e.ts`.
Interface: endpoint settings include independent G4 switch and positive whole-day confirmation interval; results expose interval, event/confirmation/recovery dates and values plus prediction input/anchor provenance.

- [ ] Add failing tests that changing confirmation days changes a known endpoint, that both endpoint/recovery details are visible, and that actual workbook records contain matching configuration/dates.
- [ ] Wire settings through shared FitConfig to cohort calculations and exports; preserve compatibility defaults for older in-memory configurations.
- [ ] Document strict thresholds, reset/persistence behavior, raw prediction scope, fit anchor, confidence convention and worked examples in app methodology and repository docs.
- [ ] Run component regressions, build, then production browser regression including actual downloaded workbook content; expect all passing.

## Task 4: Whole-package verification and review

- [ ] Run `pnpm test --maxWorkers=2 --minWorkers=1` and `pnpm build`; expect all passing.
- [ ] Run production Playwright suite with Chromium/Firefox/WebKit and no retries.
- [ ] Request independent final code review, reproduce substantive findings before fixing and rerun relevant checks.
- [ ] Update decision/backlog implementation status, changelog and dated verification record, commit, verify clean status and complete Goal.

## Execution ledger

Pre-flight: Task1 preserves OlsFit for Task2; Task2 result/settings extensions feed Task3 labels and exports. Task3 must propagate settings through both workspace and original UI. No interface conflict.
Ruling: Work in the current feature branch, as requested by the ongoing branch-completion task. No separate worktree or plan-approval pause is needed under the user's autonomous execution instruction.
