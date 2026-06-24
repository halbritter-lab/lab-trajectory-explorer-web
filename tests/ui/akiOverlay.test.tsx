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
  it('marks clinical-event excluded detail measurements in red only when censoring is enabled', () => {
    const rows = [
      kreat('2020-01-01T00:00:00Z', 60),
      kreat('2020-09-01T00:00:00Z', 52),
      kreat('2021-01-01T00:00:00Z', 45),
    ]
    const transplant = {
      patientId: 1,
      type: 'kidney_transplant' as const,
      date: new Date('2020-09-01T00:00:00Z'),
      title: 'Kidney transplant',
      description: '',
      endDate: null,
      intent: null,
      warning: '' as const,
    }
    const enabled = render(
      <SeriesPlot
        title="eGFR"
        rows={rows}
        cfg={{
          mode: 'global',
          gapDays: 180,
          windowDays: 730,
          stepDays: 180,
          clinicalEvents: [transplant],
          clinicalEventCensoring: {
            censorAfterKidneyTransplant: true,
            censorAfterChronicDialysis: false,
            excludeAcuteDialysisPeriods: false,
            unknownDialysisPolicy: 'flag-only',
          },
        }}
      />,
    )
    expect(enabled.container.querySelectorAll('[data-testid="detail-excluded-point"]')).toHaveLength(2)
    enabled.unmount()

    const disabled = render(
      <SeriesPlot
        title="eGFR"
        rows={rows}
        cfg={{
          mode: 'global',
          gapDays: 180,
          windowDays: 730,
          stepDays: 180,
          clinicalEvents: [transplant],
          clinicalEventCensoring: {
            censorAfterKidneyTransplant: false,
            censorAfterChronicDialysis: false,
            excludeAcuteDialysisPeriods: false,
            unknownDialysisPolicy: 'flag-only',
          },
        }}
      />,
    )
    expect(disabled.container.querySelector('[data-testid="detail-excluded-point"]')).toBeNull()
  })

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
    expect(container.querySelector('[data-testid="detail-aki-excluded-point"]')).toBeNull()
  })

  it('marks AKI-window detail measurements in red only when AKI exclusion is active', () => {
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
        cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30, excludeAkiWindows: true }}
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

    expect(container.querySelectorAll('[data-testid="detail-aki-excluded-point"]')).toHaveLength(2)
  })

  it('marks AKI-window detail measurements in red when excluded even if AKI episode display is off', () => {
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
        cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30, excludeAkiWindows: true }}
        showAki={false}
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

    expect(container.querySelectorAll('[data-testid="detail-aki-excluded-point"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="series-plot"]')?.textContent).not.toContain('AKI I')
  })

  it('labels the trend legend by the active fit model and hides it when no fit is configured', () => {
    const rows = [
      kreat('2020-01-01T00:00:00Z', 1.0),
      kreat('2021-01-01T00:00:00Z', 1.4),
      kreat('2022-01-01T00:00:00Z', 2.0),
    ]
    const noFit = render(
      <SeriesPlot
        title="Kreatinin"
        rows={rows}
        cfg={{ mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, fitModel: 'none' }}
      />,
    )
    expect(screen.queryByText(/Trend/)).not.toBeInTheDocument()
    noFit.unmount()

    render(
      <SeriesPlot
        title="Kreatinin"
        rows={rows}
        cfg={{ mode: 'global-robust', gapDays: 180, windowDays: 730, stepDays: 180, fitModel: 'theil-sen' }}
      />,
    )
    expect(screen.getByText('Trend (Theil-Sen fit)')).toBeInTheDocument()
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

    it('aki-aware mode keeps excluded AKI-window points visible when showAki is off', () => {
      useAppStore.getState().setSeriesConfig(0, { mode: 'aki-aware' })
      useAppStore.getState().setShowAki(false)
      const { container } = render(<OnePatientView />)
      const svg = container.querySelector('[data-testid="series-plot"] svg')!
      expect(svg.innerHTML).not.toContain('#ef4444')
      expect(svg.innerHTML).not.toContain('AKI II')
      expect(container.querySelectorAll('[data-testid="detail-aki-excluded-point"]')).toHaveLength(2)
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
