import * as XLSX from 'xlsx'
import { sheetsToXlsxBytes } from '../../../src/io/export'
import { describe, it, expect } from 'vitest'
import { mixedModelExportSheets, mixedModelTermLabel } from '../../../src/core/mixedModel/modelExport'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula } from '../../../src/core/mixedModel/config'
import { lme4ModelCall, mixedModelDataRCode, mixedModelRScript } from '../../../src/core/mixedModel/rCode'
import type { MixedModelSuccess } from '../../../src/core/mixedModel/types'
import type { ProjectionSnapshot } from '../../../src/core/projection/projectionSnapshot'

it('exports explicit response and disabled projection provenance, rejecting an older result object', () => {
  const result = {status:'success', converged:true, singular:false, metadata:{}, warnings:['Fit warning'], fixedEffects:{intercept:80,timeSinceBaseline:5}, fixedEffectConfidenceIntervals:{timeSinceBaseline:null}} as MixedModelSuccess
  const identity = {seriesKey:'ambiguous|key|unit'} as ProjectionSnapshot['sourceIdentity']
  const target = {id:'custom',label:'Study boundary',outcome:'Protein|marker',unit:'mg/L',threshold:100,direction:'above' as const,enabled:false}
  const projection = {sourceResult:result,sourceIdentity:identity,sourceResponse:{outcome:'Protein|marker',unit:'mg/L'},settings:{targets:[target],profile:{},referenceTimeYears:2,horizonYears:20},line:{status:'ready',intercept:80,slopePerYear:5},rows:[{target,status:'disabled',reason:null,modelTimeYears:null,remainingYears:null}],warnings:result.warnings,categoryChoices:{}} satisfies ProjectionSnapshot
  const sheets = mixedModelExportSheets([{entity:'Whole cohort',result,identity,projection}])
  const workbook = XLSX.read(sheetsToXlsxBytes(sheets),{type:'array'})
  expect(XLSX.utils.sheet_to_json(workbook.Sheets.projections)).toEqual([expect.objectContaining({outcome:'Protein|marker',outcome_unit:'mg/L',status:'disabled',enabled:false,reference_time_years:2,time_uncertainty:'not estimated'})])
  expect(XLSX.utils.sheet_to_json(workbook.Sheets.models)).toEqual([expect.objectContaining({outcome:'Protein|marker',outcome_unit:'mg/L'})])
  expect(() => mixedModelExportSheets([{entity:'Whole cohort',result:{...result},identity,projection}])).toThrow(/current|source|snapshot/i)
  const singularResult = {...result,singular:true}
  expect(() => mixedModelExportSheets([{entity:'Whole cohort',result:singularResult,identity,projection:{...projection,sourceResult:singularResult}}])).toThrow(/projection/i)
  const empty = {...projection,settings:{...projection.settings,targets:[]},rows:[]}
  expect(mixedModelExportSheets([{entity:'Whole cohort',result,identity,projection:empty}]).find((sheet) => sheet.name === 'projections')?.rows).toEqual([expect.objectContaining({status:'no_targets',outcome:'Protein|marker',outcome_unit:'mg/L'})])
  const unavailable = {...projection,line:{status:'unavailable' as const,reason:'Missing coefficient'},rows:[{...projection.rows[0],status:'unavailable_profile' as const,reason:'Missing coefficient'}]}
  expect(mixedModelExportSheets([{entity:'Whole cohort',result,identity,projection:unavailable}]).find((sheet) => sheet.name === 'projections')?.rows).toEqual([expect.objectContaining({status:'unavailable_profile',reason:'Missing coefficient',intercept:null,slope_per_year:null,model_time_years:null,remaining_years:null})])
})

describe('mixed model export', () => {
  it('exports fitted configuration, every term, reference, exclusions, centers and disclaimer', () => {
    const config = {...DEFAULT_MIXED_MODEL_CONFIG, factors:[{key:'genotype',kind:'categorical' as const,effect:'level_slope' as const,reference:'A'}, {key:'baseline_age',kind:'numeric' as const,effect:'level_slope' as const}, {key:'dose',kind:'numeric' as const,effect:'level_slope' as const}]}
    const result = {status:'success', metadata:{engine:'webr-lme4',runtimeVersion:null,packageVersions:{},browserUserAgent:'test',wasmAssetSource:'cdn',optimizer:null,reml:true,tolerance:null,datasetId:'test',randomSeed:null,fitConfigHash:'fit',modelConfig:config,formula:'fitted formula',datasetHash:'fitted hash',preparation:{nPatientsBefore:4,nMeasurementsBefore:12,presetExclusionPolicy:'apply' as const,excludedByPreset:2,centers:{factor_1_:62},excludedPatients:[{patientId:'p4',reasons:['Missing sex']}]}},nPatients:3,nMeasurements:9,converged:true,singular:true,warnings:['singular'],fixedEffectTerms:[{term:'time_since_baseline:factor_0_B',estimate:-2,confidenceInterval:[-3,-1]}],fixedEffects:{intercept:60,timeSinceBaseline:-1},fixedEffectConfidenceIntervals:{timeSinceBaseline:null},randomEffects:{interceptSd:null,slopeSd:null,interceptSlopeCorrelation:null},residualSd:null} satisfies MixedModelSuccess
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
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.models)).toEqual(expect.arrayContaining([expect.objectContaining({preset_exclusion_policy:'apply',excluded_by_preset:2})]))
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.models)).toEqual(expect.arrayContaining([expect.objectContaining({singular:true,converged:true})]))
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

describe('R reproduction export', () => {
  const config = {...DEFAULT_MIXED_MODEL_CONFIG, factors:[{key:'genotype',kind:'categorical' as const,effect:'level_slope' as const,reference:'A'}, {key:'dose',kind:'numeric' as const,effect:'level' as const}]}
  const terms = ['(Intercept)','time_since_baseline','factor_0_B','factor_1_','time_since_baseline:factor_0_B']
  const result = {status:'success', metadata:{engine:'webr-lme4',runtimeVersion:'4.5.1',packageVersions:{lme4:'1.1-37',Matrix:'1.7-3',jsonlite:'2.0.0'},browserUserAgent:'test',wasmAssetSource:'cdn',optimizer:null,reml:true,tolerance:null,datasetId:'cohort',randomSeed:null,fitConfigHash:'fit',modelConfig:config,formula:mixedModelFormula(config),datasetHash:'hash'},nPatients:2,nMeasurements:2,converged:true,singular:false,warnings:[],
    fixedEffectTerms:terms.map((term,index) => ({term,estimate:index+1,confidenceInterval:null,standardError:index/10})),
    fixedEffectCovariance:{terms,matrix:terms.map((_,row) => terms.map((__,column) => row === column ? (row/10)**2 : 0.001))},
    fixedEffects:{intercept:1,timeSinceBaseline:2},fixedEffectConfidenceIntervals:{timeSinceBaseline:null},randomEffects:{interceptSd:null,slopeSd:null,interceptSlopeCorrelation:null},residualSd:null} satisfies MixedModelSuccess
  const rows = [
    {patient_id:'p1',value:60,date:'2020-01-01',time_since_baseline:0,factorValues:{factor_0_:'A',factor_1_:-1.5},factorRawValues:{factor_0_:'A',factor_1_:2}},
    {patient_id:'p2',value:58,date:'2020-03-01',time_since_baseline:0,factorValues:{factor_0_:'B',factor_1_:1.5},factorRawValues:{factor_0_:'B',factor_1_:5}},
  ]
  const inputFlags = [{patient_id:'p1',date:'2020-01-01',value:60,status:'entered' as const,reason:'',model_date:'2020-01-01'}, {patient_id:'p1',date:'2020-02-01',value:40,status:'excluded' as const,reason:'aki',model_date:''}]
  const sheets = mixedModelExportSheets([{entity:'G1',result,identity:{seriesKey:'eGFR|ml/min',groupValue:'G1'},rows,inputFlags}])
  const workbook = XLSX.read(sheetsToXlsxBytes(sheets),{type:'array'})
  const sheet = (name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], {defval:''})

  it('exports the exact model rows with passed and raw factor values', () => {
    expect(sheet('model_rows')).toEqual([
      {entity:'G1',group:'G1',patient_id:'p1',date:'2020-01-01',value:60,time_since_baseline:0,factor_0_:'A',raw_factor_0_:'A',factor_1_:-1.5,raw_factor_1_:2},
      {entity:'G1',group:'G1',patient_id:'p2',date:'2020-03-01',value:58,time_since_baseline:0,factor_0_:'B',raw_factor_0_:'B',factor_1_:1.5,raw_factor_1_:5},
    ])
    expect(sheet('model_input_flags')).toEqual([
      {entity:'G1',group:'G1',patient_id:'p1',date:'2020-01-01',value:60,status:'entered',reason:'',model_date:'2020-01-01'},
      {entity:'G1',group:'G1',patient_id:'p1',date:'2020-02-01',value:40,status:'excluded',reason:'aki',model_date:''},
    ])
  })

  it('exports standard errors and the covariance matrix in term order', () => {
    expect(sheet('coefficients').map(row => [row.term,row.estimate,row.std_error])).toEqual(terms.map((term,index) => [term,index+1,index/10]))
    const vcov = sheet('vcov')
    expect(vcov.map(row => row.term)).toEqual(terms)
    expect(vcov[2]).toMatchObject({entity:'G1',factor_0_B:0.2**2,'(Intercept)':0.001})
  })

  it('generates an R script with the worker data, contrast and model code', () => {
    const script = sheet('r_script').map(row => row.line).join('\n')
    expect(script).toContain('Research use only')
    expect(script).toContain('REML = FALSE')
    expect(script).toContain('lmerTest')
    expect(script).toContain(`mm_fit <- ${lme4ModelCall(config)}`)
    expect(lme4ModelCall(config)).toContain(`(${mixedModelFormula(config)}, data = mm_data, REML = TRUE`)
    for (const line of mixedModelDataRCode(config).split('\n').filter(line => line.trim())) expect(script).toContain(line.replace(/^ {4}/, ''))
    expect(script).toContain('mm_levels <- c("A", sort(setdiff(unique(mm_factor_0_), "A")))')
    expect(script).toContain('contrasts(mm_data$factor_0_) <- contr.treatment(mm_levels, base = 1)')
    expect(script).toContain('mm_factor_0_ <- as.character(mm_unit[["factor_0_"]])')
    expect(script).toContain('mm_unit <- mm_rows[mm_rows$entity == "G1", , drop = FALSE]')
    expect(script).toContain('R 4.5.1 (webR); lme4 1.1-37; Matrix 1.7-3; jsonlite 2.0.0')
    expect(mixedModelRScript([{entity:'G2',result:{...result,metadata:{...result.metadata,runtimeVersion:null,packageVersions:{}}}}]).join('\n')).toContain('R version unknown (webR); package versions unknown')
  })
})
