import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../src/workspace/state/store'
import { useWorkspaceData, workspaceSpecs, type WorkspaceData } from '../../src/workspace/workspace-data'
import { WorkspacePlot } from '../../src/workspace/WorkspacePlot'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { buildMixedModelResultIdentity, mixedModelFitConfigHash } from '../../src/core/mixedModel/resultIdentity'
import type { MixedModelSuccess } from '../../src/core/mixedModel/types'
import type { LabRow } from '../../src/core/types'
import { groupPatients } from '../../src/core/grouping/grouping'
import { workspaceGroupableAttributes, workspaceModelEntities } from '../../src/workspace/workspace-model-results'
import type { ClinicalEvent } from '../../src/core/events/events'

const success: MixedModelSuccess = {
  status: 'success', converged: true, singular: false, warnings: [], nPatients: 3, nMeasurements: 9,
  fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
  fixedEffectConfidenceIntervals: { timeSinceBaseline: [-2.5, -1.5] },
  randomEffects: { interceptSd: 4, slopeSd: null, interceptSlopeCorrelation: null }, residualSd: 2,
  metadata: { engine: 'webr-lme4', formula: 'value ~ time_since_baseline + (1 | patient_id)', runtimeVersion: '4.6.0', packageVersions: {}, browserUserAgent: 'test', wasmAssetSource: 'cdn', optimizer: 'nloptwrap', reml: true, tolerance: 1e-6, datasetId: 'test', datasetHash: 'test', randomSeed: null, fitConfigHash: 'test' },
}
let data: WorkspaceData
function Harness({ axis = 'baseline', studio = false, groupBy = '' }: { axis?: 'baseline' | 'age'; studio?: boolean; groupBy?: string }) {
  data = useWorkspaceData()
  if (studio) return <CohortModelsWorkspace data={data} onBrowseData={() => {}} onBrowseTrajectories={() => {}} />
  const parameter = data.parameters[0]
  return <WorkspacePlot data={data} parameter={parameter} parameterIndex={0}
    cohortRows={buildCohortRows(data.rows, data.patients.map(p => p.id), workspaceSpecs(data, [parameter.key]))}
    axis={axis} groupBy={groupBy} highlight={null} display={{ points: true, connect: true, events: false, aki: false }}
    showFit onOpen={() => {}} sharedDomain={{ min: 0, max: 100, days: 731 }} scaleMode="shared" />
}
function seedResult(patch: Partial<MixedModelSuccess> = {}) {
  const config = useAppStore.getState().mixedModelConfig
  const spec = workspaceSpecs(data, [data.parameters[0].key])[0]
  const prepared = workspaceModelEntities(data.rows, data.patients.map(p => p.id), spec, config, data.patientAttributes, [])[0]
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
  useAppStore.getState().replaceDataset({ rows: rows, fileName: 'test.csv' })
})
function seedGroupResult(attribute: string, value: string) {
  const config = useAppStore.getState().mixedModelConfig
  const spec = workspaceSpecs(data, [data.parameters[0].key])[0]
  const ids = data.patients.map(p => p.id)
  const groups = groupPatients(ids, workspaceGroupableAttributes(data.rows, data.patientAttributes), attribute)
  const entity = workspaceModelEntities(data.rows, ids, spec, config, data.patientAttributes, groups)
    .find(item => item.entity.kind === 'group' && item.entity.value === value)!
  const identity = buildMixedModelResultIdentity({ seriesIndex: 0, seriesKey: data.parameters[0].key,
    rows: entity.rows, patientIds: entity.rows.map(r => r.patient_id), preparation: entity.preparation,
    fitConfigHash: mixedModelFitConfigHash(spec, config), groupValue: value })
  useAppStore.setState({ cohortModelResults: { ...useAppStore.getState().cohortModelResults, [`group:${value}`]: { result: success, identity } }, showCohortMixedModelLine: true })
}
describe('workspace model validity', () => {
  it('reports pooled and grouped preset exclusions separately from factor preparation', () => {
    render(<Harness />)
    const transplant: ClinicalEvent = { patientId: 'A', type: 'kidney_transplant', date: new Date('2021-01-01T00:00:00Z'), title: 'Transplant', description: null, endDate: null, intent: null, warning: '' }
    const spec = { ...workspaceSpecs(data, [data.parameters[0].key])[0], fitConfig: undefined, clinicalEventsByPatient: { A: [transplant] } }
    const ids = data.patients.map(p => p.id)
    const groups = [{ value: 'A', patientIds: ['A'] }, { value: 'BC', patientIds: ['B', 'C'] }]
    const entities = workspaceModelEntities(data.rows, ids, spec, useAppStore.getState().mixedModelConfig, {}, groups)
    expect(entities.map(entity => entity.preparation?.excludedByPreset)).toEqual([2, 2, 0])
    expect(entities.map(entity => entity.preparation?.nMeasurementsBefore)).toEqual([7, 1, 6])
    expect(entities.every(entity => entity.preparation?.presetExclusionPolicy === 'apply')).toBe(true)
    const skipped = workspaceModelEntities(data.rows, ids, spec, useAppStore.getState().mixedModelConfig, {}, groups, 'skip')
    expect(skipped.map(entity => entity.preparation?.excludedByPreset)).toEqual([0, 0, 0])
    expect(skipped.map(entity => entity.rows.length)).toEqual([9, 3, 6])
  })
  it('invalidates a fitted result when preset exclusions are switched off', () => {
    const view = render(<Harness studio />)
    expect(screen.getByText(/Preset windows: applied; 0 eligible measurements excluded/)).toBeInTheDocument()
    act(() => seedResult())
    view.rerender(<Harness studio />)
    expect(screen.getByText(/Whole cohort fitted trajectory/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Apply preset event and AKI exclusions/i }))
    expect(screen.getByText(/Preset windows: skipped; 0 eligible measurements excluded/)).toBeInTheDocument()
    expect(screen.queryByText(/Whole cohort fitted trajectory/)).not.toBeInTheDocument()
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().projectionSettings).toEqual({})
  })
  it('draws per-group model lines only for groups fitted under the overlay grouping', () => {
    useAppStore.getState().setPatientAttributes({ A: { arm: 'X' }, B: { arm: 'X' }, C: { arm: 'Y' } })
    const view = render(<Harness groupBy="arm" />)
    act(() => seedGroupResult('arm', 'X'))
    view.rerender(<Harness groupBy="arm" />)
    const lines = view.container.querySelectorAll('.wt-group-model-line')
    expect([...lines].map(line => line.getAttribute('data-group'))).toEqual(['X'])
    expect(screen.getByTestId('group-model-legend')).toHaveTextContent('fitted separately per group (X)')
    expect(view.container.querySelector('svg')!.getAttribute('data-export-context')).toContain('Group mixed model mean lines: X')
    // Rows filtered to group Y (as Filter group does) drop group X's line.
    const onlyY = buildCohortRows(data.rows, ['C'], workspaceSpecs(data, [data.parameters[0].key]))
    view.rerender(<WorkspacePlot data={data} parameter={data.parameters[0]} parameterIndex={0} cohortRows={onlyY}
      axis="baseline" groupBy="arm" highlight={null} display={{ points: true, connect: true, events: false, aki: false }}
      showFit onOpen={() => {}} sharedDomain={{ min: 0, max: 100, days: 731 }} scaleMode="shared" />)
    expect(view.container.querySelector('.wt-group-model-line')).toBeNull()
    view.rerender(<Harness groupBy="arm" />)
    expect(view.container.querySelectorAll('.wt-group-model-line')).toHaveLength(1)
    // Hiding the group in the legend hides its model line too.
    fireEvent.click(within(screen.getByRole('group', { name: /^Groups for/ })).getByRole('button', { name: /X/ }))
    expect(view.container.querySelector('.wt-group-model-line')).toBeNull()
    // Without grouping, or grouped by another attribute, group results are not shown.
    view.rerender(<Harness groupBy="" />)
    expect(view.container.querySelector('.wt-group-model-line')).toBeNull()
    view.rerender(<Harness groupBy="sex" />)
    expect(view.container.querySelector('.wt-group-model-line')).toBeNull()
  })

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
    useAppStore.getState().replaceDataset({ rows: [...originalRows, ...originalRows.map(r => ({ ...r, bezeichnung: 'Other' }))] })
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
  it('does not draw a singular preview as a valid trajectory', () => {
    const view = render(<Harness studio />)
    act(() => seedResult({ singular: true }))
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
