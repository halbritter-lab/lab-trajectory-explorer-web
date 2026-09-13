import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import type { MixedModelSuccess } from '../../../src/core/mixedModel/types'
export function fitted(): MixedModelSuccess {
  return {status:'success',converged:true,warnings:['singular'],nPatients:2,nMeasurements:4,
    metadata:{engine:'webr-lme4',formula:'eGFR ~ time_since_baseline',runtimeVersion:null,packageVersions:{},browserUserAgent:'test',wasmAssetSource:'cdn',optimizer:null,reml:true,tolerance:null,datasetId:'test',datasetHash:'data',randomSeed:null,fitConfigHash:'fit',modelConfig:{...DEFAULT_MIXED_MODEL_CONFIG,factors:[{key:'genotype',kind:'categorical',effect:'level_slope',reference:'A'},{key:'dose',kind:'numeric',effect:'level_slope'}]},preparation:{nPatientsBefore:2,nMeasurementsBefore:4,excludedPatients:[],centers:{factor_1_:10}}},
    fixedEffects:{intercept:60,timeSinceBaseline:-3},fixedEffectTerms:[{term:'factor_0_B:factor_10_',estimate:5,confidenceInterval:null},{term:'time_since_baseline:factor_0_B:factor_10_',estimate:-1,confidenceInterval:null},{term:'factor_1_',estimate:2,confidenceInterval:null},{term:'factor_1_:time_since_baseline',estimate:0.5,confidenceInterval:null}],fixedEffectConfidenceIntervals:{timeSinceBaseline:null},randomEffects:{interceptSd:null,slopeSd:null,interceptSlopeCorrelation:null},residualSd:null}
}
