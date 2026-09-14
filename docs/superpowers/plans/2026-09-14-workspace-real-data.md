# Real-data workspace implementation plan

> For agentic workers: use subagent-driven-development with isolated file ownership and task/whole-change review.

**Goal:** Complete the accepted import → quality/demographics → derivation → patient comparison → export workflow.
**Spec:** `docs/requirements-reconciliation.md` and `prototypes/analysis-workspace/feature-audit.md`, first workflow, approved in conversation.
**Architecture:** A React workspace at `/workspace.html` reuses the existing application store, import, analysis registry and numeric/export core. The prototype remains a visual reference. Existing root application is retained during acceptance; the workspace is included as a second Vite build entry for production-build testing, with no release/deploy action.
**Stack:** Existing React/TypeScript/Vite/Zustand/Observable Plot/SheetJS; no new dependencies.

## Constraints and contracts

- Branch `feat/workspace-real-data`, based on `7ceba27`; shared checkout with nonoverlapping file ownership. No worktree or branch operations by workers.
- Numerical core unchanged. All labels describe actual loaded data. No illustrative cohort fits on imported data. Cohort-model workspace integration and full fit configuration are subsequent workflow packages.
- Use existing session-only store; do not silently load/save patient data. Failed imports preserve current usable dataset; successful replacement resets dependent browser choices.
- Real IDs including strings, arbitrary parameter names and distinct units. No 3-series cap or fixed 48-person/12-parameter schema.
- Query/group filter/person selection affect table, overlay and export equally. Missing values remain visible/explained. Table has page vertical scroll and deliberate horizontal scroll, without pagination.
- Native controls/dialogs, keyboard access, responsive layout, chart downloads with research-use framing.

### Shared data module (`src/workspace/workspace-data.ts`, Task 1)

Exports:

```ts
interface WorkspaceParameter { key: string; label: string; bezeichnung: string; einheit: string | null; derived: boolean }
interface WorkspacePatient { id: PatientId; label: string; attributes: Record<string,string>; baselineAge: number | null }
interface WorkspaceData {
  rawRows: LabRow[]; rows: LabRow[]; fileName: string | null;
  parameters: WorkspaceParameter[]; patients: WorkspacePatient[];
  events: ClinicalEvent[]; patientAttributes: Record<string,Record<string,string>>;
  analysis: AnalysisResult; analysisSettings: AnalysisSettings;
  manualDemographics: Record<string,ManualDemographics>;
}
function useWorkspaceData(): WorkspaceData;
function workspaceSpecs(data: WorkspaceData, parameterKeys: string[]): CohortSeriesSpec[];
```

Parameter identity uses collision-safe serialization of name/unit. `workspaceSpecs` preserves requested order, uses existing general-exploration fit settings and actual events/analysis fit inputs. No implicit clinical exclusions beyond the existing selected general-exploration default. Display those settings honestly. Patient attributes include resolved demographics for grouping. `useWorkspaceData` memoizes data independently of unrelated store state. Dataset replacement can be detected via `rawRows` identity.

### UI components

- `DataWorkspace({onBrowse}: {onBrowse: (patientId?: PatientId) => void})`: Task 1.
- `TrajectoriesWorkspace({data, requestedPatientId}: {data: WorkspaceData; requestedPatientId?: PatientId | null})`: Task 2. Owns retained local parameter/query/person/mode/display state. Root keeps it mounted while switching pages, remounts on actual dataset replacement.
- `WorkspaceExportActions({data, parameterKeys, patientIds, cohortRows, patientId?})`: Task 3. `cohortRows: CohortRow[]` is the already prepared visible cohort, to avoid duplicate preparation for export summaries. Individual export scopes to `patientId`.
- `ChartExportActions({getSvg, title}: {getSvg: () => SVGSVGElement | null; title: string})`: Task 3. SVG/PNG export with visible failure state; added by Task 2 to each detail/overlay plot.

## Task 1: Data, quality, derivation and shared adapter

Owner: data agent. Files: `workspace-data.ts`, `DataWorkspace.tsx`, `data-workspace.css`, tests under `tests/workspace/data*`.

- [x] Test actual CSV/workbook loading, arbitrary IDs/units, replacement/failure, missing/conflicting demographics and derived-value updates.
- [x] Implement adapter using existing analysis registry/store; no numeric rewrites.
- [x] Build import, demo, template downloads, separate event/attribute uploads, file summary and accessible diagnostics.
- [x] Offer per-patient demographic correction with explicit age reference date and conflict visibility using existing resolver/describe helpers.
- [x] Implement eGFR off/source/formula (including EKFC), preview before apply, actual counts/reasons and no mutation of source rows.
- [x] Run focused tests, self-review, report changed files and results. Do not commit shared files or run full suite.

## Task 2: Patient browser and multi-parameter plots

Owner: trajectories agent. Files: `TrajectoriesWorkspace.tsx`, `WorkspacePlot.tsx` and optionally focused helper components, `trajectories-workspace.css`, tests `tests/workspace/trajectories*`.

- [x] Test arbitrary parameter/ID data and shared scope across table/detail/overlay; selection persists between views and resets after dataset replacement.
- [x] Searchable parameter picker with draft/apply/cancel, many columns and distinct units. Patient search/selection, group filter, ID/last-value sorting, previous/next/direct detail navigation.
- [x] Prepare cohort once with `buildCohortRows` and shared specs; reuse for table/detail/exports, show missing/no-fit and existing quality labels.
- [x] Real overlay per parameter; baseline/calendar/age axes, data-driven grouping, legend visibility, highlight, points/connect/events, keyboard open-person. No synthetic dates or values. Missing age must be explicit.
- [x] Display optional per-parameter fit lines/slope/R² from real cells, with clearly named current general-exploration OLS config; full config manager is deferred to next workflow.
- [x] Add Task 3 export components; run focused tests and report. No edits to shared model/export/root shell files.

## Task 3: Consistent patient/cohort and chart export

Owner: export agent. Files: `WorkspaceExports.tsx`, `workspace-export.ts`, optional `exports-workspace.css`, tests `tests/workspace/export*`.

- [x] Test actual downloaded workbook contents, selected scope, derived provenance, events/attributes, empty/unavailable cases.
- [x] Reuse existing patient/cohort XLSX core; scope all sheets to visible patients and parameters, record formula/source/settings and research-use statement.
- [x] Use prepared cohort rows for cohort summaries; raw/derived measurement meaning explicit. Preserve string IDs and units.
- [x] Provide SVG/PNG export component, safe filenames, errors, no empty silent downloads. Include research-use attribution in exported chart content.
- [x] Run focused tests and report; do not edit other workers' files.

## Task 4: Integration and acceptance

Owner: controller integration; independent reviewer after tasks land.

- [x] Add root workspace shell/main entry/style, Vite second build input and navigation retaining mounted browser. Real dataset status; cohort model page explains next integration without fake calculations.
- [x] Test shell navigation/empty and data replacement paths; resolve interface integration issues with owning agents.
- [x] Review each work package; fix substantive findings and re-review.
- [x] Run full tests/build and real Chromium workbook workflow including CSV/XLSX download inspection, formula change, person browsing, overlay and narrow screen.
- [x] Update manual smoke/implementation record and remaining feature inventory. No release, no merge.

## Progress

- Baseline at `7ceba27`: clean; 782 tests/build passed immediately before this task.
- Branch created; user approved workflow and explicit parallel subagents.
- Integration choice: separate built workspace entry preserves the accepted prototype and existing app during transition; layout follows prototype and all new outputs use real data.
- Parallel implementation: data adapter/UI (Task 1), trajectories (Task 2), exports (Task 3); controller owns shell and end-to-end checks. File ownership is disjoint.
- Initial integration: 805 tests / 97 files pass, build passes, two Chromium workflow tests pass (actual workbook/SVG/PNG downloads and narrow viewport/replacement).
- Task reviews found: bounded measurement labels, overlay reliability, palette stability, derived-selection continuity, precise/estimated age anchors, imported-computed naming collisions, UTC export dates and standalone chart context. Assigned to their owning agents with focused regressions.
- Integration review also requires the accepted table sparklines, sticky person columns and scroll restoration; these remain in Task 2's fix wave before completion.
- Task 1 fix round: collision blocked before apply; resolved birth anchor/estimate metadata added. Nine focused tests pass; independent re-review pending.

- All implementation and review fix packages completed. Graph table, shared scales,
  sticky columns, scroll/focus restoration and export context were re-reviewed.
- Verified: 814 tests / 97 files, final focused trajectory tests, production build,
  13 existing plus 3 new production-browser checks. See workspace acceptance record.
- Checkpoint commit `3f12763` secures the real-data workflow.
- User correction: English application language and regular incremental commits.
  Navigation translated in `804d3e0`; data, trajectories and exports being translated
  in parallel with separate ownership and follow-up verification.

- English correction complete: data `164dc57`, trajectories `92e3799`, exports
  `0873575`; final independent language/regression review clean.
- Final verified English tree: 814 tests / 97 files, production build, all 16
  Chromium tests in one run. English downloaded PNG visually checked.
- Acceptance record and smoke checklist updated. Branch remains separate; no
  release or merge. Next packages remain full fit settings and real cohort models.
