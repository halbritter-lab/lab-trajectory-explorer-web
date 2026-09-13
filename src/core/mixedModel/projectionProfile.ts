import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFactorColumn, mixedModelFactors, validateMixedModelConfig } from './config'
import type { MixedModelSuccess } from './types'

/** Keys are configured factor keys; numbers are raw, before fitted centering. */
export type ProjectionProfile = Record<string, string | number>
export type ProfileLine = {status:'ready'; intercept:number; slopePerYear:number} | {status:'unavailable'; reason:string}

export function defaultProjectionProfile(result: MixedModelSuccess): ProjectionProfile {
  return Object.fromEntries(mixedModelFactors(result.metadata.modelConfig ?? DEFAULT_MIXED_MODEL_CONFIG).flatMap((factor,index) => {
    const value = factor.kind === 'categorical' ? factor.reference : result.metadata.preparation?.centers[mixedModelFactorColumn(factor,index)]
    return value !== undefined ? [[factor.key,value]] : []
  }))
}

export function resolveProjectionProfile(result: MixedModelSuccess, profile: ProjectionProfile): ProfileLine {
  const unavailable = (reason: string): ProfileLine => ({status:'unavailable',reason})
  if (result.status !== 'success' || !result.converged) return unavailable('A converged fit is required.')
  const config = result.metadata.modelConfig ?? DEFAULT_MIXED_MODEL_CONFIG
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return unavailable(validation.message)
  let intercept = result.fixedEffects.intercept
  let slopePerYear = result.fixedEffects.timeSinceBaseline
  if (![intercept,slopePerYear].every(Number.isFinite)) return unavailable('Nonfinite fitted coefficient.')
  const terms = new Map(result.fixedEffectTerms?.map(term => [term.term,term.estimate]))
  for (const [index,factor] of mixedModelFactors(config).entries()) {
    const column = mixedModelFactorColumn(factor,index)
    const value = Object.prototype.hasOwnProperty.call(profile,factor.key) ? profile[factor.key] : undefined
    let multiplier: number
    let term = column
    if (factor.kind === 'numeric') {
      const center = result.metadata.preparation?.centers[column]
      if (typeof value !== 'number' || !Number.isFinite(value)) return unavailable(`Missing or invalid numeric profile: ${factor.key}.`)
      if (center === undefined || !Number.isFinite(center)) return unavailable(`Missing fitted center: ${factor.key}.`)
      multiplier = value-center
    } else {
      if (typeof value !== 'string' || !value.trim()) return unavailable(`Missing categorical profile: ${factor.key}.`)
      if (value === factor.reference) continue
      term = `${column}${value}`
      multiplier = 1
    }
    const level = terms.get(term) ?? (config.factors === undefined && factor.key === 'baseline_age' ? result.fixedEffects.baselineAge : undefined)
    if (level === undefined || !Number.isFinite(level)) return unavailable(`Missing or invalid fitted term: ${term}.`)
    intercept += level*multiplier
    if (factor.effect === 'level_slope') {
      // Construct exact names: category labels themselves can contain colons.
      const slope = terms.get(`time_since_baseline:${term}`) ?? terms.get(`${term}:time_since_baseline`)
      if (slope === undefined || !Number.isFinite(slope)) return unavailable(`Missing or invalid fitted slope term: ${term}.`)
      slopePerYear += slope*multiplier
    }
  }
  return [intercept,slopePerYear].every(Number.isFinite) ? {status:'ready',intercept,slopePerYear} : unavailable('Profile calculation overflow.')
}
