import { EXPORT_DISCLAIMER_ROWS } from '../cohort/screening'
import { mixedModelFactorColumn, mixedModelFactors, type MixedModelConfig } from './config'
import type { MixedModelResultIdentity } from './resultIdentity'
import { mixedModelIdentityEquals } from './resultIdentity'
import type { ProjectionSnapshot, ProjectionResponse } from '../projection/projectionSnapshot'
import type { MixedModelResult, MixedModelSuccess } from './types'

export function mixedModelTermLabel(term: string, config?: MixedModelConfig): string {
  const factors = config ? mixedModelFactors(config) : []
  if (term === '(Intercept)') return 'Intercept'
  if (term === 'time_since_baseline') return 'Slope'
  const interaction = term.startsWith('time_since_baseline:')
  const part = interaction ? term.slice('time_since_baseline:'.length) : term
  const columns = factors.map((factor,index) => ({factor,column:mixedModelFactorColumn(factor,index)})).sort((a,b) => b.column.length - a.column.length)
  for (const {factor,column} of columns) {
    if (part === column || (factor.kind === 'categorical' && part.startsWith(column))) {
      const label = factor.key === 'baseline_age' ? 'Baseline age' : factor.key
      const contrast = factor.kind === 'numeric' ? `${label} (centered)` : `${label}: ${part.slice(column.length)} (reference ${factor.reference})`
      return `${interaction ? 'Slope \u00d7 ' : ''}${contrast}`
    }
  }
  return term
}

export function mixedModelCoefficientTerms(result: MixedModelSuccess) {
  return result.fixedEffectTerms ?? [
    {term: '(Intercept)', estimate: result.fixedEffects.intercept, confidenceInterval: null},
    {term: 'time_since_baseline', estimate: result.fixedEffects.timeSinceBaseline, confidenceInterval: result.fixedEffectConfidenceIntervals.timeSinceBaseline},
    ...(result.fixedEffects.baselineAge === undefined ? [] : [{term:'baseline_age_centered',estimate:result.fixedEffects.baselineAge,confidenceInterval:null}]),
  ]
}

/** Receives stored fitted results only, never live/draft model settings. */
export function mixedModelExportSheets(
  models: readonly { entity: string; result: MixedModelResult; identity: Pick<MixedModelResultIdentity, 'seriesKey'>; sourceResponse?: ProjectionResponse; projection?: ProjectionSnapshot }[],
): { name: string; rows: object[] }[] {
  const settings: object[] = []
  const coefficients: object[] = []
  const factors: object[] = []
  const centers: object[] = []
  const exclusions: object[] = []
  const projections: object[] = []
  for (const { entity, result, identity, sourceResponse, projection } of models) {
    if (projection && (projection.sourceResult !== result || result.status !== 'success' || !result.converged || !mixedModelIdentityEquals(projection.sourceIdentity, identity as MixedModelResultIdentity))) {
      throw new Error('Projection snapshot must match the current source result and identity.')
    }
    const separator = identity.seriesKey.lastIndexOf('|')
    const response = projection?.sourceResponse ?? sourceResponse
    const outcome = response?.outcome ?? (separator >= 0 ? identity.seriesKey.slice(0, separator) : identity.seriesKey)
    const outcomeUnit = response?.unit ?? (separator >= 0 ? identity.seriesKey.slice(separator + 1) : '')
    if (projection) {
      const common = {
        entity, outcome, outcome_unit: outcomeUnit, source_identity: JSON.stringify(projection.sourceIdentity),
        profile: JSON.stringify(projection.settings.profile), settings: JSON.stringify(projection.settings),
        intercept: projection.line.status === 'ready' ? projection.line.intercept : null,
        slope_per_year: projection.line.status === 'ready' ? projection.line.slopePerYear : null,
        reference_time_years: projection.settings.referenceTimeYears, horizon_years: projection.settings.horizonYears,
        anchor: "Fitted model curve; years since each patient's first retained measurement",
        time_uncertainty: 'not estimated', warnings: result.warnings.join('; '),
      }
      for (const row of projection.rows) projections.push({...common, target:JSON.stringify(row.target), target_id:row.target.id, target_label:row.target.label, threshold:row.target.threshold, direction:row.target.direction, enabled:row.target.enabled, status:row.status, reason:row.reason, model_time_years:row.modelTimeYears, remaining_years:row.remainingYears})
      if (projection.rows.length === 0) projections.push({...common,status:'no_targets',model_time_years:null,remaining_years:null})
    }
    const config = result.metadata.modelConfig
    const preparation = result.metadata.preparation
    settings.push({
      entity,
      series_key: identity.seriesKey,
      outcome,
      outcome_unit: outcomeUnit || 'unspecified outcome unit',
      status: result.status,
      ...result.metadata,
      modelConfig: JSON.stringify(config ?? null),
      preparation: JSON.stringify(preparation ?? null),
      packageVersions: JSON.stringify(result.metadata.packageVersions ?? {}),
      warnings: result.warnings.join('; '),
      ...(result.status === 'success'
        ? { patients: result.nPatients, measurements: result.nMeasurements, converged: result.converged }
        : { message: result.message }),
    })
    if (config) mixedModelFactors(config).forEach((factor, index) => {
      factors.push({ entity, ...factor, column: mixedModelFactorColumn(factor, index) })
    })
    for (const [column, mean] of Object.entries(preparation?.centers ?? {})) {
      centers.push({ entity, column, patient_weighted_mean: mean })
    }
    for (const patient of preparation?.excludedPatients ?? []) {
      exclusions.push({ entity, patient_id: patient.patientId, reasons: patient.reasons.join('; ') })
    }
    if (result.status === 'success') {
      for (const coefficient of mixedModelCoefficientTerms(result)) {
        coefficients.push({
          entity,
          outcome,
          unit: coefficientUnit(coefficient.term, outcomeUnit, config),
          term: coefficient.term,
          label: mixedModelTermLabel(coefficient.term, config),
          estimate: coefficient.estimate,
          ci_lower: coefficient.confidenceInterval?.[0] ?? null,
          ci_upper: coefficient.confidenceInterval?.[1] ?? null,
        })
      }
    }
  }
  return [
    { name: 'models', rows: settings },
    { name: 'coefficients', rows: coefficients },
    { name: 'factors', rows: factors },
    { name: 'centering', rows: centers },
    { name: 'excluded_patients', rows: exclusions },
    ...(models.some((model) => model.projection) ? [{ name: 'projections', rows: projections }] : []),
    { name: 'about', rows: [
      ...EXPORT_DISCLAIMER_ROWS,
      { note: 'Adjusted intercept and slope refer to the selected reference categories and centered numeric predictors. Time is years since the first retained measurement. Associations are conditional on the selected model and population.' },
    ] },
  ]
}

function coefficientUnit(term: string, outcomeUnit: string, config?: MixedModelConfig): string {
  const interaction = term.startsWith('time_since_baseline:')
  const part = interaction ? term.slice('time_since_baseline:'.length) : term
  const base = `${outcomeUnit || 'unspecified outcome unit'}${interaction || term === 'time_since_baseline' ? ' per year' : ''}`
  const factors = config ? mixedModelFactors(config) : []
  const numericFactor = factors.find((factor, index) => factor.kind === 'numeric' && mixedModelFactorColumn(factor, index) === part)
  if (numericFactor?.key === 'baseline_age') return `${base} per year of baseline age`
  if (numericFactor) return `${base} per unit of ${numericFactor.key}`
  return base
}
