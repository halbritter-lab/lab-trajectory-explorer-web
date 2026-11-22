import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { version } from '../../package.json'
import { exportFixture } from './export-fixture'
import { inputDataId, workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { defaultFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'
import { buildCohortRows } from '../../src/core/cohort/screening'
import type { LabRow } from '../../src/core/types'

const records = (bytes: Uint8Array, name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(bytes, { type: 'array' }).Sheets[name])
const notes = (bytes: Uint8Array) => records(bytes, 'about').map(row => String(row.note))
const noteValue = (bytes: Uint8Array, key: string) => notes(bytes).find(note => note.startsWith(`${key}: `))?.slice(key.length + 2)

describe('settings sheet: preset name and time axis', () => {
  const configs = () => {
    const input = exportFixture()
    const [first, second] = input.parameterKeys.map(key => input.data.parameters.find(p => p.key === key)!)
    return { input, first, second }
  }

  it('writes the Theil-Sen preset as theil_sen and the same values set by hand as custom', () => {
    const { input, first, second } = configs()
    const byHand = { ...defaultFitSettings(), presetId: 'custom', fitModel: 'theil-sen' as const }
    const settings = records(workspaceWorkbookBytes({ ...input, fitConfigByParameterKey: { [first.key]: toFitConfig(defaultFitSettings('theil_sen'), first), [second.key]: toFitConfig(byHand, second) } }), 'settings')
    const [preset, custom] = settings.map(row => JSON.parse(String(row.fit_config)))
    expect(preset.preset).toBe('theil_sen')
    expect(custom.preset).toBe('custom')
    // Nothing but the name and the parameter differs: both compute the same way.
    expect({ ...preset, preset: '', parameter: null }).toEqual({ ...custom, preset: '', parameter: null })
  })

  it('leaves xAxis out of fit_config for every preset and keeps the other entries', () => {
    const { input, first, second } = configs()
    const ckd = toFitConfig(defaultFitSettings('ckd_progression'), first)
    expect(ckd.xAxis).toBe('age')
    const settings = records(workspaceWorkbookBytes({ ...input, fitConfigByParameterKey: { [first.key]: ckd, [second.key]: toFitConfig(defaultFitSettings(), second) } }), 'settings')
    for (const row of settings) expect(String(row.fit_config)).not.toContain('xAxis')
    const { xAxis: _dropped, ...rest } = ckd
    expect(JSON.parse(String(settings[0].fit_config))).toEqual(JSON.parse(JSON.stringify(rest)))
    expect(Object.keys(JSON.parse(String(settings[0].fit_config)))).toEqual(['parameter', 'preset', 'censoring', 'exclusions', 'timeBalancing', 'fitModel', 'endpoints'])
  })

  it('explains the time axis, the preset name and the fixed segmentation parameters in about', () => {
    const about = notes(workspaceWorkbookBytes(exportFixture()))
    expect(about.some(note => note.startsWith('Time axis of the trend:') && note.includes('intercept is the fitted value at index_date') && note.includes('no longer carries the entry xAxis'))).toBe(true)
    expect(about.some(note => note.startsWith('preset in fit_config records how the settings were selected') && note.includes('theil_sen'))).toBe(true)
    expect(about.some(note => note.includes('more than 180 days apart') && note.includes('at least 3 points'))).toBe(true)
  })

  it('names the segmentation limits the fit uses: a gap of 181 days splits, 180 days does not', () => {
    const day = (n: number) => new Date(Date.UTC(2020, 0, 1) + n * 86_400_000)
    const row = (n: number, wertNum: number): LabRow => ({ patientId: 1, bezeichnung: 'Marker', einheit: 'mg/L', wertNum, wert: String(wertNum), wertOperator: '=', labDatum: day(n), patientSex: null, patientAgeAtLab: null, loinc: null })
    const lines = (gap: number) => buildCohortRows([row(0, 1), row(30, 2), row(60, 3), row(60 + gap, 4), row(90 + gap, 5), row(120 + gap, 6)], [1], [{ bezeichnung: 'Marker', einheit: 'mg/L', mode: 'gap-split' }])[0].cells[0].fitLines.length
    expect(lines(180)).toBe(1)
    expect(lines(181)).toBe(2)
  })
})

describe('about sheet: provenance and personal data', () => {
  it('records app version, export time in UTC, export id and the input data id as separate rows', () => {
    const bytes = workspaceWorkbookBytes({ ...exportFixture(), exportedAt: new Date('2026-11-21T13:14:15.000Z'), exportId: 'fixed-id' })
    expect(noteValue(bytes, 'app_version')).toBe(version)
    expect(noteValue(bytes, 'exported_at')).toBe('2026-11-21T13:14:15.000Z')
    expect(noteValue(bytes, 'export_id')).toBe('fixed-id')
    expect(noteValue(bytes, 'input_data_id')).toMatch(/^[0-9a-f]{8}$/)
    expect(notes(bytes).some(note => note.startsWith('app_version is the version of Lab Trajectory Explorer'))).toBe(true)
  })

  it('gives every export its own id and the current time', () => {
    const before = Date.now()
    const [a, b] = [workspaceWorkbookBytes(exportFixture()), workspaceWorkbookBytes(exportFixture())]
    expect(noteValue(a, 'export_id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(noteValue(a, 'export_id')).not.toBe(noteValue(b, 'export_id'))
    expect(Date.parse(noteValue(a, 'exported_at')!)).toBeGreaterThanOrEqual(before)
    expect(noteValue(a, 'exported_at')).toMatch(/Z$/)
  })

  it('identifies the imported rows in scope: same rows, same id, whatever their order and the settings', () => {
    const id = (change?: (input: ReturnType<typeof exportFixture>) => void, extra: object = {}) => {
      const input = exportFixture()
      change?.(input)
      return noteValue(workspaceWorkbookBytes({ ...input, ...extra }), 'input_data_id')
    }
    const base = id(undefined, { parameterKeys: ['marker', 'other-unit'] })
    expect(id(input => { input.data.rawRows.reverse() }, { parameterKeys: ['marker', 'other-unit'] })).toBe(base)
    expect(id(input => { input.data.analysisSettings.rapidEgfrDecline.threshold = 3 }, { parameterKeys: ['marker', 'other-unit'] })).toBe(base)
    // Another value, or another scope, is another input.
    expect(id(input => { input.data.rawRows[0].wert = '11' }, { parameterKeys: ['marker', 'other-unit'] })).not.toBe(base)
    expect(id()).not.toBe(base)
    // The worked example of the method reference.
    const a = { PatientID: 7, Date: '2024-01-15', Parameter: 'Creatinine', Unit: 'mg/dl', Value: '1.2', patient_sex: 'w', patient_age_at_lab: 54 }
    const b = { ...a, Date: '2024-07-15', Value: '<1.0' }
    expect([inputDataId([a, b]), inputDataId([b, a]), inputDataId([a, { ...b, Value: '1.0' }])]).toEqual(['d2196115', 'd2196115', 'bf80cedd'])
    // The imported birth date is part of the identifier: an exact date and an age in whole years are different inputs.
    expect(inputDataId([{ ...a, patient_birth_date: '1969-05-06' }])).not.toBe(inputDataId([a]))
    expect(inputDataId([{ ...a, patient_birth_date: '' }])).toBe(inputDataId([a]))
    // The time of day (2026-11-22) joins only where a row has one: rows without a time keep their identifier.
    expect(inputDataId([{ ...a, time_of_day: '06:00:00' }])).not.toBe(inputDataId([a]))
    expect(inputDataId([{ ...a, time_of_day: '06:00:00' }])).not.toBe(inputDataId([{ ...a, time_of_day: '20:00:00' }]))
    expect([inputDataId([{ ...a, time_of_day: '' }, { ...b, time_of_day: '' }]), inputDataId([a, b])]).toEqual(['d2196115', 'd2196115'])
    // The worked example with the time: the first variant (<1.0) and the variant with 1.0.
    expect([inputDataId([{ ...a, time_of_day: '06:00:00' }, b]), inputDataId([{ ...a, time_of_day: '06:00:00' }, { ...b, Value: '1.0' }])]).toEqual(['dfa98525', '661a656d'])
    expect(inputDataId([{ PatientID: 7, Date: '2024-01-01', Parameter: 'a', Unit: 'u', Value: '1' }])).toBe(inputDataId([{ PatientID: '7', Date: '2024-01-01', Parameter: 'a', Unit: 'u', Value: '1', patient_sex: '', patient_age_at_lab: null }]))
  })

  it('names the personal and source-related fields and asks for a check before the file is passed on', () => {
    const note = notes(workspaceWorkbookBytes(exportFixture())).find(text => text.startsWith('This file contains personal data'))!
    for (const field of ['PatientID', 'not pseudonymised', 'patient_ids', 'birth_anchor', 'age_estimated', 'source_file', 'Check these fields before passing the file on']) expect(note, field).toContain(field)
  })

  it('keeps the earlier about rows in place and appends the new ones', () => {
    const about = notes(workspaceWorkbookBytes(exportFixture()))
    expect(about[0]).toBe('Lab Trajectory Explorer export')
    expect(about[9]).toMatch(/^endpoint_percent_change is the total eGFR change/)
    expect(about[16]).toMatch(/^Measurements marked < or > are bounds/)
    expect(about.slice(-5).map(note => note.split(':')[0])).toEqual(['app_version', 'exported_at', 'export_id', 'input_data_id', 'app_version is the version of Lab Trajectory Explorer that computed and wrote this file; exported_at is the time of the export in UTC; export_id is a random identifier of this file. input_data_id identifies the imported measurements in the exported scope (the rows of raw_measurements'])
  })
})
