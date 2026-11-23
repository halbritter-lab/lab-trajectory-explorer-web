import { describe, expect, it } from 'vitest'
import { buildCohortRows } from '../../../src/core/cohort/screening'
import { clinicalEventsByPatient, cohortSeriesSpec } from '../../../src/core/cohort/specs'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'
import { formatFixedDecimals } from '../../../src/core/format'
import { krtSegmentText, slopeTierNote } from '../../../src/workspace/labels/slopeTier'
import { fitInclusionCaveat, openUnknownDialysisWarning } from '../../../src/workspace/labels/fitInclusion'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const parameter = { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²' }
const lab = (date: string, value: number): LabRow => ({ patientId: 'P', labDatum: day(date), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 60 })
const yearly = (n: number, from = 2018) => Array.from({ length: n }, (_, i) => lab(`${from + i}-01-01`, 60 - 3 * i))
const cellOf = (rows: LabRow[], config = generalExplorationConfig(parameter), events: ClinicalEvent[] = []) =>
  buildCohortRows(rows, ['P'], [cohortSeriesSpec(parameter, config, { clinicalEventsByPatient: clinicalEventsByPatient(events) })])[0].cells[0]
const number = (value: number, signed = false) => formatFixedDecimals(value, 2, signed)

describe('slope tier note', () => {
  it('names a reliable slope with its dates and span, and what an estimable one lacks', () => {
    expect(slopeTierNote(cellOf(yearly(4)))).toMatchObject({ tier: 'reliable', short: 'reliable', label: 'Reliable slope' })
    expect(slopeTierNote(cellOf(yearly(4)))!.title).toMatch(/^4 fitted dates over 1096 days\. Reliable: at least 4 fitted measurement dates over at least 2 years/)
    const estimable = slopeTierNote(cellOf(yearly(3)))!
    expect(estimable).toMatchObject({ tier: 'estimable', label: 'Estimable slope' })
    expect(estimable.title).toMatch(/^Not yet reliable: 3 fitted dates and 730 days of fitted follow-up\./)
    // Uncertain and missing slopes have no tier note; their amber or grey note stays.
    expect(slopeTierNote(cellOf(yearly(2)))).toBeNull()
    expect(slopeTierNote(cellOf(yearly(4), { ...generalExplorationConfig(parameter), fitModel: 'none' }))).toBeNull()
  })
})

describe('notes on what a kidney-function fit leaves out (2026-11-22)', () => {
  const transplant: ClinicalEvent = { patientId: 'P', type: 'kidney_transplant', date: day('2020-06-01'), title: 'Tx', description: null, endDate: null, intent: null, warning: '' }
  it('describes the separate segment after a transplant once the values after it are included', () => {
    const config = generalExplorationConfig(parameter)
    expect(krtSegmentText(cellOf(yearly(5), config, [transplant]), number)).toBeNull()
    const included = cellOf(yearly(5), { ...config, censoring: { ...config.censoring, censorAfterKidneyTransplant: false } }, [transplant])
    expect(krtSegmentText(included, number)).toBe('After kidney transplant (01/06/2020), fitted as a separate segment: -3.00 mL/min/1.73m²/year (2 fitted, 2 dates, over 365 days). Not native kidney function; the slope above uses the values before it.')
    // No note on values the fit runs across: they are not part of the fit.
    expect(fitInclusionCaveat(included, [transplant])).toBeNull()
  })

  it('warns about values left out after an undated dialysis of unknown intent', () => {
    const dialysis: ClinicalEvent = { patientId: 'P', type: 'dialysis', date: day('2021-06-01'), title: 'HD', description: null, endDate: null, intent: 'unknown', warning: 'unknown_dialysis_intent' }
    const cell = cellOf(yearly(6), ckdProgressionConfig(parameter), [dialysis])
    expect(openUnknownDialysisWarning(cell)?.label).toBe('2 values after dialysis of unknown intent left out')
    expect(openUnknownDialysisWarning(cellOf(yearly(6), generalExplorationConfig(parameter), [dialysis]))).toBeNull()
  })
})
