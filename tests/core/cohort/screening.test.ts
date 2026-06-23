import { describe, it, expect } from 'vitest'
import { formatAkiChip, formatAkiEpisodeSummary, buildCohortRows, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}
const d = (s: string) => new Date(s)

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
    expect(out[0].cells[0].akiChip.startsWith('AKI')).toBe(true)
  })

  it('leaves akiChip empty for a non-creatinine column', () => {
    const spec2: CohortSeriesSpec = { bezeichnung: 'HbA1c', einheit: '%', mode: 'global' }
    const rows = [row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', wertNum: 6 })]
    const out = buildCohortRows(rows, [1], [spec2])
    expect(out[0].cells[0].akiChip).toBe('')
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
    expect(cell.akiBands.length).toBeGreaterThan(0)
    expect(cell.akiChip.startsWith('AKI')).toBe(true)
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
  it('non-creatinine cell in aki-aware mode gets cross-series bands from creatinine', () => {
    const egfr = spiky.map((r) => ({ ...r, bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 60 - (r.wertNum! - 1) * 20 }))
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', mode: 'aki-aware' }
    const cell = buildCohortRows([...spiky, ...egfr], [1], [spec])[0].cells[0]
    expect(cell.akiBands.length).toBeGreaterThan(0)
    expect(cell.excludedIdx.length).toBeGreaterThan(0)
    expect(cell.akiChip.startsWith('AKI')).toBe(true)
  })
  it('non-creatinine cell in global mode can show cross-series AKI bands without excluding points', () => {
    const egfr = spiky.map((r) => ({ ...r, bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 60 - (r.wertNum! - 1) * 20 }))
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', mode: 'global' }
    const cell = buildCohortRows([...spiky, ...egfr], [1], [spec])[0].cells[0]
    expect(cell.akiBands.length).toBeGreaterThan(0)
    expect(cell.excludedIdx).toEqual([])
    expect(cell.akiChip.startsWith('AKI')).toBe(true)
  })
  it('rolling mode has no mini fit lines', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'rolling' }
    const cell = buildCohortRows(spiky, [1], [spec])[0].cells[0]
    expect(cell.fitLines).toEqual([])
  })
})
