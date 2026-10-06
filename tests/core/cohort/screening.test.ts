import { describe, it, expect } from 'vitest'
import { buildCohortRows, type CohortCell, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { formatAkiChip, formatAkiEpisodeSummary } from '../../../src/core/domains/nephrology/aki/summary'
import { episodesForSeries } from '../../../src/core/domains/nephrology/aki/akiAware'
import { akiFitInput } from '../../../src/core/domains/nephrology/aki/akiModule'
import type { LabRow } from '../../../src/core/types'
import type { AnalysisFitInputContribution } from '../../../src/core/analysis/types'
import type { ClinicalEvent } from '../../../src/core/events/events'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}
const d = (s: string) => new Date(s)
// The AKI module's chip, window bands and episode markers on a cohort cell.
const akiChip = (cell: CohortCell) => cell.flags.find((flag) => flag.moduleId === 'aki')?.label ?? ''
const akiBands = (cell: CohortCell) => cell.overlays.filter((overlay) => overlay.moduleId === 'aki' && overlay.kind === 'band')
const akiMarkers = (cell: CohortCell) => cell.overlays.flatMap((overlay) => overlay.moduleId === 'aki' && overlay.kind === 'marker' ? [overlay] : [])

describe('formatAkiChip', () => {
  it('formats single and repeated stages', () => {
    expect(formatAkiChip([])).toBe('')
    expect(formatAkiChip([2])).toBe('AKI II')
    expect(formatAkiChip([1, 1, 3])).toBe('AKI 2×I, III')
  })

  it('formats an explanatory AKI episode count summary', () => {
    expect(formatAkiEpisodeSummary([])).toBe('')
    expect(formatAkiEpisodeSummary([2])).toBe('1 AKI episode: 1× stage II')
    expect(formatAkiEpisodeSummary([1, 1, 3])).toBe('3 AKI episodes: 2× stage I, 1× stage III')
  })
})

describe('buildCohortRows', () => {
  const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
  it('builds one row per patient with a cell per series', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
      row({ patientId: 2, labDatum: d('2019-01-01'), wertNum: 0.9 }),
    ]
    const out = buildCohortRows(rows, [1, 2], [spec])
    expect(out).toHaveLength(2)
    expect(out[0].patientId).toBe(1)
    expect(out[0].cells).toHaveLength(1)
    expect(out[0].cells[0].nNumeric).toBe(3)
    expect(Number.isNaN(out[0].cells[0].slope)).toBe(false)
    expect(out[0].cells[0].points).toHaveLength(3)
  })

  it('stamps groupValue when an attribute name and attributes map are passed', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 2, labDatum: d('2019-01-01'), wertNum: 0.9 }),
      row({ patientId: 2, labDatum: d('2020-01-01'), wertNum: 1.1 }),
    ]
    const byPatient = { '1': { genotype: 'A' }, '2': {} }
    const out = buildCohortRows(rows, [1, 2], [spec], 'genotype', byPatient)
    expect(out[0].groupValue).toBe('A')
    expect(out[1].groupValue).toBe('(ungrouped)')
  })

  it('leaves groupValue undefined when no attribute name is passed (backward compatible)', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
    ]
    expect(buildCohortRows(rows, [1], [spec])[0].groupValue).toBeUndefined()
  })

  it('reports a null reason for a successful fit (not no_numeric_values)', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const cell = buildCohortRows(rows, [1], [spec])[0].cells[0]
    expect(cell.nNumeric).toBe(3)
    expect(cell.reason).toBeNull()
  })

  it('reports no_numeric_values only when the series truly has no numeric values', () => {
    const spec2: CohortSeriesSpec = { bezeichnung: 'HbA1c', einheit: '%', mode: 'global' }
    const rows = [row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', wert: 'n.d.', wertNum: null })]
    const cell = buildCohortRows(rows, [1], [spec2])[0].cells[0]
    expect(cell.nNumeric).toBe(0)
    expect(cell.reason).toBe('no_numeric_values')
  })

  it('attaches an AKI chip on a creatinine mg/dl column when episodes exist', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2020-01-01T00:00:00Z'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-02T00:00:00Z'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2020-02-01T00:00:00Z'), wertNum: 1.0 }),
    ]
    const out = buildCohortRows(rows, [1], [spec])
    expect(akiChip(out[0].cells[0]).startsWith('AKI')).toBe(true)
  })

  it('leaves akiChip empty for a non-creatinine column', () => {
    const spec2: CohortSeriesSpec = { bezeichnung: 'HbA1c', einheit: '%', mode: 'global' }
    const rows = [row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', wertNum: 6 })]
    const out = buildCohortRows(rows, [1], [spec2])
    expect(akiChip(out[0].cells[0])).toBe('')
  })
})

describe('buildCohortRows cell overlays', () => {
  const spiky: LabRow[] = [
    row({ labDatum: d('2019-01-01T00:00:00Z'), wertNum: 1.0 }),
    row({ labDatum: d('2019-06-01T00:00:00Z'), wertNum: 1.1 }),
    row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 1.05 }),
    row({ labDatum: d('2020-07-30T00:00:00Z'), wertNum: 1.15 }),
    row({ labDatum: d('2020-08-01T00:00:00Z'), wertNum: 2.4 }),
    row({ labDatum: d('2020-08-10T00:00:00Z'), wertNum: 1.8 }),
    row({ labDatum: d('2020-10-01T00:00:00Z'), wertNum: 1.2 }),
    row({ labDatum: d('2021-06-01T00:00:00Z'), wertNum: 1.3 }),
  ]
  it('creatinine cell in global mode: bands + chip, fit through everything, nothing excluded', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const cell = buildCohortRows(spiky, [1], [spec])[0].cells[0]
    expect(akiBands(cell).length).toBeGreaterThan(0)
    expect(akiChip(cell).startsWith('AKI')).toBe(true)
    expect(cell.excludedIdx).toEqual([])
    expect(cell.fitLines).toHaveLength(1)
  })
  it('aki-aware mode: excluded points listed, slope below global', () => {
    const g = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }])[0].cells[0]
    const a = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'aki-aware', exclusionDays: 30 }])[0].cells[0]
    expect(a.excludedIdx).toEqual([4, 5])
    expect(a.slope).toBeLessThan(g.slope)
    expect(a.fitLines).toHaveLength(1)
  })
  it('fitConfig AKI exclusion applies to global cohort fit lines without selecting aki-aware mode', () => {
    const g = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }])[0].cells[0]
    const fitConfig = generalExplorationConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    fitConfig.exclusions.excludeAkiWindows = true
    const c = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig }])[0].cells[0]
    expect(c.excludedIdx).toEqual([4, 5])
    expect(c.slope).toBeLessThan(g.slope)
    expect(c.fitLines[0][1].value).toBeLessThan(g.fitLines[0][1].value)
  })
  it('aki-aware mode honours spec exclusionDays when fit inputs are supplied', () => {
    const fitInputs: AnalysisFitInputContribution[] = [
      akiFitInput(1, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, episodesForSeries(spiky, 1, 'Kreatinin', 'mg/dl'), 30),
    ]
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'aki-aware', exclusionDays: 0, fitInputs }
    const cell = buildCohortRows(spiky, [1], [spec])[0].cells[0]
    expect(cell.excludedIdx).toEqual([4])
  })
  it('non-creatinine cell in aki-aware mode gets cross-series bands from creatinine', () => {
    const egfr = spiky.map((r) => ({ ...r, bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 60 - (r.wertNum! - 1) * 20 }))
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', mode: 'aki-aware' }
    const cell = buildCohortRows([...spiky, ...egfr], [1], [spec])[0].cells[0]
    expect(akiBands(cell).length).toBeGreaterThan(0)
    expect(cell.excludedIdx.length).toBeGreaterThan(0)
    expect(akiChip(cell).startsWith('AKI')).toBe(true)
  })
  it('non-creatinine cell in global mode can show cross-series AKI bands without excluding points', () => {
    const egfr = spiky.map((r) => ({ ...r, bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 60 - (r.wertNum! - 1) * 20 }))
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', mode: 'global' }
    const cell = buildCohortRows([...spiky, ...egfr], [1], [spec])[0].cells[0]
    expect(akiBands(cell).length).toBeGreaterThan(0)
    expect(cell.excludedIdx).toEqual([])
    expect(akiChip(cell).startsWith('AKI')).toBe(true)
  })
  it('exposes the AKI episodes and per-point exclusion reasons behind excludedIdx', () => {
    const g = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }])[0].cells[0]
    expect(akiMarkers(g).map((marker) => marker.label)).toEqual(['AKI II'])
    expect(g.pointExclusionReasons.every((reasons) => reasons.length === 0)).toBe(true)

    const fitConfig = ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    fitConfig.timeBalancing = 'raw'
    const transplant: ClinicalEvent = { patientId: 1, type: 'kidney_transplant', date: d('2021-01-01T00:00:00Z'), title: 'Tx', description: null, endDate: null, intent: null, warning: '' }
    const cell = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig, clinicalEvents: [transplant] }])[0].cells[0]
    expect(cell.excludedIdx).toEqual([4, 5, 7])
    expect(cell.pointExclusionReasons).toEqual([[], [], [], [], ['aki'], ['aki'], [], ['post_kidney_transplant']])
    // Same aligned contract: non-empty exactly at excludedIdx.
    expect(cell.pointExclusionReasons.flatMap((r, i) => r.length ? [i] : [])).toEqual(cell.excludedIdx)
  })
  it('rolling mode has no mini fit lines', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'rolling' }
    const cell = buildCohortRows(spiky, [1], [spec])[0].cells[0]
    expect(cell.fitLines).toEqual([])
  })

  it('marks event-excluded points and fits cohort cells before transplant', () => {
    const rows: LabRow[] = [
      row({ labDatum: d('2018-01-01'), wertNum: 8 }),
      row({ labDatum: d('2019-01-01'), wertNum: 9 }),
      row({ labDatum: d('2020-01-01'), wertNum: 10 }),
      row({ labDatum: d('2021-01-01'), wertNum: 11 }),
      row({ labDatum: d('2022-01-01'), wertNum: 200 }),
      row({ labDatum: d('2023-01-01'), wertNum: 220 }),
    ]
    const transplant: ClinicalEvent = {
      patientId: 1,
      type: 'kidney_transplant',
      date: d('2022-01-01'),
      title: 'Kidney transplant',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }
    const spec: CohortSeriesSpec = {
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      mode: 'global',
      clinicalEventsByPatient: { 1: [transplant] },
    }

    const cell = buildCohortRows(rows, [1], [spec])[0].cells[0]

    expect(cell.nNumeric).toBe(6)
    expect(cell.excludedIdx).toEqual([4, 5])
    expect(cell.slope).toBeGreaterThan(0.9)
    expect(cell.slope).toBeLessThan(1.1)
    expect(cell.fitLines[0][1].date.toISOString().slice(0, 10)).toBe('2021-01-01')
  })

  it('stops endpoint input at transplant, including a same-day recovery value', () => {
    const rows: LabRow[] = [
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2021-01-01'), wertNum: 45, patientAgeAtLab: 61 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2022-01-01'), wertNum: 30, patientAgeAtLab: 62 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2022-07-01'), wertNum: 80, patientAgeAtLab: 62 }),
    ]
    const transplant: ClinicalEvent = {
      patientId: 1,
      type: 'kidney_transplant',
      date: d('2022-07-01'),
      title: 'Kidney transplant',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      mode: 'global',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
      clinicalEventsByPatient: { 1: [transplant] },
    }

    const cell = buildCohortRows(rows, [1], [spec])[0].cells[0]

    expect(cell.excludedIdx).toEqual([3])
    expect(cell.slope).toBeLessThan(0)
    expect(cell.endpoints.percentDecline.value).toBe(50)
    expect(cell.endpoints.percentDecline.latestValue).toBe(30)
    expect(cell.endpoints.projectedAgeToCkdG5.value).not.toBeNull()
    expect(cell.endpoints.kidneyFailureReached).toMatchObject({ type: 'kidney_transplant', date: d('2022-07-01') })
    expect(cell.points).toHaveLength(4)
  })

  it('keeps an earlier lab-confirmed G5 and reports later chronic dialysis separately', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const rows = [['2020-01-01', 14], ['2020-05-01', 13], ['2021-01-01', 65]].map(([date, value]) => row({ ...parameter, labDatum: d(date as string), wertNum: value as number }))
    const event: ClinicalEvent = { patientId: 1, type: 'dialysis', intent: 'chronic', date: d('2020-08-01'), endDate: null, title: 'Dialysis', description: null, warning: '' }
    const fitConfig = ckdProgressionConfig(parameter)
    fitConfig.endpoints.observedCkdG5 = false
    const spec = { ...parameter, mode: 'global' as const, fitConfig, clinicalEvents: [event] }
    const disabled = buildCohortRows(rows, [1], [spec])[0].cells[0]
    expect(disabled.endpoints.observedCkdG5.met).toBe(false)
    expect(disabled.endpoints.kidneyFailureReached).toMatchObject({ type: 'chronic_dialysis', date: d('2020-08-01') })
    fitConfig.endpoints.observedCkdG5 = true
    const enabled = buildCohortRows(rows, [1], [spec])[0].cells[0]
    expect(enabled.endpoints.observedCkdG5).toMatchObject({ met: true, firstDate: d('2020-01-01'), confirmedDate: d('2020-05-01'), recoveryDate: null })
    expect(enabled.endpoints.kidneyFailureReached?.date).toEqual(d('2020-08-01'))
    expect(enabled.endpoints.percentDecline.latestValue).toBe(13)
  })

  it('excludes dated acute dialysis only through its end date and retains later recovery', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const rows = [['2020-01-01', 60], ['2020-06-01', 13], ['2020-06-10', 12], ['2021-01-01', 45]].map(([date, value]) => row({ ...parameter, labDatum: d(date as string), wertNum: value as number }))
    const event: ClinicalEvent = { patientId: 1, type: 'dialysis', intent: 'acute', date: d('2020-06-01'), endDate: d('2020-06-10'), title: 'Acute dialysis', description: null, warning: '' }
    const cell = buildCohortRows(rows, [1], [{ ...parameter, mode: 'global', fitConfig: ckdProgressionConfig(parameter), clinicalEvents: [event] }])[0].cells[0]
    expect(cell.endpoints.observedCkdG5.met).toBe(false)
    expect(cell.endpoints.percentDecline.latestValue).toBe(45)
    expect(cell.endpoints.percentDecline.value).toBe(25)
    expect(cell.endpoints.kidneyFailureReached).toBeNull()
    expect(cell.points).toHaveLength(4)
  })

  it('does not infer endpoint censoring from unknown intent or an undated acute interval', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const rows = [['2020-01-01', 60], ['2020-06-01', 30], ['2021-01-01', 45]].map(([date, value]) => row({ ...parameter, labDatum: d(date as string), wertNum: value as number }))
    const events: ClinicalEvent[] = [
      { patientId: 1, type: 'dialysis', intent: 'unknown', date: d('2020-02-01'), endDate: d('2020-12-01'), title: 'Unknown', description: null, warning: '' },
      { patientId: 1, type: 'dialysis', intent: 'acute', date: d('2020-02-01'), endDate: null, title: 'Undated end', description: null, warning: 'unresolved_dialysis_interval' },
    ]
    const cell = buildCohortRows(rows, [1], [{ ...parameter, mode: 'global', fitConfig: ckdProgressionConfig(parameter), clinicalEvents: events }])[0].cells[0]
    expect(cell.endpoints.endpointPointCount).toBe(3)
    expect(cell.endpoints.percentDecline.latestValue).toBe(45)
    expect(cell.endpoints.percentDecline.value).toBe(25)
    expect(cell.endpoints.kidneyFailureReached).toBeNull()
  })

  it('reports no patient-level KRT result for an eGFR cell without measurements', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const event: ClinicalEvent = { patientId: 1, type: 'kidney_transplant', intent: null, date: d('2020-01-01'), endDate: null, title: 'Transplant', description: null, warning: '' }
    const cell = buildCohortRows([], [1], [{ ...parameter, mode: 'global', fitConfig: ckdProgressionConfig(parameter), clinicalEvents: [event] }])[0].cells[0]
    expect(cell.endpoints.kidneyFailureReached).toBeNull()
    expect(cell.endpoints.endpointPointCount).toBe(0)
  })

  it('uses the earliest KRT date even when events arrive out of order', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const rows = [['2020-01-01', 60], ['2020-06-01', 40], ['2021-01-01', 20]].map(([date, value]) => row({ ...parameter, labDatum: d(date as string), wertNum: value as number }))
    const events: ClinicalEvent[] = [
      { patientId: 1, type: 'kidney_transplant', intent: null, date: d('2021-06-01'), endDate: null, title: 'Transplant', description: null, warning: '' },
      { patientId: 1, type: 'dialysis', intent: 'chronic', date: d('2020-07-01'), endDate: null, title: 'Dialysis', description: null, warning: '' },
    ]
    const cell = buildCohortRows(rows, [1], [{ ...parameter, mode: 'global', fitConfig: ckdProgressionConfig(parameter), clinicalEvents: events }])[0].cells[0]
    expect(cell.endpoints.kidneyFailureReached).toMatchObject({ type: 'chronic_dialysis', date: d('2020-07-01') })
    expect(cell.endpoints.percentDecline.latestValue).toBe(40)
    expect(cell.points).toHaveLength(3)
  })

  it('ignores nonfinite measurements consistently in endpoint fitting and evaluation', () => {
    const parameter = { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²' }
    const fitConfig = ckdProgressionConfig(parameter)
    const rows = [60, 50, 25].map((wertNum, i) => row({ ...parameter, labDatum: new Date(Date.UTC(2020, 0, 1) + i * 365.25 * 86400000), wertNum, patientAgeAtLab: 50 + i }))
    const spec: CohortSeriesSpec = { ...parameter, mode: 'global', fitConfig }
    const expected = buildCohortRows(rows, [1], [spec])[0].cells[0].endpoints
    rows.push(row({ ...parameter, labDatum: d('2021-06-01'), wertNum: Infinity, patientAgeAtLab: 51.5 }))
    expect(buildCohortRows(rows, [1], [spec])[0].cells[0].endpoints).toEqual(expected)
  })
  it('does not compute CKD endpoints for non-eGFR units even when endpoint toggles are enabled', () => {
    const fitConfig = ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    const cell = buildCohortRows(spiky, [1], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig }])[0].cells[0]

    expect(cell.endpoints.percentDecline.value).toBeNull()
    expect(cell.endpoints.observedCkdG5.met).toBe(false)
    expect(cell.endpoints.projectedAgeToCkdG5.reason).toBe('disabled')
  })
})
