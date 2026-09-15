import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { exportFixture } from './export-fixture'
import process from 'node:process'


import { workspaceWorkbookBytes, exportChartSvg, safeExportFilename } from '../../src/workspace/workspace-export'
import { defaultFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'

function records(workbook: XLSX.WorkBook, name: string) {return XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets[name])}

describe('workspace workbook', () => {
  it('exports each column model and rapid-decline threshold with matching flags', () => {
    const input = exportFixture()
    const first = input.data.parameters.find(p => p.key === input.parameterKeys[0])!
    const second = input.data.parameters.find(p => p.key === input.parameterKeys[1])!
    const cell = input.cohortRows[0].cells.find(c => c.bezeichnung === second.bezeichnung)!
    cell.slope = -8
    const configs = {
      [first.key]: toFitConfig(defaultFitSettings(), first),
      [second.key]: toFitConfig(defaultFitSettings('theil_sen'), second),
    }
    for (const threshold of [5, 10]) {
      const workbook = XLSX.read(workspaceWorkbookBytes({ ...input, fitConfigByParameterKey: configs,
        rapidEgfrThresholdByParameterKey: { [first.key]: 5, [second.key]: threshold },
      }), { type: 'array' })
      const settings = records(workbook, 'settings')
      expect(JSON.parse(String(settings[0].fit_config)).fitModel).toBe('ols')
      expect(JSON.parse(String(settings[1].fit_config)).fitModel).toBe('theil-sen')
      expect(settings[1].rapid_egfr_threshold).toBe(threshold)
      expect(records(workbook, 'cohort').find(row => row.Parameter === second.bezeichnung)?.rapid_progression).toBe(threshold === 5 ? 'yes' : '')
    }
  })
  it('preserves UTC import dates in a negative-offset timezone', () => {
    const previous = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      const midnight = new Date('2024-01-01T00:00:00.000Z')
      expect(midnight.getDate()).toBe(31)
      const input = exportFixture()
      input.data.rows.forEach(row => { row.labDatum = midnight })
      input.data.events[0].date = midnight
      input.data.events[0].endDate = new Date('2024-01-03T00:00:00.000Z')
      const workbook = XLSX.read(workspaceWorkbookBytes(input),{type:'array'})
      expect(records(workbook,'measurements')[0].Date).toBe('2024-01-01')
      expect(records(workbook,'raw_measurements')[0].Date).toBe('2024-01-01')
      expect(records(workbook,'events')[0]).toMatchObject({date:'2024-01-01',endDate:'2024-01-03'})
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
  })
  it('retains patient-scoped demographic conflict warnings in summaries and provenance', () => {
    const input = exportFixture()
    input.data.patients[0].birthAnchor = new Date('1969-05-06T00:00:00Z')
    input.data.patients[0].ageEstimated = true
    input.data.analysis.messages = [
      {id:'demographics:sex_tie:001-A',severity:'warning',text:'Conflicting recorded sex'},
      {id:'demographics:sex_tie:hidden',severity:'warning',text:'SECRET'},
    ]
    const workbook = XLSX.read(workspaceWorkbookBytes(input),{type:'array'})
    expect(records(workbook,'cohort')[0]).toMatchObject({demographics_conflict:'yes'})
    expect(records(workbook,'demographics')[0]).toMatchObject({warnings:'Conflicting recorded sex',birth_anchor:'1969-05-06',age_estimated:true})
    expect(JSON.stringify(Object.values(workbook.Sheets))).not.toContain('SECRET')
  })
  it('roundtrips the visible scope with actual prepared summaries and derived provenance', () => {
    const input = exportFixture()
    input.cohortRows[0].cells[0].slope = 123.456 // Proves the supplied displayed summary is reused.
    const workbook = XLSX.read(workspaceWorkbookBytes(input),{type:'array'})
    expect(records(workbook,'measurements')).toHaveLength(2)
    expect(records(workbook,'measurements')).toEqual(expect.arrayContaining([expect.objectContaining({PatientID:'001-A',Parameter:'Marker|one',Unit:'mg/L',NumericValue:10,origin:'imported'}),expect.objectContaining({Parameter:'Derived eGFR',origin:'derived',formula:'ekfc-2021'})]))
    expect(records(workbook,'raw_measurements')).toHaveLength(1)
    expect(records(workbook,'cohort')[0]).toMatchObject({PatientID:'001-A',slope:123.456})
    expect(records(workbook,'events')).toEqual([expect.objectContaining({patientId:'001-A',title:'Visit'})])
    expect(JSON.stringify(Object.values(workbook.Sheets))).not.toContain('SECRET')
    expect(JSON.stringify(Object.values(workbook.Sheets))).not.toContain('hidden')
    expect(records(workbook,'parameters')).toEqual(expect.arrayContaining([expect.objectContaining({formula:'ekfc-2021',source_parameter:'Creatinine',source_unit:'mg/dl'})]))
    expect(records(workbook,'about').some(row => String(row.note).includes('Research use only'))).toBe(true)
  })
  it('intersects individual selection with visible IDs and rejects empty or missing summaries', () => {
    const input = exportFixture()
    const workbook = XLSX.read(workspaceWorkbookBytes({...input,patientId:'001-A'}),{type:'array'})
    expect(records(workbook,'slopes')).toHaveLength(2)
    expect(() => workspaceWorkbookBytes({...input,patientId:'hidden'})).toThrow(/patients|selection/)
    expect(() => workspaceWorkbookBytes({...input,parameterKeys:[]})).toThrow(/parameters/)
    expect(() => workspaceWorkbookBytes({...input,cohortRows:[]})).toThrow(/summary/)
  })
  it('serializes custom fit configurations into the settings sheet', () => {
    const input = exportFixture()
    const customConfig = {
      parameter: { bezeichnung: 'Marker|one', einheit: 'mg/L' },
      preset: 'custom' as const,
      xAxis: 'calendar_time' as const,
      censoring: { censorAfterKidneyTransplant: true, censorAfterChronicDialysis: false, excludeAcuteDialysisPeriods: false, unknownDialysisPolicy: 'flag-only' as const },
      exclusions: { excludeAkiWindows: true, akiExclusionDays: 14 },
      timeBalancing: 'monthly-median' as const,
      fitModel: 'theil-sen' as const,
      endpoints: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false },
    }
    const workbook = XLSX.read(workspaceWorkbookBytes({
      ...input,
      fitConfigByParameterKey: { [input.parameterKeys[0]]: customConfig },
    }), { type: 'array' })
    const settings = records(workbook, 'settings')
    expect(settings[0]).toMatchObject({
      parameter_key: input.parameterKeys[0],
    })
    expect(String(settings[0].fit_config)).toContain('"fitModel":"theil-sen"')
    expect(String(settings[0].fit_config)).toContain('"timeBalancing":"monthly-median"')
    expect(String(settings[0].fit_config)).toContain('"censorAfterKidneyTransplant":true')
  })
})

describe('chart serialization', () => {
  it('embeds visible parameter/unit, legend and context and standalone text styles', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
    svg.setAttribute('viewBox','0 0 200 100')
    svg.setAttribute('data-export-context','Calendar date · Group: Center · 2 patients')
    svg.setAttribute('data-export-legend',JSON.stringify([{label:'Nord',color:'#176c68'},{label:'Süd',color:'#487ca9'}]))
    const axis = document.createElementNS(svg.namespaceURI,'text')
    axis.textContent = '01.01.2024'
    svg.append(axis)
    const result = exportChartSvg(svg,'Very long marker [mg/L]')
    const parsed = new DOMParser().parseFromString(result.svg,'image/svg+xml')
    const text = [...parsed.querySelectorAll('text')].map(node => node.textContent).join(' ')
    expect(text).toContain('Very long marker [mg/L]')
    expect(text).toContain('Calendar date')
    expect(text).toContain('Nord')
    expect(text).toContain('Süd')
    expect(parsed.querySelector('text')?.getAttribute('font-family')).toBeTruthy()
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.querySelectorAll('rect[fill="#176c68"]')).toHaveLength(1)
    expect(result.height).toBeGreaterThan(144)
  })
  it('adds visible research attribution without mutating the displayed chart', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
    svg.setAttribute('viewBox','10 20 400 200')
    const path = document.createElementNS(svg.namespaceURI,'path')
    path.setAttribute('d','M0,0L20,20')
    svg.append(path)
    const exported = exportChartSvg(svg,'Marker <sample>')
    expect(exported.svg).toContain('Research use only')
    expect(exported.svg).toContain('Marker &lt;sample&gt;')
    expect(exported.height).toBeGreaterThan(200)
    expect(svg.outerHTML).not.toContain('Research use')
    expect(() => exportChartSvg(document.createElementNS(svg.namespaceURI,'svg') as SVGSVGElement,'empty')).toThrow(/chart/)
    expect(safeExportFilename('../Patient: A/B*?','svg')).not.toMatch(/[\\/:*?"<>|]/)
  })
})

