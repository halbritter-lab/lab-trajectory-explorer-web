# Unified Cohort Model Table And Central Fit Computation Design

## Goal

Make the cohort mixed-model computation **central and display-independent**, and
present all results — the pooled whole-cohort fit and the per-group fits — in
**one table** with a checkbox selection of what to fit. Remove the per-group OLS
"mean lines" from the overlay: they look like a model but are only OLS and were
never requested. The overlay keeps only **real** model mean lines (drawn once an
actual mixed model has been fit for that entity).

This supersedes the per-group UI introduced in
`2026-06-27-attribute-grouping-and-per-group-analysis-design.md`: the two
separate panels (pooled `CohortMixedModelPanel`, per-group
`CohortGroupedMixedModelPanel`) and the overlay OLS fallback are replaced by a
single panel + table over a single, store-owned result map.

Research and exploratory analysis only; not clinical decision support.

## Motivation (review findings this resolves)

- The per-group overlay "mean lines" fall back to OLS when no mixed model has
  run, presenting a non-model as a model; nobody asked for OLS. Remove it.
- The cohort model is computed inside the UI (the pooled fit runs in
  `CohortMixedModelPanel`, the per-group rows/fit live in `CohortView` and
  `CohortGroupedMixedModelPanel`, the overlay recomputes per-group rows again).
  Computation should live centrally and not depend on which view is mounted.
- Pooled and per-group results are two store shapes shown in two panels. They
  should be one uniform set shown in one table; "fit the whole cohort" and "fit
  per group" are complementary, selectable together.

## Scope

In scope:

1. A uniform **entity model**: the pooled cohort and each group are the same
   kind of thing to fit.
2. A **central core orchestrator** (`runCohortMixedModels`) generalizing the
   existing `runGroupedMixedModel` so the pooled cohort is just another entity.
3. A **store-owned result map** `cohortModelResults` plus a store action
   `runCohortModels(entities)` that builds rows, runs the orchestrator
   (abortable), and writes results — callable from anywhere, not display-bound.
4. A single **`CohortModelPanel`** (shared model settings) + **`CohortModelTable`**
   (one row per entity, checkbox selection, "Fit selected", core columns,
   expandable per-row technical details).
5. Overlay: remove the OLS fallback entirely; draw a model mean line only for
   entities with a successful, identity-matching result.

Non-goals (defer):

- Confidence intervals / standard errors (the result model exposes point
  estimates + SDs only; no CIs).
- Persisting the fit selection or results across reloads.
- Statistical group comparison (p-values, contrasts).
- Per-group endpoints/KM curves.
- Auto-fitting on every change (fits stay user-triggered via "Fit selected").

## Entity Model

New, in `src/core/mixedModel/` (e.g. `cohortModelEntity.ts`):

```ts
export type CohortModelEntity =
  | { kind: 'cohort' }
  | { kind: 'group'; value: string }

// Stable map/selection key. 'cohort' for the pooled fit; 'group:<value>' for a
// group. The 'group:' prefix avoids collision with the pooled key for any group
// value (including a group literally named "cohort").
export function entityKey(entity: CohortModelEntity): string
export function entityGroupValue(entity: CohortModelEntity): string | undefined
```

The pooled entity carries no `groupValue`; group entities carry their value.
`MixedModelResultIdentity` already holds an optional `groupValue`, so pooled
identities stay byte-for-byte unchanged (undefined) and group identities are
discriminated by it.

## Core Orchestrator

Generalize the existing `runGroupedMixedModel` (in
`src/core/mixedModel/groupedFit.ts`) into `runCohortMixedModels`:

```ts
export interface CohortModelEntityRows {
  entity: CohortModelEntity
  rows: MixedModelSpikeRow[]
}

export interface RunCohortMixedModelsParams {
  entities: CohortModelEntityRows[]   // iterated in array order
  seriesIndex: number
  seriesKey: string
  fitConfigHash: string
  engine?: MixedModelEngine
  config?: MixedModelConfig
  formula?: string
  formulaKey?: string
  datasetId?: string
  runJob: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
  signal?: AbortSignal
}

// Fit one mixed model per entity, sequentially, reusing one worker. Per-entity
// failures are isolated (a thrown error or failure result is recorded, others
// continue). Aborts launch no further entities. Returns a map keyed by
// entityKey, each value a StoredMixedModelResult (result + identity); the
// identity's groupValue is set from the entity (undefined for the cohort).
export async function runCohortMixedModels(
  params: RunCohortMixedModelsParams,
): Promise<Record<string, StoredMixedModelResult>>
```

Behavior is exactly today's `runGroupedMixedModel` (sequential, `reuseWorker`,
failure isolation via the shared `jobFailure` shape, abort short-circuit), with
the input being a list of entities (pooled + groups) instead of a `rowsByGroup`
record, and the output keyed by `entityKey`. The old `runGroupedMixedModel` is
removed (its tests are rewritten against `runCohortMixedModels`).

## Store Changes

`src/ui/state/store.ts`:

- **Remove** `mixedModelResult` and `mixedModelResultsByGroup` (and their
  setters `setMixedModelResult`, `setMixedModelResultsByGroup`).
- **Add** `cohortModelResults: Record<string, StoredMixedModelResult> | null`
  (default `null`), keyed by `entityKey`. The pooled result lives at key
  `'cohort'`, each group at `'group:<value>'`.
- **Add** `cohortModelRunning: boolean` (default `false`) for the button/spinner
  state.
- **Add** action `runCohortModels(entities: CohortModelEntityRows[])`:
  - aborts any in-flight run (module-scoped `AbortController` in the store
    module — not stored in serializable state),
  - sets `cohortModelRunning: true`,
  - calls `runCohortMixedModels(...)` with the active series/config/hash and a
    fresh signal,
  - on completion merges the returned results into `cohortModelResults`
    (so fitting only groups does not wipe a prior pooled result, and vice versa),
    then sets `cohortModelRunning: false`.
  - Consumers re-validate identity before display, so a late-returning run whose
    config was superseded is harmless (its identities will not match); the run is
    also aborted by the clearing setters below.
- **Keep** `showCohortMixedModelLine` + `setShowCohortMixedModelLine` as the
  single "show model mean lines" toggle (applies to whichever lines are active:
  pooled when grouping off, per-group when grouping on).
- `clearedMixedModelResults()` becomes:

  ```ts
  const clearedMixedModelResults = () => {
    abortActiveCohortModelRun()   // abort module-scoped controller if any
    return { cohortModelResults: null, cohortModelRunning: false, showCohortMixedModelLine: false }
  }
  ```

  Every existing call site (setDataset, setSelectedPatientIds,
  setCohortPatientMode, setSeriesConfig, removeSeries, setEgfrFormula/Source,
  setManualDemographics, setEvents, setSeriesFitPreset/Config,
  setMixedModelConfig, setCohortGroupByAttribute, setPatientAttributes,
  clearMixedModelResult) is unchanged in *where* it clears — only the cleared
  fields change. `clearMixedModelResult` stays as the public "clear" entry point.
- Update the `AppData` Pick and `initialState` to swap the two old fields for
  `cohortModelResults` + `cohortModelRunning`.

## UI: CohortModelPanel + CohortModelTable

`src/ui/cohort/CohortModelPanel.tsx` (replaces both `CohortMixedModelPanel` and
`CohortGroupedMixedModelPanel`):

- **Header — shared model settings** (lifted from today's `CohortMixedModelPanel`
  inline config): time axis (fixed `time_since_baseline`), baseline-age
  covariate checkbox, random-effects radio (`intercept` / `intercept_slope`),
  formula preview, validation message, "Apply settings". These configure the
  model used for every entity. "Apply settings" still routes through
  `setMixedModelConfig` (which clears results). The standalone "Fit model"
  button is gone — fitting is driven by the table.
- **Body — `CohortModelTable`** (`src/ui/cohort/CohortModelTable.tsx`):
  - One row per entity: always the **cohort** row; plus one row per group when
    grouping is active (in `groupPatients` order, so integer-like values are not
    reordered).
  - Columns: `☑` (checkbox) · Entity (label; "Whole cohort" for the pooled row,
    the group value + color swatch for group rows) · n patients · n measurements
    · Slope (`x.xx unit/yr`) · Intercept · Status.
  - Eligibility: each entity's rows pass the same `validateMixedModelRows(rows,
    config)` gate. Ineligible rows show a disabled checkbox and "Too few data to
    fit" and are never submitted.
  - Status text per row: "Not fitted" / slope / "<slope> (did not converge)" /
    "Fit failed: <message>" — and "Not fitted" when a stored result's identity
    no longer matches the row's current rows (stale guard, mirroring the
    overlay).
  - Per-row **expandable details** (a details row / `<details>`): random-effects
    SDs (intercept SD, slope SD, intercept-slope correlation), residual SD,
    formula, engine, dataset/fit-config hashes — the richer content from today's
    pooled `SuccessResult`.
  - Header controls: select-all / select-none, and **"Fit selected"** (disabled
    while running or when no eligible row is selected). Clicking it builds the
    `CohortModelEntityRows[]` for the *selected eligible* entities and calls
    `runCohortModels`.
  - **Selection** is local component state (ephemeral), defaulting to all
    eligible entities selected; results come from the store.
- The panel keeps the existing "Experimental" treatment and lazy-loading in
  `CohortView`.

`src/ui/cohort/CohortView.tsx`:
- Replace the two lazy panels with the one `CohortModelPanel`. `CohortView`
  passes the active series spec, `cohortGroups`, `cohortGroupColorMap`, and the
  cohort rows to the panel. The panel builds the `CohortModelEntityRows[]` with
  the pure core helpers (`mixedModelRowsFromCohortInputs` for the cohort entity,
  `mixedModelRowsByGroup` for the group entities) and calls
  `runCohortModels(entities)`; the per-group row building that lived in
  `CohortView` (`mixedModelRowsByGroupValue`) is removed. Keep `cohortGroups` /
  `cohortGroupColorMap` for the table swatches and the overlay legend.

## Overlay Changes

`src/ui/cohort/CohortTrajectoryOverlay.tsx`:

- **Remove** the per-group OLS fallback: the whole `olsSamples` / `fitOls`
  per-group block, the `groupMeanLines` OLS branch, and the now-unused `fitOls`
  import. Keep `groupMixedModelRows` — it is still needed to rebuild each group's
  identity for the mixed-line staleness guard below.
- **Keep** per-group **mixed-model** mean lines, drawn only when
  `cohortModelResults['group:<value>']` is a success **and** its identity matches
  the group's current rows/series/policy (the existing identity guard). No fit →
  no line for that group.
- **Pooled** line reads `cohortModelResults['cohort']` (replacing
  `mixedModelResult`), unchanged otherwise: shown when grouping is off, suppressed
  when grouping is on (per-group lines take over). Governed by
  `showCohortMixedModelLine`.
- Colors, legend, and per-group trajectory coloring are unchanged.

## Removed

- `src/ui/cohort/CohortGroupedMixedModelPanel.tsx` and its test.
- `src/ui/cohort/CohortMixedModelPanel.tsx` is refactored into
  `CohortModelPanel` (the rich `SuccessResult` rendering becomes the table's
  expandable details).
- The overlay OLS block and `fitOls` usage there.
- Store fields `mixedModelResult` / `mixedModelResultsByGroup` and their setters.

## Testing Strategy

Core (deterministic, mocked worker):
- `entityKey` / entity helpers: pooled vs group keys, no collision for a group
  named "cohort".
- `runCohortMixedModels`: mixed list (cohort + groups) runs once per entity in
  order with `reuseWorker`; per-entity failure isolation (thrown + failure
  result); abort short-circuit and already-aborted signal; identity stamped with
  the right `groupValue` (undefined for cohort).

Store:
- `runCohortModels` writes `cohortModelResults` keyed by entity and merges
  (fitting groups keeps a prior cohort result).
- `cohortModelRunning` toggles around a run.
- Every invalidation site clears `cohortModelResults` and aborts an in-flight
  run (config change, selected patients, attributes (re)import, dataset load,
  reset, grouping change).
- `initialState` / reset defaults: `cohortModelResults` null, `cohortModelRunning`
  false.

UI:
- `CohortModelTable`: rows = cohort (+ groups when grouping active) in group
  order; eligibility gating disables the checkbox and shows "Too few data to
  fit"; selecting entities + "Fit selected" submits exactly the selected
  eligible entities (worker mocked); results render slope / failure /
  non-converged; expandable details show random-effects SDs etc.; a stored
  result with a non-matching identity shows "Not fitted" (stale guard); the
  reference-vs-content publish robustness is covered by the store/orchestrator
  tests.
- `CohortView`: the single panel renders when the mixed-model dialog is open;
  the cohort row is always present, group rows appear when grouping is active.
- Overlay: no OLS lines ever; a per-group mixed line appears only for a group
  with a matching successful result, otherwise no line; pooled line behaves as
  before via `cohortModelResults['cohort']`; no lines when nothing is fit.

Full `pnpm vitest run` and `pnpm exec tsc -b` stay green; existing
mixed-model/overlay/export tests are migrated to the new store shape (no
behavioral regressions to the pooled fit, the table, the export, or grouping).

## Implementation Phases

1. Entity model + generalize core orchestrator to `runCohortMixedModels`
   (+ tests). Keep a thin shim only if needed during migration.
2. Store: swap to `cohortModelResults` + `cohortModelRunning` + `runCohortModels`
   + abort-aware `clearedMixedModelResults`; migrate store tests.
3. `CohortModelTable` + `CohortModelPanel` (settings header + table); wire into
   `CohortView`; remove the two old panels; migrate UI tests.
4. Overlay: remove OLS, read `cohortModelResults`, keep real lines only; migrate
   overlay tests.
5. Cleanup pass: dead code (old setters, `fitOls` import, duplicate helpers),
   final `tsc -b` + full suite.

## Acceptance Criteria

- The overlay never draws an OLS "mean line"; a per-group mean line appears only
  after a real mixed model is fit for that group (identity-matching), and the
  pooled line behaves as before when grouping is off.
- Cohort model computation runs through a single store action and a React-free
  core orchestrator; it does not depend on which view (table/overlay) is mounted.
- One table lists the whole cohort and every group, with per-row checkboxes,
  "Fit selected", core columns, and expandable technical details; the pooled and
  per-group fits are selectable and fit together.
- Fitting only groups preserves a prior whole-cohort result (and vice versa);
  any data/policy change invalidates results and aborts an in-flight run.
- Ineligible entities are listed but not fit; failed entities are isolated and do
  not abort the others.
- `pnpm vitest run` and `pnpm exec tsc -b` are green; no domain/dataset specifics
  enter the repo.
