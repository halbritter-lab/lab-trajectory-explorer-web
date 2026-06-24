import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnePatientView } from '../../src/ui/patient/OnePatientView'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import { ckdProgressionConfig } from '../../src/core/fitPipeline/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

function dialysisEvent(title = 'Dialysis start', date = '2020-01-01') {
  return {
    patientId: 1,
    type: 'dialysis' as const,
    date: new Date(date),
    title,
    description: 'temporary note',
    endDate: null,
    intent: 'unknown' as const,
    warning: 'unknown_dialysis_intent' as const,
  }
}

describe('OnePatientView', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('renders a plot card for the configured series', () => {
    render(<OnePatientView />)
    expect(screen.getAllByTestId('series-plot').length).toBeGreaterThan(0)
  })

  it('can hide loaded events from the plot', () => {
    useAppStore.getState().setEvents([dialysisEvent()])
    useAppStore.getState().setShowEvents(false)
    const { container } = render(<OnePatientView />)
    expect(container.textContent).not.toContain('Dialysis start')
  })

  it('keeps event-driven fit split lines for active fit events when event labels are hidden', () => {
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
      row({ labDatum: new Date('2022-01-01'), wertNum: 4 }),
      row({ labDatum: new Date('2023-01-01'), wertNum: 5 }),
      row({ labDatum: new Date('2024-01-01'), wertNum: 6 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      mode: 'event-driven',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
    })
    useAppStore.getState().setConnectPoints(false)
    useAppStore.getState().setEvents([{
      ...dialysisEvent('Temporary dialysis', '2021-06-01'),
      title: 'Temporary dialysis',
      intent: 'acute',
      endDate: new Date('2021-07-01'),
      warning: '',
    }])
    useAppStore.getState().setShowEvents(false)

    const { container } = render(<OnePatientView />)

    expect(container.textContent).not.toContain('Temporary dialysis')
    expect(container.querySelectorAll('g[aria-label="line"]')).toHaveLength(2)
  })

  it('does not split event-driven fits at display-only events', () => {
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
      row({ labDatum: new Date('2022-01-01'), wertNum: 4 }),
      row({ labDatum: new Date('2023-01-01'), wertNum: 5 }),
      row({ labDatum: new Date('2024-01-01'), wertNum: 6 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      mode: 'event-driven',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
    })
    useAppStore.getState().setConnectPoints(false)
    useAppStore.getState().setEvents([{
      patientId: 1,
      type: 'other',
      date: new Date('2021-06-01'),
      title: 'Study medication',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }])

    const { container } = render(<OnePatientView />)

    expect(container.querySelectorAll('g[aria-label="line"]')).toHaveLength(1)
  })

  it('keeps event labels above the plot area away from the x-axis', () => {
    useAppStore.getState().setEvents([dialysisEvent()])
    const { container } = render(<OnePatientView />)
    const label = [...container.querySelectorAll('text')].find((node) => node.textContent === 'Dialysis start')!
    const y = Number(label.getAttribute('transform')?.match(/translate\([^,]+,([^)]+)\)/)?.[1])

    expect(label).toBeTruthy()
    expect(label.getAttribute('transform')).not.toContain('rotate')
    expect(y).toBeLessThan(60)
  })

  it('highlights event lines on hover and exposes a tooltip', () => {
    useAppStore.getState().setEvents([dialysisEvent()])
    const { container } = render(<OnePatientView />)
    const eventLine = container.querySelector<SVGLineElement>('[data-testid="event-line"]')!
    const title = eventLine.querySelector('title')?.textContent ?? ''

    expect(eventLine).toBeTruthy()
    expect(title).toContain('Dialysis start')
    expect(title).toContain('dialysis')
    expect(title).toContain('effect:')
    expect(eventLine.getAttribute('stroke-width')).toBe('1.25')

    fireEvent.pointerEnter(eventLine)
    expect(eventLine.getAttribute('stroke-width')).toBe('3')
    expect(eventLine.getAttribute('stroke')).toBe('#7c3aed')

    fireEvent.pointerLeave(eventLine)
    expect(eventLine.getAttribute('stroke-width')).toBe('1.25')
  })

  it('keeps x-axis tick labels separated from the x-axis title', () => {
    const { container } = render(<OnePatientView />)
    const textNodes = [...container.querySelectorAll('text')]
    const xLabel = textNodes.find((node) => node.textContent?.includes('Date'))!
    const tickYs = textNodes
      .filter((node) => /^(Jan|Apr|Jul|Oct)/.test(node.textContent ?? ''))
      .map((node) => Number(node.getAttribute('transform')?.match(/translate\([^,]+,([^)]+)\)/)?.[1]))
      .filter(Number.isFinite)
    const labelY = Number(xLabel.getAttribute('transform')?.match(/translate\([^,]+,([^)]+)\)/)?.[1])

    expect(labelY - Math.max(...tickYs)).toBeGreaterThanOrEqual(18)
  })

  it('shows a back-to-cohort button when opened from the cohort view', async () => {
    useAppStore.getState().setView('one')
    useAppStore.getState().setReturnToCohort(true)
    render(<OnePatientView />)
    const back = screen.getByRole('button', { name: /back to cohort/i })
    expect(back).toHaveTextContent('←')
    await userEvent.click(back)
    expect(useAppStore.getState().view).toBe('cohort')
    expect(useAppStore.getState().returnToCohort).toBe(false)
  })
})
