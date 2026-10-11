import { beforeEach, describe, it, expect } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Methodology } from '../../../src/workspace/methods/Methodology'

function topic(id: string) {
  act(() => {
    window.history.replaceState(null, '', `/#methods/${id}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
function details() {
  fireEvent.click(screen.getByText('Calculation details'))
  // Scientific wording remains available within the individual detail groups.
  for (const summary of document.querySelectorAll('.methodology-detail > summary')) fireEvent.click(summary)
}

describe('Methodology', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))
  it('explains AKI serum creatinine units, conversion and numeric boundary tolerance', () => {
    topic('aki')
    render(<Methodology />)
    expect(screen.getByText(/AKI detection accepts serum creatinine in mg\/dl or µmol\/l; µmol\/l values are divided by 88\.42 before KDIGO comparisons/i)).toBeInTheDocument()
    expect(screen.getByText(/KDIGO thresholds use an inclusive 1e-12 numeric tolerance/i)).toBeInTheDocument()
    expect(screen.getByText(/rise ≥ 0\.3 mg\/dl or peak\/baseline ≥ 1\.5×/i)).toBeInTheDocument()
  })
  it('keeps the workflow and reference available under their own topics', () => {
    render(<Methodology />)
    expect(screen.getByRole('heading', { name: 'Quick Guide' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Help topics' })).toBeInTheDocument()
    expect(screen.getByText(/Load or upload a workbook/i)).toBeInTheDocument()
    expect(screen.getByText(/Use Cohort models for population-level estimates/i)).toBeInTheDocument()
    topic('fits')
    details()
    expect(screen.getByRole('heading', { name: 'Fit Pipeline' })).toBeInTheDocument()
    expect(screen.getByText(/Data filter/)).toBeInTheDocument()
    expect(screen.getByText('Time balancing', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Fit model', { selector: 'strong' })).toBeInTheDocument()
    topic('sources')
    expect(screen.getByRole('heading', { name: /medical sources/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /national kidney foundation formula page/i })).toHaveAttribute('href', expect.stringContaining('kidney.org'))
    expect(screen.getByRole('link', { name: /kdigo 2012 clinical practice guideline/i })).toHaveAttribute('href', expect.stringContaining('KDIGO-2012-AKI-Guideline-English.pdf'))
  })
  // Part B of the wording drafts, approved by the owner on 2026-10-08.
  it('covers presets, time balancing, OLS, AKI timing, eGFR conditions, demographics and cohort models', () => {
    render(<Methodology />)
    topic('fits')
    details()
    expect(screen.getByText(/give the quarterly point 45\.5 on 20 February 2021/)).toBeInTheDocument()
    expect(screen.getByText(/56 on 1 January 2021 give −3\.99 per year/)).toBeInTheDocument()
    topic('data')
    details()
    expect(screen.getByText(/gives 29\.96, which is stored as 30\.0/)).toBeInTheDocument()
    topic('fits')
    details()
    expect(screen.getByText(/with three or more points it is unavailable when all fitted values are identical/)).toBeInTheDocument()
    topic('data')
    details()
    expect(screen.getByText(/birth date on the earliest dated lab row that carries one/)).toBeInTheDocument()
    topic('aki')
    details()
    expect(screen.getByText(/onset 2 January 2020 excludes 2 January to 1 February 2020/)).toBeInTheDocument()
    topic('fits')
    details()
    expect(screen.getByText(/Every preset sets the rapid-decline threshold to 5 mL\/min\/1\.73m² per year/)).toBeInTheDocument()
  })
  it('keeps one description of the age anchor and points the eGFR age input to it', () => {
    topic('data')
    render(<Methodology />)
    details()
    expect(screen.getAllByText(/the anchor is the midpoint of their intersection/)).toHaveLength(1)
    expect(screen.getByText(/derives every row's age from one birth-date anchor per patient/)).toBeInTheDocument()
    expect(screen.getByText(/A stated age that contradicts the others is corrected rather than used/)).toBeInTheDocument()
    expect(screen.queryByText(/taken from a manual entry, an explicit birth date, or the stated ages/)).not.toBeInTheDocument()
  })
})
