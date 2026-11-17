import { describe, expect, it } from 'vitest'
import type { CohortCell } from '../../../src/core/cohort/screening'
import type { ClinicalEvent } from '../../../src/core/events/events'
import { fitInclusionCaveat } from '../../../src/workspace/labels/fitInclusion'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const dates = ['2020-01-01', '2020-06-01', '2020-06-10', '2021-01-01', '2022-01-01']
function cell(patch: Partial<CohortCell> = {}): CohortCell {
  return {
    bezeichnung: 'eGFR', einheit: 'ml/min/1.73m²', fitModel: 'ols', slope: -3,
    points: dates.map(date => ({ date: day(date), value: 60 })),
    pointExclusionReasons: dates.map(() => []),
    overlays: [{ kind: 'band', moduleId: 'aki', start: day('2020-06-01'), end: day('2020-07-01'), title: '' }],
    ...patch,
  } as CohortCell
}
const transplant: ClinicalEvent = { patientId: 'A', type: 'kidney_transplant', date: day('2021-01-01'), endDate: null, title: 'Tx', description: null, intent: null, warning: '' }

describe('fitInclusionCaveat', () => {
  it('counts unexcluded values per window, event windows first, boundaries included', () => {
    expect(fitInclusionCaveat(cell(), [transplant])?.label).toBe('Fit includes 2 values after kidney transplant, 2 values in an AKI window')
  })
  it('counts a value in two windows once, under the event', () => {
    const early = { ...transplant, date: day('2020-06-10') }
    expect(fitInclusionCaveat(cell(), [early])?.label).toBe('Fit includes 3 values after kidney transplant, 1 value in an AKI window')
  })
  it('leaves out values the column already excludes', () => {
    const excluded = cell({ pointExclusionReasons: [[], ['aki'], ['aki'], [], []] })
    expect(fitInclusionCaveat(excluded, [])).toBeNull()
  })
  it('says nothing without a slope, without a fit or for another parameter', () => {
    expect(fitInclusionCaveat(cell({ slope: Number.NaN }), [transplant])).toBeNull()
    expect(fitInclusionCaveat(cell({ fitModel: 'none' }), [transplant])).toBeNull()
    expect(fitInclusionCaveat(cell({ bezeichnung: 'HbA1c', einheit: '%' }), [transplant])).toBeNull()
  })
})
