# Patient Demographics Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve each patient's sex and age once, before any analysis runs, and report contradictions in the source data instead of silently computing over them.

**Architecture:** A new pure module `src/core/demographics/` decides one sex and one birth-date anchor per patient from three sources (manual entry > attributes table > lab rows). A new analysis module wraps it and becomes the first entry in the analysis pipeline, so every consumer of `analysisResult.rows` — cohort table, patient view, overlay, age x-axis, mixed model, exports — receives resolved rows without being touched. Conflicts travel up the existing but so far unused `AnalysisResult.messages` channel. The ported numeric core (`loadLabRows`, `appendComputedEgfr`) is not modified, so the parity goldens keep their meaning.

**Tech Stack:** TypeScript, Vitest (jsdom), Playwright (Chromium), Zustand store, SheetJS.

**Spec:** `docs/superpowers/specs/2026-08-24-demographics-resolution-design.md`

---

## File Structure

Created:

- `src/core/demographics/types.ts` — conflict and interval types, no logic
- `src/core/demographics/birthDate.ts` — date-interval arithmetic
- `src/core/demographics/resolveSex.ts` — sex precedence and majority
- `src/core/demographics/resolveAge.ts` — birth-date anchor precedence
- `src/core/demographics/resolve.ts` — ties both together, rewrites rows
- `src/core/demographics/describe.ts` — conflict → human sentence
- `src/core/analysis/demographicsModule.ts` — pipeline module
- `scripts/regen_demo_birthdates.mjs` — one-off demo-fixture regeneration
- Test files mirroring each of the above under `tests/core/demographics/`

Modified:

- `src/core/parse/loader.ts` — export `completedYears`; carry `patientBirthDate`
- `src/core/types.ts` — `LabRow.patientBirthDate`
- `src/core/analysis/types.ts` — `AnalysisContext.patientAttributes`
- `src/core/analysis/egfrModule.ts` — drop `rowsWithManualDemographics`
- `src/core/analysis/registry.ts` — register the module first
- `src/ui/state/store.ts` — thread `patientAttributes` into the pipeline and its cache key
- `src/ui/shell/Sidebar.tsx` — render the conflict notes
- `src/core/cohort/screening.ts` — `demographics_conflict` export column
- `src/ui/cohort/CohortView.tsx` — offer `sex` as a grouping attribute
- `public/test_labs.xlsx` — regenerated with consistent ages

**Splitting rationale:** resolution is four separate decisions (interval maths, sex, age, assembly) that are each independently testable. Keeping them in one file would mean a single test file asserting four unrelated things, and the interval maths is the part most likely to be read on its own later.

---

### Task 1: Birth-date interval arithmetic

The whole design rests on one idea: a lab date plus a stated integer age brackets a *range* of possible birth dates. Rows are consistent exactly when those ranges overlap.

**Files:**
- Create: `src/core/demographics/types.ts`
- Create: `src/core/demographics/birthDate.ts`
- Modify: `src/core/parse/loader.ts:131`
- Test: `tests/core/demographics/birthDate.test.ts`

- [ ] **Step 1: Export the existing `completedYears` helper**

It is currently private in the loader. Exporting it is a one-word change and keeps a single definition of "completed years", which the interval maths must agree with exactly.

In `src/core/parse/loader.ts`, line 131:

```ts
export function completedYears(birth: Date, ref: Date): number | null {
```

- [ ] **Step 2: Create the shared types**

`src/core/demographics/types.ts`:

```ts
import type { PatientId, Sex } from '../types'

/** An inclusive range of candidate birth dates. `lo > hi` means the constraints
 * that produced it contradict each other — check with `isEmptyInterval`. */
export interface BirthInterval {
  lo: Date
  hi: Date
}

export interface SexCount {
  sex: Sex
  count: number
}

export type DemographicsConflict =
  | { kind: 'sex_row_disagreement'; patientId: PatientId; counts: SexCount[]; resolved: Sex }
  | { kind: 'sex_tie'; patientId: PatientId; counts: SexCount[] }
  | { kind: 'sex_source_disagreement'; patientId: PatientId; fromAttributes: Sex; fromRows: Sex }
  | { kind: 'age_no_common_birth_date'; patientId: PatientId; gapDays: number }
```

- [ ] **Step 3: Write the failing test**

`tests/core/demographics/birthDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  addYearsUtc,
  birthDateInterval,
  intersectBirthIntervals,
  intervalGapDays,
  intervalMidpoint,
  isEmptyInterval,
  medianDate,
} from '../../../src/core/demographics/birthDate'
import { completedYears } from '../../../src/core/parse/loader'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)

describe('birthDateInterval', () => {
  it('brackets the birth dates that yield a stated age', () => {
    const iv = birthDateInterval(utc('2022-01-15'), 46)
    expect(day(iv.lo)).toBe('1975-01-16')
    expect(day(iv.hi)).toBe('1976-01-15')
  })

  it('agrees with completedYears at both ends and fails one day outside', () => {
    const labDate = utc('2022-01-15')
    const iv = birthDateInterval(labDate, 46)
    expect(completedYears(iv.lo, labDate)).toBe(46)
    expect(completedYears(iv.hi, labDate)).toBe(46)
    const beforeLo = new Date(iv.lo.getTime() - 86_400_000)
    const afterHi = new Date(iv.hi.getTime() + 86_400_000)
    expect(completedYears(beforeLo, labDate)).toBe(47)
    expect(completedYears(afterHi, labDate)).toBe(45)
  })
})

describe('addYearsUtc', () => {
  it('clamps 29 February to 28 February in a non-leap year', () => {
    expect(day(addYearsUtc(utc('2024-02-29'), -1))).toBe('2023-02-28')
  })
})

describe('intersectBirthIntervals', () => {
  it('overlaps for ages that fit one birth date', () => {
    const iv = intersectBirthIntervals([
      birthDateInterval(utc('2022-01-15'), 46),
      birthDateInterval(utc('2022-07-20'), 46),
      birthDateInterval(utc('2023-03-02'), 47),
    ])!
    expect(isEmptyInterval(iv)).toBe(false)
    expect(day(iv.lo)).toBe('1975-07-21')
    expect(day(iv.hi)).toBe('1976-01-15')
  })

  it('is empty when one age is a typo', () => {
    const iv = intersectBirthIntervals([
      birthDateInterval(utc('2022-01-15'), 46),
      birthDateInterval(utc('2022-07-20'), 46),
      birthDateInterval(utc('2023-03-02'), 64),
    ])!
    expect(isEmptyInterval(iv)).toBe(true)
    expect(intervalGapDays(iv)).toBeGreaterThan(5000)
  })

  it('returns null for no intervals at all', () => {
    expect(intersectBirthIntervals([])).toBeNull()
  })
})

describe('intervalMidpoint and medianDate', () => {
  it('takes the middle of a range', () => {
    expect(day(intervalMidpoint({ lo: utc('2000-01-01'), hi: utc('2000-01-11') }))).toBe('2000-01-06')
  })

  it('returns an input date rather than a synthetic one', () => {
    const dates = [utc('2000-01-01'), utc('2000-06-01'), utc('2000-12-01')]
    expect(day(medianDate(dates)!)).toBe('2000-06-01')
    expect(medianDate([])).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/demographics/birthDate.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/core/demographics/birthDate"`

- [ ] **Step 5: Write the implementation**

`src/core/demographics/birthDate.ts`:

```ts
import type { BirthInterval } from './types'

const MS_PER_DAY = 86_400_000

/** Shift a UTC date by whole years. 29 February in a non-leap target year would
 * roll forward into March, which would put an interval endpoint in the wrong
 * month; clamp it back to the last day of February instead. */
export function addYearsUtc(date: Date, delta: number): Date {
  const month = date.getUTCMonth()
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + delta, month, date.getUTCDate()))
  if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0)
  return shifted
}

/** The inclusive range of birth dates for which `completedYears(birth, labDate)`
 * equals `age`. "46 years old on 2022-01-15" means born 1975-01-16 … 1976-01-15. */
export function birthDateInterval(labDate: Date, age: number): BirthInterval {
  const hi = addYearsUtc(labDate, -age)
  const lo = addYearsUtc(labDate, -(age + 1))
  lo.setUTCDate(lo.getUTCDate() + 1)
  return { lo, hi }
}

/** Tightest range consistent with every input. Returns null only when there is
 * nothing to intersect; a contradiction comes back as an inverted interval, so
 * callers can report how far apart the constraints are. */
export function intersectBirthIntervals(intervals: readonly BirthInterval[]): BirthInterval | null {
  if (intervals.length === 0) return null
  let lo = intervals[0].lo
  let hi = intervals[0].hi
  for (const interval of intervals) {
    if (interval.lo.getTime() > lo.getTime()) lo = interval.lo
    if (interval.hi.getTime() < hi.getTime()) hi = interval.hi
  }
  return { lo, hi }
}

export function isEmptyInterval(interval: BirthInterval): boolean {
  return interval.lo.getTime() > interval.hi.getTime()
}

/** How far the constraints miss each other, in days. Zero for a valid range. */
export function intervalGapDays(interval: BirthInterval): number {
  const gap = interval.lo.getTime() - interval.hi.getTime()
  return gap <= 0 ? 0 : Math.round(gap / MS_PER_DAY)
}

export function intervalMidpoint(interval: BirthInterval): Date {
  return new Date(Math.round((interval.lo.getTime() + interval.hi.getTime()) / 2))
}

/** Median of dates, taking the earlier of the two middles for an even count so
 * the result is always one of the inputs rather than a synthetic half-day. */
export function medianDate(dates: readonly Date[]): Date | null {
  if (dates.length === 0) return null
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  return sorted[Math.floor((sorted.length - 1) / 2)]
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/core/demographics/birthDate.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add src/core/demographics/types.ts src/core/demographics/birthDate.ts src/core/parse/loader.ts tests/core/demographics/birthDate.test.ts
git commit -m "feat: add birth-date interval arithmetic for demographics resolution"
```

---

### Task 2: Carry the birth date through to the rows

The loader reads a `birthDate` column, converts it to a per-row age and throws the date away (`loader.ts:197-200`). When a file carries *both* `ageAtLab` and `birthDate`, `ageAtLab` wins and the exact answer sitting in the next column is discarded. Keeping the date lets the anchor be exact instead of inferred.

This is additive: a new optional field. No existing value changes, so the parity goldens are unaffected.

**Files:**
- Modify: `src/core/types.ts:37`
- Modify: `src/core/parse/loader.ts:191-201`
- Test: `tests/core/parse/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/parse/loader.test.ts`:

```ts
describe('birth date passthrough', () => {
  it('keeps the birth date even when an age column also exists', () => {
    const rows = loadLabRows([
      {
        patientId: 1,
        labDate: '2022-01-15',
        testName: 'Kreatinin',
        unit: 'mg/dl',
        value: '1,0',
        ageAtLab: 46,
        birthDate: '1975-06-12',
      },
    ])
    expect(rows[0].patientAgeAtLab).toBe(46)
    expect(rows[0].patientBirthDate?.toISOString().slice(0, 10)).toBe('1975-06-12')
  })

  it('leaves the field null when the column is absent', () => {
    const rows = loadLabRows([
      { patientId: 1, labDate: '2022-01-15', testName: 'Kreatinin', unit: 'mg/dl', value: '1,0' },
    ])
    expect(rows[0].patientBirthDate ?? null).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/parse/loader.test.ts -t "birth date passthrough"`
Expected: FAIL — `patientBirthDate` does not exist on type `LabRow`

- [ ] **Step 3: Add the field to the type**

In `src/core/types.ts`, inside `interface LabRow`, after `patientAgeAtLab`:

```ts
  patientAgeAtLab: number | null
  /** The birth date as read from the file, when the column was present. Kept so
   * demographics resolution can anchor ages exactly instead of inferring an
   * anchor from integer ages. Optional: datasets persisted before this field
   * existed, and row literals in tests, simply omit it. */
  patientBirthDate?: Date | null
```

- [ ] **Step 4: Populate it in the loader**

In `src/core/parse/loader.ts`, replace the age block at lines 191-201 with:

```ts
    const birthDate = hasBirth ? toDate(cell(r, columns, 'birthDate')) : null

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const a = cell(r, columns, 'ageAtLab')
      patientAgeAtLab =
        a === null || a === undefined || a === '' ? null : Math.trunc(Number(a))
      if (patientAgeAtLab !== null && Number.isNaN(patientAgeAtLab)) patientAgeAtLab = null
    } else if (birthDate) {
      patientAgeAtLab = labDatum ? completedYears(birthDate, labDatum) : null
    }
```

and add `patientBirthDate: birthDate,` to the pushed row literal, next to `patientAgeAtLab`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/core/parse/loader.test.ts tests/parity`
Expected: PASS — including every parity test, unchanged. A red parity test here means the age logic was altered rather than extended.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/parse/loader.ts tests/core/parse/loader.test.ts
git commit -m "feat: keep the parsed birth date on lab rows"
```

---

### Task 3: Sex resolution

**Files:**
- Create: `src/core/demographics/resolveSex.ts`
- Test: `tests/core/demographics/resolveSex.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/core/demographics/resolveSex.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSex } from '../../../src/core/demographics/resolveSex'

const base = { patientId: 1, attributeSex: null, manualSex: null } as const

describe('resolveSex', () => {
  it('reports nothing when every row agrees', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w', 'w'] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('takes the majority and reports the outlier', () => {
    const out = resolveSex({ ...base, rowSexes: [...Array(27).fill('w'), 'm'] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'sex_row_disagreement',
      resolved: 'w',
      counts: [{ sex: 'w', count: 27 }, { sex: 'm', count: 1 }],
    })
  })

  it('treats a tie as unknown', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'm'] })
    expect(out.sex).toBeNull()
    expect(out.conflicts[0].kind).toBe('sex_tie')
  })

  it('ignores unreadable spellings, which arrive as null', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', null, null] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('lets the attributes table win over the rows, and says so', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w'], attributeSex: 'm' })
    expect(out.sex).toBe('m')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'sex_source_disagreement',
      fromAttributes: 'm',
      fromRows: 'w',
    })
  })

  it('reports nothing when the attributes table merely confirms the rows', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w'], attributeSex: 'w' })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('goes quiet once a manual entry exists', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'm'], attributeSex: 'd', manualSex: 'w' })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/demographics/resolveSex.test.ts`
Expected: FAIL — cannot resolve `resolveSex`

- [ ] **Step 3: Write the implementation**

`src/core/demographics/resolveSex.ts`:

```ts
import type { PatientId, Sex } from '../types'
import type { DemographicsConflict, SexCount } from './types'

export interface SexResolutionInput {
  patientId: PatientId
  /** One entry per lab row of this patient; null for missing or unreadable. */
  rowSexes: readonly (Sex | null)[]
  attributeSex: Sex | null
  manualSex: Sex | null
}

export interface SexResolution {
  sex: Sex | null
  conflicts: DemographicsConflict[]
}

/** Votes per spelling, most frequent first; ties broken alphabetically so the
 * order is stable for both the tie check and the message text. */
function tally(rowSexes: readonly (Sex | null)[]): SexCount[] {
  const counts = new Map<Sex, number>()
  for (const sex of rowSexes) {
    if (sex === null) continue
    counts.set(sex, (counts.get(sex) ?? 0) + 1)
  }
  return [...counts]
    .map(([sex, count]) => ({ sex, count }))
    .sort((a, b) => b.count - a.count || a.sex.localeCompare(b.sex))
}

export function resolveSex(input: SexResolutionInput): SexResolution {
  const counts = tally(input.rowSexes)
  const tied = counts.length > 1 && counts[0].count === counts[1].count
  const fromRows = counts.length === 0 || tied ? null : counts[0].sex

  // A manual entry means the user already looked at this patient. Repeating the
  // underlying disagreement would nag about something they have resolved — the
  // same reason unrecognisedSexValues skips patients with manual demographics.
  if (input.manualSex !== null) return { sex: input.manualSex, conflicts: [] }

  const conflicts: DemographicsConflict[] = []
  if (tied) {
    conflicts.push({ kind: 'sex_tie', patientId: input.patientId, counts })
  } else if (counts.length > 1) {
    conflicts.push({
      kind: 'sex_row_disagreement',
      patientId: input.patientId,
      counts,
      resolved: counts[0].sex,
    })
  }

  if (input.attributeSex !== null) {
    if (fromRows !== null && fromRows !== input.attributeSex) {
      conflicts.push({
        kind: 'sex_source_disagreement',
        patientId: input.patientId,
        fromAttributes: input.attributeSex,
        fromRows,
      })
    }
    return { sex: input.attributeSex, conflicts }
  }
  return { sex: fromRows, conflicts }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/core/demographics/resolveSex.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/demographics/resolveSex.ts tests/core/demographics/resolveSex.test.ts
git commit -m "feat: resolve one sex per patient across manual, attributes and rows"
```

---

### Task 4: Birth-date anchor resolution

**Files:**
- Create: `src/core/demographics/resolveAge.ts`
- Test: `tests/core/demographics/resolveAge.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/core/demographics/resolveAge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveBirthAnchor } from '../../../src/core/demographics/resolveAge'
import { completedYears } from '../../../src/core/parse/loader'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)
const base = { patientId: 1, attributeBirthDate: null, manualAge: undefined } as const

describe('resolveBirthAnchor', () => {
  it('reproduces every stated age when the rows are consistent', () => {
    const rows = [
      { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2023-03-02'), ageAtLab: 47, birthDate: null },
    ]
    const out = resolveBirthAnchor({ ...base, rows })
    expect(out.conflicts).toEqual([])
    for (const row of rows) {
      expect(completedYears(out.birthAnchor!, row.labDatum)).toBe(row.ageAtLab)
    }
  })

  it('reports a typo that fits no single birth date', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2023-03-02'), ageAtLab: 64, birthDate: null },
      ],
    })
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({ kind: 'age_no_common_birth_date' })
    // The two agreeing rows outvote the typo, so the anchor lands in the 1970s.
    expect(out.birthAnchor!.getUTCFullYear()).toBeGreaterThan(1970)
  })

  it('prefers a birth date on the rows over the stated ages', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') },
        { labDatum: utc('2023-03-02'), ageAtLab: 64, birthDate: utc('1975-06-12') },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toEqual([])
  })

  it('prefers the attributes table over the rows', () => {
    const out = resolveBirthAnchor({
      ...base,
      attributeBirthDate: utc('1980-02-03'),
      rows: [{ labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') }],
    })
    expect(day(out.birthAnchor!)).toBe('1980-02-03')
  })

  it('reads a manual age as the age at the first lab date, so it ages with the series', () => {
    const out = resolveBirthAnchor({
      ...base,
      manualAge: 46,
      rows: [
        { labDatum: utc('2014-01-15'), ageAtLab: null, birthDate: null },
        { labDatum: utc('2022-01-15'), ageAtLab: null, birthDate: null },
      ],
    })
    expect(completedYears(out.birthAnchor!, utc('2014-01-15'))).toBe(46)
    expect(completedYears(out.birthAnchor!, utc('2022-01-15'))).toBe(54)
  })

  it('returns no anchor when there is nothing to anchor on', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [{ labDatum: utc('2022-01-15'), ageAtLab: null, birthDate: null }],
    })
    expect(out.birthAnchor).toBeNull()
    expect(out.conflicts).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/demographics/resolveAge.test.ts`
Expected: FAIL — cannot resolve `resolveBirthAnchor`

- [ ] **Step 3: Write the implementation**

`src/core/demographics/resolveAge.ts`:

```ts
import type { PatientId } from '../types'
import {
  birthDateInterval,
  intersectBirthIntervals,
  intervalGapDays,
  intervalMidpoint,
  isEmptyInterval,
  medianDate,
} from './birthDate'
import type { DemographicsConflict } from './types'

export interface AgeResolutionRow {
  labDatum: Date | null
  ageAtLab: number | null
  birthDate?: Date | null
}

export interface AgeResolutionInput {
  patientId: PatientId
  rows: readonly AgeResolutionRow[]
  attributeBirthDate: Date | null
  manualAge: number | undefined
}

export interface AgeResolution {
  /** The single birth date every row's age is derived from, or null when the
   * patient carries no age information at all — then the rows keep what they had. */
  birthAnchor: Date | null
  conflicts: DemographicsConflict[]
}

export function resolveBirthAnchor(input: AgeResolutionInput): AgeResolution {
  const dated = input.rows.filter((r): r is AgeResolutionRow & { labDatum: Date } => r.labDatum !== null)

  // 1. A manual age is the user's answer, read as the age at the first lab date
  //    so it ages across the series instead of freezing.
  if (input.manualAge !== undefined) {
    const earliest = dated.reduce<Date | null>(
      (min, r) => (min === null || r.labDatum.getTime() < min.getTime() ? r.labDatum : min),
      null,
    )
    if (earliest === null) return { birthAnchor: null, conflicts: [] }
    return { birthAnchor: intervalMidpoint(birthDateInterval(earliest, input.manualAge)), conflicts: [] }
  }

  // 2. and 3. An explicit birth date needs no inference.
  if (input.attributeBirthDate !== null) return { birthAnchor: input.attributeBirthDate, conflicts: [] }
  const rowBirthDate = dated.find((r) => r.birthDate != null)?.birthDate
  if (rowBirthDate != null) return { birthAnchor: rowBirthDate, conflicts: [] }

  // 4. Infer from the stated ages.
  const intervals = dated
    .filter((r) => r.ageAtLab !== null)
    .map((r) => birthDateInterval(r.labDatum, r.ageAtLab as number))
  const intersection = intersectBirthIntervals(intervals)
  if (intersection === null) return { birthAnchor: null, conflicts: [] }

  if (!isEmptyInterval(intersection)) {
    return { birthAnchor: intervalMidpoint(intersection), conflicts: [] }
  }

  return {
    birthAnchor: medianDate(intervals.map(intervalMidpoint)),
    conflicts: [
      {
        kind: 'age_no_common_birth_date',
        patientId: input.patientId,
        gapDays: intervalGapDays(intersection),
      },
    ],
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/core/demographics/resolveAge.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/demographics/resolveAge.ts tests/core/demographics/resolveAge.test.ts
git commit -m "feat: resolve one birth-date anchor per patient"
```

---

### Task 5: Assemble the resolution and prove the identity guarantee

The centrepiece test is the guarantee the whole design rests on: consistent input comes back untouched, by reference.

**Files:**
- Create: `src/core/demographics/resolve.ts`
- Test: `tests/core/demographics/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/core/demographics/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveDemographics } from '../../../src/core/demographics/resolve'
import type { LabRow } from '../../../src/core/types'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function row(patientId: number, date: string, sex: LabRow['patientSex'], age: number | null): LabRow {
  return {
    patientId,
    labDatum: utc(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1,0',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: sex,
    patientAgeAtLab: age,
  }
}

describe('resolveDemographics', () => {
  it('returns the very same array when the data is already consistent', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(1, '2022-07-20', 'w', 46),
      row(1, '2023-03-02', 'w', 47),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows).toBe(rows)
    expect(out.conflicts).toEqual([])
  })

  it('unifies a stray sex across the patient and reports it', () => {
    const rows = [row(1, '2022-01-15', 'w', 46), row(1, '2022-07-20', 'm', 46)]
    const out = resolveDemographics(rows, {}, {})
    // Two rows, one each: a tie, so sex becomes unknown for the whole patient.
    expect(out.rows.map((r) => r.patientSex)).toEqual([null, null])
    expect(out.conflicts.map((c) => c.kind)).toEqual(['sex_tie'])
  })

  it('rewrites a typo age from the anchor the other rows imply', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(1, '2022-07-20', 'w', 46),
      row(1, '2023-03-02', 'w', 64),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows[2].patientAgeAtLab).toBe(47)
    expect(out.conflicts.map((c) => c.kind)).toEqual(['age_no_common_birth_date'])
  })

  it('ages a manually entered age across the series', () => {
    const rows = [row(1, '2014-01-15', 'w', null), row(1, '2022-01-15', 'w', null)]
    const out = resolveDemographics(rows, {}, { '1': { age: 46 } })
    expect(out.rows.map((r) => r.patientAgeAtLab)).toEqual([46, 54])
  })

  it('reads sex and birthDate from the attributes table', () => {
    const rows = [row(1, '2022-01-15', 'w', 46)]
    const out = resolveDemographics(rows, { '1': { sex: 'male', birthDate: '1980-02-03' } }, {})
    expect(out.rows[0].patientSex).toBe('m')
    expect(out.rows[0].patientAgeAtLab).toBe(41)
    expect(out.conflicts.map((c) => c.kind)).toEqual(['sex_source_disagreement'])
  })

  it('keeps patients independent of one another', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(2, '2022-01-15', 'm', 46),
      row(2, '2023-03-02', 'm', 64),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows[0]).toBe(rows[0])
    expect(out.conflicts.every((c) => c.patientId === 2)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/demographics/resolve.test.ts`
Expected: FAIL — cannot resolve `resolveDemographics`

- [ ] **Step 3: Write the implementation**

`src/core/demographics/resolve.ts`:

```ts
import type { ManualDemographics } from '../analysis/types'
import { normaliseSex } from '../egfr/formulas'
import { completedYears } from '../parse/loader'
import { comparePatientIds, patientIdKey, type LabRow } from '../types'
import { resolveBirthAnchor } from './resolveAge'
import { resolveSex } from './resolveSex'
import type { DemographicsConflict } from './types'

export interface DemographicsResolution {
  rows: LabRow[]
  conflicts: DemographicsConflict[]
}

interface Resolved {
  sex: LabRow['patientSex']
  birthAnchor: Date | null
}

function parseAttributeDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Decide one sex and one birth-date anchor per patient, then derive every row's
 * demographics from that decision. Rows whose values already match are returned
 * untouched, and when no patient changes at all the input array itself comes
 * back — consistent data must not produce a new object graph downstream.
 */
export function resolveDemographics(
  rows: LabRow[],
  patientAttributes: Record<string, Record<string, string>>,
  manual: Record<string, ManualDemographics>,
): DemographicsResolution {
  const byPatient = new Map<string, LabRow[]>()
  for (const row of rows) {
    const key = patientIdKey(row.patientId)
    const bucket = byPatient.get(key)
    if (bucket) bucket.push(row)
    else byPatient.set(key, [row])
  }

  const resolved = new Map<string, Resolved>()
  const conflicts: DemographicsConflict[] = []

  for (const [key, patientRows] of byPatient) {
    const patientId = patientRows[0].patientId
    const attributes = patientAttributes[key] ?? {}
    const manualDemo = manual[key]

    const sexResult = resolveSex({
      patientId,
      rowSexes: patientRows.map((r) => r.patientSex),
      attributeSex: normaliseSex(attributes.sex),
      manualSex: manualDemo?.sex ?? null,
    })
    const ageResult = resolveBirthAnchor({
      patientId,
      rows: patientRows.map((r) => ({
        labDatum: r.labDatum,
        ageAtLab: r.patientAgeAtLab,
        birthDate: r.patientBirthDate ?? null,
      })),
      attributeBirthDate: parseAttributeDate(attributes.birthDate),
      manualAge: manualDemo?.age,
    })

    resolved.set(key, { sex: sexResult.sex, birthAnchor: ageResult.birthAnchor })
    conflicts.push(...sexResult.conflicts, ...ageResult.conflicts)
  }

  let changed = false
  const mapped = rows.map((row) => {
    const decision = resolved.get(patientIdKey(row.patientId))
    if (!decision) return row
    const age =
      decision.birthAnchor && row.labDatum
        ? completedYears(decision.birthAnchor, row.labDatum)
        : row.patientAgeAtLab
    if (decision.sex === row.patientSex && age === row.patientAgeAtLab) return row
    changed = true
    return { ...row, patientSex: decision.sex, patientAgeAtLab: age }
  })

  conflicts.sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.kind.localeCompare(b.kind))
  return { rows: changed ? mapped : rows, conflicts }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/core/demographics/resolve.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/demographics/resolve.ts tests/core/demographics/resolve.test.ts
git commit -m "feat: resolve demographics per patient across a row set"
```

---

### Task 6: Wire the module into the pipeline

**Files:**
- Create: `src/core/demographics/describe.ts`
- Create: `src/core/analysis/demographicsModule.ts`
- Modify: `src/core/analysis/types.ts:37`
- Modify: `src/core/analysis/registry.ts:41`, `:64`
- Modify: `src/core/analysis/egfrModule.ts:1-26`
- Modify: `src/ui/state/store.ts:245-256`, `:454-457`
- Test: `tests/core/analysis/demographicsModule.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/core/analysis/demographicsModule.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { demographicsModule } from '../../../src/core/analysis/demographicsModule'
import type { LabRow } from '../../../src/core/types'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function row(date: string, age: number): LabRow {
  return {
    patientId: 1,
    labDatum: utc(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1,0',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'w',
    patientAgeAtLab: age,
  }
}

describe('demographicsModule', () => {
  it('turns conflicts into warning messages naming the patient', () => {
    const contribution = demographicsModule.apply({
      rows: [row('2022-01-15', 46), row('2022-07-20', 46), row('2023-03-02', 64)],
      manualDemographics: {},
      patientAttributes: {},
      events: [],
    })
    expect(contribution.messages).toHaveLength(1)
    expect(contribution.messages![0].severity).toBe('warning')
    expect(contribution.messages![0].text).toContain('Patient 1')
    expect(contribution.messages![0].text).toContain('no single birth date')
    expect(contribution.rows![2].patientAgeAtLab).toBe(47)
  })

  it('stays silent and passes rows through for consistent data', () => {
    const rows = [row('2022-01-15', 46), row('2022-07-20', 46)]
    const contribution = demographicsModule.apply({
      rows,
      manualDemographics: {},
      patientAttributes: {},
      events: [],
    })
    expect(contribution.rows).toBe(rows)
    expect(contribution.messages).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/analysis/demographicsModule.test.ts`
Expected: FAIL — cannot resolve `demographicsModule`

- [ ] **Step 3: Write the message text**

`src/core/demographics/describe.ts`:

```ts
import { patientIdKey } from '../types'
import type { DemographicsConflict } from './types'

export function conflictId(conflict: DemographicsConflict): string {
  return `demographics:${conflict.kind}:${patientIdKey(conflict.patientId)}`
}

/** One sentence per conflict: what disagreed, and what won. Kept out of the
 * module so the wording can be tested without building a pipeline context. */
export function describeConflict(conflict: DemographicsConflict): string {
  switch (conflict.kind) {
    case 'sex_row_disagreement': {
      const parts = conflict.counts.map(
        (c) => `${c.count} ${c.count === 1 ? 'row says' : 'rows say'} "${c.sex}"`,
      )
      return `Patient ${conflict.patientId}: ${parts.join(', ')} — resolved as "${conflict.resolved}".`
    }
    case 'sex_tie': {
      const parts = conflict.counts.map((c) => `${c.count} × "${c.sex}"`)
      return (
        `Patient ${conflict.patientId}: sex is split evenly (${parts.join(', ')}) — treated as ` +
        `unknown, so no eGFR is computed. Enter it under Patients to resolve.`
      )
    }
    case 'sex_source_disagreement':
      return (
        `Patient ${conflict.patientId}: the attributes table says "${conflict.fromAttributes}", ` +
        `the lab rows say "${conflict.fromRows}" — the attributes table wins.`
      )
    case 'age_no_common_birth_date':
      return (
        `Patient ${conflict.patientId}: the age values fit no single birth date ` +
        `(${conflict.gapDays} days apart) — ages derived from the median instead.`
      )
  }
}
```

- [ ] **Step 4: Write the module**

`src/core/analysis/demographicsModule.ts`:

```ts
import { conflictId, describeConflict } from '../demographics/describe'
import { resolveDemographics } from '../demographics/resolve'
import type { AnalysisContext, AnalysisContribution } from './types'

/** First module in the pipeline: every later module, and every consumer of
 * analysisResult.rows, sees demographics that have already been made consistent
 * per patient. Takes no settings — resolution is not optional. */
export const demographicsModule = {
  id: 'demographics',
  label: 'Demographics',
  apply: (ctx: AnalysisContext): AnalysisContribution => {
    const { rows, conflicts } = resolveDemographics(
      ctx.rows,
      ctx.patientAttributes,
      ctx.manualDemographics,
    )
    return {
      rows,
      messages: conflicts.map((conflict) => ({
        id: conflictId(conflict),
        text: describeConflict(conflict),
        severity: 'warning' as const,
      })),
    }
  },
}
```

- [ ] **Step 5: Extend the context type**

In `src/core/analysis/types.ts`, `interface AnalysisContext`:

```ts
export interface AnalysisContext {
  rows: LabRow[]
  manualDemographics: Record<string, ManualDemographics>
  patientAttributes: Record<string, Record<string, string>>
  events: ClinicalEvent[]
}
```

- [ ] **Step 6: Register the module and thread the attributes**

In `src/core/analysis/registry.ts`, add the import and put the module first:

```ts
import { demographicsModule } from './demographicsModule'

export const analysisModules: readonly RegisteredAnalysisModule[] = [
  demographicsModule,
  adaptModule('egfr', egfrModule),
  adaptModule('aki', akiModule),
  adaptModule('rapidEgfrDecline', rapidEgfrDeclineModule),
]
```

Add `patientAttributes` to `ComputeAnalysisResultOptions`, to the destructured parameters of `computeAnalysisResult`, and to the context passed to each module:

```ts
export interface ComputeAnalysisResultOptions {
  rows: LabRow[]
  manualDemographics: Record<string, ManualDemographics>
  patientAttributes: Record<string, Record<string, string>>
  events: ClinicalEvent[]
  settings: AnalysisSettings
  modules?: readonly RegisteredAnalysisModule[]
}
```

```ts
    const contribution = module.apply(
      { rows: currentRows, manualDemographics, patientAttributes, events },
      settings,
    )
```

- [ ] **Step 7: Strip the old override out of the eGFR module**

`src/core/analysis/egfrModule.ts` becomes, in full:

```ts
import { appendComputedEgfr } from '../egfr/series'
import type { AnalysisModule, EgfrModuleSettings } from './types'

export const egfrModule: AnalysisModule<EgfrModuleSettings> = {
  id: 'egfr',
  label: 'eGFR',
  defaultSettings: { formula: 'off', source: null },
  apply: (ctx, settings) => {
    if (settings.formula === 'off') return {}
    return { rows: appendComputedEgfr(ctx.rows, { formula: settings.formula, source: settings.source }) }
  },
}
```

Manual demographics are already applied by the time this runs, so the module no longer needs to know about them — and returning `{}` when the formula is off is now correct, because it no longer has rows of its own to contribute.

- [ ] **Step 8: Thread the attributes through the store**

In `src/ui/state/store.ts`, extend `computeStoreAnalysisResult` to take and cache the attributes:

```ts
  if (
    analysisCache &&
    analysisCache.rows === rows &&
    analysisCache.settings === settings &&
    analysisCache.manual === manual &&
    analysisCache.attributes === attributes &&
    analysisCache.events === events
  ) return analysisCache.result

  const result = computeAnalysisResult({
    rows,
    settings,
    manualDemographics: manual,
    patientAttributes: attributes,
    events,
  })
  analysisCache = { rows, settings, manual, attributes, events, result }
  return result
```

Add `attributes` to the parameter list and to the `analysisCache` type declaration, and update the caller:

```ts
  analysisResult: () => {
    const s = get()
    return computeStoreAnalysisResult(
      s.rows,
      s.analysisSettings,
      s.manualDemographics,
      s.patientAttributes,
      s.events,
    )
  },
```

Caching on `attributes` identity is required, not decorative: without it, uploading an attributes table would leave the previous result in place.

- [ ] **Step 9: Run the full suite**

Run: `pnpm test`
Expected: PASS. Existing tests calling `computeAnalysisResult` need `patientAttributes: {}` added; fix each call site rather than making the field optional, so a future module cannot silently receive an empty map.

- [ ] **Step 10: Commit**

```bash
git add src/core/demographics/describe.ts src/core/analysis/ src/ui/state/store.ts tests/
git commit -m "feat: resolve demographics as the first analysis pipeline step"
```

---

### Task 7: Show the conflicts in the sidebar

`AnalysisResult.messages` has never had a consumer. This builds the first one.

**Files:**
- Modify: `src/ui/shell/Sidebar.tsx:235`
- Test: `tests/ui/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/Sidebar.test.tsx`, using the `row` helper and `setDataset`
pattern that file already uses. Note the deliberate absence of
`setEgfrFormula`: the note must appear with the formula off.

```tsx
describe('demographics conflict notes', () => {
  it('names the patient and shows with the eGFR formula off', () => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2022-01-15'), patientSex: 'w', patientAgeAtLab: 46 }),
      row({ patientId: 1, labDatum: new Date('2022-07-20'), patientSex: 'w', patientAgeAtLab: 46 }),
      row({ patientId: 1, labDatum: new Date('2023-03-02'), patientSex: 'w', patientAgeAtLab: 64 }),
    ])
    render(<Sidebar />)
    expect(screen.getByText(/no single birth date/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/ui/Sidebar.test.tsx -t "demographics conflict"`
Expected: FAIL — text not found

- [ ] **Step 3: Render the notes**

In `src/ui/shell/Sidebar.tsx`, read the messages near the other derived values:

```ts
  const DEMOGRAPHICS_CONFLICT_CAP = 4
  const demographicsConflicts = useAppStore((s) => s.analysisResult().messages)
    .filter((m) => m.id.startsWith('demographics:'))
```

and render them immediately after the `unrecognisedSexValues` note, deliberately **without** an `egfrFormula !== 'off'` gate, because an age conflict also corrupts the age x-axis:

```tsx
            {demographicsConflicts.length > 0 && (
              <div className="sidebar-note sidebar-warning" role="status" aria-live="polite">
                {demographicsConflicts.slice(0, DEMOGRAPHICS_CONFLICT_CAP).map((message) => (
                  <p key={message.id}>{message.text}</p>
                ))}
                {demographicsConflicts.length > DEMOGRAPHICS_CONFLICT_CAP && (
                  <p>and {demographicsConflicts.length - DEMOGRAPHICS_CONFLICT_CAP} more</p>
                )}
              </div>
            )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/ui/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/shell/Sidebar.tsx tests/ui/Sidebar.test.tsx
git commit -m "feat: surface demographics conflicts in the sidebar"
```

---

### Task 8: Carry the conflict into the export

**Files:**
- Modify: `src/core/cohort/screening.ts:309`, `:328`
- Modify: `src/ui/cohort/CohortView.tsx` (the export call site)
- Test: `tests/core/cohort/exportRecords.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/cohort/exportRecords.test.ts`:

```ts
it('flags patients whose demographics were contradictory', () => {
  const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
  const rows = [
    row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
    row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
    row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
  ]
  const cohort = buildCohortRows(rows, [1], [spec])
  expect(cohortExportRecords(cohort, 0, new Set(['1']))[0].demographics_conflict).toBe('yes')
  expect(cohortExportRecords(cohort, 0, new Set())[0].demographics_conflict).toBe('')
  expect(cohortExportRecords(cohort)[0].demographics_conflict).toBe('')
})
```

The third assertion pins the default: existing call sites that pass no set must
keep exporting a blank column rather than crashing or claiming a conflict.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/core/cohort/exportRecords.test.ts`
Expected: FAIL — `cohortExportRecords` takes two arguments

- [ ] **Step 3: Add the parameter and the column**

In `src/core/cohort/screening.ts`:

```ts
/** Flatten cohort rows into export records (one per patient × series). Pass the
 * rapid-progression threshold (mL/min/1.73m²/yr) to populate rapid_progression;
 * 0 (default) leaves the flag off. `conflictPatientKeys` holds the patientIdKey
 * of every patient whose demographics had to be resolved from contradictory
 * input, so the caveat travels with the exported table. */
export function cohortExportRecords(
  rows: CohortRow[],
  rapidThreshold = 0,
  conflictPatientKeys: ReadonlySet<string> = new Set(),
): CohortExportRecord[] {
```

and next to `unstable_slope` in the record literal:

```ts
        demographics_conflict: conflictPatientKeys.has(patientIdKey(r.patientId)) ? 'yes' : '',
```

Add `demographics_conflict: string` to `CohortExportRecord`, and import `patientIdKey` if it is not already imported in that file.

- [ ] **Step 4: Pass the set from the call site**

In `src/ui/cohort/CohortView.tsx`, where the export records are built:

```ts
  const demographicsConflictKeys = useMemo(
    () =>
      new Set(
        analysisResult.messages
          .filter((m) => m.id.startsWith('demographics:'))
          .map((m) => m.id.split(':')[2]),
      ),
    [analysisResult.messages],
  )
```

and pass it as the third argument to `cohortExportRecords`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/core/cohort tests/ui/exports.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/cohort/screening.ts src/ui/cohort/CohortView.tsx tests/core/cohort/exportRecords.test.ts
git commit -m "feat: flag contradictory demographics in the cohort export"
```

---

### Task 9: Offer sex as a grouping attribute

**Files:**
- Modify: `src/ui/cohort/CohortView.tsx:144`
- Test: `tests/ui/CohortView.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/CohortView.test.tsx`. Note the corrected setup: `CohortView`
gates its whole table (and the group-by selector) behind `specs.length > 0`
(`CohortView.tsx:264`), a check that predates this plan. A bare `reset()` +
`setDataset()` — as an earlier draft of this test had it — never selects a
series, so the component renders only the empty-state paragraph and the test
fails for the wrong reason. Seed a series the way the rest of the file does:
give the rows a `bezeichnung`/`einheit` and call `setSeriesConfig(0, ...)` with
the same pair, mirroring the file's `seedValidEgfrCohort` pattern.

```tsx
it('offers sex for grouping without an attributes table', () => {
  useAppStore.getState().setDataset([
    row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.0, patientSex: 'w' }),
    row({ patientId: 2, labDatum: new Date('2020-01-01'), wertNum: 1.1, patientSex: 'm' }),
  ])
  useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

  render(<CohortView />)

  expect(screen.getByLabelText(/group by/i)).toHaveTextContent('sex')
})
```

Also pin the merge order the `groupableAttributes` docstring in Step 3 claims
("the attributes table wins on a key collision") — nothing currently tests it:

```tsx
it('lets the attributes table override a row-derived sex on a key collision', () => {
  useAppStore.getState().setDataset([
    row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.0, patientSex: 'w' }),
    row({ patientId: 1, labDatum: new Date('2020-06-01'), wertNum: 1.1, patientSex: 'w' }),
  ])
  useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  useAppStore.getState().setPatientAttributes({ '1': { sex: 'm' } })
  useAppStore.getState().setCohortGroupByAttribute('sex')

  render(<CohortView />)

  expect(screen.getByRole('cell', { name: 'm' })).toBeInTheDocument()
  expect(screen.queryByRole('cell', { name: 'w' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/ui/CohortView.test.tsx -t "offers sex"`
Expected: FAIL — with a series selected, the cohort table itself renders (rows,
sort controls, the lot), but the group-by selector does not render at all: it
is wrapped in `(groupByOptions.length > 0 || groupByAttribute !== null)`, and
`availableGroupByAttributes` only reads `patientAttributes`, which is empty
here. So the failure is a missing option starving the selector's render
condition, not a missing option inside an otherwise-visible `<select>`.

- [ ] **Step 3: Merge row demographics into the grouping source**

Grouping reads its values from `patientAttributes` in two places —
`buildCohortRows(displayRows, patientIds, specs, groupByAttribute, patientAttributes)`
(`CohortView.tsx:163`) and `groupPatients(patientIds, patientAttributes, groupByAttribute)`
(`CohortView.tsx:225`). Rather than teaching both about lab rows, build one
augmented map and pass that to both. `screening.ts` needs no change at all.

In `src/ui/cohort/CohortView.tsx`, next to the other memos:

```ts
  /** Patient attributes plus the demographics that live on the lab rows, so the
   * cohort can be grouped by sex without a second spreadsheet. The attributes
   * table wins on a key collision, which is free of consequence: the
   * demographics module has already merged both sources into one value, so they
   * agree by construction. */
  const groupableAttributes = useMemo(() => {
    const merged: Record<string, Record<string, string>> = {}
    for (const r of displayRows) {
      if (r.patientSex === null) continue
      const key = patientIdKey(r.patientId)
      if (merged[key] === undefined) merged[key] = { sex: r.patientSex }
    }
    for (const [key, attributes] of Object.entries(patientAttributes)) {
      merged[key] = { ...merged[key], ...attributes }
    }
    return merged
  }, [displayRows, patientAttributes])
```

Then replace `patientAttributes` with `groupableAttributes` in three places: the
loop inside `availableGroupByAttributes` (`CohortView.tsx:146`), the
`buildCohortRows` call (`:163`) and the `groupPatients` call (`:225`) — including
their dependency arrays. Import `patientIdKey` from `../../core/types` if it is
not already imported.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/ui/CohortView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortView.tsx tests/ui/CohortView.test.tsx
git commit -m "feat: allow grouping the cohort by sex"
```

---

### Task 10: Regenerate the demo workbook

7 of 13 patients in `public/test_labs.xlsx` have ages that fit no single birth date. Shipping that means more than half the demo cohort raises a warning on first run — and the file fails the very guarantee we give real data.

`tests/fixtures/test_labs.xlsx` is deliberately **not** regenerated: it mirrors the Python reference data behind the parity goldens, and its inconsistency makes it a useful fixture for the conflict path.

**Files:**
- Create: `scripts/regen_demo_birthdates.mjs`
- Modify: `public/test_labs.xlsx`
- Test: `tests/io/demoFixture.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/io/demoFixture.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows } from '../../src/core/parse/loader'
import { resolveDemographics } from '../../src/core/demographics/resolve'

describe('shipped demo workbook', () => {
  it('carries demographics that resolve without conflict', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const rows = loadLabRows(
      readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    )
    const { rows: resolved, conflicts } = resolveDemographics(rows, {}, {})
    expect(conflicts).toEqual([])
    // The guarantee, exercised on the file we actually ship.
    expect(resolved).toBe(rows)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/io/demoFixture.test.ts`
Expected: FAIL — 7 conflicts of kind `age_no_common_birth_date`

- [ ] **Step 3: Write the regeneration script**

`scripts/regen_demo_birthdates.mjs`:

```js
// Rewrite PatientAgeAtLab in the shipped demo workbook so every patient's ages
// derive from one birth date. The anchor is the midpoint of the interval implied
// by that patient's earliest row, so the data moves as little as possible.
// One-off: run it, commit the workbook, done.
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const FILE = new URL('../public/test_labs.xlsx', import.meta.url)
const MS_PER_DAY = 86_400_000

const addYears = (date, delta) => {
  const month = date.getUTCMonth()
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + delta, month, date.getUTCDate()))
  if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0)
  return shifted
}

const completedYears = (birth, ref) => {
  let years = ref.getUTCFullYear() - birth.getUTCFullYear()
  const reached =
    ref.getUTCMonth() > birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() >= birth.getUTCDate())
  return reached ? years : years - 1
}

const book = XLSX.read(readFileSync(FILE), { cellDates: true })
const sheetName = book.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName])

const earliest = new Map()
for (const row of rows) {
  if (row.LabDatum == null || row.PatientAgeAtLab == null) continue
  const date = new Date(row.LabDatum)
  const seen = earliest.get(row.PatientID)
  if (!seen || date < seen.date) earliest.set(row.PatientID, { date, age: Number(row.PatientAgeAtLab) })
}

const anchors = new Map()
for (const [patientId, { date, age }] of earliest) {
  const hi = addYears(date, -age)
  const lo = addYears(date, -(age + 1))
  lo.setUTCDate(lo.getUTCDate() + 1)
  anchors.set(patientId, new Date(Math.round((lo.getTime() + hi.getTime()) / 2)))
}

let rewritten = 0
for (const row of rows) {
  const anchor = anchors.get(row.PatientID)
  if (!anchor || row.LabDatum == null) continue
  const age = completedYears(anchor, new Date(row.LabDatum))
  if (age !== row.PatientAgeAtLab) rewritten += 1
  row.PatientAgeAtLab = age
}

book.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows)
writeFileSync(FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
console.log(`patients: ${anchors.size}, rewritten age cells: ${rewritten} of ${rows.length}`)
```

- [ ] **Step 4: Run the script**

Run: `pnpm exec node scripts/regen_demo_birthdates.mjs`
Expected: a line reporting 13 patients and a non-zero count of rewritten cells.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/io/demoFixture.test.ts`
Expected: PASS

- [ ] **Step 6: Run the whole suite and the build**

Run: `pnpm test && pnpm build`
Expected: PASS. Some UI snapshots or assertions may reference demo eGFR values; update those, and note in the commit which numbers moved and why.

- [ ] **Step 7: Commit**

```bash
git add scripts/regen_demo_birthdates.mjs public/test_labs.xlsx tests/io/demoFixture.test.ts
git commit -m "fix: give the demo workbook internally consistent ages"
```

---

### Task 11: Browser regression for the conflict note

Sidebar geometry is worthless in jsdom, so the note gets one Chromium case alongside the existing PR 5 subset.

**Files:**
- Modify: `tests/e2e/pr5-quality.e2e.ts` or a sibling spec following the same upload pattern
- Modify: `tests/e2e/smoke.md`

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/pr5-quality.e2e.ts`, using its existing
`uploadCsv(page, name, csv)` helper (`pr5-quality.e2e.ts:29`):

```ts
test('reports a patient whose ages fit no single birth date', async ({ page }) => {
  await uploadCsv(page, 'age-conflict.csv', [
    'patientId,labDate,testName,unit,value,sex,ageAtLab',
    '1,2022-01-15,Kreatinin,mg/dl,1.0,w,46',
    '1,2022-07-20,Kreatinin,mg/dl,1.2,w,46',
    '1,2023-03-02,Kreatinin,mg/dl,1.4,w,64',
  ].join('\n'))
  await expect(page.getByText(/no single birth date/i)).toBeVisible()
})
```

- [ ] **Step 2: Run it to verify it fails, then passes**

Run: `pnpm test:e2e`
Expected: FAIL before Task 7 is in place, PASS after.

- [ ] **Step 3: Update the manual checklist**

In `tests/e2e/smoke.md`, add a demographics-conflict step to the relevant phase and refresh that phase's `Verified <date>` line.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test: cover the demographics conflict note in Chromium"
```

---

## Final verification

- [ ] `pnpm test` — full unit suite green, **parity tests unmodified**
- [ ] `pnpm build` — clean
- [ ] `pnpm test:e2e` — Chromium subset green
- [ ] `git diff main --stat -- tests/parity tests/goldens` — **empty**. Any change here means resolution leaked into the ported core and the goldens stopped meaning anything.
- [ ] Run `/code-review` on the branch before opening the PR, per `CLAUDE.md`
- [ ] In the PR body, list which demo eGFR values moved and by how much
