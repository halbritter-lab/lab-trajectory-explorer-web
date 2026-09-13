import { expect, it } from 'vitest'
import { buildMixedModelResultIdentity } from '../../../src/core/mixedModel/resultIdentity'
import { fitted } from '../mixedModel/projectionProfile.fixture'
import { buildProjectionSnapshot, createDefaultProjectionSettings, projectionCategoryChoices, validateProjectionSettings } from '../../../src/core/projection/projectionSnapshot'
import { projectionTargetPresets } from '../../../src/core/projection/targetPresets'
const response = {outcome:'eGFR',unit:'ml/min/1,73m²'}
const rows = [{patient_id:'a',eGFR:60,time_since_baseline:0,factorValues:{factor_0_:'A',factor_1_:0}},{patient_id:'b',eGFR:50,time_since_baseline:1,factorValues:{factor_0_:'B:factor_10_',factor_1_:2}}]
function source() {
  const result = fitted()
  const identity = buildMixedModelResultIdentity({seriesIndex:0,seriesKey:'literal|series|unit',patientIds:['a','b'],rows,fitConfigHash:'fit'})
  result.metadata.datasetHash = identity.datasetHash
  result.nMeasurements = rows.length
  return {result,identity}
}
it('binds renal presets to compatible outcomes/units and returns independent copies', () => {
  expect(projectionTargetPresets(response).map(t => t.threshold)).toEqual([30,15])
  expect(projectionTargetPresets({outcome:'Other',unit:response.unit})).toEqual([])
  expect(projectionTargetPresets({outcome:'eGFR',unit:'mg/dL'})).toEqual([])
  expect(projectionTargetPresets({outcome:'eGFR',unit:'ml/min'})).toEqual([])
  const presets = projectionTargetPresets(response)
  presets[0].threshold = 1
  expect(projectionTargetPresets(response)[0].threshold).toBe(30)
})
it('uses complete-case rows for choices and keeps disabled and unavailable rows', () => {
  const {result,identity} = source()
  expect(projectionCategoryChoices(result,rows)).toEqual({genotype:['A','B:factor_10_']})
  const settings = createDefaultProjectionSettings(result,response)
  settings.targets[1].enabled = false
  const snapshot = buildProjectionSnapshot(result,identity,response,rows,settings)
  expect(snapshot.sourceResult).toBe(result)
  expect(snapshot.sourceResponse).toEqual(response)
  expect(snapshot.rows.map(row => row.status)).toEqual(['crossing','disabled'])
  expect(snapshot.rows[0].modelTimeYears).toBe(10)
  expect(snapshot.warnings).toEqual(['singular'])
  settings.profile.genotype = 'excluded'
  const unavailable = buildProjectionSnapshot(result,identity,response,rows,settings)
  expect(unavailable.rows[0]).toMatchObject({status:'unavailable_profile',modelTimeYears:null,remainingYears:null})
  expect(unavailable.rows[1].status).toBe('disabled')
  expect(snapshot.settings.profile.genotype).toBe('A')
})
it('preserves response without targets and recomputes same-identity refits', () => {
  const {result,identity} = source()
  const generic = {outcome:'Sodium',unit:'mmol/L'}
  const settings = createDefaultProjectionSettings(result,generic)
  expect(buildProjectionSnapshot(result,identity,generic,rows,settings).sourceResponse).toEqual(generic)
  const next = {...result,fixedEffects:{intercept:80,timeSinceBaseline:5}}
  expect(buildProjectionSnapshot(next,identity,generic,rows,settings).line).toEqual({status:'ready',intercept:80,slopePerYear:5})
})
it('rejects malformed applied targets and times, including disabled targets', () => {
  const {result,identity} = source()
  const settings = createDefaultProjectionSettings(result,response)
  expect(validateProjectionSettings(settings,response)).toEqual([])
  settings.targets[1] = {...settings.targets[0],enabled:false,label:'',unit:'bad',threshold:NaN}
  settings.horizonYears = 0
  expect(validateProjectionSettings(settings,response).length).toBeGreaterThan(3)
  expect(() => buildProjectionSnapshot(result,identity,response,rows,settings)).toThrow()
})
it('refuses nonconverged, mismatched and stale-row sources', () => {
  const {result,identity} = source()
  const settings = createDefaultProjectionSettings(result,response)
  expect(() => buildProjectionSnapshot({...result,converged:false},identity,response,rows,settings)).toThrow()
  expect(() => buildProjectionSnapshot(result,{...identity,datasetHash:'stale'},response,rows,settings)).toThrow()
  expect(() => buildProjectionSnapshot(result,identity,response,[],settings)).toThrow()
})
