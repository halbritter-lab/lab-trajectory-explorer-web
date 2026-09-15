import { cohortExportRecords, EXPORT_DISCLAIMER_ROWS, type CohortRow } from '../core/cohort/screening'
import { patientMeasurementRecords } from '../core/patient/patientExport'
import { patientAttributesExportRows } from '../core/attributes/attributes'
import { patientIdKey, type LabRow, type PatientId } from '../core/types'
import { fileStamp, sheetsToXlsxBytes, svgElementToString } from '../io/export'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import type { FitConfig } from '../core/fitPipeline/types'
import { isRapidEgfrDecline } from '../core/analysis/rapidEgfrDeclineModule'

export interface WorkspaceExportInput {
  data: WorkspaceData
  parameterKeys: string[]
  patientIds: PatientId[]
  cohortRows: CohortRow[]
  patientId?: PatientId
  fitConfigByParameterKey?: Record<string, FitConfig>
  rapidEgfrThresholdByParameterKey?: Record<string, number>
}

const seriesIdentity = (name: string | null, unit: string | null) => JSON.stringify([name,unit])
function utcDate(date: Date | null): string {
  if (!date || !Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0,10)
}

/** All sheets share the supplied visible scope; summaries are never fitted again. */
export function workspaceWorkbookSheets({data,parameterKeys,patientIds,cohortRows,patientId,fitConfigByParameterKey,rapidEgfrThresholdByParameterKey}: WorkspaceExportInput): {name:string;rows:object[]}[] {
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
      PatientID:record.PatientID,Date:utcDate(row.labDatum),Parameter:record.Bezeichnung,Unit:record.Einheit,Value:record.Wert,NumericValue:record.WertNum,Operator:record.Operator,
      origin:!raw && parameter.derived ? 'derived' : 'imported',
      formula:!raw && parameter.derived ? data.analysisSettings.egfr.formula : '',
      patient_sex:row.patientSex ?? '',patient_age_at_lab:row.patientAgeAtLab,
      demographics:raw ? 'as imported' : 'resolved analysis values',
    }))
  })
  const attrs = Object.fromEntries(ids.map(id => [patientIdKey(id),data.patientAttributes[patientIdKey(id)] ?? {}]))
  // conflictId's documented contract preserves colons inside IDs after segment two.
  const demographicWarnings = data.analysis.messages.filter(message => message.id.startsWith('demographics:'))
  const warningsFor = (id: PatientId) => demographicWarnings.filter(message => message.id.split(':').slice(2).join(':') === patientIdKey(id)).map(message => message.text)
  const conflictKeys = new Set(ids.filter(id => warningsFor(id).length > 0).map(patientIdKey))
  const specs = workspaceSpecs(data,requestedKeys,fitConfigByParameterKey)
  const summaries = cohortExportRecords(prepared,0,conflictKeys).map((record,index) => {
    const cell = prepared[Math.floor(index / selectedParameters.length)].cells[index % selectedParameters.length]
    const threshold = rapidEgfrThresholdByParameterKey?.[requestedKeys[index % selectedParameters.length]] ?? 5
    const {Bezeichnung,Einheit,...fields} = record
    return {...fields,Parameter:Bezeichnung,Unit:Einheit,n_fitted:cell.nFitted,fitted_span_days:cell.fittedSpanDays,rapid_progression:isRapidEgfrDecline(cell.einheit,cell.slope,threshold) ? 'yes' : ''}
  })
  return [
    {name:'measurements',rows:measurementRows(data.rows)},
    {name:'raw_measurements',rows:measurementRows(data.rawRows,true)},
    {name:patientId === undefined ? 'cohort' : 'slopes',rows:summaries},
    {name:'events',rows:data.events.filter(event => idSet.has(event.patientId)).map(event => ({...event,date:utcDate(event.date),endDate:utcDate(event.endDate)}))},
    {name:'patient_attributes',rows:patientAttributesExportRows(attrs)},
    {name:'demographics',rows:ids.map(id => {
      const patient = data.patients.find(patient => patient.id === id)
      return {patientId:id,baseline_age:patient?.baselineAge ?? null,birth_anchor:utcDate(patient?.birthAnchor ?? null),age_estimated:patient?.ageEstimated ?? null,manual_override:JSON.stringify(data.manualDemographics[patientIdKey(id)] ?? {}),warnings:warningsFor(id).join('; ')}
    })},
    {name:'parameters',rows:selectedParameters.map(parameter => ({parameter_key:parameter.key,parameter:parameter.bezeichnung,unit:parameter.einheit ?? '',origin:parameter.derived ? 'derived' : 'imported',formula:parameter.derived ? data.analysisSettings.egfr.formula : '',source_parameter:parameter.derived ? data.analysisSettings.egfr.source?.[0] ?? '' : '',source_unit:parameter.derived ? data.analysisSettings.egfr.source?.[1] ?? '' : ''}))},
    {name:'settings',rows:specs.map((spec,index) => ({parameter_key:requestedKeys[index],parameter:spec.bezeichnung,unit:spec.einheit ?? '',mode:spec.mode,fit_config:JSON.stringify(spec.fitConfig ?? {}),rapid_egfr_threshold:rapidEgfrThresholdByParameterKey?.[requestedKeys[index]] ?? 5,analysis_settings:JSON.stringify(data.analysisSettings),patient_ids:JSON.stringify(ids),source_file:data.fileName ?? '',scope:patientId === undefined ? 'visible cohort' : 'selected patient'}))},
    {name:'about',rows:[...EXPORT_DISCLAIMER_ROWS,
      {note:'Research use only. Not for clinical decision-making.'},
      {note:'Measurements, summaries, events and attributes are restricted to the selected patients and parameters. Events and attributes apply at patient level.'},
      {note:'measurements contains analysis values with resolved demographics and explicitly marked derived values; raw_measurements contains only imported values for the selected parameters. Unselected source measurements are not added.'},
      {note:'Slopes and quality information come directly from the displayed summary; export does not refit the data. n counts raw measurements; n_fitted counts the points actually fitted.'},
    ]},
  ]
}

export function workspaceWorkbookBytes(input: WorkspaceExportInput): Uint8Array {
  return sheetsToXlsxBytes(workspaceWorkbookSheets(input))
}

export function safeExportFilename(title: string, extension: 'xlsx'|'svg'|'png'): string {
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
      const value = style.getPropertyValue(property) || text.getAttribute(property) || fallback
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
  const lines = ['Lab Trajectory Explorer · Research use only.', 'Not for clinical decision-making.'].flatMap(line => wrapChartText(line,Math.max(1,Math.floor((width-24)/11))))
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
  description.textContent = 'Lab Trajectory Explorer · Research use only. Not for clinical decision-making.'
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
