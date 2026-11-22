import { version as APP_VERSION } from '../../package.json'
import { cohortExportRecords, cohortSheetRecord, EXPORT_DISCLAIMER_ROWS, type CohortRow } from '../core/cohort/screening'
import { hashString } from '../core/mixedModel/validation'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../core/endpoints/thresholdEndpoints'
import { THEIL_SEN_FEW_DATES_COVERAGE } from './labels/qualityLabels'
import { patientMeasurementRecords } from '../core/patient/patientExport'
import { patientAttributesExportRows } from '../core/attributes/attributes'
import { patientIdKey, type LabRow, type PatientId } from '../core/types'
import { exportTimeOfDay, utcDateOrBlank } from '../core/format'
import { demographicWarningsByPatient } from '../core/demographics/describe'
import { fileStamp, sheetsToXlsxBytes, svgElementToString, type WorkbookSheet } from '../io/export'
import { COHORT_SHEET_HEADER, cohortColumnDirectoryRows, cohortSheetRow } from './cohort-sheet-columns'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import { akiRecoveryHours } from '../core/domains/nephrology/aki/akiModule'
import { akiEpisodeExportRows, akiEpisodeRows } from './aki-episodes'
import type { FitConfig } from '../core/analysis/fitConfig'
import { columnSettingModules, defaultColumnModuleSettings, type ColumnModuleSettings } from '../core/analysis/registry'
import { dataChecks, importDiagnosticRecords } from './import-diagnostics'

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
 * reduced as before, so a dataset without times keeps its identifier. */
export function inputDataId(rawMeasurementRows: readonly Record<string, unknown>[]): string {
  const rows = rawMeasurementRows.map(row => JSON.stringify([String(row.PatientID),row.Date,row.Parameter,row.Unit,row.Value,row.patient_sex ?? '',row.patient_age_at_lab ?? null,row.patient_birth_date ?? '',
    // The time of day joins only where a row has one, so rows without a time keep their identifier.
    ...(row.time_of_day ? [row.time_of_day] : [])])).sort()
  return hashString(`[${rows.join(',')}]`)
}

const seriesIdentity = (name: string | null, unit: string | null) => JSON.stringify([name,unit])

/** Fixed column lists of the sheets, so a sheet without rows still has its
 * header row and a script finds every column by name. `patient_attributes`
 * (one column per attribute) and `settings` (one column per module setting)
 * take their columns from their rows, which are never empty. The patient ID
 * is `PatientID` in every sheet, written as the import read it: a number for
 * a numeric ID, otherwise text. `patient_birth_date` is the birth date of
 * the imported lab row: filled in `raw_measurements` only, so that a
 * re-import keeps an exact birth date; the resolved date of the analysis is
 * `birth_anchor` in `demographics`. */
export const MEASUREMENT_SHEET_HEADER = ['PatientID','Date','Parameter','Unit','Value','NumericValue','Operator','origin','formula','patient_sex','patient_age_at_lab','demographics','loinc','patient_birth_date','time_of_day'] as const
export const EVENTS_SHEET_HEADER = ['PatientID','type','date','title','description','endDate','intent','warning'] as const
export const AKI_EPISODES_SHEET_HEADER = ['PatientID','creatinine_parameter','creatinine_unit','stage','onset_date','peak_date','peak_value_mg_dl','baseline_date','baseline_value_mg_dl','criterion','end_date','dialysis_start','ended_by_gap','last_value_date'] as const
export const DEMOGRAPHICS_SHEET_HEADER = ['PatientID','baseline_age','birth_anchor','age_estimated','manual_override','warnings'] as const
export const PARAMETERS_SHEET_HEADER = ['parameter_key','parameter','unit','origin','formula','source_parameter','source_unit','loinc'] as const
export const ROLLING_WINDOWS_SHEET_HEADER = ['PatientID','Parameter','Unit','window','window_start','window_end','first_date','last_date','n','slope'] as const
export const IMPORT_DIAGNOSTICS_SHEET_HEADER = ['source','sheet','kind','row','patient_id','date','parameter','value','message'] as const

/** All sheets share the supplied visible scope; summaries are never fitted again. */
export function workspaceWorkbookSheets({data,parameterKeys,patientIds,cohortRows,patientId,fitConfigByParameterKey,moduleSettingsByParameterKey,groupBy = '',exportedAt = new Date(),exportId = crypto.randomUUID()}: WorkspaceExportInput): WorkbookSheet[] {
  const requestedKeys = [...new Set(parameterKeys)]
  const parameters = requestedKeys.map(key => data.parameters.find(parameter => parameter.key === key))
  if (!parameters.length || parameters.some(parameter => !parameter)) throw new Error('No valid parameters selected for export.')
  const selectedParameters = parameters.filter(parameter => parameter !== undefined)
  const knownPatients = new Set(data.patients.map(patient => patient.id))
  const visibleIds = [...new Set(patientIds)].filter(id => knownPatients.has(id))
  const ids = patientId === undefined ? visibleIds : visibleIds.filter(id => id === patientId)
  if (!ids.length) throw new Error('No patients available in the current selection.')
  const idSet = new Set(ids)
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
  const measurementRows = (rows: LabRow[], raw = false) => scopedRows(rows).flatMap(row => {
    const parameter = bySeries.get(seriesIdentity(row.bezeichnung,row.einheit))!
    return patientMeasurementRecords([row],row.patientId).map(record => ({
      PatientID:record.PatientID,Date:utcDateOrBlank(row.labDatum),Parameter:record.Bezeichnung,Unit:record.Einheit,Value:record.Wert,NumericValue:record.WertNum === '' ? null : record.WertNum,Operator:record.Operator,
      origin:!raw && parameter.derived ? 'derived' : 'imported',
      formula:!raw && parameter.derived ? data.analysisSettings.egfr.formula : '',
      patient_sex:row.patientSex ?? '',patient_age_at_lab:row.patientAgeAtLab,
      demographics:raw ? 'as imported' : 'resolved analysis values',
      // Appended 2026-11-21; empty for derived values and rows without a code.
      loinc:row.loinc ?? '',
      patient_birth_date:raw ? utcDateOrBlank(row.patientBirthDate ?? null) : '',
      // Appended 2026-11-22: the time of day of the lab date, empty when the file gave none.
      time_of_day:exportTimeOfDay(row.labTime),
    }))
  })
  const attrs = Object.fromEntries(ids.map(id => [patientIdKey(id),data.patientAttributes[patientIdKey(id)] ?? {}]))
  const demographicWarnings = demographicWarningsByPatient(data.analysis.messages)
  const warningsFor = (id: PatientId) => demographicWarnings.get(patientIdKey(id)) ?? []
  const conflictKeys = new Set(ids.filter(id => warningsFor(id).length > 0).map(patientIdKey))
  const specs = workspaceSpecs(data,requestedKeys,fitConfigByParameterKey)
  const columnSettings = (key: string): ColumnModuleSettings => moduleSettingsByParameterKey?.[key] ?? defaultColumnModuleSettings()
  const patientById = new Map(data.patients.map(patient => [patient.id,patient]))
  // Sex, baseline age and the group follow the columns of earlier releases;
  // `group` is always last and empty without grouping (decided 2026-11-21).
  const summaries = cohortExportRecords(prepared,cellIndex => columnSettings(requestedKeys[cellIndex]),conflictKeys).map((record,index) => {
    const {group,...fields} = cohortSheetRecord(record,prepared[Math.floor(index / selectedParameters.length)].cells[index % selectedParameters.length])
    const patient = patientById.get(record.PatientID)
    return cohortSheetRow({...fields,sex:patient?.attributes.sex ?? '',baseline_age:patient?.baselineAge ?? null,group:group ?? ''})
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
  return [
    {name:'measurements',header:MEASUREMENT_SHEET_HEADER,rows:measurementRows(data.rows)},
    {name:'raw_measurements',header:MEASUREMENT_SHEET_HEADER,rows:rawMeasurements},
    {name:patientId === undefined ? 'cohort' : 'slopes',header:COHORT_SHEET_HEADER,rows:summaries},
    {name:'events',header:EVENTS_SHEET_HEADER,rows:data.events.filter(event => idSet.has(event.patientId)).map(event => ({PatientID:event.patientId,type:event.type,date:utcDateOrBlank(event.date),title:event.title,description:event.description,endDate:utcDateOrBlank(event.endDate),intent:event.intent,warning:event.warning}))},
    {name:'aki_episodes',header:AKI_EPISODES_SHEET_HEADER,rows:akiEpisodeExportRows(akiEpisodeRows(data.rows.filter(row => idSet.has(row.patientId)),data.events,akiRecoveryHours(data.analysisSettings)))},
    {name:'patient_attributes',rows:patientAttributesExportRows(attrs,key => idByKey.get(key) ?? key)},
    {name:'demographics',header:DEMOGRAPHICS_SHEET_HEADER,rows:ids.map(id => {
      const patient = patientById.get(id)
      return {PatientID:id,baseline_age:patient?.baselineAge ?? null,birth_anchor:utcDateOrBlank(patient?.birthAnchor ?? null),age_estimated:patient?.ageEstimated ?? null,manual_override:JSON.stringify(data.manualDemographics[patientIdKey(id)] ?? {}),warnings:warningsFor(id).join('; ')}
    })},
    {name:'parameters',header:PARAMETERS_SHEET_HEADER,rows:selectedParameters.map(parameter => ({parameter_key:parameter.key,parameter:parameter.bezeichnung,unit:parameter.einheit ?? '',origin:parameter.derived ? 'derived' : 'imported',formula:parameter.derived ? data.analysisSettings.egfr.formula : '',source_parameter:parameter.derived ? data.analysisSettings.egfr.source?.[0] ?? '' : '',source_unit:parameter.derived ? data.analysisSettings.egfr.source?.[1] ?? '' : '',
      // Appended 2026-11-21: the distinct codes of the parameter's imported rows, whatever patients are selected.
      loinc:parameter.derived ? '' : [...new Set(data.rawRows.filter(row => row.loinc !== null && seriesIdentity(row.bezeichnung,row.einheit) === seriesIdentity(parameter.bezeichnung,parameter.einheit)).map(row => row.loinc))].join('; ')}))},
    {name:'settings',rows:specs.map((spec,index) => ({parameter_key:requestedKeys[index],parameter:spec.bezeichnung,unit:spec.einheit ?? '',mode:spec.mode,fit_config:JSON.stringify(exportedFitConfig(spec.fitConfig)),...moduleSettingColumns(requestedKeys[index]),analysis_settings:JSON.stringify(data.analysisSettings),patient_ids:JSON.stringify(ids),source_file:data.fileName ?? '',scope:patientId === undefined ? 'visible cohort' : 'selected patient',
      // Appended 2026-11-22: the grouping attribute behind the group column, empty without grouping.
      group_by:groupBy}))},
    {name:'about',rows:[...EXPORT_DISCLAIMER_ROWS,
      // Only this workbook has the column, so the note is not in the shared rows.
      {note:'endpoint_percent_change is the total eGFR change in percent from the first to the latest eligible measurement, with the sign the badge in the app shows: negative when eGFR fell, positive when it rose. It is not a rate per year and not the confirmed 40 % or 57 % decline event. Until 2026-11-16 the column was named endpoint_percent_decline and had the opposite sign.'},
      {note:'Research use only. Not for clinical decision-making.'},
      {note:'Measurements, summaries, events and attributes are restricted to the selected patients and parameters. Events and attributes apply at patient level.'},
      {note:'measurements contains analysis values with resolved demographics and explicitly marked derived values; raw_measurements contains only imported values for the selected parameters. Unselected source measurements are not added.'},
      {note:'aki_episodes lists every AKI episode detected for the selected patients, one row per episode and serum creatinine parameter, whichever parameters are selected and whether or not a column excludes AKI windows from its fit. Automated KDIGO creatinine screening, not a diagnosis; creatinine values in mg/dl. A new episode starts only after creatinine was back below the KDIGO criterion for the recovery length, aki.recoveryHours in analysis_settings of the settings sheet (48 hours by default: no crossing on the two calendar days after a value below it, none of them under dialysis), or after more than seven days without creatinine values outside dated acute dialysis intervals; end_date is the date of the first value back below it; it is empty while the episode is still open at the last value and when such a gap ended it (ended_by_gap true: the first value after the gap is not compared with any earlier value, so no recovery was observed). last_value_date is the date of the last value of the episode before its end. dialysis_start is the first dialysis starting between onset and end_date, or, when end_date is empty, up to the recovery length (two days by default) after last_value_date, with its intent; it does not change the stage.'},
      {note:'Slopes and quality information come directly from the displayed summary; export does not refit the data. n counts raw measurements; n_fitted counts the points actually fitted.'},
      {note:`ci_low and ci_high are the 95 % interval of the slope. For a Theil-Sen fit with n_fitted_dates below ${MIN_THEIL_SEN_PROJECTION_DATES} they are Theil-Sen bounds, not a 95 % interval. ${THEIL_SEN_FEW_DATES_COVERAGE}.`},
      {note:'Measurements marked < or > are bounds. Their numeric limits remain in raw and chart data, but these rows are excluded from fits, endpoints, AKI detection and cohort mixed models.'},
      {note:'loinc is the LOINC code as imported (measurements, raw_measurements) and the distinct codes of a parameter (parameters). Codes do not separate or join parameters, with one exception: creatinine with a urine code (2161-8, 14683-7) is a parameter of its own, named with the code, and is not used for AKI detection or eGFR.'},
      {note:'import_diagnostics lists what the import reported for lab values, events and attributes (rejected rows and warnings) and the rows behind the data checks of the Data page (values without a date or a number, implausible serum creatinine). Lines about patients outside this export are left out; all parameters are covered, not only the selected ones. row is the row in the source file (header row = 1); a collective warning has one line per affected row. The sheet is empty when there is nothing to report.'},
      {note:'rolling_windows lists the fitted windows of every Rolling OLS column, one row per window: window_start and window_end are the bounds of the window (both days included), first_date and last_date the dates of the first and last fitted point inside, n their number, slope the OLS slope of the window per year, unrounded. A fitted point is a measurement; with monthly or quarterly medians as time balancing (see the settings sheet) it is the median of one calendar month or quarter, dated to one of its measurement days, so n counts medians and a measurement outside the window bounds can enter through the median of its period. The sheet is empty when no selected parameter uses Rolling OLS. The reported slope stays the global OLS slope.'},
      {note:`The columns sheet describes every column of the ${patientId === undefined ? 'cohort' : 'slopes'} sheet: meaning, unit and when the cell is empty. first_eligible_value and last_eligible_value are the measured values at first_eligible_date and last_eligible_date: exact values before the first kidney transplant or chronic dialysis, whatever the fit settings. last_eligible_value can therefore differ from "latest" in the Trajectories table, which is the last dated numeric value of the series.`},
      {note:'The patient ID is in column PatientID in every sheet (until 2026-11-21: patientId in events, patient_attributes and demographics). group is always the last column of the cohort sheet and empty when the table was not grouped; group_by, the last column of settings, names the attribute it was grouped by (empty without grouping). A number without a value is an empty cell.'},
      {note:'Time axis of the trend: every slope is fitted on the time in years (365.25 days) since the first fitted measurement of the patient and parameter, whose date is index_date. slope is the change per year and intercept is the fitted value at index_date, not at age 0 or at a calendar origin. The axis chosen for the charts (age, calendar date, time since first measurement) changes the drawing only. fit_config no longer carries the entry xAxis (until 2026-11-21 it did, with "age" for the CKD progression preset); no fit ever read it.'},
      {note:'preset in fit_config records how the settings were selected: a preset of the app, or custom after any setting was changed by hand. The Theil-Sen preset is written as theil_sen (until 2026-11-21 as custom). The other entries of fit_config, the settings sheet and the columns of the result sheet determine the computation; two files with the same entries and a different preset name were computed the same way.'},
      {note:`Fixed parameters that fit_config does not carry: Segmented OLS (slope_mode gap-split) starts a new segment where two consecutive fitted points are more than ${SEGMENT_GAP_DAYS} days apart and fits a segment of at least ${SEGMENT_MIN_POINTS} points; slope, intercept, r2 and the bounds are those of the global OLS fit across all segments. Rolling OLS: see rolling_window_days and rolling_step_days in the result sheet.`},
      {note:`This file contains personal data and details of its origin. The patient IDs are written as imported, not pseudonymised: in column PatientID of every sheet and in settings (patient_ids). The measurement sheets hold dated values, sex and age, and raw_measurements the birth date where the imported lab rows carried one (patient_birth_date); demographics holds birth_anchor, a birth date (estimated from the stated age where age_estimated is true); events and patient_attributes hold the imported texts and attributes. settings names the imported file (source_file). Check these fields before passing the file on.`},
      {note:'patient_birth_date is the last column of the measurement sheets. In raw_measurements it holds the birth date of the imported lab row, so that loading this file again keeps an exact birth date; where the import had no birth date it is empty, and patient_age_at_lab is then the stated age. In measurements it is empty: the birth date used by the analysis is birth_anchor in demographics.'},
      {note:'Date holds the calendar day and time_of_day, the last column of the measurement sheets, the time of day of the imported lab date (HH:MM:SS), empty where the file gave none; a time of 00:00 counts as none. Derived values have no time. Where the imported file gave times, they ordered several serum creatinine values of one day in AKI detection. Loading this file again reads time_of_day from raw_measurements, so the AKI episodes are the same as in this export. input_data_id covers the time of day of the rows that have one (until 2026-11-22 the time was in no sheet).'},
      {note:`app_version: ${APP_VERSION}`},
      {note:`exported_at: ${exportedAt.toISOString()}`},
      {note:`export_id: ${exportId}`},
      {note:`input_data_id: ${inputDataId(rawMeasurements)}`},
      {note:'app_version is the version of Lab Trajectory Explorer that computed and wrote this file; exported_at is the time of the export in UTC; export_id is a random identifier of this file. input_data_id identifies the imported measurements in the exported scope (the rows of raw_measurements: patient, date, parameter, unit, value, sex, stated age, imported birth date and time of day; a 32-bit checksum, independent of row order and of the settings): two exports with the same input_data_id were computed from the same imported rows. Events, attributes and manual demographic entries are not part of it.'},
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
