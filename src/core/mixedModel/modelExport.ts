import { EXPORT_DISCLAIMER_ROWS } from '../cohort/screening'
import { mixedModelFactorColumn, mixedModelFactors, type MixedModelConfig } from './config'
import type { MixedModelResultIdentity } from './resultIdentity'
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
  models: readonly { entity: string; result: MixedModelResult; identity: Pick<MixedModelResultIdentity, 'seriesKey'> }[],
): { name: string; rows: object[] }[] {
  const settings: object[] = []
  const coefficients: object[] = []
  const factors: object[] = []
  const centers: object[] = []
  const exclusions: object[] = []
  for (const { entity, result, identity } of models) {
    const separator = identity.seriesKey.lastIndexOf('|')
    const outcome = separator >= 0 ? identity.seriesKey.slice(0, separator) : identity.seriesKey
    const outcomeUnit = separator >= 0 ? identity.seriesKey.slice(separator + 1) : '' 
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
