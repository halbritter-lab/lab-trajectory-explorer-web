import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeriesPlot } from '../../src/ui/charts/SeriesPlot'
import { OnePatientView } from '../../src/ui/patient/OnePatientView'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function kreat(date: string, value: number): LabRow {
  return { patientId: 1, labDatum: new Date(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null,
    patientAgeAtLab: null }
}

describe('SeriesPlot AKI overlay', () => {
  it('renders without crashing when showAki is on for a creatinine series with an episode', () => {
    const rows = [kreat('2020-01-01T00:00:00Z', 1.0), kreat('2020-01-02T00:00:00Z', 1.6), kreat('2020-02-01T00:00:00Z', 1.0)]
    const { container } = render(
      <SeriesPlot title="Kreatinin (mg/dl)" rows={rows} cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180 }} showAki creatinine />,
    )
    expect(container.querySelector('[data-testid="series-plot"]')).toBeTruthy()
  })

  it('draws precomputed creatinine AKI episodes on computed eGFR when showAki is on', () => {
    const rows = [
      { ...kreat('2020-01-01T00:00:00Z', 80), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-01-02T00:00:00Z', 60), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-02-01T00:00:00Z', 82), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
    ]
    const episodeDate = new Date('2020-01-02T00:00:00Z')
    const { container } = render(
      <SeriesPlot
        title="eGFR (CKD-EPI 2021, computed)"
        rows={rows}
        cfg={{ mode: 'aki-aware', gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30 }}
        showAki
        episodes={[{
          date: episodeDate,
          baselineDate: new Date('2020-01-01T00:00:00Z'),
          baselineValue: 1.0,
          peakValue: 1.6,
          peakDate: episodeDate,
          criterion: 'relative_1_5x_7d',
          stage: 1,
        }]}
      />,
    )
    const svg = container.querySelector('[data-testid="series-plot"] svg')!
    expect(svg.innerHTML).toContain('#ef4444')
    expect(svg.innerHTML).toContain('AKI I')
  })

  it('draws precomputed creatinine AKI episodes on computed eGFR in global mode', () => {
    const rows = [
      { ...kreat('2020-01-01T00:00:00Z', 80), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-01-02T00:00:00Z', 60), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-02-01T00:00:00Z', 82), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
    ]
    const episodeDate = new Date('2020-01-02T00:00:00Z')
    const { container } = render(
      <SeriesPlot
        title="eGFR (CKD-EPI 2021, computed)"
        rows={rows}
        cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30 }}
        showAki
        episodes={[{
          date: episodeDate,
          baselineDate: new Date('2020-01-01T00:00:00Z'),
          baselineValue: 1.0,
          peakValue: 1.6,
          peakDate: episodeDate,
          criterion: 'relative_1_5x_7d',
          stage: 1,
        }]}
      />,
    )
    const svg = container.querySelector('[data-testid="series-plot"] svg')!
    expect(svg.innerHTML).toContain('#ef4444')
    expect(svg.innerHTML).toContain('AKI I')
  })

  it('summarises detected AKI episode counts by stage in the plot legend', () => {
    const rows = [
      { ...kreat('2020-01-01T00:00:00Z', 80), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-01-02T00:00:00Z', 60), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
      { ...kreat('2020-02-01T00:00:00Z', 82), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²' },
    ]
    const episodeDate = new Date('2020-01-02T00:00:00Z')
    render(
      <SeriesPlot
        title="eGFR (CKD-EPI 2021, computed)"
        rows={rows}
        cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30 }}
        showAki
        episodes={[
          {
            date: episodeDate,
            baselineDate: new Date('2020-01-01T00:00:00Z'),
            baselineValue: 1.0,
            peakValue: 1.6,
            peakDate: episodeDate,
            criterion: 'relative_1_5x_7d',
            stage: 1,
          },
          {
            date: new Date('2020-03-01T00:00:00Z'),
            baselineDate: new Date('2020-02-01T00:00:00Z'),
            baselineValue: 1.0,
            peakValue: 1.7,
            peakDate: new Date('2020-03-01T00:00:00Z'),
            criterion: 'relative_1_5x_7d',
            stage: 1,
          },
          {
            date: new Date('2020-04-01T00:00:00Z'),
            baselineDate: new Date('2020-03-01T00:00:00Z'),
            baselineValue: 1.0,
            peakValue: 2.1,
            peakDate: new Date('2020-04-01T00:00:00Z'),
            criterion: 'relative_1_5x_7d',
            stage: 2,
          },
        ]}
      />,
    )

    expect(screen.getByText('AKI episodes: 2×I, II')).toHaveAttribute('title', '3 AKI episodes: 2× stage I, 1× stage II')
  })

  describe('OnePatientView aki-aware rendering', () => {
    beforeEach(() => {
      useAppStore.getState().reset()
      useAppStore.getState().setDataset([
        kreat('2020-01-01T00:00:00Z', 1.0),
        kreat('2020-01-02T00:00:00Z', 1.6),
        kreat('2020-02-01T00:00:00Z', 1.0),
      ])
      useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    })

    it('aki-aware mode does not draw AKI episode visuals when showAki is off', () => {
      useAppStore.getState().setSeriesConfig(0, { mode: 'aki-aware' })
      useAppStore.getState().setShowAki(false)
      const { container } = render(<OnePatientView />)
      const svg = container.querySelector('[data-testid="series-plot"] svg')!
      expect(svg.innerHTML).not.toContain('#ef4444')
      expect(svg.innerHTML).not.toContain('#dc2626')
      expect(svg.innerHTML).not.toContain('AKI II')
    })

    it('showAki draws the AKI window, excluded points, and stage label', () => {
      useAppStore.getState().setSeriesConfig(0, { mode: 'aki-aware' })
      useAppStore.getState().setShowAki(true)
      const { container } = render(<OnePatientView />)
      const svg = container.querySelector('[data-testid="series-plot"] svg')!
      expect(svg.innerHTML).toContain('#ef4444')
      expect(svg.innerHTML).toContain('#dc2626')
      expect(svg.innerHTML).toContain('AKI I')
    })
  })
})
