/**
 * The cohort pipeline as the web app runs it, assembled from the kidney
 * package only (see src/workspace/workspace-data.ts and workspace-export.ts in
 * the app). No analysis logic lives here: the aggregates below count and
 * summarise the cells and export records the package returns.
 */
import {
  buildCohortRows,
  clinicalEventsByPatient,
  comparePatientIds,
  cohortExportRecords,
  cohortSeriesSpec,
  computeAnalysisResult,
  computedEgfrName,
  creatinineSourceOptions,
  defaultAnalysisSettings,
  defaultColumnModuleSettings,
  defaultCreatinineSource,
  demographicWarningsByPatient,
  EGFR_FORMULA_LABELS,
  exactBirthDateByPatient,
  EXPORT_DISCLAIMER_ROWS,
  fitPresetById,
  fitPresetCatalog,
  patientBirthAnchor,
  patientIdKey,
  type CohortExportRecord,
  type CohortRow,
  type FormulaName,
  type LabRow,
  type LoadedDataset,
  type PatientId,
} from '@halbritter-lab/kidney-trajectories'

export const RESEARCH_USE = String(EXPORT_DISCLAIMER_ROWS.find((row) => String(row.note).startsWith('Research use only'))?.note
  ?? 'Research use only. Not for clinical decision-making.')

export const METHOD_REFERENCE_URL = 'https://github.com/halbritter-lab/lab-trajectory-explorer-web/blob/main/docs/method-algorithms.md'

/** The eGFR equations the package offers, in its label order. */
export const EGFR_FORMULAS = Object.keys(EGFR_FORMULA_LABELS) as [FormulaName, ...FormulaName[]]

/** Smallest cell size reported: patient and point counts from 1 to
 * MIN_CELL − 1 become SUPPRESSED, and slope quartiles need MIN_CELL slopes.
 * Pending owner decision (see docs/method-algorithms.md). */
export const MIN_CELL = 5
export const SUPPRESSED = `<${MIN_CELL}`
export const cell = (n: number): number | string => (n === 0 || n >= MIN_CELL ? n : SUPPRESSED)

export interface CohortOptions {
  /** Series name (Bezeichnung). Defaults to the computed eGFR when a formula is set. */
  series?: string
  unit?: string
  preset: string
  egfrFormula?: FormulaName
  /** [name, unit] of the serum creatinine series; the app's default when omitted. */
  creatinineSource?: [string, string]
}

/** Exact birth dates by patientIdKey with the app's rule and no manual
 * demographics. Without one the endpoint projection uses completed years. */
function exactBirthDates(dataset: LoadedDataset): Record<string, Date> {
  const byPatient = new Map<PatientId, LabRow[]>()
  for (const row of dataset.rows) {
    const bucket = byPatient.get(row.patientId)
    if (bucket) bucket.push(row)
    else byPatient.set(row.patientId, [row])
  }
  return exactBirthDateByPatient([...byPatient].map(([id, rows]) => ({ id, ...patientBirthAnchor({
    patientId: id, rows, attributeBirthDate: dataset.patientAttributes[patientIdKey(id)]?.birthDate, manualAge: undefined }) })))
}

export function runCohort(dataset: LoadedDataset, options: CohortOptions) {
  const preset = fitPresetById(options.preset)
  if (!preset) throw new Error(`Unknown preset "${options.preset}". Use one of: ${fitPresetCatalog.map((p) => p.id).join(', ')}.`)
  const settings = defaultAnalysisSettings()
  if (options.egfrFormula) {
    const sources = creatinineSourceOptions(dataset.rows)
    const source = options.creatinineSource
      ? sources.find(([name, unit]) => name === options.creatinineSource![0] && unit === options.creatinineSource![1])
      : defaultCreatinineSource(sources)
    if (!source) throw new Error(`No usable serum creatinine series${options.creatinineSource ? ` "${options.creatinineSource.join(' [')}]"` : ''}. Available: ${sources.map(([n, u]) => `${n} [${u}]`).join(', ') || 'none'}.`)
    settings.egfr = { formula: options.egfrFormula, source }
  }
  const analysis = computeAnalysisResult({ rows: dataset.rows, events: dataset.events, patientAttributes: dataset.patientAttributes, manualDemographics: {}, settings })

  const name = options.series ?? (options.egfrFormula ? computedEgfrName(options.egfrFormula) : undefined)
  if (!name) throw new Error('Name a series, or set egfr_formula to analyse the computed eGFR.')
  const units = [...new Set(analysis.rows.filter((r) => r.bezeichnung === name).map((r) => r.einheit))]
  const candidates = options.unit === undefined ? units : units.filter((u) => u === options.unit)
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? `Series "${name}"${options.unit === undefined ? '' : ` [${options.unit}]`} not found. Call list_series for the available names.`
      : `Series "${name}" has several units (${units.join(', ')}); pass unit.`)
  }
  const parameter = { bezeichnung: name, einheit: candidates[0] }
  const fitConfig = preset.buildConfig(parameter)
  const spec = cohortSeriesSpec(parameter, fitConfig, {
    clinicalEventsByPatient: clinicalEventsByPatient(dataset.events),
    exactBirthDateByPatient: exactBirthDates(dataset),
    fitInputs: analysis.fitInputs,
  })
  const patientIds = [...new Set(analysis.rows.map((r) => r.patientId))].sort(comparePatientIds)
  const cohort = buildCohortRows(analysis.rows, patientIds, [spec])
  const columnSettings = defaultColumnModuleSettings()
  const conflictKeys = new Set(demographicWarningsByPatient(analysis.messages).keys())
  const records = cohortExportRecords(cohort, columnSettings, conflictKeys)
  const method = {
    series: name,
    unit: parameter.einheit,
    slope_unit: records[0]?.slope_unit ?? `${parameter.einheit ?? '(no unit)'}/yr`,
    preset: { id: preset.id, name: preset.name, description: preset.description },
    fit_config: fitConfig,
    slope_mode: spec.mode,
    egfr: settings.egfr,
    aki: settings.aki,
    column_settings: columnSettings,
    demographics: 'as imported; no manual overrides',
    method_reference: METHOD_REFERENCE_URL,
  }
  return { cohort, records, method, analysisMessages: analysis.messages.length }
}

/** Linear-interpolation quantile (R type 7, the numpy default) of sorted values. */
export function quantile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo])
}

export const countBy = (values: readonly string[]) => {
  const out: Record<string, number> = {}
  for (const value of values) out[value] = (out[value] ?? 0) + 1
  return out
}
const cellsOf = (counts: Record<string, number>) => Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, cell(n)]))
const yes = (records: readonly CohortExportRecord[], key: string) => cell(records.filter((r) => r[key] === 'yes').length)

/** Cohort-level counts and the slope distribution; no patient identifiers.
 * Small cells are suppressed (MIN_CELL); there is no minimum or maximum, which
 * would always be one patient's value. */
export function aggregate(cohort: readonly CohortRow[], records: readonly CohortExportRecord[]) {
  const cells = cohort.map((row) => row.cells[0])
  const withData = cells.filter((c) => c.nNumeric > 0)
  const fitted = records.filter((r) => typeof r.slope === 'number')
  const slopes = fitted.map((r) => r.slope as number).sort((a, b) => a - b)
  const distribution = slopes.length >= MIN_CELL
  const unstable = fitted.filter((r) => r.unstable_slope === 'yes').length
  const reasons = withData.flatMap((c) => c.pointExclusionReasons.flat())
  // Measurement totals of fewer than MIN_CELL patients describe those patients.
  const total = (n: number) => (withData.length === 0 || withData.length >= MIN_CELL ? n : SUPPRESSED)
  return {
    min_cell: MIN_CELL,
    patients_in_dataset: cell(cohort.length),
    patients_with_series: cell(withData.length),
    patients_with_slope: cell(fitted.length),
    measurements_raw: total(withData.reduce((sum, c) => sum + c.nNumeric, 0)),
    points_fitted: total(withData.reduce((sum, c) => sum + c.nFitted, 0)),
    slope_per_year: {
      n: cell(slopes.length),
      median: distribution ? quantile(slopes, 0.5) : null,
      q1: distribution ? quantile(slopes, 0.25) : null,
      q3: distribution ? quantile(slopes, 0.75) : null,
      suppressed: slopes.length > 0 && !distribution,
      quantile_method: 'linear interpolation (type 7)',
    },
    unstable_slope: { count: cell(unstable), share_of_slopes: distribution && cell(unstable) !== SUPPRESSED ? unstable / slopes.length : null,
      rule: 'fewer than three fitted points or a fitted span under one year (isUnstableSlope)' },
    // With fit model 'none' (acute review) the core reports 'n_below_threshold' whatever the point count.
    no_slope_reasons: cellsOf(countBy(records.flatMap((r, i) => cells[i].nNumeric > 0 && typeof r.slope !== 'number'
      ? [cells[i].fitModel === 'none' ? 'no_fit_requested' : r.reason || 'none'] : []))),
    rapid_decline_count: yes(records, 'rapid_progression'),
    aki: { patients_with_episodes: cell(records.filter((r) => r.aki).length), by_label: cellsOf(countBy(records.flatMap((r) => (r.aki ? [String(r.aki)] : [])))) },
    exclusions: {
      points_by_reason: cellsOf(countBy(reasons)),
      patients_by_reason: cellsOf(countBy(withData.flatMap((c) => [...new Set(c.pointExclusionReasons.flat())]))),
    },
    endpoints: {
      // Patients for whom each endpoint was evaluated (the preset enables it and the series carries it).
      evaluated_patients: cellsOf(countBy(withData.flatMap((c) => Object.entries(c.endpoints.evaluated).flatMap(([key, on]) => (on ? [key] : []))))),
      observed_ckd_g4: yes(records, 'endpoint_observed_ckd_g4'),
      observed_ckd_g5: yes(records, 'endpoint_observed_ckd_g5'),
      observed_decline_40: yes(records, 'endpoint_observed_decline_40'),
      observed_decline_57: yes(records, 'endpoint_observed_decline_57'),
      kidney_failure_reached: yes(records, 'endpoint_kidney_failure_reached'),
    },
    projection_to_ckd_g5: {
      projected: cell(records.filter((r) => typeof r.endpoint_projected_age_to_ckd_g5 === 'number').length),
      by_reason: cellsOf(countBy(records.flatMap((r) => (r.endpoint_prediction_reason ? [String(r.endpoint_prediction_reason)] : [])))),
    },
  }
}

/** Distinct UTC measurement dates of one cell. */
export const distinctDates = (cell: CohortRow['cells'][number]) => new Set(cell.points.map((p) => p.date.toISOString().slice(0, 10))).size
