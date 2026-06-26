import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CohortTrajectoryOverlay } from '../../src/ui/cohort/CohortTrajectoryOverlay'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import { ckdProgressionConfig, generalExplorationConfig } from '../../src/core/fitPipeline/types'
import { buildMixedModelResultIdentity, mixedModelFitConfigHash } from '../../src/core/mixedModel/resultIdentity'
import { mixedModelRowsFromCohortInputs } from '../../src/core/mixedModel/cohortDataset'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula, type MixedModelConfig } from '../../src/core/mixedModel/config'
import {
  MIXED_MODEL_FORMULA,
  MIXED_MODEL_TOLERANCE,
  type MixedModelSuccess,
} from '../../src/core/mixedModel/types'

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: 50,
    ...p,
  }
}

function rectsOverlap(
  a: { x1: number; x2: number; y1: number; y2: number },
  b: { x1: number; x2: number; y1: number; y2: number },
): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

function mixedModelSuccess(overrides: Partial<MixedModelSuccess> = {}): MixedModelSuccess {
  return {
    status: 'success',
    metadata: {
      engine: 'webr-lme4',
      formula: MIXED_MODEL_FORMULA,
      runtimeVersion: '4.6.0',
      packageVersions: { lme4: '1.1-35' },
      browserUserAgent: 'vitest',
      wasmAssetSource: 'cdn',
      optimizer: 'nloptwrap',
      reml: true,
      tolerance: MIXED_MODEL_TOLERANCE,
      datasetId: 'cohort',
      datasetHash: 'abc12345',
      randomSeed: null,
      fitConfigHash: 'fit-policy',
    },
    converged: true,
    warnings: [],
    nPatients: 3,
    nMeasurements: 6,
    fixedEffects: {
      intercept: 60,
      timeSinceBaseline: -3,
    },
    randomEffects: {
      interceptSd: 4.2,
      slopeSd: 1.1,
      interceptSlopeCorrelation: -0.2,
    },
    residualSd: 2.4,
    ...overrides,
  }
}

describe('CohortTrajectoryOverlay state', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('stores cohort display mode and overlay x-axis mode', () => {
    expect(useAppStore.getState().cohortDisplayMode).toBe('table')
    expect(useAppStore.getState().cohortOverlayXAxis).toBe('age')

    useAppStore.getState().setCohortDisplayMode('overlay')
    useAppStore.getState().setCohortOverlayXAxis('calendar_time')

    expect(useAppStore.getState().cohortDisplayMode).toBe('overlay')
    expect(useAppStore.getState().cohortOverlayXAxis).toBe('calendar_time')
  })
})

describe('CohortTrajectoryOverlay', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 55 }),
      row({ patientId: 2, labDatum: new Date('2020-06-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 45 }),
      row({ patientId: 2, labDatum: new Date('2021-06-01T00:00:00Z'), patientAgeAtLab: 62, wertNum: 38 }),
      row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', patientAgeAtLab: 50, wertNum: 6.5 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
  })

  it('renders the active cohort series across patients on the age axis', () => {
    render(<CohortTrajectoryOverlay />)

    expect(screen.getByRole('img', { name: /eGFR .* across 2 patient/ })).toBeInTheDocument()
    expect(screen.getByText('Axis: Age')).toBeInTheDocument()
    expect(screen.getByText('2 patients')).toBeInTheDocument()
    expect(screen.getByText('4 points')).toBeInTheDocument()
    expect(screen.queryByText('CKD thresholds: 60, 45, 30, 15')).not.toBeInTheDocument()
  })

  it('draws the stored mixed-model mean line for the matching time-baseline and age overlays', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 59 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 58 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 54 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 67 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 63 }),
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[0]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({ metadata: { ...mixedModelSuccess().metadata, fitConfigHash: identity.fitConfigHash } }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    const { rerender } = render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean')

    act(() => useAppStore.getState().setCohortOverlayXAxis('age'))
    rerender(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean at mean baseline age')
  })

  it('draws the baseline-age adjusted mixed-model mean line for the default config', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 59 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 58 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 54 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 67 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 63 }),
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setMixedModelConfig(DEFAULT_MIXED_MODEL_CONFIG)
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[0]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec, DEFAULT_MIXED_MODEL_CONFIG),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({
        metadata: {
          ...mixedModelSuccess().metadata,
          formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
          modelConfig: DEFAULT_MIXED_MODEL_CONFIG,
          fitConfigHash: identity.fitConfigHash,
        },
        fixedEffects: { intercept: 100, timeSinceBaseline: -2, baselineAge: -0.5 },
      }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean')
  })

  it('places the mixed-model line label above a declining line endpoint', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 95 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 90 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 95 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 90 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 95 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 90 }),
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[0]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec, DEFAULT_MIXED_MODEL_CONFIG),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({
        metadata: {
          ...mixedModelSuccess().metadata,
          formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
          modelConfig: DEFAULT_MIXED_MODEL_CONFIG,
          fitConfigHash: identity.fitConfigHash,
        },
        fixedEffects: { intercept: 95, timeSinceBaseline: -5, baselineAge: 0 },
      }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    const label = screen.getByText('Mixed model mean')
    expect(label).toHaveAttribute('dy', '-10')
    expect(label).toHaveAttribute('dx', '-8')
    expect(label).toHaveAttribute('text-anchor', 'end')
    expect(label).toHaveAttribute('dominant-baseline', 'auto')
  })

  it('matches the mixed-model overlay identity with the active non-default model config', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 59 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 58 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 54 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 67 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 63 }),
    ]
    const nonDefaultConfig: MixedModelConfig = {
      timeAxis: 'time_since_baseline',
      covariates: [],
      randomEffects: 'intercept',
    }
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setMixedModelConfig(nonDefaultConfig)
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[0]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec, nonDefaultConfig),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({
        metadata: {
          ...mixedModelSuccess().metadata,
          formula: mixedModelFormula(nonDefaultConfig),
          modelConfig: nonDefaultConfig,
          fitConfigHash: identity.fitConfigHash,
        },
      }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
  })

  it('matches mixed-model identity by filtered overlay series index when earlier configs are blank', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 59 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 58 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 54 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 67 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 63 }),
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: null, einheit: null })
    useAppStore.getState().addSeries()
    useAppStore.getState().setSeriesConfig(1, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[1]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({ metadata: { ...mixedModelSuccess().metadata, fitConfigHash: identity.fitConfigHash } }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean')
  })

  it('matches stored mixed-model identity that includes active fit policy fields', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 50, wertNum: 62 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01T00:00:00Z'), patientAgeAtLab: 51, wertNum: 59 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 60, wertNum: 58 }),
      row({ patientId: 2, labDatum: new Date('2021-02-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 54 }),
      row({ patientId: 3, labDatum: new Date('2020-03-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 67 }),
      row({ patientId: 3, labDatum: new Date('2021-03-01T00:00:00Z'), patientAgeAtLab: 71, wertNum: 63 }),
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: {
        ...ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
        timeBalancing: 'monthly-median',
      },
    })
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

    const analysisResult = useAppStore.getState().analysisResult()
    const activeConfig = useAppStore.getState().seriesConfigs[0]
    const patientIds = [1, 2, 3]
    const activeSpec = {
      bezeichnung: activeConfig.bezeichnung as string,
      einheit: activeConfig.einheit,
      mode: activeConfig.mode,
      gapDays: activeConfig.gapDays,
      windowDays: activeConfig.windowDays,
      stepDays: activeConfig.stepDays,
      cutoffDays: activeConfig.cutoffDays,
      exclusionDays: activeConfig.exclusionDays,
      fitConfig: activeConfig.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, patientIds, activeSpec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: patientIds.map(String),
      rows: modelRows,
      fitConfigHash: mixedModelFitConfigHash(activeSpec),
    })

    useAppStore.getState().setMixedModelResult({
      identity,
      result: mixedModelSuccess({ metadata: { ...mixedModelSuccess().metadata, fitConfigHash: identity.fitConfigHash } }),
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean')
  })

  it('does not render Plot popovers above the clickable trajectories', () => {
    render(<CohortTrajectoryOverlay />)

    expect(screen.getByTestId('cohort-trajectory-overlay').querySelector('[aria-label="tip"]')).not.toBeInTheDocument()
  })

  it('does not render a duplicate patient action list below the plot', () => {
    render(<CohortTrajectoryOverlay />)

    expect(screen.queryByLabelText('Overlay patients')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Patient 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Patient 2' })).not.toBeInTheDocument()
  })

  it('honours the connect data points setting in the overlay plot', () => {
    useAppStore.getState().setConnectPoints(false)

    render(<CohortTrajectoryOverlay />)

    const plot = screen.getByTestId('cohort-trajectory-overlay')
    expect(plot.querySelector('path[data-patient-id="1"]')).toBeNull()
    expect(plot.querySelector('path[data-patient-id="2"]')).toBeNull()
    expect(plot.querySelectorAll('circle[data-patient-id="1"]')).toHaveLength(2)
    expect(plot.querySelectorAll('circle[data-patient-id="2"]')).toHaveLength(2)
  })

  it('does not draw red exclusion connector segments when connect data points is off', () => {
    useAppStore.getState().setConnectPoints(false)
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientPoint = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGCircleElement>('circle[data-patient-id="2"]')
    fireEvent.pointerEnter(patientPoint!)

    expect(screen.queryByTestId('cohort-overlay-exclusion-segment')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('cohort-overlay-excluded-point')).toHaveLength(1)
  })

  it('uses the selected-patient cohort scope', () => {
    useAppStore.getState().setCohortPatientMode('selected')
    useAppStore.getState().setSelectedPatientIds([2])

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByRole('img', { name: /across 1 patient/ })).toBeInTheDocument()
    expect(screen.getByText('1 patient')).toBeInTheDocument()
    expect(screen.getByText('2 points')).toBeInTheDocument()
  })

  it('switches a double-clicked patient trajectory to the one-patient view', () => {
    render(<CohortTrajectoryOverlay />)

    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')

    expect(patientTrajectory).toHaveAttribute('title', 'Patient 2 - click to highlight; double-click to open')

    fireEvent.click(patientTrajectory!)

    expect(useAppStore.getState().view).toBe('cohort')
    expect(screen.getByText('Selected: Patient 2')).toBeInTheDocument()

    fireEvent.dblClick(patientTrajectory!)

    expect(useAppStore.getState().view).toBe('one')
    expect(useAppStore.getState().selectedPatientId).toBe(2)
    expect(useAppStore.getState().returnToCohort).toBe(true)
  })

  it('supports keyboard selection and opening for overlay trajectories', () => {
    render(<CohortTrajectoryOverlay />)

    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')!

    expect(patientTrajectory).toHaveAttribute('tabindex', '0')
    expect(patientTrajectory).toHaveAttribute('role', 'button')

    fireEvent.keyDown(patientTrajectory, { key: ' ' })
    expect(screen.getByText('Selected: Patient 2')).toBeInTheDocument()
    expect(useAppStore.getState().view).toBe('cohort')

    fireEvent.keyDown(patientTrajectory, { key: 'Enter' })
    expect(useAppStore.getState().view).toBe('one')
    expect(useAppStore.getState().selectedPatientId).toBe(2)
  })

  it('lets the user choose which configured series is shown in the overlay', async () => {
    useAppStore.getState().addSeries()
    useAppStore.getState().setSeriesConfig(1, { bezeichnung: 'HbA1c', einheit: '%' })

    render(<CohortTrajectoryOverlay />)

    expect(screen.getByRole('img', { name: /eGFR .* across 2 patient/ })).toBeInTheDocument()
    expect(screen.queryByText('CKD thresholds: 60, 45, 30, 15')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Overlay series'), '1')

    expect(screen.getByRole('img', { name: /HbA1c .* across 1 patient/ })).toBeInTheDocument()
    expect(screen.queryByText('CKD thresholds: 60, 45, 30, 15')).not.toBeInTheDocument()
  })

  it('highlights a patient when hovering an overlay trajectory', () => {
    render(<CohortTrajectoryOverlay />)

    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')

    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.getByText('Hover: Patient 2')).toBeInTheDocument()
  })

  it('renders configured clinical event effects as labeled vertical event lines and hides them with the event toggle', () => {
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 1,
        type: 'dialysis',
        date: new Date('2020-06-01T00:00:00Z'),
        title: 'Dialysis start',
        description: '',
        endDate: null,
        intent: 'unknown',
        warning: 'unknown_dialysis_intent',
      },
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])
    const { rerender } = render(<CohortTrajectoryOverlay />)

    expect(screen.queryByTestId('cohort-overlay-event-marker')).not.toBeInTheDocument()
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.getAllByTestId('cohort-overlay-event-line')).toHaveLength(1)
    expect(screen.getAllByTestId('cohort-overlay-event-label')).toHaveLength(1)
    expect(screen.getAllByTestId('cohort-overlay-event-label-bg')).toHaveLength(1)
    expect(screen.queryByTestId('cohort-overlay-event-marker')).not.toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay').textContent).toContain('Kidney transplant')
    expect(screen.getByTestId('cohort-trajectory-overlay').textContent).not.toContain('Dialysis start')
    expect(
      [...screen.getByTestId('cohort-trajectory-overlay').querySelectorAll('title')]
        .some((title) => title.textContent?.includes('Kidney transplant')),
    ).toBe(false)

    act(() => useAppStore.getState().setShowEvents(false))
    rerender(<CohortTrajectoryOverlay />)

    expect(screen.queryByTestId('cohort-overlay-event-marker')).not.toBeInTheDocument()
    expect(screen.getByTestId('cohort-trajectory-overlay').textContent).not.toContain('Dialysis start')
  })

  it('places the event label at the top end of its vertical event line', () => {
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const line = screen.getByTestId('cohort-overlay-event-line')
    const label = screen.getByTestId('cohort-overlay-event-label')
    const bg = screen.getByTestId('cohort-overlay-event-label-bg')
    const lineX = Number(line.getAttribute('x1'))
    const lineTop = Math.min(Number(line.getAttribute('y1')), Number(line.getAttribute('y2')))
    const labelX = Number(label.getAttribute('x'))
    const bgY = Number(bg.getAttribute('y'))
    const bgHeight = Number(bg.getAttribute('height'))

    expect(Math.abs(labelX - lineX)).toBeLessThanOrEqual(12)
    expect(Math.abs(bgY - lineTop)).toBeLessThanOrEqual(4)
    expect(bgHeight).toBeGreaterThan(0)
  })

  it('keeps long right-edge event labels attached to their vertical line', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 9, labDatum: new Date('2023-01-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 42 }),
      row({ patientId: 9, labDatum: new Date('2023-03-01T00:00:00Z'), patientAgeAtLab: 70.16, wertNum: 39 }),
      row({ patientId: 9, labDatum: new Date('2023-06-01T00:00:00Z'), patientAgeAtLab: 70.42, wertNum: 36 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 9,
        type: 'dialysis',
        date: new Date('2023-03-01T00:00:00Z'),
        title: 'Unknown dialysis interval',
        description: '',
        endDate: new Date('2023-03-21T00:00:00Z'),
        intent: 'unknown',
        warning: 'unknown_dialysis_intent',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="9"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const line = screen.getByTestId('cohort-overlay-event-line')
    const label = screen.getByTestId('cohort-overlay-event-label')
    const bg = screen.getByTestId('cohort-overlay-event-label-bg')
    const lineX = Number(line.getAttribute('x1'))
    const labelX = Number(label.getAttribute('x'))
    const bgX = Number(bg.getAttribute('x'))
    const bgWidth = Number(bg.getAttribute('width'))
    const nearestBgEdgeDistance = Math.min(Math.abs(bgX - lineX), Math.abs(bgX + bgWidth - lineX))

    expect(label.textContent).toBe('Unknown dialysis interval')
    expect(nearestBgEdgeDistance).toBeLessThanOrEqual(6)
    expect(Math.abs(labelX - lineX)).toBeLessThanOrEqual(bgWidth)
  })

  it('stacks multiple active event labels for the same patient without overlap', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 9, labDatum: new Date('2023-01-01T00:00:00Z'), patientAgeAtLab: 70, wertNum: 42 }),
      row({ patientId: 9, labDatum: new Date('2024-04-01T00:00:00Z'), patientAgeAtLab: 71.25, wertNum: 30 }),
      row({ patientId: 9, labDatum: new Date('2024-04-15T00:00:00Z'), patientAgeAtLab: 71.29, wertNum: 28 }),
      row({ patientId: 9, labDatum: new Date('2024-06-01T00:00:00Z'), patientAgeAtLab: 71.42, wertNum: 26 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 9,
        type: 'dialysis',
        date: new Date('2024-04-01T00:00:00Z'),
        title: 'Unknown dialysis interval',
        description: '',
        endDate: new Date('2024-04-21T00:00:00Z'),
        intent: 'unknown',
        warning: 'unknown_dialysis_intent',
      },
      {
        patientId: 9,
        type: 'dialysis',
        date: new Date('2024-04-15T00:00:00Z'),
        title: 'Dialysis start',
        description: '',
        endDate: null,
        intent: 'chronic',
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="9"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const rects = [...screen.getAllByTestId('cohort-overlay-event-label-bg')]
      .map((rect) => ({
        x1: Number(rect.getAttribute('x')),
        x2: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')),
        y1: Number(rect.getAttribute('y')),
        y2: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')),
      }))

    expect(rects).toHaveLength(2)
    expect(rectsOverlap(rects[0], rects[1])).toBe(false)
    expect(rects.every((rect) => rect.y1 >= 0)).toBe(true)
    expect(screen.getByTestId('cohort-trajectory-overlay').textContent).toContain('Unknown dialysis interval')
    expect(screen.getByTestId('cohort-trajectory-overlay').textContent).toContain('Dialysis start')
  })

  it('draws exclusion portions of affected trajectories in red from the event onward', () => {
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const excluded = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelectorAll<SVGPathElement>('path[data-testid="cohort-overlay-exclusion-segment"][data-patient-id="2"]')

    expect(excluded.length).toBeGreaterThan(0)
    expect([...excluded].every((path) => path.getAttribute('stroke') === '#dc2626')).toBe(true)
  })

  it('marks only actually excluded overlay measurements in red for the active trajectory', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 2, labDatum: new Date('2020-06-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 45 }),
      row({ patientId: 2, labDatum: new Date('2020-09-01T00:00:00Z'), patientAgeAtLab: 61.25, wertNum: 40 }),
      row({ patientId: 2, labDatum: new Date('2021-06-01T00:00:00Z'), patientAgeAtLab: 62, wertNum: 38 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const excludedPoints = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelectorAll<SVGCircleElement>('circle[data-testid="cohort-overlay-excluded-point"][data-patient-id="2"]')

    expect(excludedPoints).toHaveLength(2)
    expect([...excludedPoints].every((point) => point.getAttribute('stroke') === '#dc2626')).toBe(true)
    expect([...excludedPoints].every((point) => point.getAttribute('fill') === '#fff')).toBe(true)
  })

  it('keeps excluded overlay measurements visible when event labels are hidden', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 2, labDatum: new Date('2020-06-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 45 }),
      row({ patientId: 2, labDatum: new Date('2020-09-01T00:00:00Z'), patientAgeAtLab: 61.25, wertNum: 40 }),
      row({ patientId: 2, labDatum: new Date('2021-06-01T00:00:00Z'), patientAgeAtLab: 62, wertNum: 38 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])
    useAppStore.getState().setShowEvents(false)

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.queryByTestId('cohort-overlay-event-line')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cohort-overlay-event-label')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('cohort-overlay-excluded-point')).toHaveLength(2)
    expect(screen.getByTestId('cohort-overlay-exclusion-segment')).toBeInTheDocument()
  })

  it('renders contextual event lines but no exclusion effects when exclusions are disabled for the series', () => {
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      fitConfig: generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }),
    })
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'kidney_transplant',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.queryByTestId('cohort-overlay-event-marker')).not.toBeInTheDocument()
    expect(screen.getByTestId('cohort-overlay-event-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-overlay-event-label')).toHaveTextContent('Kidney transplant')
    expect(screen.queryByTestId('cohort-overlay-excluded-point')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cohort-overlay-exclusion-segment')).not.toBeInTheDocument()
  })

  it('renders display-only events as neutral context in the active overlay trajectory', () => {
    useAppStore.getState().setEvents([
      {
        patientId: 2,
        type: 'other',
        date: new Date('2020-09-01T00:00:00Z'),
        title: 'Study medication',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.getByTestId('cohort-overlay-event-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-overlay-event-label')).toHaveTextContent('Study medication')
    expect(screen.queryByTestId('cohort-overlay-excluded-point')).not.toBeInTheDocument()
  })

  it('renders selected AKI episodes in the overlay from the patient creatinine source', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 1.0 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-02T00:00:00Z'), patientAgeAtLab: 61.01, wertNum: 1.6 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 61.08, wertNum: 1.1 }),
      row({ patientId: 2, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 45 }),
      row({ patientId: 2, labDatum: new Date('2020-01-02T00:00:00Z'), patientAgeAtLab: 61.01, wertNum: 39 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 61.08, wertNum: 44 }),
    ])
    useAppStore.getState().setShowAki(true)

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    expect(screen.getByTestId('cohort-overlay-event-line')).toBeInTheDocument()
    expect(screen.getByTestId('cohort-overlay-event-label')).toHaveTextContent('AKI I')
    expect(screen.queryByTestId('cohort-overlay-excluded-point')).not.toBeInTheDocument()
  })

  it('marks AKI-window overlay measurements in red only when AKI exclusions are active', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 1.0 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-02T00:00:00Z'), patientAgeAtLab: 61.01, wertNum: 1.6 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 61.08, wertNum: 1.1 }),
      row({ patientId: 2, labDatum: new Date('2020-01-01T00:00:00Z'), patientAgeAtLab: 61, wertNum: 45 }),
      row({ patientId: 2, labDatum: new Date('2020-01-02T00:00:00Z'), patientAgeAtLab: 61.01, wertNum: 39 }),
      row({ patientId: 2, labDatum: new Date('2020-02-01T00:00:00Z'), patientAgeAtLab: 61.08, wertNum: 44 }),
    ])
    useAppStore.getState().setShowAki(true)
    useAppStore.getState().setSeriesFitConfig(0, { exclusions: { excludeAkiWindows: true } })

    render(<CohortTrajectoryOverlay />)
    const patientTrajectory = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelector<SVGPathElement>('path[data-patient-id="2"]')
    fireEvent.pointerEnter(patientTrajectory!)

    const excludedPoints = screen
      .getByTestId('cohort-trajectory-overlay')
      .querySelectorAll<SVGCircleElement>('circle[data-testid="cohort-overlay-excluded-point"][data-patient-id="2"]')

    expect(screen.getByTestId('cohort-overlay-event-label')).toHaveTextContent('AKI I')
    expect(excludedPoints).toHaveLength(2)
  })
})
