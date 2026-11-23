import { version as APP_VERSION } from '../../package.json'
import { cohortExportRecords, cohortSheetRecord, EXPORT_DISCLAIMER_ROWS, slopeUnit, type CohortRow } from '../core/cohort/screening'
import type { AnchorComparisonSettings, AnchorSide } from '../core/cohort/anchorComparison'
import { hashString } from '../core/mixedModel/validation'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../core/endpoints/thresholdEndpoints'
import { isUnstableSlope, theilSenFewDatesCoverage } from './labels/qualityLabels'
import { patientMeasurementRecords } from '../core/patient/patientExport'
import { patientAttributesExportRows } from '../core/attributes/attributes'
import { patientIdKey, type LabRow, type PatientId } from '../core/types'
import { exportTimeOfDay, utcDateOrBlank } from '../core/format'
import { demographicWarningsByPatient } from '../core/demographics/describe'
import { normaliseSex } from '../core/demographics/sex'
import { fileStamp, sheetsToXlsxBytes, svgElementToString, type WorkbookSheet } from '../io/export'
import { COHORT_SHEET_HEADER, cohortColumnDirectoryRows, cohortSheetRow } from './cohort-sheet-columns'
import { workspaceSpecs, type WorkspaceData, type WorkspaceParameter } from './workspace-data'
import { seriesMerges } from '../core/domains/nephrology/seriesMergeModule'
import { akiRecoveryHours, akiRetrospectiveFall } from '../core/domains/nephrology/aki/akiModule'
import { akiEpisodeExportRows, akiEpisodeRows } from './aki-episodes'
import { PERI_EVENT_SHEET_HEADER, periEventExportRows } from './peri-event'
import { egfrFormulaSwitches, fitCrossesFormulaSwitch } from '../core/domains/nephrology/egfr/series'
import { computedEgfrKey } from './egfr-gaps'
import { formulaSwitchText } from './egfr-switch'
import { periEventCreatinineRows, type PeriEventSettings } from '../core/domains/nephrology/aki/periEvent'
import type { FitConfig } from '../core/analysis/fitConfig'
import { columnSettingModules, defaultColumnModuleSettings, type ColumnModuleSettings } from '../core/analysis/registry'
import { dataChecks, importDiagnosticRecords } from './import-diagnostics'
import type { ColumnSettingsRecord } from './trajectory-ui/analysis'
import { inEnglish } from '../i18n'

export interface WorkspaceExportInput {
  data: WorkspaceData
  parameterKeys: string[]
  patientIds: PatientId[]
  cohortRows: CohortRow[]
  patientId?: PatientId
  fitConfigByParameterKey?: Record<string, FitConfig>
  /** Each column's own module settings (e.g. its rapid-decline threshold);
   * module defaults for columns without an entry. */
  moduleSettingsByParameterKey?: Record<string, ColumnModuleSettings>
  /** The attribute the Trajectories table is grouped by, written to `settings`
   * as `group_by`; empty without grouping. */
  groupBy?: string
  /** Each column's before/after setting (issue #64); none for columns without an entry. */
  anchorComparisonByParameterKey?: Record<string, AnchorComparisonSettings | undefined>
  /** Each column's settings as the app keeps them (issue #83), written to
   * `settings` as `trend`, `settings_source` and `column_settings` so that
   * "Apply settings from an export" can restore them; empty without an entry. */
  columnSettingsByParameterKey?: Record<string, ColumnSettingsRecord>
  /** The peri-event creatinine selection of the Data page (issue #69); the
   * sheet `peri_event_creatinine` is empty without one. */
  periEventSettings?: PeriEventSettings | null
  /** Written to `about` as `exported_at`; the time of the call when omitted. */
  exportedAt?: Date
  /** Written to `about` as `export_id`; a new random UUID when omitted. */
  exportId?: string
}

/** Gap above which Segmented OLS starts a new segment, and the points a
 * segment needs for a fit: the defaults of `summarizeByBezeichnung` and
 * `buildCohortRows`, which no interface control changes. */
const SEGMENT_GAP_DAYS = 180
const SEGMENT_MIN_POINTS = 3

/** Identifier of the imported rows in the export scope: the FNV-1a hash (32
 * bit, eight hex digits) of the rows of `raw_measurements`, each reduced to
 * patient ID (as text), date, parameter, unit, value text, sex, stated age
 * and imported birth date, sorted, as JSON. Events, attributes and manual
 * demographic entries are not part of it. The same rows give the same identifier whatever
 * their order, the fit settings and the app version; it is a checksum for
 * comparing runs, not a cryptographic hash. Since 2026-11-22 the time of day
 * (`time_of_day`) is part of a row that has one; a row without a time is
 * reduced as before, so a dataset without times keeps its identifier. The
 * laboratory or method (`lab_method`, issue #68) joins in the same way. */
export function inputDataId(rawMeasurementRows: readonly Record<string, unknown>[]): string {
  const rows = rawMeasurementRows.map(row => JSON.stringify([String(row.PatientID),row.Date,row.Parameter,row.Unit,row.Value,row.patient_sex ?? '',row.patient_age_at_lab ?? null,row.patient_birth_date ?? '',
    // The time of day joins only where a row has one, so rows without a time keep their identifier.
    ...(row.time_of_day ? [row.time_of_day] : []),
    // Issue #68: the laboratory or method joins likewise, only where a row has one.
    ...(row.lab_method ? [`lab_method:${row.lab_method}`] : [])])).sort()
  return hashString(`[${rows.join(',')}]`)
}

/** `input_data_id` of imported rows as `raw_measurements` would list them:
 * the same reduction as there, for a workbook without that sheet (the
 * time-to-event workbook names the whole imported dataset this way). */
export function labRowsInputDataId(rows: readonly LabRow[]): string {
  return inputDataId(rows.filter(row => row.bezeichnung !== null).map(row => ({
    PatientID:row.patientId,Date:utcDateOrBlank(row.labDatum),Parameter:row.bezeichnung ?? '',Unit:row.einheit ?? '',Value:row.wert ?? '',
    patient_sex:row.patientSex ?? '',patient_age_at_lab:row.patientAgeAtLab,patient_birth_date:utcDateOrBlank(row.patientBirthDate ?? null),
    time_of_day:exportTimeOfDay(row.labTime),lab_method:row.labMethod ?? '',
  })))
}

const seriesIdentity = (name: string | null, unit: string | null) => JSON.stringify([name,unit])

/** `formula` of a merged series in measurements and parameters (issue #68). */
export const SERIES_MERGE_FORMULA = 'series_merge'

export const SERIES_MERGE_NOTE = 'lab_method, source_parameter and source_unit (since 2026-11-22) follow egfr_height_cm; source_unit is the last column of the measurement sheets. lab_method is the laboratory or method of the value as imported (column Laboratory, Labor, Method, Methode or lab_method), empty where the file had none; no calculation reads it. source_parameter and source_unit name, for a derived value in measurements, the series it comes from: for a merged series (origin derived, formula series_merge) the imported series the value was copied from, for a computed eGFR the creatinine series; both are empty for imported values and in raw_measurements. A merged series is formed only by an explicit mapping on the Data page (seriesMerge.merges in analysis_settings of the settings sheet), never automatically: every value of each source series is copied, converted to the merged unit only for serum creatinine between mg/dl and µmol/l (88.42 µmol/l per mg/dl; NumericValue unrounded, Value rounded); values of two sources on one day are all kept. The source series stay unchanged beside it, and in parameters source_parameter and source_unit list the source series of a merged series, separated by "; ". Values of one analyte from different laboratories or methods may not be comparable.'

/** Fixed column lists of the sheets, so a sheet without rows still has its
 * header row and a script finds every column by name. `patient_attributes`
 * (one column per attribute) and `settings` (one column per module setting)
 * take their columns from their rows, which are never empty. The patient ID
 * is `PatientID` in every sheet, written as the import read it: a number for
 * a numeric ID, otherwise text. `patient_birth_date` is the birth date of
 * the imported lab row: filled in `raw_measurements` only, so that a
 * re-import keeps an exact birth date; the resolved date of the analysis is
 * `birth_anchor` in `demographics`. */
export const MEASUREMENT_SHEET_HEADER = ['PatientID','Date','Parameter','Unit','Value','NumericValue','Operator','origin','formula','patient_sex','patient_age_at_lab','demographics','loinc','patient_birth_date','time_of_day','egfr_equation','egfr_height_cm','lab_method','source_parameter','source_unit'] as const
export const EVENTS_SHEET_HEADER = ['PatientID','type','date','title','description','endDate','intent','warning'] as const
export const AKI_EPISODES_SHEET_HEADER = ['PatientID','creatinine_parameter','creatinine_unit','stage','onset_date','peak_date','peak_value_mg_dl','baseline_date','baseline_value_mg_dl','criterion','end_date','dialysis_start','ended_by_gap','last_value_date','baseline_source','baseline_n'] as const
export const DEMOGRAPHICS_SHEET_HEADER = ['PatientID','baseline_age','birth_anchor','age_estimated','manual_override','warnings','egfr_source_parameter','egfr_source_unit','egfr_male_coefficients_for_sex_d'] as const
export const PARAMETERS_SHEET_HEADER = ['parameter_key','parameter','unit','origin','formula','source_parameter','source_unit','loinc'] as const
export const ROLLING_WINDOWS_SHEET_HEADER = ['PatientID','Parameter','Unit','window','window_start','window_end','first_date','last_date','n','slope'] as const
export const IMPORT_DIAGNOSTICS_SHEET_HEADER = ['source','sheet','kind','row','patient_id','date','parameter','value','message'] as const
export const ANCHOR_COMPARISON_SHEET_HEADER = ['PatientID','Parameter','Unit','fit_model','anchor_rule','anchor_value','anchor_date','anchor_type','anchor_title','exclusion_days','n_excluded_window',
  'before_n','before_first_date','before_last_date','before_span_days','before_slope','before_ci_low','before_ci_high',
  'after_n','after_first_date','after_last_date','after_span_days','after_slope','after_ci_low','after_ci_high',
  'slope_difference','difference_ci_low','difference_ci_high','slope_unit',
  // Appended 2026-11-22 (review of the combined branch): below five dates Theil-Sen bounds are not a 95 % interval.
  'before_n_fitted_dates','after_n_fitted_dates'] as const

/** Columns of `log_trend` (issue #70): the sheet exists only when a column is
 * shown on a logarithmic axis, so an export without one is unchanged. */
export const LOG_TREND_SHEET_HEADER = ['PatientID','Parameter','Unit','slope_mode','fit_model','n_fitted','n_fitted_dates','fitted_span_days','n_non_positive','index_date','last_fitted_date',
  'log_slope','log_slope_ci_low','log_slope_ci_high','log_slope_se','log_intercept','r2','reason','unstable_slope','doubling_time_years','doubling_time_ci_low','doubling_time_ci_high'] as const

const numberOrBlank = (value: number | undefined): number | '' => value === undefined || !Number.isFinite(value) ? '' : value

/** One row per patient and column with a before/after comparison (issue #64);
 * a patient without a matching anchor event has a row with empty values. */
function anchorComparisonRows(rows: readonly CohortRow[]) {
  return rows.flatMap(row => row.cells.flatMap(cell => {
    const comparison = cell.anchorComparison
    if (!comparison) return []
    const { rule, exclusionDays } = comparison.settings
    const side = (prefix: 'before' | 'after', value: AnchorSide | null) => ({
      [`${prefix}_n`]: value?.nFitted ?? '', [`${prefix}_first_date`]: utcDateOrBlank(value?.firstDate ?? null), [`${prefix}_last_date`]: utcDateOrBlank(value?.lastDate ?? null),
      [`${prefix}_span_days`]: value?.fittedSpanDays ?? '', [`${prefix}_slope`]: numberOrBlank(value?.slope), [`${prefix}_ci_low`]: numberOrBlank(value?.ciLow), [`${prefix}_ci_high`]: numberOrBlank(value?.ciHigh),
    })
    return [{
      PatientID: row.patientId, Parameter: cell.bezeichnung, Unit: cell.einheit ?? '', fit_model: cell.fitModel,
      anchor_rule: rule.kind, anchor_value: rule.kind === 'first' ? '' : rule.value,
      anchor_date: utcDateOrBlank(comparison.anchor?.date ?? null), anchor_type: comparison.anchor?.type ?? '', anchor_title: comparison.anchor?.title ?? '',
      exclusion_days: exclusionDays, n_excluded_window: comparison.before ? comparison.windowIdx.length : '',
      ...side('before', comparison.before), ...side('after', comparison.after),
      slope_difference: numberOrBlank(comparison.difference), difference_ci_low: numberOrBlank(comparison.differenceCiLow), difference_ci_high: numberOrBlank(comparison.differenceCiHigh),
      slope_unit: slopeUnit(cell.einheit),
      before_n_fitted_dates: comparison.before?.nFittedDates ?? '', after_n_fitted_dates: comparison.after?.nFittedDates ?? '',
    }]
  }))
}

/** One row per patient and column shown on a logarithmic axis: the fit on
 * ln(value) and the doubling time (positive) or halving time (negative). */
function logTrendRows(rows: readonly CohortRow[]) {
  return rows.flatMap(row => row.cells.flatMap(cell => {
    const trend = cell.logTrend
    if (!trend) return []
    return [{
      PatientID: row.patientId, Parameter: cell.bezeichnung, Unit: cell.einheit ?? '', slope_mode: cell.mode, fit_model: cell.fitModel,
      n_fitted: trend.nFitted, n_fitted_dates: trend.nFittedDates, fitted_span_days: trend.fittedSpanDays, n_non_positive: trend.nNonPositive,
      index_date: utcDateOrBlank(trend.firstFittedDate), last_fitted_date: utcDateOrBlank(trend.lastFittedDate),
      log_slope: numberOrBlank(trend.slope), log_slope_ci_low: numberOrBlank(trend.ciLow), log_slope_ci_high: numberOrBlank(trend.ciHigh),
      log_slope_se: numberOrBlank(trend.slopeSe), log_intercept: numberOrBlank(trend.intercept), r2: numberOrBlank(trend.r2), reason: trend.reason ?? '',
      unstable_slope: isUnstableSlope({ reason: trend.reason, nFitted: trend.nFitted, nFittedDates: trend.nFittedDates, fittedSpanDays: trend.fittedSpanDays, fitModel: cell.fitModel }) ? 'yes' : '',
      doubling_time_years: numberOrBlank(trend.doublingTimeYears), doubling_time_ci_low: numberOrBlank(trend.doublingCiLow), doubling_time_ci_high: numberOrBlank(trend.doublingCiHigh),
    }]
  }))
}

/** The last three columns of `settings` (issue #83); empty text without a record. */
function columnSettingsColumns(record: ColumnSettingsRecord | undefined) {
  return { trend: record ? record.trend : '', settings_source: record?.source ?? '', column_settings: record ? JSON.stringify(record.settings) : '' }
}

export const COLUMN_SETTINGS_NOTE = 'trend, settings_source and column_settings, the last columns of settings, record the settings of each parameter as the app keeps them: trend is true when Trend was on (with Trend off, fit_config has fitModel none and the column has no slope), settings_source is shared for a parameter that used the shared settings and own for one with its own settings, and column_settings holds those settings as JSON (the entries of fit_config with the preset id, the module settings and the before/after setting). Loading this file does not apply them; "Apply settings from an export" in the analysis record (Trajectories) does, together with analysis_settings, and lists what it could not apply.'

/** All sheets share the supplied visible scope; summaries are never fitted again. */
/** The workbook sheets of an export. Always English, whatever the interface
 * language (issue #71): column names, values and notes are composed under
 * `inEnglish`. */
export function workspaceWorkbookSheets(input: WorkspaceExportInput): WorkbookSheet[] {
  return inEnglish(() => composeWorkbookSheets(input))
}
function composeWorkbookSheets({data,parameterKeys,patientIds,cohortRows,patientId,fitConfigByParameterKey,moduleSettingsByParameterKey,groupBy = '',anchorComparisonByParameterKey,columnSettingsByParameterKey,periEventSettings = null,exportedAt = new Date(),exportId = crypto.randomUUID()}: WorkspaceExportInput): WorkbookSheet[] {
  const requestedKeys = [...new Set(parameterKeys)]
  const parameters = requestedKeys.map(key => data.parameters.find(parameter => parameter.key === key))
  if (!parameters.length || parameters.some(parameter => !parameter)) throw new Error('No valid parameters selected for export.')
  const selectedParameters = parameters.filter(parameter => parameter !== undefined)
  const knownPatients = new Set(data.patients.map(patient => patient.id))
  const visibleIds = [...new Set(patientIds)].filter(id => knownPatients.has(id))
  const ids = patientId === undefined ? visibleIds : visibleIds.filter(id => id === patientId)
  if (!ids.length) throw new Error('No patients available in the current selection.')
  const idSet = new Set(ids)
  const periEvent = periEventSettings
  const exportedKeys = new Set(ids.map(patientIdKey))
  const loadedKeys = new Set(data.patients.map(patient => patientIdKey(patient.id)))
  const bySeries = new Map(selectedParameters.map(parameter => [seriesIdentity(parameter.bezeichnung,parameter.einheit),parameter]))
  const scopedRows = (rows: LabRow[]) => rows.filter(row => idSet.has(row.patientId) && bySeries.has(seriesIdentity(row.bezeichnung,row.einheit)))
  const prepared = ids.map(id => {
    const row = cohortRows.find(row => row.patientId === id)
    if (!row) throw new Error('The displayed summary is missing. Reopen the selection.')
    const cells = selectedParameters.map(parameter => row.cells.find(cell => cell.bezeichnung === parameter.bezeichnung && cell.einheit === parameter.einheit))
    if (cells.some(cell => !cell)) throw new Error('The displayed summary does not contain all selected parameters.')
    return {...row,cells:cells.filter(cell => cell !== undefined)}
  })
  // Issue #68: a derived parameter is a computed eGFR or a deliberately merged series.
  const merges = new Map(seriesMerges(data.analysisSettings).map(merge => [seriesIdentity(merge.name,merge.unit),merge]))
  const mergeOf = (parameter: WorkspaceParameter) => merges.get(seriesIdentity(parameter.bezeichnung,parameter.einheit))
  const derivedFormula = (parameter: WorkspaceParameter) => mergeOf(parameter) ? SERIES_MERGE_FORMULA : data.analysisSettings.egfr.formula
  const measurementRows = (rows: LabRow[], raw = false) => scopedRows(rows).flatMap(row => {
    const parameter = bySeries.get(seriesIdentity(row.bezeichnung,row.einheit))!
    return patientMeasurementRecords([row],row.patientId).map(record => ({
      PatientID:record.PatientID,Date:utcDateOrBlank(row.labDatum),Parameter:record.Bezeichnung,Unit:record.Einheit,Value:record.Wert,NumericValue:record.WertNum === '' ? null : record.WertNum,Operator:record.Operator,
      origin:!raw && parameter.derived ? 'derived' : 'imported',
      formula:!raw && parameter.derived ? derivedFormula(parameter) : '',
      patient_sex:row.patientSex ?? '',patient_age_at_lab:row.patientAgeAtLab,
      demographics:raw ? 'as imported' : 'resolved analysis values',
      // Appended 2026-11-21; empty for derived values and rows without a code.
      loinc:row.loinc ?? '',
      patient_birth_date:raw ? utcDateOrBlank(row.patientBirthDate ?? null) : '',
      // Appended 2026-11-22: the time of day of the lab date, empty when the file gave none.
      time_of_day:exportTimeOfDay(row.labTime),
      // Appended 2026-11-22 (issue #66): the equation of a computed eGFR value, and the height it used.
      egfr_equation:!raw && row.egfrFormula ? row.egfrFormula : '',
      egfr_height_cm:!raw && row.egfrHeightCm !== undefined ? row.egfrHeightCm : null,
      // Appended 2026-11-22 (issue #68): the laboratory or method as imported, and the series a derived value comes from.
      lab_method:row.labMethod ?? '',
      source_parameter:raw ? '' : row.mergedFrom?.bezeichnung ?? row.sourceSeries?.bezeichnung ?? '',
      source_unit:raw ? '' : row.mergedFrom ? row.mergedFrom.einheit ?? '' : row.sourceSeries?.einheit ?? '',
    }))
  })
  const attrs = Object.fromEntries(ids.map(id => [patientIdKey(id),data.patientAttributes[patientIdKey(id)] ?? {}]))
  const demographicWarnings = demographicWarningsByPatient(data.analysis.messages)
  const warningsFor = (id: PatientId) => demographicWarnings.get(patientIdKey(id)) ?? []
  const conflictKeys = new Set(ids.filter(id => warningsFor(id).length > 0).map(patientIdKey))
  const specs = workspaceSpecs(data,requestedKeys,fitConfigByParameterKey)
  const columnSettings = (key: string): ColumnModuleSettings => moduleSettingsByParameterKey?.[key] ?? defaultColumnModuleSettings()
  const patientById = new Map(data.patients.map(patient => [patient.id,patient]))
  // One creatinine series per patient (issue #65): the selected source or the patient's µmol/l fallback.
  const egfrSourceByPatient = new Map<string,{bezeichnung: string; einheit: string}>()
  for (const row of data.rows) if (row.sourceSeries && !egfrSourceByPatient.has(patientIdKey(row.patientId))) egfrSourceByPatient.set(patientIdKey(row.patientId),row.sourceSeries)
  // Decision `sexd` (2026-11-22): the eGFR equations use the male coefficients for sex d.
  const egfrSexDByPatient = new Map<string,boolean>()
  for (const row of data.rows) if (row.sourceSeries) {
    const key = patientIdKey(row.patientId)
    // Bedside Schwartz has no sex coefficients, as for the notice of the Data page.
    egfrSexDByPatient.set(key,(egfrSexDByPatient.get(key) ?? false) || (normaliseSex(row.patientSex) === 'd' && row.egfrFormula !== 'schwartz-bedside'))
  }
  // Sex, baseline age and the group follow the columns of earlier releases;
  // `group` is always last and empty without grouping (decided 2026-11-21).
  // A slope of the computed eGFR fitted across a change of its equation (issue #66).
  const egfrKey = computedEgfrKey(data)
  const formulaSwitches = egfrFormulaSwitches(data.rows)
  const summaries = cohortExportRecords(prepared,cellIndex => columnSettings(requestedKeys[cellIndex]),conflictKeys).map((record,index) => {
    const cell = prepared[Math.floor(index / selectedParameters.length)].cells[index % selectedParameters.length]
    const {group,...fields} = cohortSheetRecord(record,cell)
    const patient = patientById.get(record.PatientID)
    const crossed = selectedParameters[index % selectedParameters.length].key === egfrKey && Number.isFinite(cell.slope)
      ? fitCrossesFormulaSwitch(formulaSwitches.get(patientIdKey(record.PatientID)),cell.firstFittedDate,cell.lastFittedDate) : []
    return cohortSheetRow({...fields,sex:patient?.attributes.sex ?? '',baseline_age:patient?.baselineAge ?? null,
      egfr_formula_switch:crossed.map(formulaSwitchText).join('; '),group:group ?? ''})
  })
  const idByKey = new Map(ids.map(id => [patientIdKey(id),id]))
  // Each column's module settings, one export column per configurable field.
  const moduleSettingColumns = (key: string) => Object.fromEntries(columnSettingModules().flatMap(module => (module.columnSettingFields ?? []).flatMap(field => {
    if (!field.exportKey) return []
    const settings = ((columnSettings(key) as Record<string, Record<string, unknown> | undefined>)[module.id] ?? module.defaultSettings) as Record<string, unknown>
    return [[field.exportKey, settings[field.key]]]
  })))
  // `xAxis` is left out of the exported configuration (decided 2026-11-21):
  // no fit reads it, and "age" there read as if the trend were fitted on age.
  const exportedFitConfig = (config: FitConfig | undefined) => {
    if (!config) return {}
    const {xAxis: _unused,...exported} = config
    return exported
  }
  const rawMeasurements = measurementRows(data.rawRows,true)
  const logTrends = logTrendRows(prepared)
  return [
    {name:'measurements',header:MEASUREMENT_SHEET_HEADER,rows:measurementRows(data.rows)},
    {name:'raw_measurements',header:MEASUREMENT_SHEET_HEADER,rows:rawMeasurements},
    {name:patientId === undefined ? 'cohort' : 'slopes',header:COHORT_SHEET_HEADER,rows:summaries},
    {name:'events',header:EVENTS_SHEET_HEADER,rows:data.events.filter(event => idSet.has(event.patientId)).map(event => ({PatientID:event.patientId,type:event.type,date:utcDateOrBlank(event.date),title:event.title,description:event.description,endDate:utcDateOrBlank(event.endDate),intent:event.intent,warning:event.warning}))},
    {name:'aki_episodes',header:AKI_EPISODES_SHEET_HEADER,rows:akiEpisodeExportRows(akiEpisodeRows(data.rows.filter(row => idSet.has(row.patientId)),data.events,akiRecoveryHours(data.analysisSettings),akiRetrospectiveFall(data.analysisSettings),data.analysisSettings.egfr?.source ?? null))},
    {name:'patient_attributes',rows:patientAttributesExportRows(attrs,key => idByKey.get(key) ?? key)},
    {name:'demographics',header:DEMOGRAPHICS_SHEET_HEADER,rows:ids.map(id => {
      const patient = patientById.get(id)
      // Appended 2026-11-22 (issue #65): the creatinine series this patient's computed eGFR was derived from.
      const egfrSource = egfrSourceByPatient.get(patientIdKey(id))
      return {PatientID:id,baseline_age:patient?.baselineAge ?? null,birth_anchor:utcDateOrBlank(patient?.birthAnchor ?? null),age_estimated:patient?.ageEstimated ?? null,manual_override:JSON.stringify(data.manualDemographics[patientIdKey(id)] ?? {}),warnings:warningsFor(id).join('; '),
        egfr_source_parameter:egfrSource?.bezeichnung ?? '',egfr_source_unit:egfrSource?.einheit ?? '',
        // Appended 2026-11-22 (decision `sexd`): true when a computed eGFR value of the patient used the male coefficients for sex d.
        egfr_male_coefficients_for_sex_d:egfrSexDByPatient.get(patientIdKey(id)) ?? null}
    })},
    {name:'parameters',header:PARAMETERS_SHEET_HEADER,rows:selectedParameters.map(parameter => ({parameter_key:parameter.key,parameter:parameter.bezeichnung,unit:parameter.einheit ?? '',origin:parameter.derived ? 'derived' : 'imported',formula:parameter.derived ? derivedFormula(parameter) : '',
      // A merged series names its source series, separated by "; " (issue #68).
      source_parameter:!parameter.derived ? '' : mergeOf(parameter)?.sources.map(source => source.bezeichnung).join('; ') ?? data.analysisSettings.egfr.source?.[0] ?? '',
      source_unit:!parameter.derived ? '' : mergeOf(parameter)?.sources.map(source => source.einheit ?? '').join('; ') ?? data.analysisSettings.egfr.source?.[1] ?? '',
      // Appended 2026-11-21: the distinct codes of the parameter's imported rows, whatever patients are selected.
      loinc:parameter.derived ? '' : [...new Set(data.rawRows.filter(row => row.loinc !== null && seriesIdentity(row.bezeichnung,row.einheit) === seriesIdentity(parameter.bezeichnung,parameter.einheit)).map(row => row.loinc))].join('; ')}))},
    {name:'settings',rows:specs.map((spec,index) => ({parameter_key:requestedKeys[index],parameter:spec.bezeichnung,unit:spec.einheit ?? '',mode:spec.mode,fit_config:JSON.stringify(exportedFitConfig(spec.fitConfig)),...moduleSettingColumns(requestedKeys[index]),analysis_settings:JSON.stringify(data.analysisSettings),patient_ids:JSON.stringify(ids),source_file:data.fileName ?? '',scope:patientId === undefined ? 'visible cohort' : 'selected patient',
      // Appended 2026-11-22: the grouping attribute behind the group column, empty without grouping.
      group_by:groupBy,

      // Appended 2026-11-22 (issue #64): the before/after setting, empty when the column has none.
      anchor_comparison:anchorComparisonByParameterKey?.[requestedKeys[index]] ? JSON.stringify(anchorComparisonByParameterKey[requestedKeys[index]]) : '',
      // Appended 2026-11-22 (issue #83): the settings as the app keeps them, for "Apply settings from an export".
      ...columnSettingsColumns(columnSettingsByParameterKey?.[requestedKeys[index]]),
      // Appended 2026-11-22 (issue #69): the Data page's event selection and window, the same in every row; empty without one.
      peri_event_creatinine:periEvent ? JSON.stringify(periEvent) : ''}))},
    {name:'about',rows:[...EXPORT_DISCLAIMER_ROWS,
      // Only this workbook has the column, so the note is not in the shared rows.
      {note:'endpoint_percent_change is the total eGFR change in percent from the first to the latest eligible measurement, with the sign the badge in the app shows: negative when eGFR fell, positive when it rose. It is not a rate per year and not the confirmed 40 % or 57 % decline event. Until 2026-11-16 the column was named endpoint_percent_decline and had the opposite sign.'},
      {note:'Research use only. Not for clinical decision-making.'},
      {note:'Measurements, summaries, events and attributes are restricted to the selected patients and parameters. Events and attributes apply at patient level.'},
      {note:'measurements contains analysis values with resolved demographics and explicitly marked derived values; raw_measurements contains only imported values for the selected parameters. Unselected source measurements are not added.'},
      {note:'aki_episodes lists every AKI episode detected for the selected patients, one row per episode and serum creatinine parameter, whichever parameters are selected and whether or not a column excludes AKI windows from its fit. A merged creatinine series (formula series_merge) is not listed, since it repeats the episodes of its source series, unless it is the creatinine source of the computed eGFR (egfr.source in analysis_settings). Automated KDIGO creatinine screening, not a diagnosis; creatinine values in mg/dl. A new episode starts only after creatinine was back below the KDIGO criterion for the recovery length, aki.recoveryHours in analysis_settings of the settings sheet (48 hours by default: no crossing on the two calendar days after a value below it, none of them under dialysis), or after more than seven days without creatinine values outside dated acute dialysis intervals; end_date is the date of the first value back below it; it is empty while the episode is still open at the last value and when such a gap ended it (ended_by_gap true: the first value after the gap is not compared with any earlier value, so no recovery was observed). last_value_date is the date of the last value of the episode before its end. dialysis_start is the first dialysis starting between onset and end_date, or, when end_date is empty, up to the recovery length (two days by default) after last_value_date, with its intent; it does not change the stage. An acute or unknown-intent dialysis without an end date in events does not block an end, so an end_date on or after its start can reflect the dialysis rather than recovery; the Data page and the patient view name that dialysis beside the end. baseline_source is window (the lowest value of the 48-hour or 7-day window), lookback_mean (the first value of an admission, i.e. after more than seven days without values and followed by a value on one of the next two days, compared with the mean of the baseline_n values 7 to 365 days before it; baseline_date is the latest of them) or admission_minimum (the retrospective option aki.retrospectiveFall: the lowest later value of the admission, dated after the onset).'},
      {note:'Slopes and quality information come directly from the displayed summary; export does not refit the data. n counts raw measurements; n_fitted counts the points actually fitted.'},
      {note:`ci_low and ci_high are the 95 % interval of the slope. For a Theil-Sen fit with n_fitted_dates below ${MIN_THEIL_SEN_PROJECTION_DATES} they are Theil-Sen bounds, not a 95 % interval. ${theilSenFewDatesCoverage()}.`},
      {note:'Measurements marked < or > are bounds. Their numeric limits remain in raw and chart data. In the slope fits of a parameter they enter as its setting boundedValues in fit_config says: limit (both at x, the default), half-limit (<x at x/2, >x at x) or exclude (left out). Endpoints, AKI detection and cohort mixed models exclude them whatever the setting; only a conclusive bound >x with x at or above 30 (G4) or 15 (G5) interrupts an unconfirmed G4 or G5 candidate.'},
      {note:'loinc is the LOINC code as imported (measurements, raw_measurements) and the distinct codes of a parameter (parameters). Codes do not separate or join parameters, with one exception: creatinine with a urine code (2161-8, 14683-7) is a parameter of its own, named with the code, and is not used for AKI detection or eGFR.'},
      {note:'import_diagnostics lists what the import reported for lab values, events and attributes (rejected rows and warnings) and the rows behind the data checks of the Data page (values without a date or a number, implausible serum creatinine). Lines about patients outside this export are left out; all parameters are covered, not only the selected ones. row is the row in the source file (header row = 1); a collective warning has one line per affected row. The sheet is empty when there is nothing to report.'},
      {note:'rolling_windows lists the fitted windows of every Rolling OLS column, one row per window: window_start and window_end are the bounds of the window (both days included), first_date and last_date the dates of the first and last fitted point inside, n their number, slope the OLS slope of the window per year, unrounded. A fitted point is a measurement; with monthly or quarterly medians as time balancing (see the settings sheet) it is the median of one calendar month or quarter, dated to one of its measurement days, so n counts medians and a measurement outside the window bounds can enter through the median of its period. The sheet is empty when no selected parameter uses Rolling OLS. The reported slope stays the global OLS slope.'},
      {note:`The columns sheet describes every column of the ${patientId === undefined ? 'cohort' : 'slopes'} sheet: meaning, unit and when the cell is empty. first_eligible_value and last_eligible_value are the measured values at first_eligible_date and last_eligible_date: exact values before the first kidney transplant or chronic dialysis, whatever the fit settings. last_eligible_value can therefore differ from "latest" in the Trajectories table, which is the last dated numeric value of the series.`},
      {note:'The patient ID is in column PatientID in every sheet (until 2026-11-21: patientId in events, patient_attributes and demographics). group is always the last column of the cohort sheet and empty when the table was not grouped; group_by in settings, before anchor_comparison, names the attribute it was grouped by (empty without grouping). A number without a value is an empty cell.'},
      {note:'Time axis of the trend: every slope is fitted on the time in years (365.25 days) since the first fitted measurement of the patient and parameter, whose date is index_date. slope is the change per year and intercept is the fitted value at index_date, not at age 0 or at a calendar origin. The axis chosen for the charts (age, calendar date, time since first measurement) changes the drawing only. fit_config no longer carries the entry xAxis (until 2026-11-21 it did, with "age" for the CKD progression preset); no fit ever read it.'},
      {note:'preset in fit_config records how the settings were selected: a preset of the app, or custom after any setting was changed by hand. The Theil-Sen preset is written as theil_sen (until 2026-11-21 as custom). The other entries of fit_config, the settings sheet and the columns of the result sheet determine the computation; two files with the same entries and a different preset name were computed the same way.'},
      {note:`Fixed parameters that fit_config does not carry: Segmented OLS (slope_mode gap-split) starts a new segment where two consecutive fitted points are more than ${SEGMENT_GAP_DAYS} days apart and fits a segment of at least ${SEGMENT_MIN_POINTS} points; slope, intercept, r2 and the bounds are those of the global OLS fit across all segments. Rolling OLS: see rolling_window_days and rolling_step_days in the result sheet.`},
      {note:`This file contains personal data and details of its origin. The patient IDs are written as imported, not pseudonymised: in column PatientID of every sheet and in settings (patient_ids). The measurement sheets hold dated values, sex and age, and raw_measurements the birth date where the imported lab rows carried one (patient_birth_date); demographics holds birth_anchor, a birth date (estimated from the stated age where age_estimated is true); events and patient_attributes hold the imported texts and attributes. settings names the imported file (source_file). Check these fields before passing the file on.`},
      {note:'patient_birth_date follows loinc and precedes time_of_day in the measurement sheets. In raw_measurements it holds the birth date of the imported lab row, so that loading this file again keeps an exact birth date; where the import had no birth date it is empty, and patient_age_at_lab is then the stated age. In measurements it is empty: the birth date used by the analysis is birth_anchor in demographics.'},
      {note:'egfr_equation, after time_of_day, and egfr_height_cm, after egfr_equation (both since 2026-11-22), name the equation of each computed eGFR value (ckd-epi-2021, ckd-epi-2009, mdrd-4, ekfc-2021, ckid-u25 or schwartz-bedside) and, for CKiD U25 and bedside Schwartz, the height in cm it used: measured on the creatinine date or interpolated between two heights at most 90 days away, never extrapolated. Both are empty for imported values and in raw_measurements. One computed series can mix equations (by default CKiD U25 with a height, otherwise EKFC, from 2 to 17 years, and the adult formula from 18); egfr_formula_switch in the cohort sheet names each change of equation that a fitted slope spans.'},
      {note:'Date holds the calendar day and time_of_day, after patient_birth_date in the measurement sheets, the time of day of the imported lab date (HH:MM:SS), empty where the file gave none; a time of 00:00 counts as none. Derived values have no time. Where the imported file gave times, they ordered several serum creatinine values of one day in AKI detection. Loading this file again reads time_of_day from raw_measurements, so the AKI episodes are the same as in this export when Recovery between episodes on the Data page has the value aki.recoveryHours of analysis_settings in the settings sheet: loading a file does not read the settings and starts at 48 hours. input_data_id covers the time of day of the rows that have one (until 2026-11-22 the time was in no sheet).'},
      {note:`app_version: ${APP_VERSION}`},
      {note:`exported_at: ${exportedAt.toISOString()}`},
      {note:`export_id: ${exportId}`},
      {note:`input_data_id: ${inputDataId(rawMeasurements)}`},
      {note:'app_version is the version of Lab Trajectory Explorer that computed and wrote this file; exported_at is the time of the export in UTC; export_id is a random identifier of this file. input_data_id identifies the imported measurements in the exported scope (the rows of raw_measurements: patient, date, parameter, unit, value, sex, stated age, imported birth date, time of day and, since 2026-11-22, laboratory or method where a row has one; a 32-bit checksum, independent of row order and of the settings): two exports with the same input_data_id were computed from the same imported rows. Events, attributes and manual demographic entries are not part of it.'},
      // Appended 2026-11-22 (issue #64), so the earlier notes keep their positions.
      {note:`anchor_comparison lists the before/after comparison at an anchor event, one row per patient and parameter whose settings switch it on (settings: anchor_comparison). The anchor is the first event of the patient (anchor_rule first) or the first whose title or type equals anchor_value; among events of one date the first in the file. Measurements on the anchor date count as before; those of the exclusion_days days after it are left out of the after slope (n_excluded_window). Both sides use the points of the column\'s own fit (same censoring, exclusions and time balancing, balanced per side) and its estimator; n counts fitted points and n_fitted_dates their distinct dates. ci_low and ci_high of a side are its 95 % interval; for Theil-Sen with n_fitted_dates below ${MIN_THEIL_SEN_PROJECTION_DATES} they are Theil-Sen bounds, not a 95 % interval, as for the slope of the cohort sheet. slope_difference is after minus before; its 95 % interval is the Welch interval from the two OLS standard errors, assuming independent sides, and is empty for Theil-Sen and for a side with two points. A patient without a matching event has a row with empty values. The slope, flags and endpoints of the cohort sheet are those of the whole series.`},
      // Appended 2026-11-22 (issue #65).
      {note:'A computed eGFR reads one serum creatinine series per patient: the creatinine source of the Data page (source_parameter and source_unit in parameters), or, when that source is in mg/dl and the patient has no serum creatinine in mg/dl, the patient\'s series in µmol/l (divided by 88.42). egfr_source_parameter and egfr_source_unit, the last columns of demographics, name the series used for each patient; they are empty for a patient without a computed eGFR value. Series are not merged by this rule; a series merged deliberately on the Data page is the source only when it is chosen as the creatinine source.'},
      // Appended 2026-11-22 (issue #83), after the note on anchor_comparison.
      {note:COLUMN_SETTINGS_NOTE},
      // Appended 2026-11-22 (issue #69), so the earlier notes keep their positions.
      {note:'peri_event_creatinine lists the serum creatinine around every event of the selected patients whose title or type equals the selection on the Data page (event_rule; the column peri_event_creatinine of the settings sheet), one row per event; the sheet is empty while no events are selected. Automated screening with the KDIGO creatinine criterion, not a diagnosis; values in mg/dl (µmol/l divided by 88.42). Dates are calendar days: event dates have no time of day, so the window of window_hours 48 (72) is the 2 (3) calendar days after the event day, up to window_end_date, and a value on the event day counts as the baseline, also where lab values carry a time. baseline is the last value on or before the event day, with no look-back limit (baseline_days_before_event); among several values of that day the latest by time when every value has a time, otherwise the lowest (n_baseline_day_values). peak is the highest value in the window. criterion_met is true when absolute_rise_mg_dl is at least 0.3 or ratio_to_baseline at least 1.5 (both inclusive) and empty when status is not_evaluable; reason then says why. The series is the serum creatinine parameter of the patient with the most exact values above zero; values of zero or less, bounds and values under dialysis are not used, and an event whose day is under dialysis is not evaluable. Each event is evaluated on its own; overlapping_events counts the other selected events of the patient within the window length before or after it, whose values it shares.'},
      // Only with a log_trend sheet (issue #70), so an export without a logarithmic column is unchanged.
      ...(logTrends.length ? [{note:'log_trend lists, for every parameter shown on a logarithmic value axis, the trend fitted to the natural logarithm of the values with the same slope mode, estimator, exclusions and time balancing as the column (monthly or quarterly medians are medians of the log values). Values of zero or less have no logarithm and are left out (n_non_positive); bounds enter as the column\'s boundedValues in fit_config says (limit: ln x; half-limit: ln(x/2) for <x; exclude: left out). log_slope is per year; doubling_time_years is ln 2 / log_slope: positive is the doubling time, negative the halving time in years. doubling_time_ci_low and doubling_time_ci_high are ln 2 divided by the upper and the lower bound of log_slope, empty when the bounds include zero. The column\'s own slope and every other sheet are unchanged by this setting.'}] : []),
      // Appended 2026-11-22 (decision `sexd`).
      {note:'egfr_male_coefficients_for_sex_d, the last column of demographics, is true for a patient whose computed eGFR values include one with sex d from an equation with a sex term: the eGFR equations have coefficients for male and female sex only, and sex d uses the male ones. Bedside Schwartz has no sex term, so its values never make it true. It is false for a patient with computed eGFR values otherwise, and empty without a computed eGFR value.'},
      // Appended 2026-11-22 (issues #81, #82, `g5single`), last.
      {note:'endpoint_observed_decline_50 and the endpoint_decline_50_* columns, before group, are the confirmed 50 % eGFR decline: the baseline, candidate, confirmation and recovery rules of the 40 % and 57 % declines with the boundary 50 %; they are filled only where the column switches the 50 % decline on (endpoints.observedDecline50 in fit_config). endpoint_g5_single_value_unconfirmed, the column before group, is yes when no CKD G5 is confirmed and an eligible measurement date has only values below 15 while the eligible dates directly before and after it do not (a conclusive bound >x with x at or above 15 counts as a date that is not below 15): a single value below 15, unconfirmed (possible AKI). It is never an observed G5 and does not withhold the extrapolation to CKD G5. That extrapolation is off by default since 2026-11-22 (endpoints.projectedAgeToCkdG5 in fit_config says whether it was on); while it is off, its columns are empty. Switched on, it needs eligible measurements on at least four distinct dates over at least three calendar years (reason kdigo_minimum_follow_up otherwise).'},
      // Appended 2026-11-22 (issue #68), last.
      {note:SERIES_MERGE_NOTE},
    ]},
    // Sheets added later follow the earlier ones, so sheet positions stay.
    {name:'columns',header:['column','meaning','unit','empty_when'],rows:cohortColumnDirectoryRows()},
    // Added on 2026-11-21, after the sheets above existed: their positions stay as they were.
    {name:'rolling_windows',header:ROLLING_WINDOWS_SHEET_HEADER,rows:prepared.flatMap(row => row.cells.flatMap(cell => (cell.rolling?.windows ?? []).map((window,index) => ({
      PatientID:row.patientId,Parameter:cell.bezeichnung,Unit:cell.einheit ?? '',window:index+1,
      window_start:utcDateOrBlank(window.start),window_end:utcDateOrBlank(window.end),first_date:utcDateOrBlank(window.firstDate),last_date:utcDateOrBlank(window.lastDate),
      n:window.n,slope:window.slope,
    }))))},
    // Appended after the sheets that existed before 2026-11-21, so their positions stay.
    // Lines about a loaded patient outside the exported scope are left out, like that patient's
    // measurements. Lines without a patient stay; so do, in a cohort export, lines about IDs
    // that never became a patient (all rows rejected, attribute rows of unknown patients).
    {name:'import_diagnostics',header:IMPORT_DIAGNOSTICS_SHEET_HEADER,rows:importDiagnosticRecords(data.importDiagnostics ?? [],dataChecks(data.rawRows)).filter(record => {
      if (record.patient_id === '') return true
      const key = patientIdKey(record.patient_id)
      return exportedKeys.has(key) || (patientId === undefined && !loadedKeys.has(key))
    })},
    // Added 2026-11-22 (issue #64), after every earlier sheet, so their positions stay.
    {name:'anchor_comparison',header:ANCHOR_COMPARISON_SHEET_HEADER,rows:anchorComparisonRows(prepared)},
    // Added 2026-11-22 (issue #69), after every earlier sheet, so their positions stay.
    {name:'peri_event_creatinine',header:PERI_EVENT_SHEET_HEADER,rows:periEventExportRows(periEvent ? periEventCreatinineRows(data.rows.filter(row => idSet.has(row.patientId)),data.events.filter(event => idSet.has(event.patientId)),periEvent) : [],periEvent?.rule ?? null)},
    // Added 2026-11-22 (issue #70), only when a column has a logarithmic axis, after every other sheet.
    ...(logTrends.length ? [{name:'log_trend',header:LOG_TREND_SHEET_HEADER,rows:logTrends}] : []),
  ]
}

export function workspaceWorkbookBytes(input: WorkspaceExportInput): Uint8Array {
  return sheetsToXlsxBytes(workspaceWorkbookSheets(input))
}

export function safeExportFilename(title: string, extension: 'xlsx'|'svg'|'png'|'zip'): string {
  const safe = title.normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'-').replace(/^\.+|[. ]+$/g,'').trim().slice(0,100) || 'export'
  return `lab-trajectory-${safe}-${fileStamp()}.${extension}`
}

function wrapChartText(value: string, maximum: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of value.trim().split(/\s+/)) {
    if (current && current.length + word.length + 1 > maximum) { lines.push(current); current = '' }
    const letters = Array.from(word)
    while (letters.length > maximum) { lines.push(letters.splice(0,maximum).join('')) }
    current += `${current ? ' ' : ''}${letters.join('')}`
  }
  if (current) lines.push(current)
  return lines
}

/** Export only explicit chart metadata; never scrape unrelated HTML or hidden patient data. */
function chartLegend(svg: SVGSVGElement): {label:string;color:string}[] {
  try {
    const parsed: unknown = JSON.parse(svg.getAttribute('data-export-legend') ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is {label:string;color:string} => item && typeof item.label === 'string' && typeof item.color === 'string') : []
  } catch { return [] }
}

/** Clone with visible title, context, legend and research framing, also for PNG. */
export function exportChartSvg(svg: SVGSVGElement, title: string): {svg:string;width:number;height:number} {
  return inEnglish(() => composeChartSvg(svg, title))
}
function composeChartSvg(svg: SVGSVGElement, title: string): {svg:string;width:number;height:number} {
  const box = (svg.getAttribute('viewBox') ?? '').trim().split(/[ ,]+/).map(Number)
  const validBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
  const width = validBox ? box[2] : Number(svg.getAttribute('width'))
  const contentHeight = validBox ? box[3] : Number(svg.getAttribute('height'))
  if (!Number.isFinite(width) || !Number.isFinite(contentHeight) || width <= 0 || contentHeight <= 0 || !svg.querySelector('path,line,rect,circle,ellipse,polygon,polyline,text,image,use')) throw new Error('No exportable chart available.')
  const x = validBox ? box[0] : 0
  const y = validBox ? box[1] : 0
  const clone = svg.cloneNode(true) as SVGSVGElement
  // A null-namespace xmlns attribute produces duplicate declarations in some serializers.
  clone.removeAttribute('xmlns')
  clone.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns','http://www.w3.org/2000/svg')
  // Styles from the workspace stylesheet are absent in standalone downloads.
  const originals = svg.querySelectorAll('text')
  clone.querySelectorAll('text').forEach((text,index) => {
    const style = getComputedStyle(originals[index])
    for (const [property,fallback] of [['font-family','Arial, sans-serif'],['font-size','12px'],['fill','#445963']] as const) {
      // The size is fixed: the page enlarges chart text on a narrow screen, and an
      // export must not depend on the width of the window it was made in.
      const value = property === 'font-size' ? fallback : style.getPropertyValue(property) || text.getAttribute(property) || fallback
      text.setAttribute(property,value)
      text.style.setProperty(property,value)
    }
    for (const property of ['font-weight','font-style','text-anchor','dominant-baseline']) {
      const value = style.getPropertyValue(property)
      if (value) {text.setAttribute(property,value);text.style.setProperty(property,value)}
    }
  })
  const titleLines = wrapChartText(title,Math.max(1,Math.floor((width-24)/14)))
  const contextLines = wrapChartText(svg.getAttribute('data-export-context') ?? '',Math.max(1,Math.floor((width-24)/12)))
  const legend = chartLegend(svg).map(item => ({...item,lines:wrapChartText(item.label,Math.max(1,Math.floor((width-40)/12)))}))
  const headerHeight = 16 + titleLines.length*20 + contextLines.length*17 + legend.reduce((sum,item) => sum+item.lines.length*17,0)
  const lines = ['Lab Trajectory Explorer. Research use only.', 'Not for clinical decision-making.', 'Bounds (<, >) remain visible but are excluded from calculations.'].flatMap(line => wrapChartText(line,Math.max(1,Math.floor((width-24)/11))))
  const footerHeight = 12 + lines.length*16
  const height = headerHeight + contentHeight + footerHeight
  clone.setAttribute('viewBox',`${x} ${y-headerHeight} ${width} ${height}`)
  clone.setAttribute('width',String(width))
  clone.setAttribute('height',String(height))
  clone.style.background = 'white'
  clone.style.color = '#172033'
  const label = document.createElementNS(svg.namespaceURI,'title')
  label.textContent = title
  clone.prepend(label)
  const description = document.createElementNS(svg.namespaceURI,'desc')
  description.textContent = 'Lab Trajectory Explorer. Research use only. Not for clinical decision-making. Bounds (<, >) remain visible but are excluded from calculations.'
  clone.prepend(description)
  const background = document.createElementNS(svg.namespaceURI,'rect')
  background.setAttribute('x',String(x)); background.setAttribute('y',String(y-headerHeight))
  background.setAttribute('width',String(width)); background.setAttribute('height',String(height)); background.setAttribute('fill','white')
  clone.prepend(background)
  function addText(value: string, position: number, fontSize: number, left = x+12) {
    const text = document.createElementNS(svg.namespaceURI,'text')
    text.setAttribute('x',String(left)); text.setAttribute('y',String(position))
    text.setAttribute('font-family','Arial, sans-serif'); text.setAttribute('font-size',String(fontSize))
    text.setAttribute('fill','#475569'); text.textContent = value; clone.append(text)
  }
  let headerY = y-headerHeight+20
  titleLines.forEach(line => {addText(line,headerY,14);headerY+=20})
  contextLines.forEach(line => {addText(line,headerY,12);headerY+=17})
  legend.forEach(item => {
    const swatch = document.createElementNS(svg.namespaceURI,'rect')
    swatch.setAttribute('x',String(x+12));swatch.setAttribute('y',String(headerY-10))
    swatch.setAttribute('width','10');swatch.setAttribute('height','10');swatch.setAttribute('fill',item.color)
    clone.append(swatch)
    item.lines.forEach(line => {addText(line,headerY,12,x+28);headerY+=17})
  })
  lines.forEach((line,index) => {
    addText(line,y+contentHeight+16+index*16,11)
  })
  return {svg:svgElementToString(clone),width:Math.ceil(width),height:Math.ceil(height)}
}
