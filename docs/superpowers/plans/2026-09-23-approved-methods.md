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

- [x] Extend parity assertions to intercept and bounds, require three points, update direct numeric expectations. Regression example: `fitTheilSen(points([0,1,2,3],[0,0,4,9])).intercept === -3.25`.
- [x] Run `pnpm test tests/core/stats/theilSen.test.ts tests/parity/theilSen.parity.test.ts --maxWorkers=2`; expect failures on old intercept, minimum and unavailable bounds.
- [x] Implement separate medians and reference 95% rank-based slope interval with tie corrections; document exact convention and unavailable cases.
- [x] Run focused tests and relevant stats/UI tests, expect all passing; commit package.

## Task 2: Observed endpoint and prediction kernels

Files: `src/core/endpoints/ckdEndpoints.ts`, `src/core/cohort/screening.ts`, `tests/core/endpoints/ckdEndpoints.test.ts`, cohort regression tests.
Interface: extend `CkdEndpoints` with independent G4 and recovery evidence; consume optional confirmation setting with default 90 days; preserve existing G5 fields while adding dates/values/provenance.

- [x] Add failing regressions for January14/May13/November20 (preserved January event, May confirmation, November recovery), January14/March20/May13 (new candidate), exact interval boundary, G4 independent of G5 and invalid/tied dates.
- [x] Add fitted-curve regression: `[60,50,25]` at years `[0,1,2]`, target15, remaining time `0.7142857143`; verify all-data input even when display-fit censoring is active.
- [x] Run `pnpm test tests/core/endpoints tests/core/cohort --maxWorkers=2`; expect old behavior failures.
- [x] Implement chronological confirmation state, raw endpoint preparation and raw fitted-curve prediction. Retain conservative unavailability reasons for no fit, no future crossing and missing age.
- [x] Run focused endpoint/cohort suite, expect all passing; commit package.

## Task 3: Settings, presentation, exports and methodology

Files: `src/core/fitPipeline/types.ts`, `src/workspace/workspace-analysis.ts`, `src/workspace/WorkspaceAnalysisSettings.tsx`, `src/ui/shell/Sidebar.tsx`, cohort/quality labels, workspace/cohort export adapters, `src/ui/pages/Methodology.tsx`; associated component tests and `tests/e2e/workspace.e2e.ts`.
Interface: endpoint settings include independent G4 switch and positive whole-day confirmation interval; results expose interval, event/confirmation/recovery dates and values plus prediction input/anchor provenance.

- [x] Add failing tests that changing confirmation days changes a known endpoint, that both endpoint/recovery details are visible, and that actual workbook records contain matching configuration/dates.
- [x] Wire settings through shared FitConfig to cohort calculations and exports; preserve compatibility defaults for older in-memory configurations.
- [x] Document strict thresholds, reset/persistence behavior, raw prediction scope, fit anchor, confidence convention and worked examples in app methodology and repository docs.
- [x] Run component regressions, build, then production browser regression including actual downloaded workbook content; expect all passing.

## Task 4: Whole-package verification and review

- [x] Run `pnpm test --maxWorkers=2 --minWorkers=1` and `pnpm build`; expect all passing.
- [x] Run production Playwright suite with Chromium/Firefox/WebKit and no retries.
- [x] Request independent final code review, reproduce substantive findings before fixing and rerun relevant checks.
- [x] Update decision/backlog implementation status, changelog and dated verification record, commit, verify clean status and complete Goal.

## Execution ledger

Pre-flight: Task1 preserves OlsFit for Task2; Task2 result/settings extensions feed Task3 labels and exports. Task3 must propagate settings through both workspace and original UI. No interface conflict.
Ruling: Work in the current feature branch, as requested by the ongoing branch-completion task. No separate worktree or plan-approval pause is needed under the user's autonomous execution instruction.

Task1: complete in f68e481; 13 expected failures before implementation, then 73/73 focused statistics/parity tests passed, including independently regenerated Python tied-rank fixtures.
Ruling: Skill bookkeeping helpers are Bash scripts, unavailable in this PowerShell environment; this committed ledger records the same task/ruling/test evidence directly.
Ruling: Conflicting same-timestamp endpoint values cannot confirm persistence; any value at/above threshold interrupts an unconfirmed candidate. This prevents dependence on import ordering; if a different aggregation is wanted, its algorithm and tests must change.
Ruling: Raw measurements drive observed endpoints and percent change as well as predictions, so aggregation cannot erase a recovery or fabricate a confirmation date. Prepared display fits remain separate; outputs must label that distinction.
Task2: endpoint/cohort tests 46/46 passed after 4 expected regression failures; UI/export wiring is next. Existing observed-event precedence and no-future-crossing guards are retained.

Task3: initial complete unit run passed 870/870 and production build passed. Browser regression exposed an obsolete expected sample-count reason (raw endpoint points now correctly report short span rather than quarterly-bin n<3), and a new test failed to open the existing settings disclosure; test navigation/expectation corrected.
Final review: three Important findings, no Critical or deferred minor findings. Legacy patient export omitted new endpoint fields; raw percent change still depended on display-fit validity; nonfinite input reached endpoint fitting before filtering. All three reproduced by failing tests, then fixed; targeted review regression suite 38/38 passed. Patient and cohort exports now share one record adapter.

Task3/Task4 complete: final full unit suite 873/873 in 101 files; production build passed; complete production Playwright suite 78/78 across Chromium, Firefox and WebKit with no retries. After bounding endpoint-detail text, final build and three endpoint workflows passed again, including 390px width assertions and screenshot inspection. Backlog, methodology, fixture provenance, changelog and dated test records updated. No review findings remain deferred. Research acceptance, remote PR updates and publication remain outside this implementation goal.
