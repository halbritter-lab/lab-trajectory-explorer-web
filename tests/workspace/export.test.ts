import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { exportFixture } from './export-fixture'
import process from 'node:process'


import { workspaceWorkbookBytes, exportChartSvg, safeExportFilename } from '../../src/workspace/workspace-export'
import { defaultFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { resolveBirthAnchor } from '../../src/core/demographics/resolveAge'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { akiEpisodeRows } from '../../src/workspace/aki-episodes'
import type { WorkspaceData } from '../../src/workspace/workspace-data'

function records(workbook: XLSX.WorkBook, name: string) {return XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets[name])}

describe('workspace workbook', () => {
  it('loads again in the app: imported values from raw_measurements, events and attributes', () => {
    const input = exportFixture()
    const bound = input.data.rawRows.find(row => row.einheit === 'mg/L' && row.patientId === '001-A')!
    Object.assign(bound, { wert: '<10', wertOperator: '<' })
    const dataset = loadDatasetFromWorkbook(workspaceWorkbookBytes(input))
    // One imported row of the selected parameters; the derived eGFR row of `measurements` is not read back.
    expect(dataset.rows).toHaveLength(1)
    expect(dataset.rows[0]).toMatchObject({ patientId: '001-A', bezeichnung: 'Marker|one', einheit: 'mg/L', wert: '<10', wertNum: 10, wertOperator: '<', patientSex: 'w', patientAgeAtLab: 55 })
    expect(dataset.rows[0].labDatum?.toISOString().slice(0, 10)).toBe(bound.labDatum!.toISOString().slice(0, 10))
    expect(dataset.events).toEqual([expect.objectContaining({ patientId: '001-A', type: 'other', title: 'Visit' })])
    expect(dataset.patientAttributes).toEqual({ '001-A': { group: 'A' } })
    expect(dataset.diagnostics.filter(d => d.severity === 'rejected')).toEqual([])
  })
  // Review finding 2026-11-21: a file without a sex column and without attributes exports
  // patient_attributes with the ID column only, and that export could not be loaded.
  it('loads again when the dataset has no attributes: patient_attributes with the ID column only is skipped', () => {
    const csv = ['patientId,labDate,testName,unit,value', 'P1,2026-01-05,Kreatinin,mg/dl,1.0', 'P1,2026-03-05,Kreatinin,mg/dl,1.1', 'P2,2026-01-07,Kreatinin,mg/dl,0.8', 'P2,2026-04-07,Kreatinin,mg/dl,0.9'].join('\n')
    const first = loadDatasetFromWorkbook(new TextEncoder().encode(csv))
    expect(first.patientAttributes).toEqual({})
    const rows = first.rows
    const parameter = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }
    const data = { rawRows: rows, rows, fileName: 'plain.csv', parameters: [parameter], patients: ['P1', 'P2'].map(id => ({ id, label: id, attributes: {}, baselineAge: null })), events: [], patientAttributes: first.patientAttributes,
      analysis: { rows, messages: [], fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    const bytes = workspaceWorkbookBytes({ data, parameterKeys: [parameter.key], patientIds: ['P1', 'P2'], cohortRows: buildCohortRows(rows, ['P1', 'P2'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }]) })
    expect(records(XLSX.read(bytes, { type: 'array' }), 'patient_attributes')).toEqual([{ PatientID: 'P1' }, { PatientID: 'P2' }])
    const again = loadDatasetFromWorkbook(bytes)
    expect(again.rows.map(row => [row.patientId, row.labDatum?.toISOString().slice(0, 10), row.wertNum])).toEqual(rows.map(row => [row.patientId, row.labDatum?.toISOString().slice(0, 10), row.wertNum]))
    expect(again.patientAttributes).toEqual({})
    expect(again.diagnostics).toEqual([])
  })
  it('still rejects an attributes sheet without an ID column in a workbook', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['patientId', 'labDate', 'testName', 'unit', 'value'], ['P1', '2026-01-05', 'Kreatinin', 'mg/dl', 1]]), 'labs')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['genotype'], ['UMOD']]), 'attributes')
    expect(() => loadDatasetFromWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)).toThrow('Could not read this file. Patient attributes file missing required column: patientId.')
  })
  // Review finding 2026-11-21 (K26): the time of day orders creatinine values of one day in AKI
  // detection; until 2026-11-22 it was in no export, so a re-import lost an AKI episode.
  it('exports the time of day and reads it again, so a re-import keeps the AKI episode, and about says so', () => {
    const csv = ['patientId,labDate,testName,unit,value,sex,ageAtLab', 'RISE,2026-09-01 06:00,Kreatinin,mg/dl,1.0,f,60', 'RISE,2026-09-01 20:00,Kreatinin,mg/dl,1.6,f,60', 'RISE,2026-09-04 06:00,Kreatinin,mg/dl,1.2,f,60'].join('\n')
    const rows = loadDatasetFromWorkbook(new TextEncoder().encode(csv)).rows
    expect(rows.map(row => row.labTime)).toEqual([6 * 3_600_000, 20 * 3_600_000, 6 * 3_600_000])
    const parameter = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }
    const data = { rawRows: rows, rows, fileName: 'times.csv', parameters: [parameter], patients: [{ id: 'RISE', label: 'RISE', attributes: { sex: 'w' }, baselineAge: 60 }], events: [], patientAttributes: { RISE: { sex: 'w' } },
      analysis: { rows, messages: [], fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    const bytes = workspaceWorkbookBytes({ data, parameterKeys: [parameter.key], patientIds: ['RISE'], cohortRows: buildCohortRows(rows, ['RISE'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }]) })
    const workbook = XLSX.read(bytes, { type: 'array' })
    expect(records(workbook, 'aki_episodes')).toEqual([expect.objectContaining({ PatientID: 'RISE', onset_date: '2026-09-01', peak_value_mg_dl: 1.6 })])
    expect(records(workbook, 'raw_measurements').map(row => row.Date)).toEqual(['2026-09-01', '2026-09-01', '2026-09-04'])
    expect(records(workbook, 'raw_measurements').map(row => row.time_of_day)).toEqual(['06:00:00', '20:00:00', '06:00:00'])
    expect(records(workbook, 'measurements').map(row => row.time_of_day)).toEqual(['06:00:00', '20:00:00', '06:00:00'])
    const again = loadDatasetFromWorkbook(bytes).rows
    expect(again.map(row => row.labTime)).toEqual([6 * 3_600_000, 20 * 3_600_000, 6 * 3_600_000])
    expect(akiEpisodeRows(again, [])).toEqual(akiEpisodeRows(rows, []))
    expect(akiEpisodeRows(again, [])).toHaveLength(1)
    const note = records(workbook, 'about').map(row => String(row.note)).find(text => text.startsWith('Date holds the calendar day'))!
    expect(note).toContain('time_of_day, the last column of the measurement sheets')
    expect(note).toContain('Loading this file again reads time_of_day from raw_measurements, so the AKI episodes are the same as in this export')
    expect(note).toContain('input_data_id covers the time of day of the rows that have one')
  })
  it('writes an empty time_of_day for rows without a time and reads the column only from raw_measurements', () => {
    const rows = loadDatasetFromWorkbook(new TextEncoder().encode(['patientId,labDate,testName,unit,value', 'P1,2026-09-01,Kreatinin,mg/dl,1.0', 'P1,2026-09-02 07:30,Kreatinin,mg/dl,1.1'].join('\n'))).rows
    const parameter = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }
    const data = { rawRows: rows, rows, fileName: 'p1.csv', parameters: [parameter], patients: [{ id: 'P1', label: 'P1', attributes: {}, baselineAge: null }], events: [], patientAttributes: {},
      analysis: { rows, messages: [], fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    const bytes = workspaceWorkbookBytes({ data, parameterKeys: [parameter.key], patientIds: ['P1'], cohortRows: buildCohortRows(rows, ['P1'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }]) })
    expect(records(XLSX.read(bytes, { type: 'array' }), 'raw_measurements').map(row => row.time_of_day)).toEqual(['', '07:30:00'])
    expect(loadDatasetFromWorkbook(bytes).rows.map(row => row.labTime)).toEqual([undefined, 7.5 * 3_600_000])
    // A column of that name in any other lab file is not read.
    const other = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([['patientId', 'labDate', 'testName', 'unit', 'value', 'time_of_day'], ['P1', '2026-09-01', 'Kreatinin', 'mg/dl', 1, '06:00:00']]), 'labs')
    expect(loadDatasetFromWorkbook(XLSX.write(other, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).rows.map(row => row.labTime)).toEqual([undefined])
    // In raw_measurements: HH:MM, a fraction of a day and a workbook time cell; midnight and text that is no time are none; a time in the date wins.
    const own = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(own, XLSX.utils.aoa_to_sheet([['PatientID', 'Date', 'Parameter', 'Unit', 'Value', 'time_of_day'],
      ['P1', '2026-09-01', 'Kreatinin', 'mg/dl', 1, '6:15'], ['P1', '2026-09-02', 'Kreatinin', 'mg/dl', 1, 0.25], ['P1', '2026-09-03', 'Kreatinin', 'mg/dl', 1, '00:00:00'],
      ['P1', '2026-09-04', 'Kreatinin', 'mg/dl', 1, 'late'], ['P1', '2026-09-05 09:00', 'Kreatinin', 'mg/dl', 1, '06:00:00'], ['P1', '2026-09-06', 'Kreatinin', 'mg/dl', 1, '24:00']]), 'raw_measurements')
    XLSX.utils.book_append_sheet(own, XLSX.utils.aoa_to_sheet([['note']]), 'about')
    expect(loadDatasetFromWorkbook(XLSX.write(own, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).rows.map(row => row.labTime)).toEqual([6.25 * 3_600_000, 6 * 3_600_000, undefined, undefined, 9 * 3_600_000, undefined])
  })
  it('writes the imported birth date to raw_measurements, so a re-import keeps the exact birth-date anchor', () => {
    const input = exportFixture()
    const birth = new Date('1968-05-06T00:00:00Z')
    const [withBirth, withoutBirth] = input.data.rawRows.filter(row => row.patientId === '001-A' && row.bezeichnung === 'Marker|one')
    Object.assign(withBirth, { labDatum: new Date('2024-01-01T00:00:00Z'), patientBirthDate: birth })
    Object.assign(withoutBirth, { labDatum: new Date('2024-03-01T00:00:00Z'), patientBirthDate: null })
    const bytes = workspaceWorkbookBytes({ ...input, parameterKeys: ['marker', 'other-unit', 'derived'] })
    const workbook = XLSX.read(bytes, { type: 'array' })
    expect(records(workbook, 'raw_measurements').map(row => row.patient_birth_date)).toEqual(['1968-05-06', ''])
    // The analysis sheet leaves the column empty: the resolved date is birth_anchor in demographics.
    expect(records(workbook, 'measurements').map(row => row.patient_birth_date)).toEqual(['', '', ''])
    const dataset = loadDatasetFromWorkbook(bytes)
    expect(dataset.rows.map(row => row.patientBirthDate?.toISOString().slice(0, 10) ?? null)).toEqual(['1968-05-06', null])
    expect(dataset.diagnostics).toEqual([])
    const anchor = (rows: typeof dataset.rows) => resolveBirthAnchor({ patientId: '001-A', rows: rows.map(row => ({ labDatum: row.labDatum, ageAtLab: row.patientAgeAtLab, birthDate: row.patientBirthDate ?? null })), attributeBirthDate: null, manualAge: undefined }).birthAnchor
    expect(anchor(dataset.rows)).toEqual(birth)
    expect(anchor(dataset.rows)).toEqual(anchor([withBirth, withoutBirth]))
  })
  it('exports each column model and rapid-decline threshold with matching flags', () => {
    const input = exportFixture()
    const first = input.data.parameters.find(p => p.key === input.parameterKeys[0])!
    const second = input.data.parameters.find(p => p.key === input.parameterKeys[1])!
    const cell = input.cohortRows[0].cells.find(c => c.bezeichnung === second.bezeichnung)!
    // A supported slope: the flag is not set on one the reliability rule calls uncertain.
    Object.assign(cell, { slope: -8, reason: null, nFitted: 4, nFittedDates: 4, fittedSpanDays: 400 })
    const configs = {
      [first.key]: toFitConfig(defaultFitSettings(), first),
      [second.key]: toFitConfig(defaultFitSettings('theil_sen'), second),
    }
    for (const threshold of [5, 10]) {
      const workbook = XLSX.read(workspaceWorkbookBytes({ ...input, fitConfigByParameterKey: configs,
        moduleSettingsByParameterKey: { [first.key]: { rapidEgfrDecline: { threshold: 5 } }, [second.key]: { rapidEgfrDecline: { threshold } } },
      }), { type: 'array' })
      const settings = records(workbook, 'settings')
      expect(JSON.parse(String(settings[0].fit_config)).fitModel).toBe('ols')
      expect(JSON.parse(String(settings[1].fit_config)).fitModel).toBe('theil-sen')
      expect(settings[1].rapid_egfr_threshold).toBe(threshold)
      expect(records(workbook, 'cohort').find(row => row.Parameter === second.bezeichnung)?.rapid_progression).toBe(threshold === 5 ? 'yes' : '')
    }
  })
  it('carries an aki_episodes sheet and its note, also when no episode was detected', () => {
    const workbook = XLSX.read(workspaceWorkbookBytes(exportFixture()), { type: 'array' })
    expect(workbook.SheetNames).toContain('aki_episodes')
    expect(records(workbook, 'aki_episodes')).toEqual([])
    expect(records(workbook, 'about').some(row => String(row.note).startsWith('aki_episodes lists every AKI episode'))).toBe(true)
  })
  it('appends the LOINC code to measurements, raw_measurements and parameters, after the columns that existed before and before patient_birth_date', () => {
    const input = exportFixture()
    input.data.rawRows[0].loinc = '1988-5'
    input.data.rawRows[2].loinc = '30522-7'
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const header = (name: string) => XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1 })[0]
    expect(header('measurements')).toEqual(['PatientID', 'Date', 'Parameter', 'Unit', 'Value', 'NumericValue', 'Operator', 'origin', 'formula', 'patient_sex', 'patient_age_at_lab', 'demographics', 'loinc', 'patient_birth_date', 'time_of_day'])
    expect(header('raw_measurements')).toEqual(header('measurements'))
    expect(header('parameters')).toEqual(['parameter_key', 'parameter', 'unit', 'origin', 'formula', 'source_parameter', 'source_unit', 'loinc'])
    expect(records(workbook, 'raw_measurements').map(row => row.loinc)).toEqual(['1988-5'])
    expect(records(workbook, 'measurements').map(row => [row.origin, row.loinc ?? ''])).toEqual([['imported', '1988-5'], ['derived', '']])
    // The parameter lists every code of its imported rows, also those of patients outside the export.
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.parameters, { defval: '' }).map(row => [row.parameter_key, row.loinc])).toEqual([['marker', '1988-5; 30522-7'], ['derived', '']])
  })
  it('keeps the rolling columns last in the cohort sheet, after the columns that existed before', () => {
    const workbook = XLSX.read(workspaceWorkbookBytes(exportFixture()), { type: 'array' })
    const [header] = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.cohort, { header: 1 })
    expect(header.slice(61, 75)).toEqual(['n_fitted', 'fitted_span_days', 'rolling_window_days', 'rolling_step_days', 'rolling_windows', 'rolling_slope_min', 'rolling_slope_max',
      'index_date', 'last_fitted_date', 'first_eligible_date', 'last_eligible_date', 'intercept', 'slope_se', 'n_fitted_dates'])
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
  it('flags a demographic conflict for a patient ID containing colons', () => {
    const input = exportFixture()
    const rename = <T,>(value: T): T => value === '001-A' ? 'P:001' as T : value
    const data = input.data
    data.rows = data.rows.map(row => ({ ...row, patientId: rename(row.patientId) }))
    data.rawRows = data.rawRows.map(row => ({ ...row, patientId: rename(row.patientId) }))
    data.patients = data.patients.map(patient => ({ ...patient, id: rename(patient.id) }))
    input.cohortRows = input.cohortRows.map(row => ({ ...row, patientId: rename(row.patientId) }))
    input.patientIds = ['P:001']
    data.analysis.messages = [
      { id: 'demographics:sex_tie:P:001', severity: 'warning', text: 'Conflicting recorded sex' },
      { id: 'demographics:sex_tie:P', severity: 'warning', text: 'Another patient' },
    ]
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    expect(records(workbook, 'cohort')[0]).toMatchObject({ PatientID: 'P:001', demographics_conflict: 'yes' })
    expect(records(workbook, 'demographics')[0]).toMatchObject({ PatientID: 'P:001', warnings: 'Conflicting recorded sex' })
  })
  it('roundtrips the visible scope with actual prepared summaries and derived provenance', () => {
    const input = exportFixture()
    input.cohortRows[0].cells[0].slope = 123.456 // Proves the supplied displayed summary is reused.
    const workbook = XLSX.read(workspaceWorkbookBytes(input),{type:'array'})
    expect(records(workbook,'measurements')).toHaveLength(2)
    expect(records(workbook,'measurements')).toEqual(expect.arrayContaining([expect.objectContaining({PatientID:'001-A',Parameter:'Marker|one',Unit:'mg/L',NumericValue:10,origin:'imported'}),expect.objectContaining({Parameter:'Derived eGFR',origin:'derived',formula:'ekfc-2021'})]))
    expect(records(workbook,'raw_measurements')).toHaveLength(1)
    expect(records(workbook,'cohort')[0]).toMatchObject({PatientID:'001-A',slope:123.456})
    expect(records(workbook,'events')).toEqual([expect.objectContaining({PatientID:'001-A',title:'Visit'})])
    expect(JSON.stringify(Object.values(workbook.Sheets))).not.toContain('SECRET')
    expect(JSON.stringify(Object.values(workbook.Sheets))).not.toContain('hidden')
    expect(records(workbook,'parameters')).toEqual(expect.arrayContaining([expect.objectContaining({formula:'ekfc-2021',source_parameter:'Creatinine',source_unit:'mg/dl'})]))
    expect(records(workbook,'about').some(row => String(row.note).includes('Research use only'))).toBe(true)
    expect(records(workbook,'about').some(row => String(row.note).startsWith('eGFR series whose name ends in ", computed)", for example "eGFR (CKD-EPI 2021, computed)", are calculated by the app'))).toBe(true)
    expect(records(workbook,'about').some(row => String(row.note).startsWith('endpoint_percent_change is the total eGFR change in percent'))).toBe(true)
    expect(records(workbook,'about').some(row => String(row.note).includes('numeric limits remain'))).toBe(true)
    expect(records(workbook,'about').some(row => String(row.note).includes('For a Theil-Sen fit with n_fitted_dates below 5 they are Theil-Sen bounds, not a 95 % interval. With one measurement on each of three or four dates, the Theil–Sen bounds are the full range of pairwise slopes and cover the true slope only about 67 % or 92 % of the time.'))).toBe(true)
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
    expect(exported.svg).toContain('Bounds (&lt;, &gt;) remain visible but are excluded from calculations.')
    expect(exported.svg).toContain('Marker &lt;sample&gt;')
    expect(exported.height).toBeGreaterThan(200)
    expect(svg.outerHTML).not.toContain('Research use')
    expect(() => exportChartSvg(document.createElementNS(svg.namespaceURI,'svg') as SVGSVGElement,'empty')).toThrow(/chart/)
    expect(safeExportFilename('../Patient: A/B*?','svg')).not.toMatch(/[\\/:*?"<>|]/)
  })
})

