import { describe, expect, it } from 'vitest'
import { mixedModelRowsFromCohortInputs } from '../../../src/core/mixedModel/cohortDataset'
import type { AkiEpisode } from '../../../src/core/aki/kdigo'
import type { AnalysisFitInputContribution } from '../../../src/core/analysis/types'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { ClinicalEvent } from '../../../src/core/events/events'
import { generalExplorationConfig } from '../../../src/core/fitPipeline/types'
import type { LabRow } from '../../../src/core/types'

const d = (s: string) => new Date(s)

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 7,
    labDatum: d('2020-01-01T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: null,
    ...p,
  }
}

describe('mixedModelRowsFromCohortInputs', () => {
  it('uses included raw fit points and years since first included point', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-07-01T00:00:00Z'), wertNum: 59 }),
      row({ labDatum: d('2021-01-01T00:00:00Z'), wertNum: 58 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '7', eGFR: 59, time_since_baseline: 0.4982888433 },
      { patient_id: '7', eGFR: 58, time_since_baseline: 1.0020533881 },
    ])
  })

  it('adds patient baseline age from the first included model point', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }
    const rows = [
      row({ patientId: 'p1', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 70, patientAgeAtLab: 50 }),
      row({ patientId: 'p1', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 68, patientAgeAtLab: 51 }),
      row({ patientId: 'p2', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ patientId: 'p2', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 58, patientAgeAtLab: 61 }),
      row({ patientId: 'p3', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 55, patientAgeAtLab: 70 }),
      row({ patientId: 'p3', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 53, patientAgeAtLab: 71 }),
    ]

    const modelRows = mixedModelRowsFromCohortInputs(rows, ['p1', 'p2', 'p3'], spec)

    expect(modelRows.filter((modelRow) => modelRow.patient_id === 'p1').map((modelRow) => modelRow.baseline_age)).toEqual([50, 50])
    expect(modelRows.filter((modelRow) => modelRow.patient_id === 'p2').map((modelRow) => modelRow.baseline_age)).toEqual([60, 60])
    expect(modelRows.filter((modelRow) => modelRow.patient_id === 'p1').map((modelRow) => modelRow.baseline_age_centered)).toEqual([-10, -10])
    expect(modelRows.filter((modelRow) => modelRow.patient_id === 'p2').map((modelRow) => modelRow.baseline_age_centered)).toEqual([0, 0])
  })

  it('applies selected time balancing before producing model rows', () => {
    const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    fitConfig.timeBalancing = 'monthly-median'
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global', fitConfig }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-01-20T00:00:00Z'), wertNum: 58 }),
      row({ labDatum: d('2020-02-01T00:00:00Z'), wertNum: 56 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 59, time_since_baseline: 0 },
      { patient_id: '7', eGFR: 56, time_since_baseline: 0.0848733744 },
    ])
  })

  it('applies clinical-event exclusions before producing model rows', () => {
    const transplant: ClinicalEvent = {
      patientId: 7,
      type: 'kidney_transplant',
      date: d('2021-01-01T00:00:00Z'),
      title: 'Kidney transplant',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      mode: 'global',
      clinicalEventsByPatient: { 7: [transplant] },
    }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2021-01-01T00:00:00Z'), wertNum: 50 }),
      row({ labDatum: d('2022-01-01T00:00:00Z'), wertNum: 40 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 60, time_since_baseline: 0 },
    ])
  })

  it('uses AKI fit input episodes and exclusion days without recomputing episodes', () => {
    const episode: AkiEpisode = {
      date: d('2020-02-01T00:00:00Z'),
      baselineDate: d('2020-01-01T00:00:00Z'),
      baselineValue: 1,
      peakValue: 2,
      peakDate: d('2020-02-01T00:00:00Z'),
      criterion: 'absolute_0_3_mg_dl_48h',
      stage: 1,
    }
    const fitInputs: AnalysisFitInputContribution[] = [{
      id: 'aki-aware:7:eGFR:ml/min/1.73m2',
      patientId: 7,
      seriesKey: { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' },
      kind: 'aki-aware',
      exclusionDays: 45,
      episodes: [episode],
    }]
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'aki-aware', fitInputs }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-02-01T00:00:00Z'), wertNum: 30 }),
      row({ labDatum: d('2020-03-10T00:00:00Z'), wertNum: 55 }),
      row({ labDatum: d('2020-04-20T00:00:00Z'), wertNum: 54 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '7', eGFR: 54, time_since_baseline: 0.3011635866 },
    ])
  })

  it('produces no rows when fitting is disabled (fitModel none)', () => {
    const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    fitConfig.fitModel = 'none'
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global', fitConfig }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2021-01-01T00:00:00Z'), wertNum: 58 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([])
  })

  it('drops chronic-ckd run-in points before the cutoff window', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'chronic-ckd', cutoffDays: 90 }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 70 }),
      row({ labDatum: d('2020-04-15T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-08-01T00:00:00Z'), wertNum: 50 }),
    ]

    // The 2020-01-01 point is within 90 days of baseline and is dropped; the
    // first kept point (2020-04-15) becomes the new time_since_baseline anchor.
    const result = mixedModelRowsFromCohortInputs(rows, [7], spec)
    expect(result.map((r) => r.eGFR)).toEqual([60, 50])
    expect(result[0].time_since_baseline).toBe(0)
    expect(result[1].time_since_baseline).toBeGreaterThan(0)
  })

  it('uses chronic-ckd post-cutoff first selected point as baseline age source', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'chronic-ckd', cutoffDays: 90 }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 70, patientAgeAtLab: 50 }),
      row({ labDatum: d('2020-04-15T00:00:00Z'), wertNum: 60, patientAgeAtLab: 51 }),
      row({ labDatum: d('2020-08-01T00:00:00Z'), wertNum: 50, patientAgeAtLab: 52 }),
    ]

    const result = mixedModelRowsFromCohortInputs(rows, [7], spec)

    expect(result.map((modelRow) => modelRow.baseline_age)).toEqual([51, 51])
    expect(result.map((modelRow) => modelRow.baseline_age_centered)).toEqual([0, 0])
  })

  it('dedupes patient ids and processes them in sorted order', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }
    const rows = [
      row({ patientId: 10, labDatum: d('2020-01-01T00:00:00Z'), wertNum: 70 }),
      row({ patientId: 2, labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [10, 2, 10], spec)).toEqual([
      { patient_id: '2', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '10', eGFR: 70, time_since_baseline: 0 },
    ])
  })
})
