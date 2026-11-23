import { EXPORT_DISCLAIMER_ROWS } from '../cohort/screening'
import { LOG_BASELINE_UACR_KEY, mixedModelFactorColumn, mixedModelFactors, mixedModelFormulaForOutcome, mixedModelOutcomeLabel, type MixedModelConfig } from './config'
import type { MixedModelResultIdentity } from './resultIdentity'
import { mixedModelIdentityEquals } from './resultIdentity'
import type { ProjectionSnapshot, ProjectionResponse } from '../projection/projectionSnapshot'
import type { MixedModelInputFlag, MixedModelResult, MixedModelSpikeRow, MixedModelSuccess } from './types'
import { mixedModelRScript, mixedModelUnitKey } from './rCode'
import { INFORMATIVE_DROPOUT_SHARE, LOSS_TO_FOLLOW_UP_DAYS, type MixedModelDropout } from './dropout'

export function mixedModelTermLabel(term: string, config?: MixedModelConfig): string {
  const factors = config ? mixedModelFactors(config) : []
  if (term === '(Intercept)') return 'Intercept'
  if (term === 'time_since_baseline') return 'Slope'
  const interaction = term.startsWith('time_since_baseline:')
  const part = interaction ? term.slice('time_since_baseline:'.length) : term
  const columns = factors.map((factor,index) => ({factor,column:mixedModelFactorColumn(factor,index)})).sort((a,b) => b.column.length - a.column.length)
  for (const {factor,column} of columns) {
    if (part === column || (factor.kind === 'categorical' && part.startsWith(column))) {
      const label = factor.key === 'baseline_age' ? 'Baseline age' : factor.key === LOG_BASELINE_UACR_KEY ? 'Log baseline UACR' : factor.key
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
    /** Dropout of the unit's patients by reason (decision `dropout`, 2026-11-22). */
    dropout?: MixedModelDropout
  }[],
  /** Name of the downloaded workbook, so the R script reads the file as saved. */
  workbookName?: string,
  /** Written to `about` and checked by the R script, so the script cannot refit another export unnoticed. */
  exportId: string = crypto.randomUUID(),
  /** Written to `about`: the app version that wrote the file (omitted when not given) and the export time. */
  provenance: { appVersion?: string; exportedAt?: Date; egfrFormula?: string } = {},
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
  const levelRows: object[] = []
  const dropoutRows: object[] = []
  const dropoutPatientRows: object[] = []
  for (const { entity, result, identity, sourceResponse, projection, rows, inputFlags: flags, dropout } of models) {
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
      ...withEmptyToleranceColumn(result.metadata),
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
      // Variance components, unrounded (`VarCorr`, `sigma`); empty for a failed
      // fit and where R reports none (no slope SD or correlation with a
      // random intercept alone).
      intercept_sd: result.status === 'success' ? result.randomEffects?.interceptSd ?? null : null,
      slope_sd: result.status === 'success' ? result.randomEffects?.slopeSd ?? null : null,
      intercept_slope_correlation: result.status === 'success' ? result.randomEffects?.interceptSlopeCorrelation ?? null : null,
      residual_sd: result.status === 'success' ? result.residualSd ?? null : null,
      // Issue #83 (2026-11-22): the app version and the dataset's eGFR formula. The R and
      // package versions of the fit are runtimeVersion and packageVersions above.
      app_version: provenance.appVersion ?? null,
      egfr_formula: provenance.egfrFormula ?? null,
    })
    if (config) mixedModelFactors(config).forEach((factor, index) => {
      const { kindSource, referenceSource, series, ...rest } = factor
      factors.push({ entity, ...rest, column: mixedModelFactorColumn(factor, index), unit_key: unitKey,
        // Whether the type was the automatic one (OD-22) and the reference the
        // default, the first level among this unit's model rows (OD-29).
        kind_source: kindSource ?? 'automatic',
        reference_source: factor.kind !== 'categorical' ? undefined : referenceSource === 'default' ? 'default_first_level_in_model' : 'user',
        // The UACR series of the covariate log_baseline_uacr (decision `uacr`, 2026-11-22).
        ...(series ? { source_series: `${series.name}|${series.unit ?? ''}` } : {}) })
    })
    for (const level of preparation?.levelPooling ?? []) {
      levelRows.push({ entity, unit_key: unitKey, factor: level.factor, column: level.column, level: level.level, model_level: level.modelLevel,
        patients: level.patients, patients_with_2_or_more_measurements: level.patientsWithRepeated, action: level.action })
    }
    for (const count of dropout?.counts ?? []) {
      dropoutRows.push({ entity, unit_key: unitKey, factor: count.factor, level: count.level, patients: count.patients, krt: count.krt, death: count.death,
        loss: count.loss, in_follow_up: count.inFollowUp, krt_or_death_share: count.krtOrDeathShare, data_end: dropout!.dataEnd })
    }
    for (const patient of dropout?.patients ?? []) {
      dropoutPatientRows.push({ entity, unit_key: unitKey, patient_id: patient.patientId, baseline_date: patient.baselineDate, last_model_date: patient.lastModelDate,
        reason: patient.reason, event_date: patient.eventDate, years_to_end: patient.yearsToEnd, ...Object.fromEntries(Object.entries(patient.levels).map(([key, level]) => [`level_${key}`, level])) })
    }
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
      { note: 'model_rows holds the rows each model received in R, with factor values as passed to R and before centring. model_input_flags lists every measurement of the series per unit with whether it entered, was aggregated into a time-balancing median, or why it was excluded; its last column, operator, is =, < or >. Bounds (reason bound_value) never enter a cohort model, whatever the bounded-value setting of the column; r_script ends with a commented censored-model sketch that uses them. vcov is the fixed-effect variance-covariance matrix; std_error is the square root of its diagonal. r_script refits the models in R from model_rows.' },
      { note: 'readxl guesses column types from the first 1000 rows. In model_rows the group column is blank for the whole-cohort rows, which come first, so a plain read_excel can read group as logical and turn later group values into NA. Set col_types or guess_max (for example guess_max = Inf) when reading model_rows yourself; r_script selects units by unit_key and is not affected.' },
      { note: `export_id: ${exportId}` },
      { note: 'unit_key identifies the fitted unit on every sheet: "cohort" for the pooled model, "group:<value>" for a group. entity is a display label and can repeat. Join sheets on unit_key.' },
      { note: 'models ends with the variance components of each fit, unrounded: intercept_sd and slope_sd are the standard deviations of the patient random intercept and random slope (slope per year), intercept_slope_correlation their correlation, residual_sd the residual standard deviation. They are empty for a failed fit; slope_sd and the correlation are empty for a model with a random intercept only. warnings holds the notes of the input check (patients with one measurement or too few distinct times, duplicate patient/time rows; these rows stay in the fit) followed by the warnings of R.' },
      { note: 'This file contains personal data and details of the device it was made on. The patient IDs are written as imported, not pseudonymised (patient_id in model_rows, model_input_flags and excluded_patients). model_rows and model_input_flags hold dated measurement values and the factor values of each patient, such as sex, baseline age and attributes. models holds browserUserAgent, the browser and operating system that fitted the model, and r_script names this workbook file. Check these fields before passing the file on.' },
      ...(provenance.appVersion === undefined ? [] : [{ note: `app_version: ${provenance.appVersion}` }]),
      { note: `exported_at: ${(provenance.exportedAt ?? new Date()).toISOString()}` },
      { note: 'app_version is the version of Lab Trajectory Explorer that wrote this file; exported_at is the time of the export in UTC. The models were fitted with the R and package versions in models (runtimeVersion, packageVersions).' },
      // Appended 2026-11-22 (issue #4 and #83), after the rows above.
      { note: 'models ends with app_version, the version of the app that wrote the file, and egfr_formula, the eGFR formula of the dataset settings at the export (off when no eGFR is computed); it applies to the model only when the outcome is the computed eGFR. The R and package versions of each fit are runtimeVersion and packageVersions.' },
      { note: `factor_levels lists, per unit, every level of each categorical factor with its patients and the patients with 2 or more model rows. A level needs 5 such patients (a rule of this tool). Below that, a level is pooled into "other (pooled)" (action pooled; model_level is the level it entered the model with), a "not tested" level is removed with its patients (excluded_not_tested), or, with small levels kept, it enters as it is (kept_below_minimum). Attribute values "not tested", "nicht getestet", "n.t." and "NT" (any case) enter as the level "not tested", never merged with another level; a blank cell is missing.` },
      { note: `dropout counts, per unit and per level of each categorical factor, how follow-up ended: krt (kidney transplant or chronic dialysis start on or after the first model row), death (an event of type death on or after the first model row; krt when both fall on one day or krt is earlier), loss (neither, and the last model row more than ${LOSS_TO_FOLLOW_UP_DAYS} days before data_end, the latest lab date of the dataset) and in_follow_up. krt_or_death_share is (krt + death) / patients; above ${Math.round(INFORMATIVE_DROPOUT_SHARE * 100)} % for a unit, r_script suggests a joint-model sensitivity analysis. dropout_patients has one row per patient: years_to_end runs from the first model row to the event, or to the last model row without one. Rules of this tool.` },
      { note: 'Intervals in coefficients are Wald intervals (estimate ± 1.96 standard errors). r_script adds lmerTest with Satterthwaite degrees of freedom where it is installed: an omnibus F test per factor and t tests of the contrasts, which are exploratory and unadjusted.' },
    ] },
    // Sheets added after 0.3.7 follow the earlier ones, so sheet positions stay.
    { name: 'vcov', rows: covariances },
    { name: 'model_rows', rows: modelRows },
    { name: 'model_input_flags', rows: inputFlags },
    { name: 'r_script', rows: mixedModelRScript(models, workbookName, exportId).map((line) => ({ line })) },
    // Added 2026-11-22 (decisions `genomin` and `dropout`), after every earlier sheet.
    { name: 'factor_levels', rows: levelRows },
    { name: 'dropout', rows: dropoutRows },
    { name: 'dropout_patients', rows: uniformColumns(dropoutPatientRows) },
  ]
}

/** Columns added to the 0.3.7 sheets, in the order they were added. */
const COLUMNS_SINCE_0_3_7 = ['std_error', 'unit_key', 'intercept_sd', 'slope_sd', 'intercept_slope_correlation', 'residual_sd', 'kind_source', 'reference_source', 'app_version', 'egfr_formula', 'source_series']

/** Every row with the keys of all rows, in order of first appearance. */
function uniformColumns(rows: readonly object[]): object[] {
  const records = rows as readonly Record<string, unknown>[]
  const keys = [...new Set(records.flatMap((row) => Object.keys(row)))]
  return records.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
}

/** Gives every row of a 0.3.7 sheet the same keys in one order: the 0.3.7
 * columns in the order they first appear across the rows, as the workbook
 * writer ordered them then, followed by the columns added since. Rows of one
 * sheet differ in shape (a failed fit has `message`, a numeric factor no
 * `reference`), and the writer takes columns in order of first appearance, so
 * a new key at the end of an early row would otherwise land before a 0.3.7
 * column that only a later row has. A key a row lacks is `undefined`, which
 * the writer leaves as an empty cell. */
/** OD-21 (2026-11-22): no fit uses a tolerance, so the metadata carries none.
 * The 0.3.7 column `tolerance` is kept empty, right after `reml`, for
 * column-position compatibility. */
function withEmptyToleranceColumn(metadata: object): Record<string, unknown> {
  const entries = Object.entries(metadata)
  const at = entries.findIndex(([key]) => key === 'reml')
  if (at < 0) return { ...metadata, tolerance: null }
  return Object.fromEntries([...entries.slice(0, at + 1), ['tolerance', null], ...entries.slice(at + 1)])
}

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
  if (numericFactor?.key === LOG_BASELINE_UACR_KEY) return `${base} per unit of ln(baseline UACR)`
  if (numericFactor) return `${base} per unit of ${numericFactor.key}`
  return base
}
