import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../src/ui/state/store'
import { useWorkspaceData, workspaceSpecs, type WorkspaceData } from '../../src/workspace/workspace-data'
import { WorkspacePlot } from '../../src/workspace/WorkspacePlot'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { mixedModelRowsFromCohortInputs } from '../../src/core/mixedModel/cohortDataset'
import { prepareMixedModelFactors } from '../../src/core/mixedModel/factors'
import { buildMixedModelResultIdentity, mixedModelFitConfigHash } from '../../src/core/mixedModel/resultIdentity'
import type { MixedModelSuccess } from '../../src/core/mixedModel/types'
import type { LabRow } from '../../src/core/types'

const success: MixedModelSuccess = {
  status: 'success', converged: true, warnings: [], nPatients: 3, nMeasurements: 9,
  fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
  fixedEffectConfidenceIntervals: { timeSinceBaseline: [-2.5, -1.5] },
  randomEffects: { interceptSd: 4, slopeSd: null, interceptSlopeCorrelation: null }, residualSd: 2,
  metadata: { engine: 'webr-lme4', formula: 'eGFR ~ time_since_baseline + (1 | patient_id)', runtimeVersion: '4.6.0', packageVersions: {}, browserUserAgent: 'test', wasmAssetSource: 'cdn', optimizer: 'nloptwrap', reml: true, tolerance: 1e-6, datasetId: 'test', datasetHash: 'test', randomSeed: null, fitConfigHash: 'test' },
}
let data: WorkspaceData
function Harness({ axis = 'baseline', studio = false }: { axis?: 'baseline' | 'age'; studio?: boolean }) {
  data = useWorkspaceData()
  if (studio) return <CohortModelsWorkspace data={data} onBrowseData={() => {}} onBrowseTrajectories={() => {}} />
  const parameter = data.parameters[0]
  return <WorkspacePlot data={data} parameter={parameter} parameterIndex={0}
    cohortRows={buildCohortRows(data.rows, data.patients.map(p => p.id), workspaceSpecs(data, [parameter.key]))}
    axis={axis} groupBy="" highlight={null} display={{ points: true, connect: true, events: false }}
    showFit onOpen={() => {}} sharedDomain={{ min: 0, max: 100, days: 731 }} scaleMode="shared" />
}
function seedResult(patch: Partial<MixedModelSuccess> = {}) {
  const config = useAppStore.getState().mixedModelConfig
  const spec = workspaceSpecs(data, [data.parameters[0].key])[0]
  const prepared = prepareMixedModelFactors(mixedModelRowsFromCohortInputs(data.rows, data.patients.map(p => p.id), spec), config, data.patientAttributes, data.rows)
  const identity = buildMixedModelResultIdentity({ seriesIndex: 0, seriesKey: data.parameters[0].key,
    rows: prepared.rows, patientIds: prepared.rows.map(r => r.patient_id), preparation: prepared.preparation,
    fitConfigHash: mixedModelFitConfigHash(spec, config) })
  useAppStore.setState({ cohortModelResults: { cohort: { result: { ...success, ...patch }, identity } }, showCohortMixedModelLine: true })
}
beforeEach(() => {
  useAppStore.getState().reset()
  const rows: LabRow[] = ['A', 'B', 'C'].flatMap(patientId => [0, 1, 2].map(year => ({
    patientId, labDatum: new Date(Date.UTC(2020 + year, 0, 1)), bezeichnung: 'Marker', einheit: 'u',
    wert: String(60 - year * 2), wertNum: 60 - year * 2, wertOperator: '=', loinc: null,
    patientSex: 'm', patientAgeAtLab: 50 + year,
  })))
  useAppStore.getState().setDataset(rows, 'test.csv')
})
describe('workspace model validity', () => {
  it('shows an exactly matching model and rejects a different unit', () => {
    const view = render(<Harness />)
    act(() => seedResult())
    view.rerender(<Harness />)
    expect(view.container.querySelector('.wt-cohort-model-line')).not.toBeNull()
    const stored = useAppStore.getState().cohortModelResults!.cohort
    act(() => useAppStore.setState({ cohortModelResults: { cohort: { ...stored, identity: { ...stored.identity, seriesKey: JSON.stringify(['Marker', 'other']) } } } }))
    view.rerender(<Harness />)
    expect(view.container.querySelector('.wt-cohort-model-line')).toBeNull()
  })
  it('places the age-axis model at baseline age plus elapsed model time', () => {
    const view = render(<Harness axis="age" />)
    act(() => seedResult())
    view.rerender(<Harness axis="age" />)
    const line = view.container.querySelector('.wt-cohort-model-line polyline')!
    expect(line).not.toBeNull()
    const first = line.getAttribute('points')!.split(' ')[0].split(',').map(Number)
    // All patients start at age 50: x is left edge, y represents intercept 60.
    expect(first[0]).toBeCloseTo(65, 1)
    expect(first[1]).toBeCloseTo(114, 1)
  })
  it('removes preview lines after changing the response or measurement data', () => {
    const originalRows = useAppStore.getState().rows
    useAppStore.getState().setDataset([...originalRows, ...originalRows.map(r => ({ ...r, bezeichnung: 'Other' }))])
    const view = render(<Harness studio />)
    act(() => seedResult())
    view.rerender(<Harness studio />)
    expect(screen.getByText(/Whole cohort fitted trajectory/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: JSON.stringify(['Other', 'u']) } })
    expect(screen.queryByText(/Whole cohort fitted trajectory/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: JSON.stringify(['Marker', 'u']) } })
    expect(screen.getByText(/Whole cohort fitted trajectory/)).toBeInTheDocument()
    act(() => useAppStore.setState({ rows: useAppStore.getState().rows.map(r => ({ ...r, wertNum: 999 })) }))
    view.rerender(<Harness studio />)
    expect(screen.queryByText(/Whole cohort fitted trajectory/)).not.toBeInTheDocument()
  })
  it('does not draw a non-converged preview as a valid trajectory', () => {
    const view = render(<Harness studio />)
    act(() => seedResult({ converged: false }))
    view.rerender(<Harness studio />)
    expect(screen.queryByText(/Whole cohort fitted trajectory/)).not.toBeInTheDocument()
  })
  it('marks the affected individual fit, rather than only reporting an aggregate warning', () => {
    useAppStore.setState({ rows: useAppStore.getState().rows.filter(r => r.patientId !== 'A' || r.labDatum!.getUTCFullYear() !== 2022) })
    render(<Harness />)
    const uncertain = screen.getByRole('button', { name: /Open patient A,/ })
    const reliable = screen.getByRole('button', { name: /Open patient B,/ })
    expect(uncertain).toHaveAccessibleDescription(/uncertain slope/i)
    expect(uncertain.querySelector('[data-fit-quality="uncertain"]')).not.toBeNull()
    expect(reliable.querySelector('[data-fit-quality="uncertain"]')).toBeNull()
  })
  it('offers chart exports for the model preview', () => {
    render(<Harness studio />)
    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  })
})
