import * as XLSX from 'xlsx'
import { sheetsToXlsxBytes } from '../../../src/io/export'
import { describe, it, expect } from 'vitest'
import { mixedModelExportSheets, mixedModelTermLabel } from '../../../src/core/mixedModel/modelExport'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import type { MixedModelSuccess } from '../../../src/core/mixedModel/types'

describe('mixed model export', () => {
  it('exports fitted configuration, every term, reference, exclusions, centers and disclaimer', () => {
    const config = {...DEFAULT_MIXED_MODEL_CONFIG, factors:[{key:'genotype',kind:'categorical' as const,effect:'level_slope' as const,reference:'A'}, {key:'baseline_age',kind:'numeric' as const,effect:'level_slope' as const}, {key:'dose',kind:'numeric' as const,effect:'level_slope' as const}]}
    const result = {status:'success', metadata:{engine:'webr-lme4',runtimeVersion:null,packageVersions:{},browserUserAgent:'test',wasmAssetSource:'cdn',optimizer:null,reml:true,tolerance:null,datasetId:'test',randomSeed:null,fitConfigHash:'fit',modelConfig:config,formula:'fitted formula',datasetHash:'fitted hash',preparation:{nPatientsBefore:4,nMeasurementsBefore:12,centers:{factor_1_:62},excludedPatients:[{patientId:'p4',reasons:['Missing sex']}]}},nPatients:3,nMeasurements:9,converged:true,warnings:['singular'],fixedEffectTerms:[{term:'time_since_baseline:factor_0_B',estimate:-2,confidenceInterval:[-3,-1]}],fixedEffects:{intercept:60,timeSinceBaseline:-1},fixedEffectConfidenceIntervals:{timeSinceBaseline:null},randomEffects:{interceptSd:null,slopeSd:null,interceptSlopeCorrelation:null},residualSd:null} satisfies MixedModelSuccess
    const storedIdentity = {seriesKey:'eGFR (CKD-EPI 2021)|ml/min/1.73m2'}
    const fitted: MixedModelSuccess = {...result,fixedEffectTerms:[
      ...result.fixedEffectTerms,
      {term:'factor_0_B',estimate:2,confidenceInterval:null},
      {term:'baseline_age_centered',estimate:1,confidenceInterval:null},
      {term:'time_since_baseline:baseline_age_centered',estimate:0.1,confidenceInterval:null},
      {term:'factor_2_',estimate:1,confidenceInterval:null},
      {term:'time_since_baseline:factor_2_',estimate:0.1,confidenceInterval:null},
    ]}
    const sheets = mixedModelExportSheets([{entity:'Whole cohort',result:fitted,identity:storedIdentity}])
    expect(sheets.find((sheet) => sheet.name === 'coefficients')?.rows).toEqual(expect.arrayContaining([expect.objectContaining({term:'time_since_baseline:factor_0_B',estimate:-2,ci_lower:-3,ci_upper:-1,label:'Slope \u00d7 genotype: B (reference A)'})]))
    expect(JSON.stringify(sheets)).toContain('Missing sex')
    expect(JSON.stringify(sheets)).toContain('62')
    expect(JSON.stringify(sheets)).toContain('fitted formula')
    expect(JSON.stringify(sheets)).toContain('Research')
    const workbook = XLSX.read(sheetsToXlsxBytes(sheets), {type:'array'})
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.coefficients)).toEqual(expect.arrayContaining([expect.objectContaining({estimate:-2,ci_lower:-3,ci_upper:-1})]))
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.models)).toEqual(expect.arrayContaining([expect.objectContaining({series_key:storedIdentity.seriesKey,outcome:'eGFR (CKD-EPI 2021)',outcome_unit:'ml/min/1.73m2'})]))
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.coefficients)).toEqual(expect.arrayContaining([
      expect.objectContaining({term:'time_since_baseline:factor_0_B',unit:'ml/min/1.73m2 per year'}),
      expect.objectContaining({term:'factor_0_B',unit:'ml/min/1.73m2'}),
      expect.objectContaining({term:'baseline_age_centered',unit:'ml/min/1.73m2 per year of baseline age'}),
      expect.objectContaining({term:'time_since_baseline:baseline_age_centered',unit:'ml/min/1.73m2 per year per year of baseline age'}),
      expect.objectContaining({term:'factor_2_',unit:'ml/min/1.73m2 per unit of dose'}),
      expect.objectContaining({term:'time_since_baseline:factor_2_',unit:'ml/min/1.73m2 per year per unit of dose'}),
    ]))
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.excluded_patients)).toEqual([{entity:'Whole cohort',patient_id:'p4',reasons:'Missing sex'}])
    expect(mixedModelTermLabel('factor_0_B',config)).toBe('genotype: B (reference A)')
  })
})

it('labels category strings literally and distinguishes generated columns with shared prefixes', () => {
  const config = {...DEFAULT_MIXED_MODEL_CONFIG,factors:Array.from({length:11},(_,index) => ({key:`variable ${index}`,kind:'categorical' as const,effect:'level' as const,reference:'ref'}))}
  expect(mixedModelTermLabel('time_since_baseline:factor_10_A:B',config)).toBe('Slope \u00d7 variable 10: A:B (reference ref)')
  expect(mixedModelTermLabel('factor_1_0B',config)).toBe('variable 1: 0B (reference ref)')
  expect(mixedModelTermLabel('factor_10_B',config)).toBe('variable 10: B (reference ref)')
})
