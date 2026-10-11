import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Methodology } from '../../../src/workspace/methods/Methodology'

function navigate(hash: string) {
  act(() => {
    window.history.pushState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('help topics', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))

  it('starts with a short guide and renders only the selected topic', () => {
    render(<Methodology />)
    expect(screen.getByRole('navigation', { name: 'Help topics' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start here', level: 2 })).toBeVisible()
    expect(screen.queryByText(/KDIGO thresholds use an inclusive/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fits & slopes' })).toHaveAttribute('href', '#methods/fits')
    navigate('#methods/fits')
    expect(screen.getByRole('heading', { name: 'Fits & slopes', level: 2 })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Start here' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fits & slopes' })).toHaveAttribute('aria-current', 'page')
  })

  it('loads a section URL, opens its calculation details and moves focus to it', async () => {
    window.history.replaceState(null, '', '/#methods/aki/timing')
    render(<Methodology />)
    const heading = screen.getByRole('heading', { name: 'AKI Timing, Episodes and the Fit-Exclusion Window' })
    expect(heading.closest('details')).toHaveAttribute('open')
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByText(/onset 2 January 2020 excludes/)).toBeVisible()
  })

  it('handles history navigation and unknown topics without an empty page', () => {
    render(<Methodology />)
    navigate('#methods/data')
    expect(screen.getByRole('heading', { name: 'Data & eGFR', level: 2 })).toBeVisible()
    act(() => {
      window.history.replaceState(null, '', '/#methods/endpoints')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('heading', { name: 'Endpoints & prediction', level: 2 })).toBeVisible()
    navigate('#methods/unknown')
    expect(screen.getByRole('heading', { name: 'Start here', level: 2 })).toBeVisible()
  })

  it('keeps important limitations outside closed calculation details', () => {
    window.history.replaceState(null, '', '/#methods/data')
    render(<Methodology />)
    const limitation = screen.getByText(/All computed equations are/)
    expect(limitation).toBeVisible()
    expect(limitation.closest('details')).toBeNull()
    fireEvent.click(screen.getByText('Calculation details'))
    fireEvent.click(screen.getByText('eGFR: Conditions, Age and Rounding', { selector: 'summary' }))
    expect(screen.getByText(/gives 29\.96, which is stored as 30\.0/)).toBeVisible()
  })
})
