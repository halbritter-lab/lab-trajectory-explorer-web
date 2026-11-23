import { describe, expect, it } from 'vitest'
import { importMessage } from '../../src/workspace/labels/importMessages'
import { dateReadNotes, describeDateProblem, futureBirthDateWarning, type ImportDateProblem } from '../../src/core/parse/dates'
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

describe('import date findings in German leave no English fragment (issue #71)', () => {
  const ENGLISH = /\b(is|not|valid|calendar|dates?|rows?|imported|ignored|number|outside|accepted|range|years?|serial|looks|like|recognised|use|slashes|read|first|month|supported|exist|does|after|before|import day|written|were|was|stored|used|unchanged)\b/i
  const problems: ImportDateProblem[] = ['impossible_date', 'month_first', 'implausible_serial', 'excel_leap_day', 'bare_year', 'unrecognised']
  const labels = ['Lab date', 'Birth date', 'Event date', 'End date']
  const suffixes = ['; row not imported.', '; it is ignored.']
  const messages = [
    'Event date is not a valid date; row not imported.',
    futureBirthDateWarning(new Date('2099-01-01T00:00:00Z'), new Date('2026-11-22T12:00:00Z'))!,
    ...['lab date', 'birth date', 'event date'].flatMap(subject => [1, 3].flatMap(n => dateReadNotes(subject, { dayFirst: n, serial: n }))),
    ...labels.flatMap(label => problems.flatMap(problem => suffixes.map(suffix =>
      `${describeDateProblem(label, problem === 'implausible_serial' || problem === 'bare_year' ? 2024 : '31.02.2024', problem, label === 'Birth date' ? 'birth' : 'measurement')}${suffix}`))),
  ]
  it('translates every date message the import composes as a whole', () => {
    setLanguage('de')
    expect(messages.length).toBeGreaterThan(50)
    for (const message of messages) expect(importMessage(message), message).not.toMatch(ENGLISH)
    expect(importMessage('Event date is not a valid date; row not imported.')).toBe('Ereignisdatum ist kein gültiges Datum; Zeile nicht importiert.')
  })
})
