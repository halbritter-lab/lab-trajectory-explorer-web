# Workspace completion backlog

Audit started 2026-09-23 against `feat/workspace-real-data` at `59c6834`.

Purpose: finish the outstanding workspace workflows, reconcile historical
requirements, and prepare research/user acceptance. An implemented feature is
not automatically accepted. Technical completion and verification are recorded
below; research/user acceptance remains separate.

Sources: open GitHub issues #2, #4 and #6 (read on 2026-09-23),
[requirements reconciliation](requirements-reconciliation.md),
[feature inventory](../prototypes/analysis-workspace/feature-audit.md),
[branch review](branch-review.md), [workspace acceptance](workspace-real-data.md),
and [endpoint readiness](research-endpoint-readiness.md).

## Current disposition (2026-09-23)

The technically specified workspace gaps have been implemented: guarded model
charts, local data resumption, explicit unreliable-fit markers, per-measurement
exclusion explanations, chart/ZIP exports, navigation guidance and narrow-screen
layouts. Sorting and the no-group option also received regression fixes.
The review findings on stale-tab storage and clear/import races were reproduced
and corrected. The subsequently approved numerical changes are now implemented
with explicit regression cases and documentation in [method algorithms](method-algorithms.md).

The approved method decisions and remaining acceptance needs are recorded in
[method decisions](remaining-method-decisions.md). Final verification of this
method package is recorded below. Remote PR/issue
bodies remain historical; this package updates repository documentation only.

Method-package verification: 873 unit/component tests in 101 files, production
build and 78 production-browser checks across Chromium, Firefox and WebKit
passed. Three independent review findings were reproduced and corrected.
Research-data acceptance remains open; see [dated test record](../tests/e2e/smoke.md).

## 1. Reconcile status and verify correctness

- [x] Check current issues and distinguish historical claims from recent code.
- [x] Update workspace documentation and feature inventory: real import,
  configurable individual fits, cohort-model fitting, and projections are
  implemented. Preserve historical test records with their dates.
- [x] Correct the workspace Methods text: it still describes OLS-only analysis
  without exclusions or time aggregation despite configurable analysis settings.
- [x] Review model-overlay identity and coordinate handling. `WorkspacePlot.tsx`
  now checks the same complete source identity as the result table, and uses
  prepared model rows and elapsed model time. Regression tests reproduce missing
  valid lines, stale previews, unit mismatches and non-converged curves. The
  full-cohort reference remains explicitly distinct from display filtering.
- [x] Verify result invalidation across parameter, unit, patient selection,
  events, demographic edits, analysis settings and model-factor changes, including
  the model preview, result table, projection and exports.
- [x] Reconcile PR #16's description with the final implementation when preparing
  its review. Do not close issues based on stale checkboxes or green CI alone.
  Done 2026-10-06; #6 closed against its scope checklist, #2 and #4 remain open.

Completion evidence: each requirement has a current code/test reference or an
explicit outstanding decision. Confirmed defects have a reproducer and regression.

## 2. Local storage and resumption

Implemented in `workspace-storage.ts`, with a separate versioned workspace key in
the app's own IndexedDB database. Since the former interface was removed
(2026-10-06), its saved data is deleted at start-up and the user is told once. A snapshot saves source labs,
events, attributes, manual demographics and derivation settings together; views
and model results reset. IndexedDB compare-and-swap tokens prevent stale tabs
from recreating deleted data or overwriting a newer snapshot.

- [x] Define a versioned workspace snapshot and its precise saved scope.
- [x] Add opt-in local saving, visible saved/error status and deletion controls.
- [x] Save source labs, events, patient attributes and manual demographic edits
  together; preserve derivation settings needed to reconstruct derived values.
- [x] Keep the existing seven-day expiry policy and state it in the interface.
- [x] Restore atomically before interaction; handle expired, malformed,
  unsupported and inaccessible storage without blocking imports.
- [x] Prevent pending writes from recreating a snapshot after deletion/opt-out.
- [x] Cover successful replacement, failed replacement and supplementary imports.
- [x] State clearly which analysis/view settings resume and which reset. Full
  named project management is a separate extension below.
- [x] Test reload and deletion in a real browser with actual workbook data.

## 3. Complete navigation and visualization acceptance (#2)

- [x] Check first-use guidance at navigation: Data prepares inputs, Trajectories
  compares individual courses, Cohort models estimates population associations.
- [x] Mark individual unreliable fits in the overlay. Dotted lines and accessible descriptions identify the affected patients,
  alongside the aggregate count.
- [x] Verify quality, AKI, rapid-decline and endpoint visibility across table,
  individual view and overlay; important warnings must remain accessible.
- [x] Verify SVG/PNG output for every intended plot, including model preview;
  check workbook/model/projection export provenance and unavailable results.
- [x] Audit remaining original-UI functionality, including patient workbook/ZIP
  paths, clear/reset controls and local storage, before replacing that UI.
- [x] Exercise a synthetic 200-patient, 12-parameter, 19,200-measurement cohort;
  verify search and scoped export. The table, detail and export share prepared
  analyses. Real-cohort performance acceptance remains pending below.
- [x] Run the browser workflows on Chromium, Firefox and WebKit, including narrow
  screens, grouping, missing data, keyboard-related navigation and downloads.
  Perform a real WebR fit separately; failure handling also has unit coverage.
  This is technical coverage, not first-user or real-device acceptance.

## 4. Explicit statistical and endpoint decisions (#4, #6)

The owner approved the choices in the [decision record](remaining-method-decisions.md).
Update numerical contracts and parity expectations explicitly during implementation.

- [x] Decide and document observed-event persistence, first-crossing and first
  confirmation dates, interruption before confirmation, and configurable minimum
  confirmation interval (90 days by default); G4/G5 defaults remain below 30/15.
- [x] Select all-data individual prediction continuing the fitted curve.
- [x] Select Theil-Sen minimum three observations, Python intercept convention
  and Python-reference slope confidence bounds.
- [x] Implement independent observed G4/G5 endpoints and confirmation settings
  consistently in calculations, labels and exports, with recovery shown separately.
- [x] Implement fitted-curve individual prediction using all dated numeric data;
  make its relationship to existing optional preparation settings explicit.
- [x] Implement the approved Theil-Sen contract and update parity fixtures.
- [x] Document every substantive algorithm and decision in methodology, settings
  help and export provenance; include worked examples, boundary behavior and tests.
- [ ] Accept factor models and projections with representative research data and
  questions; synthetic fixtures do not establish this acceptance. Checklist:
  [research-data acceptance](research-acceptance.md).

## 5. Retained extensions needing separate scope

These remain tracked; their earlier mention was not a complete specification.
For each item, obtain a concrete use case and either implement an approved scope
or record an explicit deferral. Do not silently mark them complete.

- [ ] Dated interventions: start/end/change/repeated treatments and their model.
- [ ] Optional event-time analysis: time origin, follow-up, censoring, competing
  events and desired output, separate from conditional trend projection.
- [ ] Arbitrary input-column mapping.
- [ ] Additional derived parameters and discipline-specific endpoint/event rules.
  The branch review's proposed discipline-module architecture is a suggestion,
  not an already accepted requirement to build a plugin system.
- [ ] Full saved projects, including reusable configurations and view state.
- [ ] Earlier exploratory estimators (change points, plateau/regime changes,
  bounded-value handling and local-density weighting): explicit disposition.

## 6. Integration and release acceptance

- [x] Run unit/component tests, production build and browser regression suite
  against the final work packages; perform code review and record actual results.
- [ ] Complete representative research-data and first-user acceptance using the
  [acceptance checklist](research-acceptance.md).
- [x] Resolve the stacked PR order (#15 then #16), update the target to main,
  and integrate reviewed work according to the release process. 2026-10-06: a
  final review against main found ten issues, fixed in `31f7aa0` with
  regression tests; #16 merged as `99f9bb9` (contains #15). CI passed on the
  PR head and on main. Nothing was published.
- [ ] Prepare version/changelog and complete-workflow release scope.
- [ ] Obtain release acceptance, then publish and verify deployment only when
  authorized. A merge or successful CI is not publication approval.

See [release process](release-process.md). Each implementation package should be
verified and committed independently; unfinished items remain visible here.
