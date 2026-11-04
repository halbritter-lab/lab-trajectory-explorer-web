/**
 * The cohort pipeline as the web app runs it, assembled from the kidney
 * package only (see src/workspace/workspace-data.ts and workspace-export.ts in
 * the app). No analysis logic lives here: the aggregates below count and
 * summarise the cells and export records the package returns.
 */
import {
  buildCohortRows,
  clinicalEventsByPatient,
  cohortExportRecords,
  cohortSeriesSpec,
  computeAnalysisResult,
  computedEgfrName,
  creatinineSourceOptions,
  defaultAnalysisSettings,
  defaultColumnModuleSettings,
  defaultCreatinineSource,
  EXPORT_DISCLAIMER_ROWS,
  fitPresetById,
  fitPresetCatalog,
  parseAttributeDate,
  patientIdKey,
  resolveBirthAnchor,
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

export const EGFR_FORMULAS = ['ckd-epi-2021', 'mdrd-4', 'ekfc-2021'] as const

export interface CohortOptions {
  /** Series name (Bezeichnung). Defaults to the computed eGFR when a formula is set. */
  series?: string
  unit?: string
  preset: string
  egfrFormula?: FormulaName
  /** [name, unit] of the serum creatinine series; the app's default when omitted. */
  creatinineSource?: [string, string]
}

const validDate = (date: Date | null | undefined): date is Date => date != null && Number.isFinite(date.getTime())

/** Exact birth dates by patientIdKey, as workspace-data.ts derives them with
 * no manual demographics: a birth date read from the attributes table or the
 * lab rows. Without one the endpoint projection uses ages in completed years. */
function exactBirthDates(dataset: LoadedDataset): Record<string, Date> {
  const byPatient = new Map<PatientId, LabRow[]>()
  for (const row of dataset.rows) {
    const bucket = byPatient.get(row.patientId)
    if (bucket) bucket.push(row)
    else byPatient.set(row.patientId, [row])
  }
  const out: Record<string, Date> = Object.create(null)
  for (const [patientId, rows] of byPatient) {
    const attributeBirthDate = parseAttributeDate(dataset.patientAttributes[patientIdKey(patientId)]?.birthDate)
    const explicit = validDate(attributeBirthDate) || rows.some((r) => validDate(r.labDatum) && validDate(r.patientBirthDate))
    if (!explicit) continue
    const { birthAnchor } = resolveBirthAnchor({ patientId, attributeBirthDate, manualAge: undefined,
      rows: rows.map((r) => ({ labDatum: r.labDatum, ageAtLab: r.patientAgeAtLab, birthDate: r.patientBirthDate })) })
    if (birthAnchor) out[patientIdKey(patientId)] = birthAnchor
  }
  return out
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
  const patientIds = [...new Set(analysis.rows.map((r) => r.patientId))]
  const cohort = buildCohortRows(analysis.rows, patientIds, [spec])
  const columnSettings = defaultColumnModuleSettings()
  // Same rule as workspace-export.ts: demographics messages carry the patient key from segment three.
  const conflictKeys = new Set(analysis.messages.filter((m) => m.id.startsWith('demographics:')).map((m) => m.id.split(':').slice(2).join(':')))
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
const yes = (records: readonly CohortExportRecord[], key: string) => records.filter((r) => r[key] === 'yes').length

/** Cohort-level counts and the slope distribution; no patient identifiers. */
export function aggregate(cohort: readonly CohortRow[], records: readonly CohortExportRecord[]) {
  const cells = cohort.map((row) => row.cells[0])
  const withData = cells.filter((c) => c.nNumeric > 0)
  const fitted = records.filter((r) => typeof r.slope === 'number')
  const slopes = fitted.map((r) => r.slope as number).sort((a, b) => a - b)
  const evaluated = withData[0]?.endpoints.evaluated
  const reasons = withData.flatMap((c) => c.pointExclusionReasons.flat())
  return {
    patients_in_dataset: cohort.length,
    patients_with_series: withData.length,
    patients_with_slope: fitted.length,
    measurements_raw: withData.reduce((sum, c) => sum + c.nNumeric, 0),
    points_fitted: withData.reduce((sum, c) => sum + c.nFitted, 0),
    slope_per_year: {
      n: slopes.length,
      median: quantile(slopes, 0.5),
      q1: quantile(slopes, 0.25),
      q3: quantile(slopes, 0.75),
      min: slopes[0] ?? null,
      max: slopes.at(-1) ?? null,
      quantile_method: 'linear interpolation (type 7)',
    },
    unstable_slope: { count: yes(fitted, 'unstable_slope'), share_of_slopes: slopes.length ? yes(fitted, 'unstable_slope') / slopes.length : null,
      rule: 'fewer than three fitted points or a fitted span under one year (isUnstableSlope)' },
    // With fit model 'none' (acute review) the core reports 'n_below_threshold' whatever the point count.
    no_slope_reasons: countBy(records.flatMap((r, i) => cells[i].nNumeric > 0 && typeof r.slope !== 'number'
      ? [cells[i].fitModel === 'none' ? 'no_fit_requested' : r.reason || 'none'] : [])),
    rapid_decline_count: yes(records, 'rapid_progression'),
    aki: { patients_with_episodes: records.filter((r) => r.aki).length, by_label: countBy(records.flatMap((r) => (r.aki ? [String(r.aki)] : []))) },
    exclusions: {
      points_by_reason: countBy(reasons),
      patients_by_reason: countBy(withData.flatMap((c) => [...new Set(c.pointExclusionReasons.flat())])),
    },
    endpoints: {
      evaluated: evaluated ?? null,
      observed_ckd_g4: yes(records, 'endpoint_observed_ckd_g4'),
      observed_ckd_g5: yes(records, 'endpoint_observed_ckd_g5'),
      observed_decline_40: yes(records, 'endpoint_observed_decline_40'),
      observed_decline_57: yes(records, 'endpoint_observed_decline_57'),
      kidney_failure_reached: yes(records, 'endpoint_kidney_failure_reached'),
    },
    projection_to_ckd_g5: {
      projected: records.filter((r) => typeof r.endpoint_projected_age_to_ckd_g5 === 'number').length,
      by_reason: countBy(records.flatMap((r) => (r.endpoint_prediction_reason ? [String(r.endpoint_prediction_reason)] : []))),
    },
  }
}

/** Distinct UTC measurement dates of one cell. */
export const distinctDates = (cell: CohortRow['cells'][number]) => new Set(cell.points.map((p) => p.date.toISOString().slice(0, 10))).size
