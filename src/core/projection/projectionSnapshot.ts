import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFactorColumn, mixedModelFactors } from '../mixedModel/config'
import { defaultProjectionProfile, resolveProjectionProfile, type ProfileLine, type ProjectionProfile } from '../mixedModel/projectionProfile'
import type { MixedModelResultIdentity } from '../mixedModel/resultIdentity'
import type { MixedModelSpikeRow, MixedModelSuccess } from '../mixedModel/types'
import { hashMixedModelInput } from '../mixedModel/validation'
import { projectLinearThreshold, type ProjectionStatus, type ProjectionTarget } from './linearProjection'
import { projectionTargetPresets } from './targetPresets'

export interface ProjectionSettings {
  targets: Array<ProjectionTarget & {enabled:boolean}>
  profile: ProjectionProfile
  referenceTimeYears: number
  horizonYears: number
}
export interface AppliedProjectionSettings {
  sourceIdentity: MixedModelResultIdentity
  settings: ProjectionSettings
}
export interface ProjectionResponse {outcome:string; unit:string}
export interface ProjectionSnapshot {
  sourceResponse: ProjectionResponse
  sourceResult: MixedModelSuccess
  sourceIdentity: MixedModelResultIdentity
  settings: ProjectionSettings
  line: ProfileLine
  categoryChoices: Record<string,string[]>
  warnings: string[]
  rows: Array<{
    target: ProjectionTarget & {enabled:boolean}
    status: ProjectionStatus | 'disabled' | 'unavailable_profile'
    reason: string | null
    modelTimeYears: number | null
    remainingYears: number | null
  }>
}

export function createDefaultProjectionSettings(result: MixedModelSuccess, response: ProjectionResponse): ProjectionSettings {
  return {targets:projectionTargetPresets(response).map(target => ({...target,enabled:true})),profile:defaultProjectionProfile(result),referenceTimeYears:0,horizonYears:20}
}

export function validateProjectionSettings(settings: ProjectionSettings, response: ProjectionResponse): string[] {
  const errors: string[] = []
  if (!response || typeof response.outcome !== 'string' || !response.outcome.trim() || typeof response.unit !== 'string') errors.push('A source outcome and unit are required.')
  if (!settings || typeof settings !== 'object') return [...errors,'Projection settings are required.']
  if (!Number.isFinite(settings.referenceTimeYears) || settings.referenceTimeYears < 0) errors.push('Reference time must be finite and nonnegative.')
  if (!Number.isFinite(settings.horizonYears) || settings.horizonYears <= 0) errors.push('Horizon must be finite and positive.')
  if (!settings.profile || typeof settings.profile !== 'object' || Array.isArray(settings.profile) || Object.values(settings.profile).some(value => typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string' || !value.trim())) errors.push('Profile values must be finite numbers or nonempty categories.')
  if (!Array.isArray(settings.targets)) return [...errors,'Targets must be an array.']
  const ids = new Set<string>()
  for (const target of settings.targets) {
    if (!target || typeof target !== 'object') {errors.push('Invalid target.'); continue}
    if (typeof target.id !== 'string' || !target.id.trim() || ids.has(target.id)) errors.push('Target IDs must be nonempty and unique.')
    ids.add(target.id)
    if (typeof target.label !== 'string' || !target.label.trim()) errors.push('Target labels must not be empty.')
    if (!Number.isFinite(target.threshold)) errors.push('Target thresholds must be finite.')
    if (!['below','above'].includes(target.direction)) errors.push('Target direction must be below or above.')
    if (typeof target.enabled !== 'boolean') errors.push('Target enabled state must be boolean.')
    if (target.outcome !== response?.outcome || target.unit !== response?.unit) errors.push('Targets must match the source outcome and unit.')
  }
  return errors
}

/** Prepared rows already reflect all patient-level complete-case exclusions. */
export function projectionCategoryChoices(result: MixedModelSuccess, preparedRows: readonly MixedModelSpikeRow[]): Record<string,string[]> {
  return Object.fromEntries(mixedModelFactors(result.metadata.modelConfig ?? DEFAULT_MIXED_MODEL_CONFIG).flatMap((factor,index) => {
    if (factor.kind !== 'categorical') return []
    const column = mixedModelFactorColumn(factor,index)
    const levels = preparedRows.flatMap(row => typeof row.factorValues?.[column] === 'string' ? [row.factorValues[column] as string] : [])
    return [[factor.key,[...new Set(levels)].sort()]]
  }))
}

export function buildProjectionSnapshot(result: MixedModelSuccess, identity: MixedModelResultIdentity, sourceResponse: ProjectionResponse, preparedRows: readonly MixedModelSpikeRow[], settings: ProjectionSettings): ProjectionSnapshot {
  if (result.status !== 'success' || !result.converged) throw new Error('Projection requires a successful converged source fit.')
  if (result.metadata.datasetHash !== identity.datasetHash || result.metadata.fitConfigHash !== identity.fitConfigHash ||
      result.nPatients !== identity.nPatients || result.nMeasurements !== identity.nMeasurements || hashMixedModelInput(preparedRows) !== identity.datasetHash) throw new Error('Projection source fit or prepared rows are stale.')
  const errors = validateProjectionSettings(settings,sourceResponse)
  if (errors.length) throw new Error(errors.join(' '))
  const applied = {...settings,profile:{...settings.profile},targets:settings.targets.map(target => ({...target}))}
  const categoryChoices = projectionCategoryChoices(result,preparedRows)
  const unknown = Object.entries(categoryChoices).find(([key,choices]) => !choices.includes(String(applied.profile[key])))
  const line: ProfileLine = unknown ? {status:'unavailable',reason:`Profile category is not present in the fitted population: ${unknown[0]}.`} : resolveProjectionProfile(result,applied.profile)
  return {
    sourceResponse:{...sourceResponse},sourceResult:result,sourceIdentity:{...identity},settings:applied,line,categoryChoices,warnings:[...result.warnings],
    rows:applied.targets.map(target => {
      if (!target.enabled) return {target,status:'disabled',reason:null,modelTimeYears:null,remainingYears:null}
      if (line.status === 'unavailable') return {target,status:'unavailable_profile',reason:line.reason,modelTimeYears:null,remainingYears:null}
      return {target,...projectLinearThreshold({...line,...sourceResponse,referenceTimeYears:applied.referenceTimeYears,horizonYears:applied.horizonYears,target}),reason:null}
    }),
  }
}
