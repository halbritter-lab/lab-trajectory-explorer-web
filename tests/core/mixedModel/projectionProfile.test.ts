import { expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import { fitted } from './projectionProfile.fixture'
import { defaultProjectionProfile, resolveProjectionProfile, type ProjectionProfile } from '../../../src/core/mixedModel/projectionProfile'


it('sums every main and interaction effect with literal category names and raw numeric values', () => {
  expect(resolveProjectionProfile(fitted(),{genotype:'B:factor_10_',dose:14})).toEqual({status:'ready',intercept:73,slopePerYear:-2})
  expect(defaultProjectionProfile(fitted())).toEqual({genotype:'A',dose:10})
  expect(resolveProjectionProfile(fitted(),{genotype:'A',dose:10})).toEqual({status:'ready',intercept:60,slopePerYear:-3})
})
it('rejects missing inputs, unknown levels, missing coefficients and centers', () => {
  for (const profile of [{genotype:'unknown',dose:10},{genotype:'A',dose:NaN},{genotype:'A'}] as ProjectionProfile[]) expect(resolveProjectionProfile(fitted(),profile).status).toBe('unavailable')
  const result = fitted()
  result.metadata.preparation!.centers = {}
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10}).status).toBe('unavailable')
  result.metadata.preparation!.centers.factor_1_ = 10
  result.fixedEffectTerms = []
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10}).status).toBe('unavailable')
})
it('retains legacy baseline age centering and coefficient contract', () => {
  const result = fitted()
  result.metadata.modelConfig = {...DEFAULT_MIXED_MODEL_CONFIG,covariates:['baseline_age']}
  result.metadata.preparation!.centers = {baseline_age_centered:50}
  result.fixedEffects.baselineAge = 2
  result.fixedEffectTerms = undefined
  expect(resolveProjectionProfile(result,{baseline_age:55})).toEqual({status:'ready',intercept:70,slopePerYear:-3})
})
it('rejects nonconvergence, nonfinite coefficients and derived overflow', () => {
  const result = fitted()
  result.converged = false
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10}).status).toBe('unavailable')
  result.converged = true
  result.fixedEffects.intercept = Infinity
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10}).status).toBe('unavailable')
  result.fixedEffects.intercept = 60
  expect(resolveProjectionProfile(result,{genotype:'A',dose:Number.MAX_VALUE}).status).toBe('unavailable')
})

it('applies level-only factors without taking their slope terms', () => {
  const result = fitted()
  result.metadata.modelConfig!.factors!.forEach(factor => {factor.effect = 'level'})
  expect(resolveProjectionProfile(result,{genotype:'B:factor_10_',dose:14})).toEqual({status:'ready',intercept:73,slopePerYear:-3})
})

it('requires configured slope coefficients even at the numeric center', () => {
  const result = fitted()
  result.fixedEffectTerms = result.fixedEffectTerms!.filter(term => term.term !== 'factor_1_:time_since_baseline')
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10})).toMatchObject({status:'unavailable',reason:expect.stringContaining('slope term')})
  result.fixedEffectTerms!.find(term => term.term === 'factor_1_')!.estimate = Infinity
  expect(resolveProjectionProfile(result,{genotype:'A',dose:10})).toMatchObject({status:'unavailable',reason:expect.stringContaining('invalid fitted term')})
})
