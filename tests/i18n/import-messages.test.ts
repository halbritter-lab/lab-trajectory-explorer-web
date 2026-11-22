import { describe, expect, it } from 'vitest'
import { importMessage } from '../../src/workspace/labels/importMessages'
import { setLanguage } from '../../src/i18n'

describe('import findings in German (issue #71)', () => {
  it('leaves English findings unchanged in English', () => {
    expect(importMessage('Patient ID missing; row not imported.')).toBe('Patient ID missing; row not imported.')
  })
  it('translates known patterns and keeps imported values, codes and units', () => {
    setLanguage('de')
    expect(importMessage('Patient ID missing; row not imported.')).toBe('Patienten-ID fehlt; Zeile nicht importiert.')
    expect(importMessage('Lab date "31.02.2024" is not a valid calendar date; row not imported.')).toBe('Labordatum "31.02.2024" ist kein gültiges Kalenderdatum; Zeile nicht importiert.')
    expect(importMessage('2 duplicate lab rows (same patient, date, test, unit and value) for 1 patient; they are kept and counted as separate measurements.'))
      .toBe('2 doppelte Laborzeilen (gleicher Patient, gleiches Datum, gleicher Test, gleiche Einheit und gleicher Wert) bei 1 Patient; sie bleiben erhalten und zählen als getrennte Messungen.')
    expect(importMessage('Kreatinin: 3 LOINC codes in one parameter: 2160-0 (1 value), 38483-4 (4 values). The values stay one series; check that they are the same test and material.'))
      .toBe('Kreatinin: 3 LOINC-Codes in einem Parameter: 2160-0 (1 Wert), 38483-4 (4 Werte). Die Werte bleiben eine Reihe; prüfen Sie, dass es derselbe Test und dasselbe Material sind.')
    expect(importMessage('1 lab row with an implausible lab date: 2099-01-01 (after the import day 2026-11-22); the row is used unchanged.'))
      .toBe('1 Laborzeile mit unplausiblem Labordatum: 2099-01-01 (nach dem Importtag 2026-11-22); die Zeile wird unverändert verwendet.')
    expect(importMessage('Implausible event date 1900-01-01 (before 1927-05-18); the event is used unchanged.'))
      .toBe('Unplausibles Ereignisdatum 1900-01-01 (vor 1927-05-18); das Ereignis wird unverändert verwendet.')
    // An unknown sentence stays English rather than being half translated.
    expect(importMessage('Something new happened.')).toBe('Something new happened.')
  })
})
