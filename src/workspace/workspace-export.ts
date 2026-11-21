import { cohortExportRecords, cohortSheetRecord, EXPORT_DISCLAIMER_ROWS, type CohortRow } from '../core/cohort/screening'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../core/endpoints/thresholdEndpoints'
import { THEIL_SEN_FEW_DATES_COVERAGE } from './labels/qualityLabels'
import { patientMeasurementRecords } from '../core/patient/patientExport'
import { patientAttributesExportRows } from '../core/attributes/attributes'
import { patientIdKey, type LabRow, type PatientId } from '../core/types'
import { utcDateOrBlank } from '../core/format'
import { demographicWarningsByPatient } from '../core/demographics/describe'
import { fileStamp, sheetsToXlsxBytes, svgElementToString, type WorkbookSheet } from '../io/export'
import { COHORT_SHEET_HEADER, cohortColumnDirectoryRows, cohortSheetRow } from './cohort-sheet-columns'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import { akiEpisodeExportRows, akiEpisodeRows } from './aki-episodes'
import type { FitConfig } from '../core/analysis/fitConfig'
import { columnSettingModules, defaultColumnModuleSettings, type ColumnModuleSettings } from '../core/analysis/registry'

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
}

const seriesIdentity = (name: string | null, unit: string | null) => JSON.stringify([name,unit])

/** Fixed column lists of the sheets, so a sheet without rows still has its
 * header row and a script finds every column by name. `patient_attributes`
 * (one column per attribute) and `settings` (one column per module setting)
 * take their columns from their rows, which are never empty. The patient ID
 * is `PatientID` in every sheet, written as the import read it: a number for
 * a numeric ID, otherwise text. */
export const MEASUREMENT_SHEET_HEADER = ['PatientID','Date','Parameter','Unit','Value','NumericValue','Operator','origin','formula','patient_sex','patient_age_at_lab','demographics'] as const
export const EVENTS_SHEET_HEADER = ['PatientID','type','date','title','description','endDate','intent','warning'] as const
export const AKI_EPISODES_SHEET_HEADER = ['PatientID','creatinine_parameter','creatinine_unit','stage','onset_date','peak_date','peak_value_mg_dl','baseline_date','baseline_value_mg_dl','criterion'] as const
export const DEMOGRAPHICS_SHEET_HEADER = ['PatientID','baseline_age','birth_anchor','age_estimated','manual_override','warnings'] as const
export const PARAMETERS_SHEET_HEADER = ['parameter_key','parameter','unit','origin','formula','source_parameter','source_unit'] as const

/** All sheets share the supplied visible scope; summaries are never fitted again. */
export function workspaceWorkbookSheets({data,parameterKeys,patientIds,cohortRows,patientId,fitConfigByParameterKey,moduleSettingsByParameterKey}: WorkspaceExportInput): WorkbookSheet[] {
  const requestedKeys = [...new Set(parameterKeys)]
  const parameters = requestedKeys.map(key => data.parameters.find(parameter => parameter.key === key))
  if (!parameters.length || parameters.some(parameter => !parameter)) throw new Error('No valid parameters selected for export.')
  const selectedParameters = parameters.filter(parameter => parameter !== undefined)
  const knownPatients = new Set(data.patients.map(patient => patient.id))
  const visibleIds = [...new Set(patientIds)].filter(id => knownPatients.has(id))
  const ids = patientId === undefined ? visibleIds : visibleIds.filter(id => id === patientId)
  if (!ids.length) throw new Error('No patients available in the current selection.')
  const idSet = new Set(ids)
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
  return [
    {name:'measurements',header:MEASUREMENT_SHEET_HEADER,rows:measurementRows(data.rows)},
    {name:'raw_measurements',header:MEASUREMENT_SHEET_HEADER,rows:measurementRows(data.rawRows,true)},
    {name:patientId === undefined ? 'cohort' : 'slopes',header:COHORT_SHEET_HEADER,rows:summaries},
    {name:'events',header:EVENTS_SHEET_HEADER,rows:data.events.filter(event => idSet.has(event.patientId)).map(event => ({PatientID:event.patientId,type:event.type,date:utcDateOrBlank(event.date),title:event.title,description:event.description,endDate:utcDateOrBlank(event.endDate),intent:event.intent,warning:event.warning}))},
    {name:'aki_episodes',header:AKI_EPISODES_SHEET_HEADER,rows:akiEpisodeExportRows(akiEpisodeRows(data.rows.filter(row => idSet.has(row.patientId)),data.events))},
    {name:'patient_attributes',rows:patientAttributesExportRows(attrs,key => idByKey.get(key) ?? key)},
    {name:'demographics',header:DEMOGRAPHICS_SHEET_HEADER,rows:ids.map(id => {
      const patient = patientById.get(id)
      return {PatientID:id,baseline_age:patient?.baselineAge ?? null,birth_anchor:utcDateOrBlank(patient?.birthAnchor ?? null),age_estimated:patient?.ageEstimated ?? null,manual_override:JSON.stringify(data.manualDemographics[patientIdKey(id)] ?? {}),warnings:warningsFor(id).join('; ')}
    })},
    {name:'parameters',header:PARAMETERS_SHEET_HEADER,rows:selectedParameters.map(parameter => ({parameter_key:parameter.key,parameter:parameter.bezeichnung,unit:parameter.einheit ?? '',origin:parameter.derived ? 'derived' : 'imported',formula:parameter.derived ? data.analysisSettings.egfr.formula : '',source_parameter:parameter.derived ? data.analysisSettings.egfr.source?.[0] ?? '' : '',source_unit:parameter.derived ? data.analysisSettings.egfr.source?.[1] ?? '' : ''}))},
    {name:'settings',rows:specs.map((spec,index) => ({parameter_key:requestedKeys[index],parameter:spec.bezeichnung,unit:spec.einheit ?? '',mode:spec.mode,fit_config:JSON.stringify(spec.fitConfig ?? {}),...moduleSettingColumns(requestedKeys[index]),analysis_settings:JSON.stringify(data.analysisSettings),patient_ids:JSON.stringify(ids),source_file:data.fileName ?? '',scope:patientId === undefined ? 'visible cohort' : 'selected patient'}))},
    {name:'about',rows:[...EXPORT_DISCLAIMER_ROWS,
      // Only this workbook has the column, so the note is not in the shared rows.
      {note:'endpoint_percent_change is the total eGFR change in percent from the first to the latest eligible measurement, with the sign the badge in the app shows: negative when eGFR fell, positive when it rose. It is not a rate per year and not the confirmed 40 % or 57 % decline event. Until 2026-11-16 the column was named endpoint_percent_decline and had the opposite sign.'},
      {note:'Research use only. Not for clinical decision-making.'},
      {note:'Measurements, summaries, events and attributes are restricted to the selected patients and parameters. Events and attributes apply at patient level.'},
      {note:'measurements contains analysis values with resolved demographics and explicitly marked derived values; raw_measurements contains only imported values for the selected parameters. Unselected source measurements are not added.'},
      {note:'aki_episodes lists every AKI episode detected for the selected patients, one row per episode and serum creatinine parameter, whichever parameters are selected and whether or not a column excludes AKI windows from its fit. Automated KDIGO creatinine screening, not a diagnosis; creatinine values in mg/dl.'},
      {note:'Slopes and quality information come directly from the displayed summary; export does not refit the data. n counts raw measurements; n_fitted counts the points actually fitted.'},
      {note:`ci_low and ci_high are the 95 % interval of the slope. For a Theil-Sen fit with n_fitted_dates below ${MIN_THEIL_SEN_PROJECTION_DATES} they are Theil-Sen bounds, not a 95 % interval. ${THEIL_SEN_FEW_DATES_COVERAGE}.`},
      {note:'Measurements marked < or > are bounds. Their numeric limits remain in raw and chart data, but these rows are excluded from fits, endpoints, AKI detection and cohort mixed models.'},
      {note:`The columns sheet describes every column of the ${patientId === undefined ? 'cohort' : 'slopes'} sheet: meaning, unit and when the cell is empty. first_eligible_value and last_eligible_value are the measured values at first_eligible_date and last_eligible_date: exact values before the first kidney transplant or chronic dialysis, whatever the fit settings. last_eligible_value can therefore differ from "latest" in the Trajectories table, which is the last dated numeric value of the series.`},
      {note:'The patient ID is in column PatientID in every sheet (until 2026-11-21: patientId in events, patient_attributes and demographics). group is always the last column of the cohort sheet and empty when the table was not grouped; a number without a value is an empty cell.'},
    ]},
    // Sheets added later follow the earlier ones, so sheet positions stay.
    {name:'columns',header:['column','meaning','unit','empty_when'],rows:cohortColumnDirectoryRows()},
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
