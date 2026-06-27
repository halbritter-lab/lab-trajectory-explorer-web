import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CohortView } from '../../src/ui/cohort/CohortView'
import { Methodology } from '../../src/ui/pages/Methodology'
import { useAppStore } from '../../src/ui/state/store'
import { readWorkbook } from '../../src/io/readWorkbook'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('exports + methodology', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01'), wertNum: 2.0 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('cohort view exposes an Export xlsx button that builds bytes without throwing', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // jsdom has no anchor.click navigation; stub it so download path completes.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: /export cohort/i }))
    expect(create).toHaveBeenCalled()
  })

  function stubDownloadCapture(): Blob[] {
    const captured: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured.push(blob as Blob)
      return 'blob:x'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return captured
  }

  it('omits the patient_attributes sheet when no attributes are loaded', async () => {
    const captured = stubDownloadCapture()
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: /export cohort/i }))
    const bytes = new Uint8Array(await captured[0].arrayBuffer())
    expect(readWorkbook(bytes, 'cohort').length).toBeGreaterThan(0)
    expect(readWorkbook(bytes, 'patient_attributes')).toEqual([])
  })

  it('adds a patient_attributes sheet when attributes are loaded', async () => {
    const captured = stubDownloadCapture()
    useAppStore.getState().setPatientAttributes({ '1': { genotype: 'UMOD' } })
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: /export cohort/i }))
    const bytes = new Uint8Array(await captured[0].arrayBuffer())
    expect(readWorkbook(bytes, 'cohort').length).toBeGreaterThan(0)
    const attrRows = readWorkbook(bytes, 'patient_attributes')
    expect(attrRows).toHaveLength(1)
    expect(attrRows[0].genotype).toBe('UMOD')
    expect(String(attrRows[0].patientId)).toBe('1')
  })

  it('limits the patient_attributes sheet to patients in the exported cohort', async () => {
    const captured = stubDownloadCapture()
    useAppStore.getState().setPatientAttributes({
      '1': { genotype: 'UMOD' },
      '99': { genotype: 'MUC1' },
    })
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: /export cohort/i }))
    const bytes = new Uint8Array(await captured[0].arrayBuffer())
    const attrRows = readWorkbook(bytes, 'patient_attributes')
    expect(attrRows.map((r) => String(r.patientId))).toEqual(['1'])
  })

  it('Methodology renders the fit-pipeline reference', () => {
    render(<Methodology />)
    expect(screen.getByRole('heading', { name: 'Quick Guide' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Methodology Reference' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Safety & Sources' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Theory and methods sections' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quick Guide' })).toHaveAttribute('href', '#quick-guide')
    expect(screen.getByRole('link', { name: 'Methodology Reference' })).toHaveAttribute('href', '#methodology-reference')
    expect(screen.getByRole('link', { name: 'Safety & Sources' })).toHaveAttribute('href', '#safety-sources')
    expect(screen.getByText(/Load or upload a workbook/i)).toBeInTheDocument()
    expect(screen.getByText(/Open the cohort mixed model/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fit Pipeline' })).toBeInTheDocument()
    expect(screen.getByText(/Data filter/)).toBeInTheDocument()
    expect(screen.getByText(/Time balancing/)).toBeInTheDocument()
    expect(screen.getByText(/Fit model/)).toBeInTheDocument()
    expect(screen.queryByText('chronic-ckd')).not.toBeInTheDocument()
    expect(screen.queryByText('event-driven')).not.toBeInTheDocument()
    expect(screen.getByText(/KDIGO 2012 creatinine criteria/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /medical sources/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /national kidney foundation formula page/i })).toHaveAttribute('href', expect.stringContaining('kidney.org'))
    expect(screen.getByRole('link', { name: /kdigo 2012 clinical practice guideline/i })).toHaveAttribute('href', expect.stringContaining('KDIGO-2012-AKI-Guideline-English.pdf'))
  })
})
