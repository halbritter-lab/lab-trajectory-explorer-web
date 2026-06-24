# RRT Event Schema And Pipeline Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current loose annotation event model with structured clinical events and introduce the shared fit-pipeline contract needed for later RRT censoring, aggregation, and endpoints.

**Architecture:** Add a new `src/core/events/events.ts` module and migrate app state/UI/data loading from `ValidAnnotation` to `ClinicalEvent`. Add a pure `src/core/fitPipeline/types.ts` contract without changing current fitting behavior yet. Keep display behavior working by adapting existing chart components to `date/title` event fields.

**Tech Stack:** TypeScript, React, Zustand, Vitest, existing `readWorkbook`/`loadDataset` utilities.

---

## Scope

This plan implements the first stable slice from `docs/superpowers/specs/2026-06-24-rrt-event-schema-and-fit-pipeline-design.md`.

Included:

- Structured clinical event schema.
- Strict event import validation.
- Demo event CSV migration.
- Store/data/UI migration from `annotations` to `events`.
- Display behavior preserved for one-patient plots, cohort mini-graphs, and sidebar event table.
- Existing fit behavior preserved. Event-driven split dates still use all loaded event dates in this slice; typed event-driven cleanup is a later phase.
- Pipeline contract types for later RRT censoring.

Not included:

- Actual RRT censoring/exclusion logic.
- Monthly/quarterly aggregation.
- CKD endpoints.
- Advanced UI.
- Export audit sheets.

## File Structure

- Create `src/core/events/events.ts`: clinical event types, normalization, validation, effect/warning helpers.
- Create `tests/core/events/events.test.ts`: event schema tests.
- Create `src/core/fitPipeline/types.ts`: FitConfig/FitPoint/FitPipelineResult contracts.
- Create `tests/core/fitPipeline/types.test.ts`: compile/runtime sanity tests for default config helpers.
- Modify `public/test_events.csv`: structured demo events.
- Modify `src/ui/data/loadDataset.ts`: load bundled `ClinicalEvent[]`.
- Modify `tests/ui/data/loadDataset.test.ts`: demo event assertions.
- Modify `src/ui/state/store.ts`: store `events` instead of `annotations`.
- Modify `src/core/analysis/types.ts` and `src/core/analysis/registry.ts`: analysis context uses events.
- Modify `src/ui/shell/Sidebar.tsx`: upload/display structured events.
- Modify `src/ui/patient/OnePatientView.tsx`: pass events to plots.
- Modify `src/ui/cohort/CohortView.tsx`: pass events to cohort calculations and mini-sparklines.
- Modify tests currently using annotations: `tests/ui/OnePatientView.test.tsx`, `tests/ui/CohortView.test.tsx`, `tests/ui/Sidebar.test.tsx`, `tests/ui/state/store.test.ts`.
- Modify analysis tests that pass context objects: `tests/core/analysis/registry.test.ts`, `tests/core/analysis/egfrModule.test.ts`, `tests/core/analysis/akiModule.test.ts`.

---

### Task 1: Add Clinical Event Parser And Validator

**Files:**
- Create: `src/core/events/events.ts`
- Create: `tests/core/events/events.test.ts`

- [ ] **Step 1: Write failing tests for structured events**

Create `tests/core/events/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeClinicalEvents, validateClinicalEvents, effectForEvent } from '../../../src/core/events/events'
import type { RawRow } from '../../../src/io/readWorkbook'
import type { LabRow } from '../../../src/core/types'

const labRow = (id: number): LabRow => ({
  patientId: id,
  labDatum: new Date('2024-01-01'),
  bezeichnung: 'eGFR',
  einheit: 'ml/min/1,73m²',
  wert: '45',
  wertNum: 45,
  wertOperator: '=',
  loinc: null,
  patientSex: null,
  patientAgeAtLab: 60,
})

describe('normalizeClinicalEvents', () => {
  it('parses the structured event schema', () => {
    const rows: RawRow[] = [
      { patientId: 10, type: 'kidney_transplant', date: '2025-02-01', title: 'Kidney transplant', description: 'graft', endDate: '', intent: '' },
      { patientId: 12, type: 'dialysis', date: '2021-03-01', title: 'Temporary dialysis', description: '', endDate: '2021-03-14', intent: 'acute' },
      { patientId: 20, type: 'other', date: '2023-08-10', title: 'Study medication', description: 'optional note', endDate: '', intent: '' },
    ]

    const out = normalizeClinicalEvents(rows)

    expect(out.map((e) => e.type)).toEqual(['kidney_transplant', 'dialysis', 'other'])
    expect(out[0].date.toISOString().slice(0, 10)).toBe('2025-02-01')
    expect(out[1].endDate?.toISOString().slice(0, 10)).toBe('2021-03-14')
    expect(out[1].intent).toBe('acute')
    expect(out[2].description).toBe('optional note')
  })

  it('rejects legacy annotation headers', () => {
    expect(() => normalizeClinicalEvents([{ PatientID: 9, ReferenceDate: '2024-04-15', label: 'Dialysis start' }]))
      .toThrow(/Legacy annotation schema is no longer supported/)
  })

  it('throws when required structured columns are missing', () => {
    expect(() => normalizeClinicalEvents([{ patientId: 9, date: '2024-04-15', title: 'Dialysis start' }]))
      .toThrow(/patientId, type, date, title/)
  })
})

describe('validateClinicalEvents', () => {
  it('validates enum fields, warnings, and row-level rejects', () => {
    const events = normalizeClinicalEvents([
      { patientId: 9, type: 'dialysis', date: '2024-04-15', title: 'Dialysis start', intent: '' },
      { patientId: 10, type: 'kidney_transplant', date: '2025-02-01', title: 'Kidney transplant' },
      { patientId: 999, type: 'dialysis', date: '2024-01-01', title: 'Unknown patient', intent: 'chronic' },
      { patientId: 9, type: 'dialysis', date: '2024-05-01', title: 'Bad range', endDate: '2024-04-01', intent: 'acute' },
      { patientId: 9, type: 'other', date: '2024-01-01', title: 'Bad intent', intent: 'chronic' },
      { patientId: 9, type: 'kidney_transplant', date: '2024-01-01', title: 'Bad transplant end', endDate: '2024-02-01' },
      { patientId: 9, type: 'not_real', date: '2024-01-01', title: 'Bad type' },
    ])

    const { valid, rejects } = validateClinicalEvents(events, [labRow(9), labRow(10)])

    expect(valid).toHaveLength(3)
    expect(valid.find((e) => e.patientId === 9 && e.type === 'dialysis')?.intent).toBe('unknown')
    expect(valid.find((e) => e.patientId === 999)?.warning).toBe('unknown_patient')
    expect(rejects.map((r) => r.reason)).toEqual(['invalid_date_range', 'invalid_intent', 'invalid_date_range', 'invalid_type'])
  })

  it('classifies event effects without free-text inference', () => {
    const [unknownOpen, unknownInterval, acuteOpen, acuteInterval, chronic, transplant, other] = normalizeClinicalEvents([
      { patientId: 1, type: 'dialysis', date: '2024-01-01', title: 'Unknown dialysis' },
      { patientId: 1, type: 'dialysis', date: '2024-01-01', title: 'Unknown interval', endDate: '2024-01-10' },
      { patientId: 1, type: 'dialysis', date: '2024-01-01', title: 'Acute open', intent: 'acute' },
      { patientId: 1, type: 'dialysis', date: '2024-01-01', title: 'Acute interval', endDate: '2024-01-10', intent: 'acute' },
      { patientId: 1, type: 'dialysis', date: '2024-01-01', title: 'Chronic dialysis', intent: 'chronic' },
      { patientId: 1, type: 'kidney_transplant', date: '2024-01-01', title: 'Kidney transplant' },
      { patientId: 1, type: 'other', date: '2024-01-01', title: 'Other' },
    ])

    expect(effectForEvent(unknownOpen).effect).toBe('warning_no_exclusion')
    expect(effectForEvent(unknownInterval).effect).toBe('exclude_interval')
    expect(effectForEvent(acuteOpen).effect).toBe('warning_no_exclusion')
    expect(effectForEvent(acuteInterval).effect).toBe('exclude_interval')
    expect(effectForEvent(chronic).effect).toBe('censor_from_date')
    expect(effectForEvent(transplant).effect).toBe('censor_from_date')
    expect(effectForEvent(other).effect).toBe('display_only')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/core/events/events.test.ts
```

Expected: FAIL because `src/core/events/events.ts` does not exist.

- [ ] **Step 3: Implement event parser and validator**

Create `src/core/events/events.ts`:

```ts
import type { RawRow } from '../../io/readWorkbook'
import type { LabRow } from '../types'

export type ClinicalEventType = 'kidney_transplant' | 'dialysis' | 'other'
export type DialysisIntent = 'acute' | 'chronic' | 'unknown'
export type ClinicalEventWarning = '' | 'unknown_patient' | 'unknown_dialysis_intent' | 'unresolved_dialysis_interval'
export type RejectedClinicalEventReason =
  | 'missing_required'
  | 'invalid_type'
  | 'invalid_intent'
  | 'invalid_date'
  | 'invalid_date_range'
  | 'unsupported_legacy_schema'

export interface ClinicalEvent {
  patientId: number
  type: ClinicalEventType
  date: Date
  title: string
  description: string
  endDate: Date | null
  intent: DialysisIntent | null
  warning: ClinicalEventWarning
}

export interface RawClinicalEvent {
  patientId: number | null
  type: string | null
  date: Date | null
  title: string
  description: string
  endDate: Date | null
  intent: string | null
}

export interface RejectedClinicalEvent extends RawClinicalEvent {
  reason: RejectedClinicalEventReason
}

export type ClinicalEventEffect =
  | 'display_only'
  | 'warning_no_exclusion'
  | 'exclude_interval'
  | 'censor_from_date'

export interface ClinicalEventEffectInfo {
  effect: ClinicalEventEffect
  label: string
}

const EVENT_TYPES = new Set(['kidney_transplant', 'dialysis', 'other'])
const DIALYSIS_INTENTS = new Set(['acute', 'chronic', 'unknown'])

function value(row: RawRow, key: string): unknown {
  return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()]
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toStringOrEmpty(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function toStringOrNull(v: unknown): string | null {
  const s = toStringOrEmpty(v)
  return s === '' ? null : s
}

export function normalizeClinicalEvents(rows: RawRow[]): RawClinicalEvent[] {
  if (rows.length === 0) return []
  const headers = new Set(Object.keys(rows[0]))
  if (headers.has('PatientID') || headers.has('ReferenceDate') || headers.has('label')) {
    throw new Error('Legacy annotation schema is no longer supported. Use patientId,type,date,title.')
  }
  const required = ['patientId', 'type', 'date', 'title']
  const missing = required.filter((key) => !headers.has(key))
  if (missing.length > 0) {
    throw new Error('Event file missing required column(s): patientId, type, date, title.')
  }
  return rows.map((row) => ({
    patientId: toNumber(value(row, 'patientId')),
    type: toStringOrNull(value(row, 'type')),
    date: toDate(value(row, 'date')),
    title: toStringOrEmpty(value(row, 'title')),
    description: toStringOrEmpty(value(row, 'description')),
    endDate: toDate(value(row, 'endDate')),
    intent: toStringOrNull(value(row, 'intent')),
  }))
}

export function validateClinicalEvents(
  events: RawClinicalEvent[],
  labRows: LabRow[],
): { valid: ClinicalEvent[]; rejects: RejectedClinicalEvent[] } {
  const known = new Set(labRows.map((row) => row.patientId))
  const valid: ClinicalEvent[] = []
  const rejects: RejectedClinicalEvent[] = []

  for (const event of events) {
    if (event.patientId === null || event.type === null || event.date === null || event.title === '') {
      rejects.push({ ...event, reason: event.date === null ? 'invalid_date' : 'missing_required' })
      continue
    }
    if (!EVENT_TYPES.has(event.type)) {
      rejects.push({ ...event, reason: 'invalid_type' })
      continue
    }
    if (event.endDate !== null && event.endDate.getTime() < event.date.getTime()) {
      rejects.push({ ...event, reason: 'invalid_date_range' })
      continue
    }
    if (event.type !== 'dialysis' && event.intent !== null) {
      rejects.push({ ...event, reason: 'invalid_intent' })
      continue
    }
    if (event.type === 'kidney_transplant' && event.endDate !== null) {
      rejects.push({ ...event, reason: 'invalid_date_range' })
      continue
    }
    if (event.type === 'dialysis' && event.intent !== null && !DIALYSIS_INTENTS.has(event.intent)) {
      rejects.push({ ...event, reason: 'invalid_intent' })
      continue
    }

    const type = event.type as ClinicalEventType
    const intent = type === 'dialysis' ? ((event.intent ?? 'unknown') as DialysisIntent) : null
    let warning: ClinicalEventWarning = known.has(event.patientId) ? '' : 'unknown_patient'
    if (warning === '' && type === 'dialysis' && intent === 'unknown') warning = 'unknown_dialysis_intent'
    if (warning === '' && type === 'dialysis' && intent === 'acute' && event.endDate === null) warning = 'unresolved_dialysis_interval'

    valid.push({
      patientId: event.patientId,
      type,
      date: event.date,
      title: event.title,
      description: event.description,
      endDate: event.endDate,
      intent,
      warning,
    })
  }

  return { valid, rejects }
}

export function effectForEvent(event: Pick<ClinicalEvent, 'type' | 'intent' | 'endDate'>): ClinicalEventEffectInfo {
  if (event.type === 'kidney_transplant') return { effect: 'censor_from_date', label: 'censor from event date' }
  if (event.type === 'other') return { effect: 'display_only', label: 'display only' }
  if (event.intent === 'chronic') return { effect: 'censor_from_date', label: 'censor from dialysis start' }
  if (event.intent === 'acute' && event.endDate) return { effect: 'exclude_interval', label: 'exclude dialysis interval' }
  if (event.intent === 'unknown' && event.endDate) return { effect: 'exclude_interval', label: 'exclude interval, unknown intent' }
  return { effect: 'warning_no_exclusion', label: 'warning, not excluded from fit' }
}

export function eventTooltip(event: ClinicalEvent): string {
  const parts = [
    event.title,
    event.type,
    event.date.toISOString().slice(0, 10),
    event.intent ? `intent: ${event.intent}` : '',
    event.endDate ? `end: ${event.endDate.toISOString().slice(0, 10)}` : '',
    `effect: ${effectForEvent(event).label}`,
    event.description,
  ].filter(Boolean)
  return parts.join(' · ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test tests/core/events/events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/events/events.ts tests/core/events/events.test.ts
git commit -m "feat: add structured clinical events"
```

---

### Task 2: Add Fit Pipeline Contract Types

**Files:**
- Create: `src/core/fitPipeline/types.ts`
- Create: `tests/core/fitPipeline/types.test.ts`

- [ ] **Step 1: Write failing tests for pipeline defaults**

Create `tests/core/fitPipeline/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ckdProgressionConfig, generalExplorationConfig, primaryExclusionReason } from '../../../src/core/fitPipeline/types'

describe('fit pipeline type helpers', () => {
  it('creates explicit per-series preset configs', () => {
    const cfg = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })

    expect(cfg.parameter.bezeichnung).toBe('eGFR')
    expect(cfg.preset).toBe('ckd_progression')
    expect(cfg.xAxis).toBe('age')
    expect(cfg.censoring.censorAfterKidneyTransplant).toBe(true)
    expect(cfg.censoring.unknownDialysisPolicy).toBe('exclude-dated-interval')
    expect(cfg.timeBalancing).toBe('quarterly-median')
    expect(cfg.endpoints.observedCkdG5).toBe(true)
  })

  it('keeps general exploration display-focused', () => {
    const cfg = generalExplorationConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

    expect(cfg.preset).toBe('general_exploration')
    expect(cfg.censoring.censorAfterKidneyTransplant).toBe(false)
    expect(cfg.exclusions.excludeAkiWindows).toBe(false)
    expect(cfg.timeBalancing).toBe('raw')
    expect(cfg.endpoints.projectedAgeToCkdG5).toBe(false)
  })

  it('uses deterministic primary exclusion precedence for compact labels', () => {
    expect(primaryExclusionReason(['aki', 'post_kidney_transplant'])).toBe('post_kidney_transplant')
    expect(primaryExclusionReason(['aki', 'unknown_dialysis_interval'])).toBe('unknown_dialysis_interval')
    expect(primaryExclusionReason([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/core/fitPipeline/types.test.ts
```

Expected: FAIL because `src/core/fitPipeline/types.ts` does not exist.

- [ ] **Step 3: Implement contract types and helpers**

Create `src/core/fitPipeline/types.ts`:

```ts
import type { ClinicalEvent } from '../events/events'

export type FitPreset = 'general_exploration' | 'ckd_progression' | 'acute_review' | 'custom'
export type FitXAxis = 'age' | 'calendar_time' | 'time_since_baseline'
export type TimeBalancing = 'raw' | 'monthly-median' | 'quarterly-median'
export type FitModel = 'none' | 'ols' | 'theil-sen' | 'rolling-ols' | 'segmented-ols'
export type UnknownDialysisPolicy = 'flag-only' | 'exclude-dated-interval' | 'censor-from-start'
export type ExclusionReason =
  | 'aki'
  | 'acute_dialysis'
  | 'unknown_dialysis_interval'
  | 'post_chronic_dialysis'
  | 'post_kidney_transplant'

export interface FitConfig {
  parameter: {
    bezeichnung: string
    einheit: string | null
  }
  preset: FitPreset
  xAxis: FitXAxis
  censoring: {
    censorAfterKidneyTransplant: boolean
    censorAfterChronicDialysis: boolean
    excludeAcuteDialysisPeriods: boolean
    unknownDialysisPolicy: UnknownDialysisPolicy
  }
  exclusions: {
    excludeAkiWindows: boolean
    akiExclusionDays: number
  }
  timeBalancing: TimeBalancing
  fitModel: FitModel
  endpoints: {
    percentDecline: boolean
    observedCkdG5: boolean
    projectedAgeToCkdG5: boolean
  }
}

export interface FitPoint {
  date: Date
  value: number
  operator: '=' | '<' | '>'
  x: number | Date
  xAxis: FitXAxis
  included: boolean
  exclusionReasons: ExclusionReason[]
  sourceRowIndex: number
  aggregate?: {
    period: 'month' | 'quarter'
    nRaw: number
    start: Date
    end: Date
  }
}

export interface FitPipelineResult {
  config: FitConfig
  events: ClinicalEvent[]
  rawPoints: FitPoint[]
  fitPoints: FitPoint[]
  excludedPoints: FitPoint[]
  fitLines: Array<{ date: Date; value: number }[]>
  summary: {
    nRaw: number
    nIncluded: number
    nExcludedByReason: Record<ExclusionReason, number>
    nTimeBins: number
    followupYears: number
    medianGapDays: number | null
    maxGapDays: number | null
    clusteredMeasurementsFlag: boolean
  }
}

const emptyEndpoints = { percentDecline: false, observedCkdG5: false, projectedAgeToCkdG5: false }

export function generalExplorationConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'general_exploration',
    xAxis: 'calendar_time',
    censoring: {
      censorAfterKidneyTransplant: false,
      censorAfterChronicDialysis: false,
      excludeAcuteDialysisPeriods: false,
      unknownDialysisPolicy: 'flag-only',
    },
    exclusions: { excludeAkiWindows: false, akiExclusionDays: 30 },
    timeBalancing: 'raw',
    fitModel: 'ols',
    endpoints: { ...emptyEndpoints },
  }
}

export function ckdProgressionConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'ckd_progression',
    xAxis: 'age',
    censoring: {
      censorAfterKidneyTransplant: true,
      censorAfterChronicDialysis: true,
      excludeAcuteDialysisPeriods: true,
      unknownDialysisPolicy: 'exclude-dated-interval',
    },
    exclusions: { excludeAkiWindows: true, akiExclusionDays: 30 },
    timeBalancing: 'quarterly-median',
    fitModel: 'ols',
    endpoints: { percentDecline: true, observedCkdG5: true, projectedAgeToCkdG5: true },
  }
}

export function acuteReviewConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'acute_review',
    xAxis: 'calendar_time',
    censoring: {
      censorAfterKidneyTransplant: false,
      censorAfterChronicDialysis: false,
      excludeAcuteDialysisPeriods: false,
      unknownDialysisPolicy: 'flag-only',
    },
    exclusions: { excludeAkiWindows: false, akiExclusionDays: 30 },
    timeBalancing: 'raw',
    fitModel: 'none',
    endpoints: { ...emptyEndpoints },
  }
}

const PRECEDENCE: ExclusionReason[] = [
  'post_kidney_transplant',
  'post_chronic_dialysis',
  'acute_dialysis',
  'unknown_dialysis_interval',
  'aki',
]

export function primaryExclusionReason(reasons: readonly ExclusionReason[]): ExclusionReason | null {
  return PRECEDENCE.find((reason) => reasons.includes(reason)) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test tests/core/fitPipeline/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/fitPipeline/types.ts tests/core/fitPipeline/types.test.ts
git commit -m "feat: add fit pipeline contract"
```

---

### Task 3: Migrate Bundled Demo Events

**Files:**
- Modify: `public/test_events.csv`
- Modify: `src/ui/data/loadDataset.ts`
- Modify: `tests/ui/data/loadDataset.test.ts`

- [ ] **Step 1: Write failing test expectation for structured demo events**

Modify `tests/ui/data/loadDataset.test.ts` in `loadBundledFixtureData`:

```ts
      const { rows, events } = await loadBundledFixtureData('/')

      expect(rows.length).toBeGreaterThanOrEqual(180)
      expect(events.map((event) => event.title)).toEqual(expect.arrayContaining(['Dialysis start', 'Kidney transplant']))
      expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['dialysis', 'kidney_transplant']))
      expect(events.map((event) => event.patientId)).toEqual(expect.arrayContaining([9, 10]))
      expect(events.every((event) => event.warning === '')).toBe(true)
      expect(events).toHaveLength(3)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/ui/data/loadDataset.test.ts
```

Expected: FAIL because `loadBundledFixtureData` still returns `annotations`.

- [ ] **Step 3: Update demo CSV**

Replace `public/test_events.csv` with:

```csv
patientId,type,date,title,description,endDate,intent
9,dialysis,2024-04-15,Dialysis start,,,
10,kidney_transplant,2025-02-01,Kidney transplant,,,
12,dialysis,2024-09-20,Dialysis start,,,
```

- [ ] **Step 4: Update loader return type**

Modify `src/ui/data/loadDataset.ts`:

```ts
import { readWorkbook } from '../../io/readWorkbook'
import { loadLabRows } from '../../core/parse/loader'
import type { LabRow } from '../../core/types'
import { normalizeClinicalEvents, validateClinicalEvents, type ClinicalEvent } from '../../core/events/events'
```

Replace `BundledFixtureData` and `loadBundledFixtureData`:

```ts
export interface BundledFixtureData {
  rows: LabRow[]
  events: ClinicalEvent[]
}

/** Fetch the bundled synthetic labs plus demo clinical events shipped in public/. */
export async function loadBundledFixtureData(baseUrl = import.meta.env.BASE_URL): Promise<BundledFixtureData> {
  const rows = await loadBundledFixture(baseUrl)
  const res = await fetch(`${baseUrl}test_events.csv`)
  if (!res.ok) return { rows, events: [] }
  const rawEvents = normalizeClinicalEvents(readWorkbook(await res.arrayBuffer()))
  const { valid, rejects } = validateClinicalEvents(rawEvents, rows)
  if (rejects.length > 0) throw new Error(`Bundled event fixture contains ${rejects.length} invalid row(s).`)
  return { rows, events: valid }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm test tests/ui/data/loadDataset.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/test_events.csv src/ui/data/loadDataset.ts tests/ui/data/loadDataset.test.ts
git commit -m "feat: load structured demo events"
```

---

### Task 4: Migrate App State To Clinical Events

**Files:**
- Modify: `src/ui/state/store.ts`
- Modify: `src/core/analysis/types.ts`
- Modify: `src/core/analysis/registry.ts`
- Modify: `tests/ui/state/store.test.ts`
- Modify: `tests/core/analysis/registry.test.ts`
- Modify: `tests/core/analysis/egfrModule.test.ts`
- Modify: `tests/core/analysis/akiModule.test.ts`

- [ ] **Step 1: Write failing store tests**

In `tests/ui/state/store.test.ts`, replace annotation assertions with:

```ts
expect(state.events.map((event) => event.title)).toEqual(expect.arrayContaining(['Dialysis start', 'Kidney transplant']))
expect(state.events.map((event) => event.type)).toEqual(expect.arrayContaining(['dialysis', 'kidney_transplant']))
```

Add:

```ts
it('stores structured clinical events', () => {
  useAppStore.getState().setEvents([
    {
      patientId: 1,
      type: 'kidney_transplant',
      date: new Date('2025-02-01'),
      title: 'Kidney transplant',
      description: '',
      endDate: null,
      intent: null,
      warning: '',
    },
  ])

  expect(useAppStore.getState().events[0].type).toBe('kidney_transplant')
  expect(useAppStore.getState().events[0].title).toBe('Kidney transplant')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/ui/state/store.test.ts
```

Expected: FAIL because `events` and `setEvents` do not exist.

- [ ] **Step 3: Update analysis types**

In `src/core/analysis/types.ts`, replace `ValidAnnotation` import and field:

```ts
import type { ClinicalEvent } from '../events/events'
```

Use:

```ts
events: ClinicalEvent[]
```

In `src/core/analysis/registry.ts`, update the analysis context property from `annotations` to `events`. Modules that do not use events should continue to ignore it.

Update analysis tests by replacing context/options object properties:

```ts
annotations: []
```

with:

```ts
events: []
```

Apply this in:

```text
tests/core/analysis/registry.test.ts
tests/core/analysis/egfrModule.test.ts
tests/core/analysis/akiModule.test.ts
```

- [ ] **Step 4: Update store**

In `src/ui/state/store.ts`:

```ts
import type { ClinicalEvent } from '../../core/events/events'
```

Rename state fields/actions:

```ts
events: ClinicalEvent[]
showEvents: boolean
setEvents: (events: ClinicalEvent[]) => void
setShowEvents: (value: boolean) => void
```

Update `AppData` pick to include `events` and `showEvents`.

Update `initialState`:

```ts
events: [],
showEvents: true,
```

Update analysis cache:

```ts
events: ClinicalEvent[]
```

Update `computeStoreAnalysisResult` signature and cache comparison:

```ts
events: ClinicalEvent[],
...
events === analysisCache.events
...
const result = computeAnalysisResult({ rows, settings, manualDemographics: manual, events })
```

Update `loadSynthetic`:

```ts
const { rows, events } = await loadBundledFixtureData()
get().setDataset(rows, 'test_labs.xlsx (synthetic)')
set({
  events,
  notice: {
    kind: 'info',
    text: `Loaded ${rows.length} rows and ${events.length} events from the synthetic dataset.`,
  },
})
```

Add actions:

```ts
setEvents: (events) => set({ events }),
setShowEvents: (value) => set({ showEvents: value }),
```

Update `analysisResult`:

```ts
return computeStoreAnalysisResult(s.rows, s.analysisSettings, s.manualDemographics, s.events)
```

Update `setDataset` so loading a new lab file clears events validated against a previous dataset:

```ts
events: [],
```

inside the `set((s) => ({ ... }))` object. `loadSynthetic` calls `setDataset` first and then sets bundled events, so synthetic events still load.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm test tests/ui/state/store.test.ts tests/core/analysis/registry.test.ts tests/core/analysis/egfrModule.test.ts tests/core/analysis/akiModule.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/state/store.ts src/core/analysis/types.ts src/core/analysis/registry.ts tests/ui/state/store.test.ts tests/core/analysis/registry.test.ts tests/core/analysis/egfrModule.test.ts tests/core/analysis/akiModule.test.ts
git commit -m "feat: store structured clinical events"
```

---

### Task 5: Update Sidebar Event Upload And Table

**Files:**
- Modify: `src/ui/shell/Sidebar.tsx`
- Modify: `tests/ui/Sidebar.test.tsx`

- [ ] **Step 1: Write failing sidebar tests**

In `tests/ui/Sidebar.test.tsx`, update the event table test setup to `setEvents`.

Use a complete fixture that includes censoring and display-only effects:

```ts
useAppStore.getState().setEvents([
  {
    patientId: 9,
    type: 'dialysis',
    date: new Date('2024-04-15T00:00:00Z'),
    title: 'Dialysis start',
    description: '',
    endDate: null,
    intent: 'unknown',
    warning: 'unknown_dialysis_intent',
  },
  {
    patientId: 10,
    type: 'kidney_transplant',
    date: new Date('2025-02-01T00:00:00Z'),
    title: 'Kidney transplant',
    description: '',
    endDate: null,
    intent: null,
    warning: '',
  },
  {
    patientId: 9,
    type: 'other',
    date: new Date('2024-08-01T00:00:00Z'),
    title: 'Study medication',
    description: '',
    endDate: null,
    intent: null,
    warning: '',
  },
])
```

Expected assertions:

```ts
expect(screen.getByRole('table', { name: 'Loaded events' })).toBeInTheDocument()
expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument()
expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument()
expect(screen.getByRole('columnheader', { name: 'Effect' })).toBeInTheDocument()
expect(screen.getByRole('cell', { name: 'kidney_transplant' })).toBeInTheDocument()
expect(screen.getByRole('cell', { name: 'censor from event date' })).toBeInTheDocument()
expect(screen.getByRole('cell', { name: 'display only' })).toBeInTheDocument()
```

Add an upload test for legacy rejection:

```ts
it('rejects legacy annotation event files with a clear message', async () => {
  const file = new File(['PatientID,ReferenceDate,label\n1,2020-01-01,event\n'], 'events.csv', { type: 'text/csv' })
  render(<Sidebar />)

  await userEvent.upload(screen.getByLabelText('Events'), file)

  expect(await screen.findByText(/Legacy annotation schema is no longer supported/)).toBeInTheDocument()
})
```

Add an upload test for warning counts:

```ts
it('reports warning counts for unresolved event rows', async () => {
  const file = new File([
    'patientId,type,date,title,description,endDate,intent\n',
    '1,dialysis,2024-04-15,Dialysis start,,,\n',
    '999,dialysis,2024-05-01,Unknown patient dialysis,,,chronic\n',
  ], 'events.csv', { type: 'text/csv' })
  render(<Sidebar />)

  await userEvent.upload(screen.getByLabelText('Events'), file)

  expect(await screen.findByText(/Loaded 2 events; 2 warning/)).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'unknown_dialysis_intent' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'unknown_patient' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/ui/Sidebar.test.tsx
```

Expected: FAIL because Sidebar still imports annotation parser and state.

- [ ] **Step 3: Update Sidebar imports and upload**

In `src/ui/shell/Sidebar.tsx`, import:

```ts
import type { ClinicalEvent } from '../../core/events/events'
import { effectForEvent } from '../../core/events/events'
```

Replace state selectors:

```ts
const events = useAppStore((s) => s.events)
const setEvents = useAppStore((s) => s.setEvents)
const showEvents = useAppStore((s) => s.showEvents)
const setShowEvents = useAppStore((s) => s.setShowEvents)
```

Rename local annotation status state to event status:

```ts
const [eventNote, setEventNote] = useState<string | null>(null)
```

In the event upload handler, replace dynamic annotation import with a `try/catch` that writes the local status visible inside `Sidebar`:

```ts
try {
  const { normalizeClinicalEvents, validateClinicalEvents } = await import('../../core/events/events')
  const rawEvents = normalizeClinicalEvents(readWorkbook(buf))
  const { valid, rejects } = validateClinicalEvents(rawEvents, rows)
  const warnings = valid.filter((event) => event.warning).length
  setEvents(valid)
  setEventNote(
    `Loaded ${valid.length} events` +
    `${rejects.length ? `; rejected ${rejects.length}` : ''}` +
    `${warnings ? `; ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.`,
  )
} catch (err) {
  setEvents([])
  setEventNote(err instanceof Error ? err.message : String(err))
}
```

Rename visible annotation labels to event labels:

```tsx
<h3 className="sidebar-group-title">Events</h3>
<input type="checkbox" aria-label="Show events on plot" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
<input type="file" aria-label="Events" accept=".xlsx,.csv" onChange={onEventFile} />
{eventNote && <p className="sidebar-note sidebar-status" role="status" aria-live="polite">{eventNote}</p>}
{events.length > 0 && <EventTable events={events} />}
```

- [ ] **Step 4: Replace EventTable**

Use:

```tsx
function EventTable({ events }: { events: ClinicalEvent[] }) {
  const sorted = [...events].sort((a, b) => a.patientId - b.patientId || a.date.getTime() - b.date.getTime())
  return (
    <table className="event-table" aria-label="Loaded events">
      <thead>
        <tr>
          <th>Patient</th>
          <th>Date</th>
          <th>Type</th>
          <th>Title</th>
          <th>Intent</th>
          <th>End</th>
          <th>Effect</th>
          <th>Warning</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((event, index) => {
          const effect = effectForEvent(event)
          return (
            <tr key={`${event.patientId}-${event.date.getTime()}-${index}`}>
              <td>{event.patientId}</td>
              <td>{event.date.toISOString().slice(0, 10)}</td>
              <td>{event.type}</td>
              <td>{event.title}</td>
              <td>{event.intent ?? ''}</td>
              <td>{event.endDate?.toISOString().slice(0, 10) ?? ''}</td>
              <td>{effect.label}</td>
              <td>{event.warning}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm test tests/ui/Sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/shell/Sidebar.tsx tests/ui/Sidebar.test.tsx
git commit -m "feat: upload and show structured clinical events"
```

---

### Task 6: Update Plot And Cohort Event Wiring

**Files:**
- Modify: `src/ui/patient/OnePatientView.tsx`
- Modify: `src/ui/cohort/CohortView.tsx`
- Modify: `src/ui/charts/SeriesPlot.tsx`
- Modify: `tests/ui/OnePatientView.test.tsx`
- Modify: `tests/ui/CohortView.test.tsx`

- [ ] **Step 1: Write failing tests using ClinicalEvent shape**

Update existing tests to call `setEvents`:

```ts
useAppStore.getState().setEvents([{
  patientId: 1,
  type: 'dialysis',
  date: new Date('2020-01-01'),
  title: 'Dialysis start',
  description: 'temporary note',
  endDate: null,
  intent: 'unknown',
  warning: 'unknown_dialysis_intent',
}])
```

Expected assertions in `OnePatientView.test.tsx`:

```ts
expect(eventLine.querySelector('title')?.textContent).toContain('Dialysis start')
expect(eventLine.querySelector('title')?.textContent).toContain('dialysis')
expect(eventLine.querySelector('title')?.textContent).toContain('effect:')
```

Expected assertions in `CohortView.test.tsx`:

```ts
useAppStore.setState({ cohortZoom: 'l' })
expect(container.querySelectorAll('[data-testid="event-marker"]')).toHaveLength(2)
expect(screen.getByText('Dialysis start')).toBeInTheDocument()
expect(screen.getByText('Kidney transplant')).toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx
```

Expected: FAIL because components still read `annotations`.

- [ ] **Step 3: Update SeriesPlot tooltip support**

In `src/ui/charts/SeriesPlot.tsx`, extend the annotation prop type:

```ts
annotations?: { date: Date; label: string; tooltip?: string }[]
```

Update `annKey` so tooltip changes re-render:

```ts
const annKey = JSON.stringify(anns.map((a) => [a.date.getTime(), a.label, a.tooltip ?? '']))
```

In the `annotationRules.slice(-anns.length).forEach` block, set the SVG title from `tooltip` when present:

```ts
line.appendChild(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), {
  textContent: annotation.tooltip ?? `${label} · ${fmtDate(annotation.date)}`,
}))
```

- [ ] **Step 4: Update OnePatientView**

In `src/ui/patient/OnePatientView.tsx`, change selectors and prop preparation:

```ts
const events = useAppStore((s) => s.events)
const showEvents = useAppStore((s) => s.showEvents)
```

Replace `anns` construction:

```ts
const patientEvents = showEvents
  ? events
      .filter((event) => event.patientId === patientId)
      .map((event) => ({ date: event.date, label: event.title, tooltip: eventTooltip(event) }))
  : []
```

Import:

```ts
import { eventTooltip } from '../../core/events/events'
```

Pass `annotations={patientEvents}` temporarily to avoid a broad `SeriesPlot` prop rename in this task. Rename the prop in a later cleanup task if desired.

Update `plotCfg`:

```ts
const plotCfg = { ...cfg, eventDates: patientEvents.map((event) => event.date) }
```

- [ ] **Step 5: Update CohortView**

In `src/ui/cohort/CohortView.tsx`, change:

```ts
const events = useAppStore((s) => s.events)
```

Preserve current event-driven behavior in this first slice by passing all loaded event dates for the patient. Typed event-driven cleanup is a later phase.

```ts
function patientEventDates(patientId: number): Date[] {
  return events
    .filter((event) => event.patientId === patientId)
    .map((event) => event.date)
}
```

Replace the `eventDatesByPatient` map with:

```ts
eventDatesByPatient: Object.fromEntries(
  [...new Set(events.map((event) => event.patientId))]
    .map((pid) => [pid, patientEventDates(pid)]),
),
```

Update the `specs` memo dependency array from `annotations` to `events`.

Replace `eventsByPatient` map values:

```ts
events.push({ date: event.date, label: event.title })
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm test tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/charts/SeriesPlot.tsx src/ui/patient/OnePatientView.tsx src/ui/cohort/CohortView.tsx tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx
git commit -m "feat: wire clinical events into plots"
```

---

### Task 7: Remove Old Annotation Module Usage

**Files:**
- Delete: `src/core/annotations/annotations.ts`
- Delete or rewrite: `tests/core/annotations/annotations.test.ts`
- Modify all imports found by `rg "annotations|ValidAnnotation|setAnnotations|showAnnotations"`
- Modify: `tests/e2e/smoke.md`
- Modify: `tests/ui/egfrAnnotations.test.tsx`
- Modify: `src/ui/pages/Methodology.tsx` if it still uses visible annotation wording.

- [ ] **Step 1: Search remaining old annotation usage**

Run:

```bash
rg -n "ValidAnnotation|Annotation|normalizeAnnotations|validateAnnotations|annotations|setAnnotations|showAnnotations" src tests
```

Expected: remaining references from old code and tests.

- [ ] **Step 2: Replace or remove old references**

Replace state fields:

```text
annotations -> events
showAnnotations -> showEvents
setAnnotations -> setEvents
setShowAnnotations -> setShowEvents
```

Use "Events" in visible UI, aria-labels, test names, and smoke docs.

- [ ] **Step 3: Delete old annotation test/module**

Run:

```bash
git rm src/core/annotations/annotations.ts tests/core/annotations/annotations.test.ts
```

- [ ] **Step 4: Verify no old references remain**

Run:

```bash
rg -n "ValidAnnotation|normalizeAnnotations|validateAnnotations|setAnnotations|showAnnotations" src tests
```

Expected: no output.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test tests/core/events/events.test.ts tests/ui/Sidebar.test.tsx tests/ui/OnePatientView.test.tsx tests/ui/CohortView.test.tsx tests/ui/state/store.test.ts tests/ui/data/loadDataset.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src tests
git commit -m "refactor: replace annotations with clinical events"
```

---

### Task 8: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm build
```

Expected: build succeeds. The known Vite warnings about static/dynamic imports should disappear if the old annotation dynamic import was removed; if a warning remains, include it in the final report.

- [ ] **Step 3: Check worktree**

Run:

```bash
git status --short
```

Expected: no uncommitted changes.

---

## Self-Review

Spec coverage:

- Event schema and no-legacy import: Tasks 1, 3, 5, 7.
- Dialysis intent normalization and validation: Task 1.
- `kidney_transplant` specificity: Task 1.
- `ClinicalEvent`/`RejectedClinicalEvent`: Task 1.
- Fit pipeline contract: Task 2.
- Existing event-driven fit behavior preserved while display wiring moves to structured events: Task 6.
- UI table/warnings baseline: Task 5.
- Plot wiring: Task 6.
- Full removal of old annotation import path: Task 7.

Gaps intentionally left for later plans:

- RRT censoring execution.
- Time balancing implementation.
- Endpoint implementation.
- Advanced UI.
- Export audit sheets.

Placeholder scan:

- No `TBD` or `TODO`.
- Each code-editing task includes concrete target files and code snippets.

Type consistency:

- New event fields use `date/title`.
- Store uses `events/showEvents/setEvents/setShowEvents`.
- Current chart props may keep the `annotations` prop name temporarily; Task 6 explicitly limits that as a compatibility bridge.
