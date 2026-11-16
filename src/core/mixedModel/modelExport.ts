import { EXPORT_DISCLAIMER_ROWS } from '../cohort/screening'
import { mixedModelFactorColumn, mixedModelFactors, mixedModelFormulaForOutcome, mixedModelOutcomeLabel, type MixedModelConfig } from './config'
import type { MixedModelResultIdentity } from './resultIdentity'
import { mixedModelIdentityEquals } from './resultIdentity'
import type { ProjectionSnapshot, ProjectionResponse } from '../projection/projectionSnapshot'
import type { MixedModelInputFlag, MixedModelResult, MixedModelSpikeRow, MixedModelSuccess } from './types'
import { mixedModelRScript, mixedModelUnitKey } from './rCode'

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

export function mixedModelCoefficientTerms(result: MixedModelSuccess): NonNullable<MixedModelSuccess['fixedEffectTerms']> {
  return result.fixedEffectTerms ?? [
    {term: '(Intercept)', estimate: result.fixedEffects.intercept, confidenceInterval: null},
    {term: 'time_since_baseline', estimate: result.fixedEffects.timeSinceBaseline, confidenceInterval: result.fixedEffectConfidenceIntervals.timeSinceBaseline},
    ...(result.fixedEffects.baselineAge === undefined ? [] : [{term:'baseline_age_centered',estimate:result.fixedEffects.baselineAge,confidenceInterval:null}]),
  ]
}

/** Receives stored fitted results only, never live/draft model settings. */
export function mixedModelExportSheets(
  models: readonly {
    entity: string; result: MixedModelResult; identity: Pick<MixedModelResultIdentity, 'seriesKey' | 'groupValue'>; sourceResponse?: ProjectionResponse; projection?: ProjectionSnapshot
    /** The rows the worker received for this result, and how the series' measurements reached them. */
    rows?: readonly MixedModelSpikeRow[]; inputFlags?: readonly MixedModelInputFlag[]
  }[],
  /** Name of the downloaded workbook, so the R script reads the file as saved. */
  workbookName?: string,
): { name: string; rows: object[] }[] {
  const settings: object[] = []
  const coefficients: object[] = []
  const covariances: object[] = []
  const factors: object[] = []
  const centers: object[] = []
  const exclusions: object[] = []
  const modelRows: object[] = []
  const inputFlags: object[] = []
  const projections: object[] = []
  for (const { entity, result, identity, sourceResponse, projection, rows, inputFlags: flags } of models) {
    if (projection && (projection.sourceResult !== result || result.status !== 'success' || !result.converged || result.singular || !mixedModelIdentityEquals(projection.sourceIdentity, identity as MixedModelResultIdentity))) {
      throw new Error('Projection snapshot must match the current source result and identity.')
    }
    // `entity` is a display label and can repeat (a group named like the pooled
    // unit); `unit_key` identifies the unit on every sheet. New columns go last
    // so the column positions of earlier releases stay.
    const unitKey = mixedModelUnitKey(identity)
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
      for (const row of projection.rows) projections.push({...common, target:JSON.stringify(row.target), target_id:row.target.id, target_label:row.target.label, threshold:row.target.threshold, direction:row.target.direction, enabled:row.target.enabled, status:row.status, reason:row.reason, model_time_years:row.modelTimeYears, remaining_years:row.remainingYears, unit_key:unitKey})
      if (projection.rows.length === 0) projections.push({...common,status:'no_targets',model_time_years:null,remaining_years:null,unit_key:unitKey})
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
      // The executable formula names the outcome column `value`; the export
      // names the series instead.
      ...(result.metadata.formula === undefined ? {} : { formula: mixedModelFormulaForOutcome(result.metadata.formula, mixedModelOutcomeLabel(outcome, outcomeUnit)) }),
      modelConfig: JSON.stringify(config ?? null),
      preparation: JSON.stringify(preparation ?? null),
      preset_exclusion_policy: preparation?.presetExclusionPolicy ?? 'apply',
      excluded_by_preset: preparation?.excludedByPreset ?? 0,
      packageVersions: JSON.stringify(result.metadata.packageVersions ?? {}),
      warnings: result.warnings.join('; '),
      ...(result.status === 'success'
        ? { patients: result.nPatients, measurements: result.nMeasurements, converged: result.converged, singular: result.singular }
        : { message: result.message }),
      unit_key: unitKey,
    })
    if (config) mixedModelFactors(config).forEach((factor, index) => {
      factors.push({ entity, ...factor, column: mixedModelFactorColumn(factor, index), unit_key: unitKey })
    })
    for (const [column, mean] of Object.entries(preparation?.centers ?? {})) {
      centers.push({ entity, column, patient_weighted_mean: mean, unit_key: unitKey })
    }
    for (const patient of preparation?.excludedPatients ?? []) {
      exclusions.push({ entity, patient_id: patient.patientId, reasons: patient.reasons.join('; '), unit_key: unitKey })
    }
    const group = identity.groupValue ?? ''
    const factorList = config ? mixedModelFactors(config) : []
    for (const row of rows ?? []) {
      modelRows.push({
        entity, unit_key: unitKey, group, patient_id: row.patient_id, date: row.date ?? '', value: row.value, time_since_baseline: row.time_since_baseline,
        ...Object.fromEntries(factorList.flatMap((factor, index) => {
          const column = mixedModelFactorColumn(factor, index)
          // The value bindRows passes to R, then the value before centring.
          const passed = config?.factors === undefined ? row.baseline_age_centered : row.factorValues?.[column]
          const raw = factor.key === 'baseline_age' ? row.baseline_age : row.factorRawValues?.[column]
          return [[column, passed ?? null], [factor.key === 'baseline_age' ? 'baseline_age' : `raw_${column}`, raw ?? null]]
        })),
      })
    }
    for (const flag of flags ?? []) inputFlags.push({ entity, unit_key: unitKey, group, ...flag })
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
          std_error: coefficient.standardError ?? null,
          unit_key: unitKey,
        })
      }
      const covariance = result.fixedEffectCovariance
      covariance?.terms.forEach((term, index) => {
        covariances.push({ entity, unit_key: unitKey, term, ...Object.fromEntries(covariance.terms.map((column, columnIndex) => [column, covariance.matrix[index][columnIndex]])) })
      })
    }
  }
  return [
    { name: 'models', rows: newColumnsLast(settings) },
    { name: 'coefficients', rows: newColumnsLast(coefficients) },
    { name: 'factors', rows: newColumnsLast(factors) },
    { name: 'centering', rows: newColumnsLast(centers) },
    { name: 'excluded_patients', rows: newColumnsLast(exclusions) },
    ...(models.some((model) => model.projection) ? [{ name: 'projections', rows: newColumnsLast(projections) }] : []),
    { name: 'about', rows: [
      ...EXPORT_DISCLAIMER_ROWS,
      { note: 'Adjusted intercept and slope refer to the selected reference categories and centered numeric predictors. Time is years since the first retained measurement. Associations are conditional on the selected model and population.' },
      { note: 'model_rows holds the rows each model received in R, with factor values as passed to R and before centring. model_input_flags lists every measurement of the series per unit with whether it entered, was aggregated into a time-balancing median, or why it was excluded. vcov is the fixed-effect variance-covariance matrix; std_error is the square root of its diagonal. r_script refits the models in R from model_rows.' },
      { note: 'readxl guesses column types from the first 1000 rows. In model_rows the group column is blank for the whole-cohort rows, which come first, so a plain read_excel can read group as logical and turn later group values into NA. Set col_types or guess_max (for example guess_max = Inf) when reading model_rows yourself; r_script selects units by unit_key and is not affected.' },
      { note: 'unit_key identifies the fitted unit on every sheet: "cohort" for the pooled model, "group:<value>" for a group. entity is a display label and can repeat. Join sheets on unit_key.' },
    ] },
    // Sheets added after 0.3.7 follow the earlier ones, so sheet positions stay.
    { name: 'vcov', rows: covariances },
    { name: 'model_rows', rows: modelRows },
    { name: 'model_input_flags', rows: inputFlags },
    { name: 'r_script', rows: mixedModelRScript(models, workbookName).map((line) => ({ line })) },
  ]
}

/** Columns added to the 0.3.7 sheets. */
const COLUMNS_SINCE_0_3_7 = ['std_error', 'unit_key']

/** Gives every row of a 0.3.7 sheet the same keys in one order: the 0.3.7
 * columns in the order they first appear across the rows, as the workbook
 * writer ordered them then, followed by the columns added since. Rows of one
 * sheet differ in shape (a failed fit has `message`, a numeric factor no
 * `reference`), and the writer takes columns in order of first appearance, so
 * a new key at the end of an early row would otherwise land before a 0.3.7
 * column that only a later row has. A key a row lacks is `undefined`, which
 * the writer leaves as an empty cell. */
function newColumnsLast(rows: readonly object[]): object[] {
  const records = rows as readonly Record<string, unknown>[]
  const keys = [...new Set(records.flatMap((row) => Object.keys(row)))]
  const header = [...keys.filter((key) => !COLUMNS_SINCE_0_3_7.includes(key)), ...COLUMNS_SINCE_0_3_7.filter((key) => keys.includes(key))]
  return records.map((row) => Object.fromEntries(header.map((key) => [key, row[key]])))
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
