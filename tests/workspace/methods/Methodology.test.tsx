import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Methodology } from '../../../src/workspace/methods/Methodology'

describe('Methodology', () => {
  it('explains AKI serum creatinine units, conversion and numeric boundary tolerance', () => {
    render(<Methodology />)
    expect(screen.getByText(/AKI detection accepts serum creatinine in mg\/dl or µmol\/l; µmol\/l values are divided by 88\.42 before KDIGO comparisons/i)).toBeInTheDocument()
    expect(screen.getByText(/KDIGO thresholds use an inclusive 1e-12 numeric tolerance/i)).toBeInTheDocument()
    expect(screen.getByText(/rise ≥ 0\.3 mg\/dl or peak\/baseline ≥ 1\.5×/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Use Cohort models for population-level estimates/i)).toBeInTheDocument()
    expect(screen.queryByText(/sidebar/i)).not.toBeInTheDocument()
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
