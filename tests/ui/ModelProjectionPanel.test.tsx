import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ModelProjectionPanel } from '../../src/ui/cohort/ModelProjectionPanel'
import { buildProjectionSnapshot, type ProjectionSettings, type ProjectionSnapshot } from '../../src/core/projection/projectionSnapshot'
import { buildMixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../src/core/mixedModel/config'

const identity = buildMixedModelResultIdentity({seriesIndex:0,seriesKey:'Protein|mg/L',patientIds:[],rows:[],fitConfigHash:'fit'})
const result = {status:'success',converged:true,nPatients:0,nMeasurements:0,metadata:{datasetHash:identity.datasetHash,fitConfigHash:'fit'},warnings:['Fit warning'],fixedEffects:{intercept:80,timeSinceBaseline:5},fixedEffectConfidenceIntervals:{timeSinceBaseline:null}} as ProjectionSnapshot['sourceResult']
const response = {outcome:'Protein',unit:'mg/L'}
const initial: ProjectionSettings = {targets:[{id:'custom',label:'Study boundary',outcome:'Protein',unit:'mg/L',threshold:100,direction:'above',enabled:true}],profile:{},referenceTimeYears:0,horizonYears:20}
function Harness({dirty = vi.fn()}: {dirty?: (value:boolean)=>void}) {
  const [settings,setSettings] = useState(initial)
  return <ModelProjectionPanel snapshot={buildProjectionSnapshot(result,identity,response,[],settings)} onApply={setSettings} onDirtyChange={dirty} />
}
it('keeps results applied until apply, validates blanks, and cancels drafts', () => {
  const dirty = vi.fn()
  render(<Harness dirty={dirty} />)
  expect(screen.getByRole('table',{name:'Projected boundary intersections'})).toHaveTextContent('4.00')
  fireEvent.change(screen.getByLabelText('Reference time (years)'),{target:{value:'2'}})
  expect(dirty).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('table')).toHaveTextContent('4.00')
  fireEvent.click(screen.getByText('Apply projection settings'))
  expect(screen.getByRole('table')).toHaveTextContent('2.00')
  fireEvent.change(screen.getByLabelText('Horizon (years)'),{target:{value:''}})
  expect(screen.getByText('Apply projection settings')).toBeDisabled()
  fireEvent.click(screen.getByText('Cancel'))
  expect(screen.getByLabelText('Horizon (years)')).toHaveValue(20)
  expect(screen.getByText(/Time uncertainty is not estimated/)).toBeInTheDocument()
  expect(screen.queryByText(/Add G4/)).not.toBeInTheDocument()
})
it('retains disabled targets and supports adding, editing and removing custom definitions', () => {
  render(<Harness />)
  fireEvent.click(screen.getByLabelText('Target 1 enabled'))
  fireEvent.click(screen.getByText('Apply projection settings'))
  expect(screen.getByRole('table')).toHaveTextContent('Disabled')
  fireEvent.click(screen.getByText('Add custom target'))
  fireEvent.change(screen.getByLabelText('Target 2 label'),{target:{value:'Second boundary'}})
  fireEvent.change(screen.getByLabelText('Target 2 direction'),{target:{value:'below'}})
  fireEvent.click(screen.getByText('Apply projection settings'))
  expect(screen.getByRole('table')).toHaveTextContent('Second boundary')
  fireEvent.click(screen.getByLabelText('Remove target 2'))
  fireEvent.click(screen.getByText('Apply projection settings'))
  expect(screen.getByRole('table')).not.toHaveTextContent('Second boundary')
})

it('uses fitted category choices and recomputes a nonreference profile without refitting', () => {
  const rows = [{patient_id:'a',eGFR:80,time_since_baseline:0,factorValues:{factor_0_:'A'}},{patient_id:'b',eGFR:80,time_since_baseline:0,factorValues:{factor_0_:'B'}}]
  const sourceIdentity = buildMixedModelResultIdentity({seriesIndex:0,seriesKey:'Protein|mg/L',patientIds:['a','b'],rows,fitConfigHash:'fit'})
  const fitted: ProjectionSnapshot['sourceResult'] = {...result,nPatients:2,nMeasurements:2,metadata:{...result.metadata,datasetHash:sourceIdentity.datasetHash,modelConfig:{...DEFAULT_MIXED_MODEL_CONFIG,factors:[{key:'genotype',kind:'categorical',effect:'level_slope',reference:'A'}]}},fixedEffectTerms:[{term:'(Intercept)',estimate:80,confidenceInterval:null},{term:'time_since_baseline',estimate:5,confidenceInterval:null},{term:'factor_0_B',estimate:10,confidenceInterval:null},{term:'time_since_baseline:factor_0_B',estimate:5,confidenceInterval:null}]}
  function ProfileHarness() {
    const [settings,setSettings] = useState({...initial,profile:{genotype:'A'}} as ProjectionSettings)
    return <ModelProjectionPanel snapshot={buildProjectionSnapshot(fitted,sourceIdentity,response,rows,settings)} onApply={setSettings} onDirtyChange={() => {}} />
  }
  render(<ProfileHarness />)
  expect(screen.getByLabelText('Profile genotype')).toHaveValue('A')
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('B')
  fireEvent.change(screen.getByLabelText('Profile genotype'),{target:{value:'B'}})
  expect(screen.getByRole('table')).toHaveTextContent('4.00')
  fireEvent.click(screen.getByText('Apply projection settings'))
  expect(screen.getByRole('table')).toHaveTextContent('1.00')
})

it('refreshes displayed times from same-identity refits while retaining unapplied drafts', () => {
  const onApply = vi.fn()
  const onDirtyChange = vi.fn()
  const {rerender} = render(<ModelProjectionPanel snapshot={buildProjectionSnapshot(result,identity,response,[],initial)} onApply={onApply} onDirtyChange={onDirtyChange} />)
  fireEvent.change(screen.getByLabelText('Reference time (years)'),{target:{value:'2'}})
  const refit = {...result,fixedEffects:{intercept:80,timeSinceBaseline:10}}
  rerender(<ModelProjectionPanel snapshot={buildProjectionSnapshot(refit,identity,response,[],initial)} onApply={onApply} onDirtyChange={onDirtyChange} />)
  expect(screen.getByRole('table')).toHaveTextContent('2.00')
  expect(screen.getByLabelText('Reference time (years)')).toHaveValue(2)
  expect(screen.getByText('Apply projection settings')).toBeEnabled()
})
