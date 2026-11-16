import { render, screen } from '@testing-library/react'
import { CohortModelPlotPreview } from '../../../src/workspace/CohortModelPlotPreview'
import type { MixedModelSpikeRow, MixedModelSuccess } from '../../../src/core/mixedModel/types'

const rows: MixedModelSpikeRow[] = [0, 1, 2].map(time => ({ patient_id: 'p1', value: 60 - 5 * time, time_since_baseline: time }))

function result(terms?: string[]): MixedModelSuccess {
  return {
    status: 'success', converged: true, singular: false, warnings: [], nPatients: 10, nMeasurements: 30,
    metadata: {} as MixedModelSuccess['metadata'],
    fixedEffects: { intercept: 60, timeSinceBaseline: -4.77 },
    fixedEffectTerms: terms?.map(term => ({ term, estimate: 0, confidenceInterval: null })),
    fixedEffectConfidenceIntervals: { timeSinceBaseline: null },
    randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: null,
  }
}

function renderPlot(terms?: string[]) {
  render(<CohortModelPlotPreview parameterLabel="eGFR" parameterUnit="ml/min" spikeRows={rows} groups={[]} groupColors={new Map()}
    groupValuesByPatient={new Map()} cohortModelResults={{ cohort: { result: result(terms), identity: {} as never } }} modelRowsByEntity={{ cohort: rows }} canFit />)
}

describe('model plot slope chip', () => {
  it('names the reference profile when a factor changes the slope', () => {
    renderPlot(['(Intercept)', 'time_since_baseline', 'cohortB', 'time_since_baseline:cohortB'])
    expect(screen.getByText('Whole cohort, reference profile:')).toBeInTheDocument()
  })
  it('keeps the plain unit name when the slope is common to all patients', () => {
    renderPlot(['(Intercept)', 'time_since_baseline', 'cohortB'])
    expect(screen.getByText('Whole cohort:')).toBeInTheDocument()
  })
})
