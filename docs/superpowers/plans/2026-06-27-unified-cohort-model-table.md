# Unified Cohort Model Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two cohort mixed-model panels and the overlay OLS fallback with one store-owned result map, a React-free core orchestrator over uniform "entities" (whole cohort + each group), and a single results table with checkbox selection ("Fit selected").

**Architecture:** A core entity model + orchestrator (`runCohortMixedModels`) fits a list of entities sequentially over one reused webR worker. The store owns `cohortModelResults` (keyed by entity) plus a `runCohortModels` action that builds nothing itself — it runs caller-supplied entity rows, abortably. The UI is one `CohortModelPanel` (shared settings) + `CohortModelTable` (selection, fit, results, expandable details). The overlay reads results and draws real model mean lines only.

**Tech Stack:** TypeScript, React, Zustand, Observable Plot, Vitest + Testing Library, webR (mocked in tests).

## Global Constraints

- Domain-neutral: no genotype/ORPHA/disease strings or logic in `src/`.
- `pnpm exec tsc -b` and `pnpm vitest run` green after every task.
- Result point estimates + SDs only; no confidence intervals.
- Fits are user-triggered ("Fit selected"); changes invalidate, never auto-fit.
- Identity equality is the single staleness gate (`mixedModelIdentityEquals`).

---

### Task 1: Entity model (core)

**Files:**
- Create: `src/core/mixedModel/cohortModelEntity.ts`
- Test: `tests/core/mixedModel/cohortModelEntity.test.ts`

**Interfaces:**
- Produces: `type CohortModelEntity = { kind: 'cohort' } | { kind: 'group'; value: string }`; `entityKey(e): string`; `entityGroupValue(e): string | undefined`; `interface CohortModelEntityRows { entity: CohortModelEntity; rows: MixedModelSpikeRow[] }`.

- [ ] **Step 1: Write failing test** `tests/core/mixedModel/cohortModelEntity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { entityKey, entityGroupValue } from '../../../src/core/mixedModel/cohortModelEntity'

describe('cohort model entity', () => {
  it('keys the pooled cohort and groups without collision', () => {
    expect(entityKey({ kind: 'cohort' })).toBe('cohort')
    expect(entityKey({ kind: 'group', value: 'A' })).toBe('group:A')
    // a group literally named "cohort" must not collide with the pooled key
    expect(entityKey({ kind: 'group', value: 'cohort' })).toBe('group:cohort')
  })

  it('exposes the group value (undefined for the cohort)', () => {
    expect(entityGroupValue({ kind: 'cohort' })).toBeUndefined()
    expect(entityGroupValue({ kind: 'group', value: 'B' })).toBe('B')
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/core/mixedModel/cohortModelEntity.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/core/mixedModel/cohortModelEntity.ts`:

```ts
import type { MixedModelSpikeRow } from './types'

export type CohortModelEntity =
  | { kind: 'cohort' }
  | { kind: 'group'; value: string }

export interface CohortModelEntityRows {
  entity: CohortModelEntity
  rows: MixedModelSpikeRow[]
}

/** Stable map/selection key. 'cohort' for the pooled fit; 'group:<value>' for a
 * group. The prefix prevents a group named "cohort" from colliding. */
export function entityKey(entity: CohortModelEntity): string {
  return entity.kind === 'cohort' ? 'cohort' : `group:${entity.value}`
}

export function entityGroupValue(entity: CohortModelEntity): string | undefined {
  return entity.kind === 'group' ? entity.value : undefined
}
```

- [ ] **Step 4:** Run the test → PASS. Run `pnpm exec tsc -b` → clean.
- [ ] **Step 5: Commit** `feat: add cohort model entity model`.

---

### Task 2: Generalize orchestrator to `runCohortMixedModels` (core)

**Files:**
- Modify/replace: `src/core/mixedModel/groupedFit.ts` → rename export to `runCohortMixedModels`, input becomes entities.
- Test: replace `tests/core/mixedModel/groupedFit.test.ts` → `tests/core/mixedModel/runCohortMixedModels.test.ts`.

**Interfaces:**
- Consumes: `CohortModelEntityRows`, `entityKey`, `entityGroupValue` (Task 1); existing `buildMixedModelResultIdentity`, `jobFailure` shape, `RunMixedModelWorkerJobOptions`, `StoredMixedModelResult`.
- Produces: `runCohortMixedModels(params): Promise<Record<string, StoredMixedModelResult>>` where `params: { entities: CohortModelEntityRows[]; seriesIndex; seriesKey; fitConfigHash; engine?; config?; formula?; formulaKey?; datasetId?; runJob; signal? }`. Result keyed by `entityKey`, each `{ result, identity }`; identity's `groupValue` from the entity.

- [ ] **Step 1: Write failing test** `tests/core/mixedModel/runCohortMixedModels.test.ts` covering: runs once per entity in array order with `reuseWorker`; cohort identity has `groupValue` undefined, group identities carry their value; per-entity failure isolation (thrown + returned failure); abort short-circuit; already-aborted signal launches nothing. (Port the existing `groupedFit.test.ts` cases; the cohort entity replaces one group; assert `Object.keys(out)` are `entityKey`s like `['cohort','group:A']`.)
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Implement** by rewriting `groupedFit.ts` to iterate `params.entities` (array order, not `Object.entries`), build identity with `groupValue: entityGroupValue(entity)`, key results by `entityKey(entity)`. Keep the existing `jobFailure` helper and sequential/`reuseWorker`/abort logic verbatim. Export `runCohortMixedModels` and `type RunCohortMixedModelsParams`/`CohortModelStoredResult` as needed (reuse `StoredMixedModelResult` from store? No — core must not import the store). Define the return value type inline as `Record<string, { result: MixedModelResult; identity: MixedModelResultIdentity }>` and let the store treat it as `Record<string, StoredMixedModelResult>` (structurally identical).
- [ ] **Step 4:** Run the test → PASS; `tsc -b` clean. Delete the old `groupedFit.test.ts`.
- [ ] **Step 5: Commit** `refactor: generalize grouped fit into runCohortMixedModels`.

Note: array-order iteration fixes the old `Object.entries` numeric-reorder issue.

---

### Task 3: Store — `cohortModelResults` map + `runCohortModels` action (store)

**Files:**
- Modify: `src/ui/state/store.ts`
- Modify: `tests/ui/state/store.test.ts`

**Interfaces:**
- Produces (state): `cohortModelResults: Record<string, StoredMixedModelResult> | null`; `cohortModelRunning: boolean`.
- Produces (actions): `runCohortModels(params: { entities: CohortModelEntityRows[]; seriesIndex: number; seriesKey: string; fitConfigHash: string; config: MixedModelConfig; formula: string; runJob?: (o: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult> }): Promise<void>`; `clearMixedModelResult()` unchanged name.
- Removes: `mixedModelResult`, `mixedModelResultsByGroup`, `setMixedModelResult`, `setMixedModelResultsByGroup`.

- [ ] **Step 1: Update store tests** (`describe('useAppStore - cohort grouping')` + pooled tests): replace references to `mixedModelResult`/`mixedModelResultsByGroup`/`setMixedModelResult`/`setMixedModelResultsByGroup` with `cohortModelResults` keyed by `'cohort'`/`'group:A'`. Add tests:
  - defaults: `cohortModelResults` null, `cohortModelRunning` false.
  - `runCohortModels` with a mock `runJob` writes `cohortModelResults` keyed by entity (e.g. `['cohort','group:A']`) and toggles `cohortModelRunning` false at the end.
  - merge: running only group entities preserves an existing `'cohort'` result.
  - every invalidation site (`setMixedModelConfig`, `setSelectedPatientIds`, `setPatientAttributes`, `setCohortGroupByAttribute`, `setDataset`, `reset`) clears `cohortModelResults`.
- [ ] **Step 2:** Run `pnpm vitest run tests/ui/state/store.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `store.ts`:
  - In `AppState`: remove the two old fields + setters; add `cohortModelResults: Record<string, StoredMixedModelResult> | null`, `cohortModelRunning: boolean`, `runCohortModels: (...) => Promise<void>`, keep `clearMixedModelResult`, `showCohortMixedModelLine`.
  - `AppData` Pick + `initialState`: swap `mixedModelResult`/`mixedModelResultsByGroup` → `cohortModelResults`/`cohortModelRunning` (defaults `null`/`false`).
  - Module-scope: `let activeCohortModelRun: AbortController | null = null` and `function abortActiveCohortModelRun() { activeCohortModelRun?.abort(); activeCohortModelRun = null }`.
  - `clearedMixedModelResults()`:

```ts
const clearedMixedModelResults = (): Pick<AppData, 'cohortModelResults' | 'cohortModelRunning' | 'showCohortMixedModelLine'> => {
  abortActiveCohortModelRun()
  return { cohortModelResults: null, cohortModelRunning: false, showCohortMixedModelLine: false }
}
```

  - Action:

```ts
runCohortModels: async ({ entities, seriesIndex, seriesKey, fitConfigHash, config, formula, runJob = runMixedModelWorkerJob }) => {
  abortActiveCohortModelRun()
  const controller = new AbortController()
  activeCohortModelRun = controller
  set({ cohortModelRunning: true })
  try {
    const map = await runCohortMixedModels({
      entities, seriesIndex, seriesKey, fitConfigHash, config, formula,
      formulaKey: mixedModelFormulaKey(config), datasetId: 'cohort', runJob, signal: controller.signal,
    })
    if (controller.signal.aborted || activeCohortModelRun !== controller) return
    set((s) => ({ cohortModelResults: { ...(s.cohortModelResults ?? {}), ...map } }))
  } finally {
    if (activeCohortModelRun === controller) { activeCohortModelRun = null; set({ cohortModelRunning: false }) }
  }
},
```

  - Remove `setMixedModelResult`/`setMixedModelResultsByGroup`; `clearMixedModelResult: () => set(clearedMixedModelResults())` stays.
  - Add imports: `runCohortMixedModels`, `runMixedModelWorkerJob`, `mixedModelFormulaKey`, `CohortModelEntityRows`, `RunMixedModelWorkerJobOptions`, `MixedModelResult`.
- [ ] **Step 4:** Run store tests → PASS; `tsc -b` will still fail in UI files (next tasks).
- [ ] **Step 5: Commit** `refactor: store-owned cohortModelResults + runCohortModels action`.

---

### Task 4: `CohortModelTable` component (UI)

**Files:**
- Create: `src/ui/cohort/CohortModelTable.tsx`
- Create: `tests/ui/CohortModelTable.test.tsx`
- Modify: `src/ui/app.css` (reuse/extend `.mixed-model-grouped-*` styles into a `.cohort-model-table`).

**Interfaces:**
- Consumes: store `cohortModelResults`, `cohortModelRunning`, `runCohortModels`; `CohortModelEntity`, `entityKey`, `entityGroupValue`; `buildMixedModelResultIdentity`, `mixedModelIdentityEquals`, `validateMixedModelRows`.
- Produces: `CohortModelTable(props)` with props `{ entities: CohortModelEntityRows[]; entityLabels: Map<string,string>; entityColors: Map<string,string>; seriesIndex; seriesKey; seriesUnit; fitConfigHash; config; formula; runJob?: ... }`. Where `entities[0]` is the cohort, rest are groups (in group order).

Behavior:
- Build `rows`: for each entity, `{ entity, key: entityKey(entity), rows, nPatients, nMeasurements, eligible: validateMixedModelRows(rows, config).ok }`, dropping entities with 0 rows EXCEPT always keep the cohort row.
- Selection: `useState<Set<string>>` of entity keys, default = all eligible keys; recompute default when the eligible set changes.
- Stored result per row: `cohortModelResults?.[key]`, shown only if `mixedModelIdentityEquals(buildMixedModelResultIdentity({ seriesIndex, seriesKey, patientIds: rows.map(r=>r.patient_id), rows, fitConfigHash, groupValue: entityGroupValue(entity) }), stored.identity)` (stale guard).
- "Fit selected": build `CohortModelEntityRows[]` for selected eligible rows, call `runCohortModels({...})` with `runJob`.
- Columns: checkbox · label (+swatch for groups) · n patients · n measurements · slope (`x.xx unit/yr`) · intercept · status. `data-testid="cohort-model-row"` + `data-entity={key}`. Status `data-testid="cohort-model-status"`.
- Expandable details (`<details>` per row, `data-testid="cohort-model-details"`): random-effects SDs, residual SD, formula, engine, dataset/fit hashes.

- [ ] **Step 1: Write failing test** `tests/ui/CohortModelTable.test.tsx`: rows = cohort + groups in order; ineligible row has disabled checkbox + "Too few data to fit"; selecting + "Fit selected" submits exactly selected eligible entities (mock `runJob`) and renders slopes; a stored result with non-matching identity → "Not fitted"; details expander shows random-effects content. Use the real store (`reset()`); inject `runJob`. Reuse the `success(...)`/`eligibleGroupRows(...)` helpers ported from the old `CohortGroupedMixedModelPanel.test.tsx`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `CohortModelTable.tsx` per the behavior above (model the run/fit on `CohortGroupedMixedModelPanel.runPerGroup`, but call the store action instead of local orchestration). Read `cohortModelResults`/`cohortModelRunning` via `useAppStore`.
- [ ] **Step 4:** Run → PASS; `tsc -b` clean for this file.
- [ ] **Step 5: Commit** `feat: add unified cohort model results table`.

---

### Task 5: `CohortModelPanel` (settings + table) and wire into `CohortView` (UI)

**Files:**
- Create: `src/ui/cohort/CohortModelPanel.tsx`
- Modify: `src/ui/cohort/CohortView.tsx`
- Delete: `src/ui/cohort/CohortMixedModelPanel.tsx`, `src/ui/cohort/CohortGroupedMixedModelPanel.tsx`
- Modify: `tests/ui/CohortView.test.tsx`; delete `tests/ui/CohortGroupedMixedModelPanel.test.tsx` (cases moved to Task 4); delete/migrate `tests/ui/CohortMixedModelPanel.test.tsx` cases worth keeping into `CohortModelPanel`/table tests.

**Interfaces:**
- `CohortModelPanel(props)` props `{ rows: LabRow[]; patientIds: PatientId[]; groups: PatientGroup[]; groupColors: Map<string,string>; spec: CohortSeriesSpec; seriesIndex; seriesKey; seriesUnit; seriesLabel; fitConfigHash; config; formula; validateConfig; onConfigChange; runJob? }`.
- Builds entities: cohort = `{ entity: { kind:'cohort' }, rows: mixedModelRowsFromCohortInputs(rows, patientIds, spec) }`; groups (when `groups.length`) = `mixedModelRowsByGroup(rows, groups, spec)` mapped to `{ entity:{kind:'group',value}, rows }` in `groups` order. Pass to `CohortModelTable` with `entityLabels` ("Whole cohort" + group values) and `entityColors` (cohort → neutral, groups → `groupColors`).

- [ ] **Step 1:** Write/adjust `CohortView.test.tsx`: the single panel region (`aria-label="Cohort mixed model"`) renders when the dialog is open; with grouping active the table shows a "Whole cohort" row plus one row per group; without grouping only the cohort row. Remove assertions on the old two-panel/region split and the per-group panel region.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**:
  - `CohortModelPanel.tsx`: lift the settings JSX + `draftConfig`/`applyDraftConfig` logic from `CohortMixedModelPanel` (baseline age, random effects, formula preview, validation, "Apply settings"); drop the "Fit model" button and the `SuccessResult`/`FailureResult` rendering (now in the table). Compose: settings header + `<CohortModelTable .../>`.
  - `CohortView.tsx`: replace the two lazy panels with one lazy `CohortModelPanel`; pass `rows={displayRows}`, `patientIds`, `groups={cohortGroups}`, `groupColors={cohortGroupColorMap}`, `spec={specs[mixedModelSeriesIndex]}`, the existing `mixedModelSeriesKey`/`mixedModelPolicyHash`/`mixedModelConfig`/`mixedModelFormulaText`/units/label, `validateConfig`, `onConfigChange={setMixedModelConfig}`. Remove `mixedModelRows`, `mixedModelRowsByGroupValue`, `mixedModelResult*` reads/setters, and `CohortGroupedMixedModelPanel`/`CohortMixedModelPanel` imports.
  - Delete the two old panel files.
- [ ] **Step 4:** Run `CohortView.test.tsx` + the table test → PASS; `tsc -b` clean except overlay (Task 6).
- [ ] **Step 5: Commit** `feat: single CohortModelPanel replacing pooled+grouped panels`.

---

### Task 6: Overlay — remove OLS, read `cohortModelResults`, real lines only (UI)

**Files:**
- Modify: `src/ui/cohort/CohortTrajectoryOverlay.tsx`
- Modify: `tests/ui/CohortTrajectoryOverlay.test.tsx`

- [ ] **Step 1:** Update overlay tests: drop the test that asserts a per-group OLS line; keep/adjust "draws a per-group mixed-model mean line for groups with a successful grouped result" so groups WITHOUT a result draw **no** line (instead of OLS). Replace `setMixedModelResultsByGroup({...})` with `set cohortModelResults` keyed `'group:A'`, and the pooled-line tests' `setMixedModelResult` with `cohortModelResults['cohort']`. Add: with grouping active and no results, `cohort-group-mean-line` is absent.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**:
  - Read `cohortModelResults` from the store; derive `pooledStored = cohortModelResults?.['cohort']` and per-group via `cohortModelResults?.['group:'+value]`.
  - In `groupMeanLines`: remove the `olsSamples`/`fitOls` block and the `'ols'` kind; keep only the `mixedModelLineForGroup` branch (now reading `cohortModelResults['group:'+value]`); push a line only when `mixedPoints.length >= 2`. Keep `groupMixedModelRows` (identity rebuild). The line `kind` is always `'mixed'`; keep `data-kind` for tests or simplify to a single class.
  - Pooled `mixedModelLine` memo: source from `pooledStored` instead of `mixedModelResult`; keep `!groupingActive` gate and identity guard.
  - Remove the now-unused `fitOls` import.
- [ ] **Step 4:** Run overlay tests → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `refactor: overlay reads cohortModelResults, drops OLS group lines`.

---

### Task 7: Full sweep — dead code, full suite, exports

**Files:**
- Modify: any remaining references (grep), `tests/ui/exports.test.tsx` if it touched the old fields.

- [ ] **Step 1:** `grep -rn "mixedModelResultsByGroup\|setMixedModelResult\|CohortGroupedMixedModelPanel\|runGroupedMixedModel\|mixedModelRowsByGroupValue" src tests` → expect no hits (fix any stragglers).
- [ ] **Step 2:** Run `pnpm exec tsc -b` → clean.
- [ ] **Step 3:** Run `pnpm vitest run` → all green.
- [ ] **Step 4: Commit** `chore: remove dead per-group fit code paths`.

---

## Self-Review

- **Spec coverage:** entity model (T1) · central orchestrator (T2) · store map + action + abort/invalidation (T3) · table with selection/eligibility/details/stale-guard (T4) · single panel + CohortView wiring + remove old panels (T5) · overlay OLS removal + real lines (T6) · dead-code sweep (T7). All spec sections map to a task.
- **Placeholder scan:** none — code/edits specified per task.
- **Type consistency:** `entityKey`/`entityGroupValue`/`CohortModelEntityRows` (T1) used identically in T2–T6; `cohortModelResults` keyed by `entityKey` everywhere; `runCohortModels` params match the action in T3 and the call sites in T4. The orchestrator returns a structurally-`StoredMixedModelResult` map consumed by the store.
