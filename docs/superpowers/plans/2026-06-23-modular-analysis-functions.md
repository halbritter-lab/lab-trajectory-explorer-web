# Modular Analysis Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing eGFR, AKI, AKI-aware fit input, and rapid eGFR decline analyses behind a static typed analysis module registry while preserving current behavior.

**Architecture:** Add `src/core/analysis/` as the analysis boundary. The pipeline runs row-producing modules first, then event/fit-input modules over the derived rows; cohort-cell flags are exposed through module-owned helpers so rapid decline does not recalculate slopes. The UI store keeps compatibility setters but stores settings under `analysisSettings`.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest, Observable Plot.

---

## File Structure

- Create `src/core/analysis/types.ts`: shared analysis context/result/module types and lookup helpers.
- Create `src/core/analysis/egfrModule.ts`: eGFR module wrapping existing `src/core/egfr/series.ts`.
- Create `src/core/analysis/akiModule.ts`: AKI module wrapping existing `src/core/aki/*`, producing overlays and `aki-aware` fit inputs.
- Create `src/core/analysis/rapidEgfrDeclineModule.ts`: rapid eGFR decline flag helper owned by the analysis module boundary.
- Create `src/core/analysis/registry.ts`: default settings, static registry, and `computeAnalysisResult`.
- Modify `src/ui/state/store.ts`: move existing eGFR/AKI/rapid settings under `analysisSettings`, add `analysisResult()`, keep current setters.
- Modify `src/ui/shell/Sidebar.tsx`: read eGFR, AKI, and rapid settings through `analysisSettings`.
- Modify `src/ui/patient/OnePatientView.tsx`: use `analysisResult()` for rows and AKI fit inputs instead of direct `episodesForSeries`.
- Modify `src/ui/charts/SeriesPlot.tsx`: accept AKI overlays/fit inputs from the caller and avoid direct episode rediscovery.
- Modify `src/core/stats/summarize.ts`: accept optional precomputed AKI fit inputs for `aki-aware`.
- Modify `src/core/stats/slopeLines.ts`: already accepts episodes; keep signature and consume module-provided episodes from callers.
- Modify `src/core/cohort/screening.ts`: accept precomputed AKI fit inputs and module-owned rapid flag helper.
- Modify `src/ui/cohort/CohortView.tsx`: use `analysisResult()` rows/fit inputs/rapid flags.
- Keep persisted settings limited to `cohortZoom` and `rapidEgfrThreshold`; do not persist the full `analysisSettings` object in this plan.
- Add tests under `tests/core/analysis/`.
- Update focused UI/store tests under `tests/ui/`.

---

### Task 1: Analysis Types And Pipeline Skeleton

**Files:**
- Create: `src/core/analysis/types.ts`
- Create: `src/core/analysis/registry.ts`
- Test: `tests/core/analysis/registry.test.ts`

- [ ] **Step 1: Write failing tests for the pipeline merge behavior**

Create `tests/core/analysis/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { computeAnalysisResult } from '../../../src/core/analysis/registry'
import type { AnalysisModule, AnalysisSettings } from '../../../src/core/analysis/types'

function row(p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('computeAnalysisResult', () => {
  it('returns the original row reference when no module contributes rows', () => {
    const rows = [row()]
    const result = computeAnalysisResult({
      rows,
      manualDemographics: {},
      annotations: [],
      settings: {
        egfr: { formula: 'off', source: null },
        aki: { showOverlays: false, exclusionDays: 30 },
        rapidEgfrDecline: { threshold: 5 },
      },
      modules: [],
    })

    expect(result.rows).toBe(rows)
    expect(result.overlays).toEqual([])
    expect(result.fitInputs).toEqual([])
    expect(result.cohortFlags).toEqual([])
    expect(result.messages).toEqual([])
  })

  it('feeds rows contributed by an earlier module into later modules', () => {
    const rows = [row()]
    const computed = row({ bezeichnung: 'computed', wertNum: 2 })
    const seenRows: number[] = []
    const modules: AnalysisModule<AnalysisSettings>[] = [
      {
        id: 'append-row',
        label: 'Append row',
        defaultSettings: {
          egfr: { formula: 'off', source: null },
          aki: { showOverlays: false, exclusionDays: 30 },
          rapidEgfrDecline: { threshold: 5 },
        },
        apply: (ctx) => ({ rows: [...ctx.rows, computed] }),
      },
      {
        id: 'observe-rows',
        label: 'Observe rows',
        defaultSettings: {
          egfr: { formula: 'off', source: null },
          aki: { showOverlays: false, exclusionDays: 30 },
          rapidEgfrDecline: { threshold: 5 },
        },
        apply: (ctx) => {
          seenRows.push(ctx.rows.length)
          return {}
        },
      },
    ]

    const result = computeAnalysisResult({
      rows,
      manualDemographics: {},
      annotations: [],
      settings: {
        egfr: { formula: 'off', source: null },
        aki: { showOverlays: false, exclusionDays: 30 },
        rapidEgfrDecline: { threshold: 5 },
      },
      modules,
    })

    expect(result.rows).toEqual([rows[0], computed])
    expect(seenRows).toEqual([2])
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm vitest run tests/core/analysis/registry.test.ts
```

Expected: FAIL because `src/core/analysis/registry.ts` and `src/core/analysis/types.ts` do not exist.

- [ ] **Step 3: Add analysis types**

Create `src/core/analysis/types.ts`:

```ts
import type { ValidAnnotation } from '../annotations/annotations'
import type { AkiEpisode } from '../aki/kdigo'
import type { DateBand } from '../aki/akiAware'
import type { Source, FormulaName } from '../egfr/series'
import type { LabRow } from '../types'

export interface ManualDemographics {
  sex?: LabRow['patientSex']
  age?: number
}

export interface SeriesKey {
  bezeichnung: string
  einheit: string | null
}

export interface EgfrModuleSettings {
  formula: FormulaName | 'off'
  source: Source | null
}

export interface AkiModuleSettings {
  showOverlays: boolean
  exclusionDays: number
}

export interface RapidEgfrDeclineModuleSettings {
  threshold: number
}

export interface AnalysisSettings {
  egfr: EgfrModuleSettings
  aki: AkiModuleSettings
  rapidEgfrDecline: RapidEgfrDeclineModuleSettings
}

export interface AnalysisContext {
  rows: LabRow[]
  manualDemographics: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
}

export interface AnalysisMessage {
  id: string
  text: string
  severity: 'info' | 'warning'
}

export interface CohortFlagContribution {
  id: string
  patientId: number
  seriesKey?: SeriesKey
  label: string
  severity?: 'info' | 'warning'
}

export interface AnalysisOverlayContribution {
  id: string
  patientId: number
  seriesKey?: SeriesKey
  kind: 'event' | 'band'
  label: string
  start: Date
  end?: Date
  episode?: AkiEpisode
  band?: DateBand
}

export interface AnalysisFitInputContribution {
  id: string
  patientId: number
  seriesKey: SeriesKey
  kind: 'aki-aware'
  exclusionDays: number
  episodes: AkiEpisode[]
}

export interface AnalysisContribution {
  rows?: LabRow[]
  messages?: AnalysisMessage[]
  cohortFlags?: CohortFlagContribution[]
  overlays?: AnalysisOverlayContribution[]
  fitInputs?: AnalysisFitInputContribution[]
}

export interface AnalysisModule<TSettings> {
  id: string
  label: string
  defaultSettings: TSettings
  apply: (ctx: AnalysisContext, settings: TSettings) => AnalysisContribution
}

export interface AnalysisResult {
  rows: LabRow[]
  messages: AnalysisMessage[]
  cohortFlags: CohortFlagContribution[]
  overlays: AnalysisOverlayContribution[]
  fitInputs: AnalysisFitInputContribution[]
}

export function seriesKeyEquals(a: SeriesKey, b: SeriesKey): boolean {
  return a.bezeichnung === b.bezeichnung && (a.einheit ?? null) === (b.einheit ?? null)
}

export function fitInputForSeries(
  fitInputs: readonly AnalysisFitInputContribution[],
  patientId: number,
  seriesKey: SeriesKey,
): AnalysisFitInputContribution | undefined {
  return fitInputs.find((input) => input.patientId === patientId && seriesKeyEquals(input.seriesKey, seriesKey))
}
```

- [ ] **Step 4: Add registry skeleton**

Create `src/core/analysis/registry.ts`:

```ts
import type { AnalysisModule, AnalysisResult, AnalysisSettings, ManualDemographics } from './types'
import type { ValidAnnotation } from '../annotations/annotations'
import type { LabRow } from '../types'

export const defaultAnalysisSettings = (): AnalysisSettings => ({
  egfr: { formula: 'off', source: null },
  aki: { showOverlays: false, exclusionDays: 30 },
  rapidEgfrDecline: { threshold: 5 },
})

export interface ComputeAnalysisResultOptions {
  rows: LabRow[]
  manualDemographics: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
  settings: AnalysisSettings
  modules?: readonly AnalysisModule<AnalysisSettings>[]
}

export const analysisModules: readonly AnalysisModule<AnalysisSettings>[] = []

export function computeAnalysisResult({
  rows,
  manualDemographics,
  annotations,
  settings,
  modules = analysisModules,
}: ComputeAnalysisResultOptions): AnalysisResult {
  let currentRows = rows
  const result: AnalysisResult = {
    rows,
    messages: [],
    cohortFlags: [],
    overlays: [],
    fitInputs: [],
  }

  for (const module of modules) {
    const contribution = module.apply({ rows: currentRows, manualDemographics, annotations }, settings)
    if (contribution.rows) {
      currentRows = contribution.rows
      result.rows = contribution.rows
    }
    if (contribution.messages) result.messages.push(...contribution.messages)
    if (contribution.cohortFlags) result.cohortFlags.push(...contribution.cohortFlags)
    if (contribution.overlays) result.overlays.push(...contribution.overlays)
    if (contribution.fitInputs) result.fitInputs.push(...contribution.fitInputs)
  }

  return result
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
pnpm vitest run tests/core/analysis/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/analysis/types.ts src/core/analysis/registry.ts tests/core/analysis/registry.test.ts
git commit -m "feat: add analysis module pipeline"
```

---

### Task 2: eGFR Module And Store Settings

**Files:**
- Create: `src/core/analysis/egfrModule.ts`
- Modify: `src/core/analysis/registry.ts`
- Modify: `src/ui/state/store.ts`
- Modify: `src/ui/shell/Sidebar.tsx`
- Test: `tests/core/analysis/egfrModule.test.ts`
- Test: `tests/ui/state/store.test.ts`
- Test: `tests/ui/Sidebar.test.tsx`

- [ ] **Step 1: Write failing eGFR module tests**

Create `tests/core/analysis/egfrModule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { egfrModule } from '../../../src/core/analysis/egfrModule'
import { appendComputedEgfr, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/egfr/series'

function row(p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('egfrModule', () => {
  it('returns the original row reference when off and no manual demographics are applied', () => {
    const rows = [row()]
    const out = egfrModule.apply({ rows, manualDemographics: {}, annotations: [] }, { formula: 'off', source: null })
    expect(out.rows).toBe(rows)
  })

  it('matches appendComputedEgfr for enabled CKD-EPI 2021', () => {
    const rows = [row({ wertNum: 1.1 })]
    const expected = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: null })
    const out = egfrModule.apply({ rows, manualDemographics: {}, annotations: [] }, { formula: 'ckd-epi-2021', source: null })
    expect(out.rows).toEqual(expected)
    expect(out.rows?.some((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toBe(true)
  })

  it('applies manual demographics before computing eGFR', () => {
    const rows = [row({ patientSex: null, patientAgeAtLab: null })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: { sex: 'w', age: 64 } }, annotations: [] },
      { formula: 'ckd-epi-2021', source: null },
    )
    const computed = out.rows?.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX)) ?? []
    expect(computed).toHaveLength(1)
    expect(computed[0].patientSex).toBe('w')
    expect(computed[0].patientAgeAtLab).toBe(64)
  })
})
```

- [ ] **Step 2: Add failing store test for analysis settings**

Append this test to `tests/ui/state/store.test.ts`:

```ts
describe('analysis settings', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('stores eGFR settings under analysisSettings and displayRows uses the analysis pipeline', () => {
    useAppStore.getState().setDataset([
      row({ patientSex: 'm', patientAgeAtLab: 50, wertNum: 1.0 }),
    ])
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')

    const state = useAppStore.getState()
    expect(state.analysisSettings.egfr.formula).toBe('ckd-epi-2021')
    expect(state.egfrFormula).toBe('ckd-epi-2021')
    expect(state.displayRows().some((r) => r.bezeichnung?.includes('eGFR (CKD-EPI 2021, computed)'))).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm vitest run tests/core/analysis/egfrModule.test.ts tests/ui/state/store.test.ts
```

Expected: FAIL because `egfrModule` and `analysisSettings` do not exist yet.

- [ ] **Step 4: Add eGFR module implementation**

Create `src/core/analysis/egfrModule.ts`:

```ts
import { appendComputedEgfr } from '../egfr/series'
import type { LabRow } from '../types'
import type { AnalysisModule, EgfrModuleSettings, ManualDemographics } from './types'

function rowsWithManualDemographics(rows: LabRow[], manual: Record<number, ManualDemographics>): LabRow[] {
  if (Object.keys(manual).length === 0) return rows
  return rows.map((r) => {
    const demo = manual[r.patientId]
    return demo ? { ...r, patientSex: demo.sex ?? r.patientSex, patientAgeAtLab: demo.age ?? r.patientAgeAtLab } : r
  })
}

export const egfrModule: AnalysisModule<EgfrModuleSettings> = {
  id: 'egfr',
  label: 'eGFR',
  defaultSettings: { formula: 'off', source: null },
  apply: (ctx, settings) => {
    const withManual = rowsWithManualDemographics(ctx.rows, ctx.manualDemographics)
    if (settings.formula === 'off') return { rows: withManual }
    return { rows: appendComputedEgfr(withManual, { formula: settings.formula, source: settings.source }) }
  },
}
```

- [ ] **Step 5: Register eGFR module with typed adapter**

Modify `src/core/analysis/registry.ts`:

```ts
import { egfrModule } from './egfrModule'
import type {
  AnalysisContribution,
  AnalysisModule,
  AnalysisResult,
  AnalysisSettings,
  ManualDemographics,
} from './types'
import type { ValidAnnotation } from '../annotations/annotations'
import type { LabRow } from '../types'

export const defaultAnalysisSettings = (): AnalysisSettings => ({
  egfr: { ...egfrModule.defaultSettings },
  aki: { showOverlays: false, exclusionDays: 30 },
  rapidEgfrDecline: { threshold: 5 },
})

export interface ComputeAnalysisResultOptions {
  rows: LabRow[]
  manualDemographics: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
  settings: AnalysisSettings
  modules?: readonly AnalysisModule<AnalysisSettings>[]
}

function adaptModule<K extends keyof AnalysisSettings>(
  key: K,
  module: AnalysisModule<AnalysisSettings[K]>,
): AnalysisModule<AnalysisSettings> {
  return {
    id: module.id,
    label: module.label,
    defaultSettings: defaultAnalysisSettings(),
    apply: (ctx, settings): AnalysisContribution => module.apply(ctx, settings[key]),
  }
}

export const analysisModules: readonly AnalysisModule<AnalysisSettings>[] = [
  adaptModule('egfr', egfrModule),
]

export function computeAnalysisResult({
  rows,
  manualDemographics,
  annotations,
  settings,
  modules = analysisModules,
}: ComputeAnalysisResultOptions): AnalysisResult {
  let currentRows = rows
  const result: AnalysisResult = {
    rows,
    messages: [],
    cohortFlags: [],
    overlays: [],
    fitInputs: [],
  }

  for (const module of modules) {
    const contribution = module.apply({ rows: currentRows, manualDemographics, annotations }, settings)
    if (contribution.rows) {
      currentRows = contribution.rows
      result.rows = contribution.rows
    }
    if (contribution.messages) result.messages.push(...contribution.messages)
    if (contribution.cohortFlags) result.cohortFlags.push(...contribution.cohortFlags)
    if (contribution.overlays) result.overlays.push(...contribution.overlays)
    if (contribution.fitInputs) result.fitInputs.push(...contribution.fitInputs)
  }

  return result
}
```

- [ ] **Step 6: Move store eGFR settings under analysisSettings**

In `src/ui/state/store.ts`, update imports:

```ts
import { computeAnalysisResult, defaultAnalysisSettings } from '../../core/analysis/registry'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../../core/analysis/types'
import type { FormulaName, Source } from '../../core/egfr/series'
```

Remove the local `ManualDemographics` interface and the `appendComputedEgfr` import.

In `AppState`, add `analysisSettings` and `analysisResult()` while preserving compatibility fields:

```ts
  analysisSettings: AnalysisSettings
  egfrFormula: FormulaName | 'off'
  egfrSource: Source | null
  manualDemographics: Record<number, ManualDemographics>
  analysisResult: () => AnalysisResult
  displayRows: () => LabRow[]
```

In `AppData`, include `analysisSettings`.

In `initialState()`, replace the eGFR defaults with:

```ts
  analysisSettings: defaultAnalysisSettings(),
  egfrFormula: 'off',
  egfrSource: null,
```

Replace the old eGFR cache with:

```ts
let analysisCache: {
  rows: LabRow[]
  settings: AnalysisSettings
  manual: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
  result: AnalysisResult
} | null = null

function computeStoreAnalysisResult(
  rows: LabRow[],
  settings: AnalysisSettings,
  manual: Record<number, ManualDemographics>,
  annotations: ValidAnnotation[],
): AnalysisResult {
  if (
    analysisCache &&
    analysisCache.rows === rows &&
    analysisCache.settings === settings &&
    analysisCache.manual === manual &&
    analysisCache.annotations === annotations
  ) return analysisCache.result

  const result = computeAnalysisResult({ rows, settings, manualDemographics: manual, annotations })
  analysisCache = { rows, settings, manual, annotations, result }
  return result
}
```

Update setters:

```ts
  setDataset: (rows, fileName) => {
    const ids = [...new Set(rows.map((r) => r.patientId))].sort((a, b) => a - b)
    set((s) => ({
      rows,
      fileName: fileName ?? null,
      selectedPatientId: ids[0] ?? null,
      selectedPatientIds: ids,
      view: 'cohort',
      returnToCohort: false,
      egfrSource: null,
      analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: null } },
    }))
    if (get().persist) void saveDataset(rows, fileName ?? null)
  },
  setEgfrFormula: (f) => set((s) => ({
    egfrFormula: f,
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, formula: f } },
  })),
  setEgfrSource: (src) => set((s) => ({
    egfrSource: src,
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: src } },
  })),
  analysisResult: () => {
    const s = get()
    return computeStoreAnalysisResult(s.rows, s.analysisSettings, s.manualDemographics, s.annotations)
  },
  displayRows: () => get().analysisResult().rows,
```

- [ ] **Step 7: Keep Sidebar selectors compatible**

In `src/ui/shell/Sidebar.tsx`, change the selectors for eGFR values to prefer `analysisSettings`:

```ts
  const analysisSettings = useAppStore((s) => s.analysisSettings)
  const egfrFormula = analysisSettings.egfr.formula
  const egfrSource = analysisSettings.egfr.source
```

Keep using `setEgfrFormula` and `setEgfrSource`.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm vitest run tests/core/analysis/registry.test.ts tests/core/analysis/egfrModule.test.ts tests/ui/state/store.test.ts tests/ui/Sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/analysis/egfrModule.ts src/core/analysis/registry.ts src/ui/state/store.ts src/ui/shell/Sidebar.tsx tests/core/analysis/egfrModule.test.ts tests/ui/state/store.test.ts tests/ui/Sidebar.test.tsx
git commit -m "feat: migrate egfr into analysis module"
```

---

### Task 3: AKI Module And AKI-Aware Fit Inputs

**Files:**
- Create: `src/core/analysis/akiModule.ts`
- Modify: `src/core/analysis/registry.ts`
- Modify: `src/core/stats/summarize.ts`
- Modify: `src/core/cohort/screening.ts`
- Modify: `src/ui/patient/OnePatientView.tsx`
- Modify: `src/ui/charts/SeriesPlot.tsx`
- Test: `tests/core/analysis/akiModule.test.ts`
- Test: `tests/core/cohort/screening.test.ts`
- Test: `tests/ui/akiOverlay.test.tsx`

- [ ] **Step 1: Write failing AKI module tests**

Create `tests/core/analysis/akiModule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { akiModule } from '../../../src/core/analysis/akiModule'

function row(date: string, value: number, p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: String(value),
    wertNum: value,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('akiModule', () => {
  const spiky = [
    row('2020-01-01T00:00:00Z', 1.0),
    row('2020-01-02T00:00:00Z', 1.6),
    row('2020-02-01T00:00:00Z', 1.0),
  ]

  it('always contributes aki-aware fit inputs for eligible series', () => {
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, annotations: [] }, { showOverlays: false, exclusionDays: 30 })
    expect(out.fitInputs).toHaveLength(1)
    expect(out.fitInputs?.[0]).toMatchObject({
      patientId: 1,
      seriesKey: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' },
      kind: 'aki-aware',
      exclusionDays: 30,
    })
    expect(out.fitInputs?.[0].episodes).toHaveLength(1)
    expect(out.overlays).toEqual([])
  })

  it('contributes event and band overlays only when showOverlays is true', () => {
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, annotations: [] }, { showOverlays: true, exclusionDays: 30 })
    expect(out.fitInputs?.[0].episodes).toHaveLength(1)
    expect(out.overlays?.some((o) => o.kind === 'event')).toBe(true)
    expect(out.overlays?.some((o) => o.kind === 'band')).toBe(true)
  })

  it('creates cross-series fit inputs for computed eGFR using creatinine-derived episodes', () => {
    const egfrRows = spiky.map((r) => ({
      ...r,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: 'ml/min/1,73m²',
      wertNum: 80 - (r.wertNum ?? 0),
    }))
    const out = akiModule.apply({ rows: [...spiky, ...egfrRows], manualDemographics: {}, annotations: [] }, { showOverlays: false, exclusionDays: 30 })
    const egfrInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung.includes('eGFR'))
    expect(egfrInput?.episodes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm vitest run tests/core/analysis/akiModule.test.ts
```

Expected: FAIL because `akiModule` does not exist.

- [ ] **Step 3: Implement AKI module**

Create `src/core/analysis/akiModule.ts`:

```ts
import { akiExclusionBands, episodesForSeries } from '../aki/akiAware'
import type { AkiEpisode } from '../aki/kdigo'
import type { LabRow } from '../types'
import type { AkiModuleSettings, AnalysisModule, AnalysisOverlayContribution, SeriesKey } from './types'

function distinctNumericSeries(rows: LabRow[]): Array<{ patientId: number; seriesKey: SeriesKey }> {
  const seen = new Map<string, { patientId: number; seriesKey: SeriesKey }>()
  for (const r of rows) {
    if (r.bezeichnung === null || r.labDatum === null || r.wertNum === null) continue
    const seriesKey = { bezeichnung: r.bezeichnung, einheit: r.einheit ?? null }
    const key = `${r.patientId}|${seriesKey.bezeichnung}|${seriesKey.einheit ?? ''}`
    if (!seen.has(key)) seen.set(key, { patientId: r.patientId, seriesKey })
  }
  return [...seen.values()]
}

function overlaysForEpisodes(
  patientId: number,
  seriesKey: SeriesKey,
  episodes: AkiEpisode[],
  exclusionDays: number,
): AnalysisOverlayContribution[] {
  const events = episodes.map((episode) => ({
    id: `aki-event:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}:${episode.date.toISOString()}`,
    patientId,
    seriesKey,
    kind: 'event' as const,
    label: `AKI stage ${episode.stage}`,
    start: episode.date,
    episode,
  }))
  const bands = akiExclusionBands(episodes, exclusionDays).map((band) => ({
    id: `aki-band:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}:${band.start.toISOString()}`,
    patientId,
    seriesKey,
    kind: 'band' as const,
    label: 'AKI exclusion window',
    start: band.start,
    end: band.end,
    band,
  }))
  return [...events, ...bands]
}

export const akiModule: AnalysisModule<AkiModuleSettings> = {
  id: 'aki',
  label: 'AKI',
  defaultSettings: { showOverlays: false, exclusionDays: 30 },
  apply: (ctx, settings) => {
    const fitInputs = []
    const overlays: AnalysisOverlayContribution[] = []

    for (const { patientId, seriesKey } of distinctNumericSeries(ctx.rows)) {
      const episodes = episodesForSeries(ctx.rows, patientId, seriesKey.bezeichnung, seriesKey.einheit)
      fitInputs.push({
        id: `aki-aware:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}`,
        patientId,
        seriesKey,
        kind: 'aki-aware' as const,
        exclusionDays: settings.exclusionDays,
        episodes,
      })
      if (settings.showOverlays && episodes.length > 0) {
        overlays.push(...overlaysForEpisodes(patientId, seriesKey, episodes, settings.exclusionDays))
      }
    }

    return { fitInputs, overlays }
  },
}
```

- [ ] **Step 4: Register AKI module and move `showAki` into analysis settings**

Modify `src/core/analysis/registry.ts` imports and registry:

```ts
import { akiModule } from './akiModule'
import { egfrModule } from './egfrModule'
```

Update defaults:

```ts
  aki: { ...akiModule.defaultSettings },
```

Update registry:

```ts
export const analysisModules: readonly AnalysisModule<AnalysisSettings>[] = [
  adaptModule('egfr', egfrModule),
  adaptModule('aki', akiModule),
]
```

Modify `src/ui/state/store.ts`:

```ts
  setShowAki: (v) => set((s) => ({
    showAki: v,
    analysisSettings: { ...s.analysisSettings, aki: { ...s.analysisSettings.aki, showOverlays: v } },
  })),
```

In `initialState()`, keep `showAki: false` and rely on `defaultAnalysisSettings().aki.showOverlays === false`.

- [ ] **Step 5: Update `summarizeByBezeichnung` to accept fit inputs**

Modify `src/core/stats/summarize.ts` imports:

```ts
import { fitInputForSeries } from '../analysis/types'
import type { AnalysisFitInputContribution } from '../analysis/types'
```

Add to `SummarizeParams`:

```ts
  fitInputs?: AnalysisFitInputContribution[]
```

Destructure:

```ts
  const { gapDays = 180, windowDays = 730, stepDays = 180, minNPerWindow = 3, minNPerSegment = 3, exclusionDays = 30, cutoffDays = 90, eventDates = [], fitInputs = [] } = params
```

Replace the AKI-aware branch episode lookup:

```ts
      const input = fitInputForSeries(fitInputs, patientId, { bezeichnung: base.bezeichnung, einheit: first.einheit ?? null })
      const episodes = input?.episodes ?? episodesForSeries(sub, patientId, first.bezeichnung, first.einheit)
      const r = fitAkiAware(points, input?.exclusionDays ?? exclusionDays, episodes)
```

- [ ] **Step 6: Update cohort building to consume fit inputs**

Modify `src/core/cohort/screening.ts` imports:

```ts
import { fitInputForSeries } from '../analysis/types'
import type { AnalysisFitInputContribution } from '../analysis/types'
```

Add optional `fitInputs` to `CohortSeriesSpec`:

```ts
  fitInputs?: AnalysisFitInputContribution[]
```

Pass it into `summarizeByBezeichnung`:

```ts
        fitInputs: spec.fitInputs,
```

Replace local episode lookup:

```ts
      const fitInput = fitInputForSeries(spec.fitInputs ?? [], pid, { bezeichnung: spec.bezeichnung, einheit: spec.einheit ?? null })
      let episodes: AkiEpisode[] = []
      if (points.length > 0) {
        episodes = fitInput?.episodes ?? episodesForSeries(prows, pid, spec.bezeichnung, spec.einheit ?? null)
      }
```

Use `fitInput?.exclusionDays` for `exclusionDays`:

```ts
      const exclusionDays = fitInput?.exclusionDays ?? spec.exclusionDays ?? 30
```

- [ ] **Step 7: Update OnePatientView to consume analysis result**

Modify `src/ui/patient/OnePatientView.tsx`:

Remove:

```ts
import { episodesForSeries } from '../../core/aki/akiAware'
```

Add:

```ts
import { fitInputForSeries } from '../../core/analysis/types'
```

Replace:

```ts
  const displayRows = useAppStore((s) => s.displayRows())
```

with:

```ts
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
```

Replace detected episodes in the render loop:

```ts
        const fitInput = fitInputForSeries(analysisResult.fitInputs, patientId, { bezeichnung: cfg.bezeichnung, einheit: cfg.einheit ?? null })
        const episodes = fitInput?.episodes.length ? fitInput.episodes : undefined
```

- [ ] **Step 8: Keep SeriesPlot episode logic caller-driven**

Modify `src/ui/charts/SeriesPlot.tsx` so legend and overlay episode lookup only use passed episodes or creatinine self-detection as fallback:

```ts
  const legendEpisodes = showAki && points.length > 0
    ? (episodes ?? (creatinine ? findKdigoAkiEpisodes(points) : []))
    : []
```

Keep the existing fallback for direct tests, but do not import `episodesForSeries` here.

- [ ] **Step 9: Update CohortView to pass fit inputs**

Modify `src/ui/cohort/CohortView.tsx`:

Replace:

```ts
  const displayRows = useAppStore((s) => s.displayRows())
```

with:

```ts
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
```

Add `fitInputs` to every spec:

```ts
      fitInputs: analysisResult.fitInputs,
```

Add `analysisResult.fitInputs` to the `useMemo` dependency list.

- [ ] **Step 10: Run focused AKI tests**

Run:

```bash
pnpm vitest run tests/core/analysis/akiModule.test.ts tests/core/cohort/screening.test.ts tests/ui/akiOverlay.test.tsx tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/core/analysis/akiModule.ts src/core/analysis/registry.ts src/core/stats/summarize.ts src/core/cohort/screening.ts src/ui/patient/OnePatientView.tsx src/ui/charts/SeriesPlot.tsx src/ui/cohort/CohortView.tsx tests/core/analysis/akiModule.test.ts tests/core/cohort/screening.test.ts tests/ui/akiOverlay.test.tsx tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx
git commit -m "feat: migrate aki analysis into module"
```

---

### Task 4: Rapid eGFR Decline Module And Cohort Flags

**Files:**
- Create: `src/core/analysis/rapidEgfrDeclineModule.ts`
- Modify: `src/core/analysis/registry.ts`
- Modify: `src/core/cohort/screening.ts`
- Modify: `src/ui/cohort/CohortView.tsx`
- Modify: `src/ui/shell/Sidebar.tsx`
- Modify: `src/ui/state/store.ts`
- Test: `tests/core/analysis/rapidEgfrDeclineModule.test.ts`
- Test: `tests/core/cohort/exportRecords.test.ts`
- Test: `tests/ui/CohortView.test.tsx`

- [ ] **Step 1: Write failing rapid decline module tests**

Create `tests/core/analysis/rapidEgfrDeclineModule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rapidEgfrDeclineModule, rapidEgfrDeclineFlagForCell } from '../../../src/core/analysis/rapidEgfrDeclineModule'

describe('rapidEgfrDeclineModule', () => {
  it('exposes default threshold matching current KDIGO rapid progression default', () => {
    expect(rapidEgfrDeclineModule.defaultSettings.threshold).toBe(5)
  })

  it('flags only eGFR-unit cells declining faster than the threshold', () => {
    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: 'ml/min/1,73m²',
      slope: -6,
      threshold: 5,
    })).toMatchObject({
      id: 'rapid-egfr-decline:7:eGFR (CKD-EPI 2021, computed):ml/min/1,73m²',
      patientId: 7,
      label: 'rapid ↓',
      severity: 'warning',
    })

    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      slope: -6,
      threshold: 5,
    })).toBeNull()

    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      slope: -6,
      threshold: 0,
    })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm vitest run tests/core/analysis/rapidEgfrDeclineModule.test.ts
```

Expected: FAIL because the module file does not exist.

- [ ] **Step 3: Implement rapid decline module helper**

Create `src/core/analysis/rapidEgfrDeclineModule.ts`:

```ts
import type { AnalysisModule, CohortFlagContribution, RapidEgfrDeclineModuleSettings } from './types'

export const RAPID_EGFR_DECLINE_DEFAULT = 5

export function isEgfrUnit(einheit: string | null): boolean {
  return einheit != null && einheit.toLowerCase().includes('ml/min')
}

export function isRapidEgfrDecline(einheit: string | null, slope: number, threshold: number): boolean {
  return threshold > 0 && isEgfrUnit(einheit) && Number.isFinite(slope) && slope < -threshold
}

export const rapidEgfrDeclineModule: AnalysisModule<RapidEgfrDeclineModuleSettings> = {
  id: 'rapid-egfr-decline',
  label: 'Rapid eGFR decline',
  defaultSettings: { threshold: RAPID_EGFR_DECLINE_DEFAULT },
  apply: () => ({}),
}

export interface RapidEgfrDeclineFlagInput {
  patientId: number
  bezeichnung: string
  einheit: string | null
  slope: number
  threshold: number
}

export function rapidEgfrDeclineFlagForCell(input: RapidEgfrDeclineFlagInput): CohortFlagContribution | null {
  if (!isRapidEgfrDecline(input.einheit, input.slope, input.threshold)) return null
  return {
    id: `rapid-egfr-decline:${input.patientId}:${input.bezeichnung}:${input.einheit ?? ''}`,
    patientId: input.patientId,
    seriesKey: { bezeichnung: input.bezeichnung, einheit: input.einheit },
    label: 'rapid ↓',
    severity: 'warning',
  }
}
```

- [ ] **Step 4: Register rapid module**

Modify `src/core/analysis/registry.ts`:

```ts
import { rapidEgfrDeclineModule } from './rapidEgfrDeclineModule'
```

Defaults:

```ts
  rapidEgfrDecline: { ...rapidEgfrDeclineModule.defaultSettings },
```

Registry:

```ts
export const analysisModules: readonly AnalysisModule<AnalysisSettings>[] = [
  adaptModule('egfr', egfrModule),
  adaptModule('aki', akiModule),
  adaptModule('rapidEgfrDecline', rapidEgfrDeclineModule),
]
```

- [ ] **Step 5: Move rapid threshold into analysis settings**

Modify `src/ui/state/store.ts`:

```ts
  setRapidEgfrThreshold: (n) => {
    const threshold = Number.isFinite(n) ? Math.max(0, n) : 0
    set((s) => ({
      rapidEgfrThreshold: threshold,
      analysisSettings: {
        ...s.analysisSettings,
        rapidEgfrDecline: { ...s.analysisSettings.rapidEgfrDecline, threshold },
      },
    }))
    if (get().persist) void saveSettings({ cohortZoom: get().cohortZoom, rapidEgfrThreshold: threshold })
  },
```

Modify `src/ui/shell/Sidebar.tsx` rapid threshold selector:

```ts
  const rapidEgfrThreshold = useAppStore((s) => s.analysisSettings.rapidEgfrDecline.threshold)
```

- [ ] **Step 6: Use module-owned flag helper in CohortView**

Modify `src/ui/cohort/CohortView.tsx` imports:

```ts
import { rapidEgfrDeclineFlagForCell } from '../../core/analysis/rapidEgfrDeclineModule'
```

Replace the badge condition:

```tsx
                  {rapidEgfrDeclineFlagForCell({
                    patientId: r.patientId,
                    bezeichnung: c.bezeichnung,
                    einheit: c.einheit,
                    slope: c.slope,
                    threshold: rapidThreshold,
                  }) && (
                    <span className="rapid-badge" title={`Rapid eGFR decline: faster than ${rapidThreshold} mL/min/1.73m²/yr (KDIGO rapid progression)`}>rapid ↓</span>
                  )}
```

- [ ] **Step 7: Move rapid helper ownership out of screening and use it in exports**

Modify `src/core/cohort/screening.ts` imports:

```ts
import {
  isEgfrUnit,
  isRapidEgfrDecline,
  RAPID_EGFR_DECLINE_DEFAULT,
  rapidEgfrDeclineFlagForCell,
} from '../analysis/rapidEgfrDeclineModule'
```

Delete the local `RAPID_EGFR_DECLINE_DEFAULT`, `isEgfrUnit`, and `isRapidEgfrDecline` definitions from `screening.ts`. The imported names remain exported by adding this line near the imports:

```ts
export { isEgfrUnit, isRapidEgfrDecline, RAPID_EGFR_DECLINE_DEFAULT } from '../analysis/rapidEgfrDeclineModule'
```

In `cohortExportRecords`, replace:

```ts
        rapid_progression: isRapidEgfrDecline(c.einheit, c.slope, rapidThreshold) ? 'yes' : '',
```

with:

```ts
        rapid_progression: rapidEgfrDeclineFlagForCell({
          patientId: r.patientId,
          bezeichnung: c.bezeichnung,
          einheit: c.einheit,
          slope: c.slope,
          threshold: rapidThreshold,
        }) ? 'yes' : '',
```

This preserves the existing `screening.ts` public exports while making `rapidEgfrDeclineModule.ts` the owner of the flag logic.

- [ ] **Step 8: Run focused rapid decline tests**

Run:

```bash
pnpm vitest run tests/core/analysis/rapidEgfrDeclineModule.test.ts tests/core/cohort/exportRecords.test.ts tests/ui/CohortView.test.tsx tests/ui/Sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/analysis/rapidEgfrDeclineModule.ts src/core/analysis/registry.ts src/core/cohort/screening.ts src/ui/cohort/CohortView.tsx src/ui/shell/Sidebar.tsx src/ui/state/store.ts tests/core/analysis/rapidEgfrDeclineModule.test.ts tests/core/cohort/exportRecords.test.ts tests/ui/CohortView.test.tsx tests/ui/Sidebar.test.tsx
git commit -m "feat: migrate rapid egfr decline flag"
```

---

### Task 5: Compatibility Cleanup And Full Verification

**Files:**
- Modify: `src/ui/state/store.ts`
- Modify: `src/core/analysis/registry.ts`
- Modify: `tests/ui/persistence.test.tsx`
- Modify: `tests/ui/App.test.tsx`
- Modify only failing tests caused by the intentional settings move.

- [ ] **Step 1: Search for direct analysis helper usage outside module boundaries**

Run:

```bash
rg -n "appendComputedEgfr|episodesForSeries|findKdigoAkiEpisodes|isRapidEgfrDecline" src tests
```

Expected allowed matches:

```text
src/core/analysis/egfrModule.ts
src/core/analysis/akiModule.ts
src/core/analysis/rapidEgfrDeclineModule.ts
src/core/aki/akiAware.ts
src/core/cohort/screening.ts
src/core/stats/summarize.ts
tests/core/analysis/*
tests/core/aki/*
tests/core/cohort/*
```

If `src/ui/*` still imports these helpers directly, replace the usage with `analysisResult()` or a module-owned helper as in Tasks 3 and 4.

- [ ] **Step 2: Add a store compatibility test for AKI and rapid settings**

Append to `tests/ui/state/store.test.ts`:

```ts
describe('analysis settings compatibility setters', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('keeps showAki and rapid threshold compatibility fields in sync with analysisSettings', () => {
    useAppStore.getState().setShowAki(true)
    useAppStore.getState().setRapidEgfrThreshold(7)

    const state = useAppStore.getState()
    expect(state.showAki).toBe(true)
    expect(state.analysisSettings.aki.showOverlays).toBe(true)
    expect(state.rapidEgfrThreshold).toBe(7)
    expect(state.analysisSettings.rapidEgfrDecline.threshold).toBe(7)
  })
})
```

- [ ] **Step 3: Run store compatibility tests**

Run:

```bash
pnpm vitest run tests/ui/state/store.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run affected test set**

Run:

```bash
pnpm vitest run \
  tests/core/analysis/registry.test.ts \
  tests/core/analysis/egfrModule.test.ts \
  tests/core/analysis/akiModule.test.ts \
  tests/core/analysis/rapidEgfrDeclineModule.test.ts \
  tests/core/egfr/series.test.ts \
  tests/core/aki/akiAware.test.ts \
  tests/core/cohort/screening.test.ts \
  tests/core/cohort/exportRecords.test.ts \
  tests/ui/state/store.test.ts \
  tests/ui/Sidebar.test.tsx \
  tests/ui/OnePatientView.test.tsx \
  tests/ui/CohortView.test.tsx \
  tests/ui/akiOverlay.test.tsx \
  tests/ui/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full validation**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit cleanup**

```bash
git add src tests
git commit -m "test: verify modular analysis behavior"
```

If no files changed after verification, skip the commit and record the passing commands in the final handoff.

---

## Self-Review

- Spec coverage: eGFR, AKI overlays, AKI-aware fit inputs, rapid eGFR decline, store settings, UI consumers, exports, and tests are covered.
- Type consistency: settings keys are `egfr`, `aki`, and `rapidEgfrDecline`; AKI visual setting is `showOverlays`; fit inputs use `kind: 'aki-aware'`.
- Scope: no dynamic plugin loading, no formula changes, no sidebar redesign.
- Critical ordering: registry order is eGFR, AKI, rapid decline, so AKI sees computed eGFR rows.
