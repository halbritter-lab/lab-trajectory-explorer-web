import { describe, expect, it } from 'vitest'
import { loadDatasetFromWorkbook, type ImportDiagnostic } from '../../src/io/loadDataset'
import { AFFECTED_ROWS_LIMIT } from '../../src/core/parse/loader'

/** Import findings as a user gets them: bytes of a CSV through the real reader,
 * so the source rows are those of the file. */
const HEADER = 'patientId;labDate;testName;unit;value;sex'
const csv = (lines: string[], header = HEADER) => new TextEncoder().encode(`${header}\n${lines.join('\n')}\n`).buffer
const TODAY = new Date(2026, 10, 21, 15, 30)
const load = (lines: string[], header = HEADER) => loadDatasetFromWorkbook(csv(lines, header), { today: TODAY })
const find = (diagnostics: ImportDiagnostic[], pattern: RegExp) => diagnostics.filter((d) => pattern.test(d.reason))

describe('source rows in lab import findings', () => {
  it('names the file row of rejected rows and keeps it on imported rows', () => {
    const { rows, diagnostics } = load([
      'A;2024-01-15;Kreatinin;mg/dl;1,0;w',
      ';2024-01-16;Kreatinin;mg/dl;1,1;w',
      ';;;;;',
      'A;2024-02-30;Kreatinin;mg/dl;1,2;w',
      'A;2024-03-15;Kreatinin;mg/dl;1,3;w',
    ])
    expect(rows.map((r) => r.sourceRow)).toEqual([2, 6])
    expect(diagnostics.filter((d) => d.severity === 'rejected')).toEqual([
      { source: 'labs', sheet: 'Sheet1', patientId: null, severity: 'rejected', row: 3, reason: 'Patient ID missing; row not imported.' },
      { source: 'labs', sheet: 'Sheet1', patientId: 'A', severity: 'rejected', row: 5, reason: 'Lab date "2024-02-30" is not a valid calendar date; row not imported.' },
    ])
  })

  it('lists the rows behind duplicates, thousands notation and censored values', () => {
    const { diagnostics } = load([
      'A;2024-01-15;Kreatinin;mg/dl;1,234;w',
      'A;2024-01-15;Kreatinin;mg/dl;1,234;w',
      'A;2024-02-15;Kreatinin;mg/dl;<0,3;w',
      'B;2024-02-15;CRP;mg/l;1.500;m',
    ])
    expect(find(diagnostics, /duplicate lab row/)[0].rows).toEqual([{ row: 3, patientId: 'A', date: '2024-01-15', parameter: 'Kreatinin [mg/dl]', value: '1,234' }])
    expect(find(diagnostics, /after a comma/)[0].rows?.map((r) => r.row)).toEqual([2, 3])
    expect(find(diagnostics, /after a point/)[0].rows).toEqual([{ row: 5, patientId: 'B', date: '2024-02-15', parameter: 'CRP [mg/l]', value: '1.500' }])
    expect(find(diagnostics, /censored value/)[0].rows).toEqual([{ row: 4, patientId: 'A', date: '2024-02-15', parameter: 'Kreatinin [mg/dl]', value: '<0,3' }])
  })

  it('lists at most AFFECTED_ROWS_LIMIT rows and keeps the total', () => {
    const lines = Array.from({ length: AFFECTED_ROWS_LIMIT + 5 }, (_, i) => `P${i};2024-01-15;CRP;mg/l;<5;w`)
    const [censored] = find(load(lines).diagnostics, /censored value/)
    expect(censored.rows).toHaveLength(AFFECTED_ROWS_LIMIT)
    expect(censored.affected).toBe(AFFECTED_ROWS_LIMIT + 5)
  })
})

describe('implausible lab dates (decided 2026-11-21)', () => {
  it('warns once per patient about dates after the import day or before 1927-05-18 and keeps the rows', () => {
    const { rows, diagnostics } = load([
      'S1;2024-01-15;Kreatinin;mg/dl;1,0;w',
      'S1;3024-05-08;Kreatinin;mg/dl;1,1;w',
      'S1;3024-05-08;CRP;mg/l;3;w',
      'S2;1923-07-18;Kreatinin;mg/dl;1,0;m',
      'S2;0203-06-05;Kreatinin;mg/dl;1,0;m',
      'S2;2026-12-15;Kreatinin;mg/dl;1,0;m',
      'S4;2003-08-08;Kreatinin;mg/dl;1,0;m',
    ])
    expect(rows).toHaveLength(7)
    expect(rows[1].labDatum).toEqual(new Date(Date.UTC(3024, 4, 8)))
    const warnings = find(diagnostics, /implausible lab date/)
    expect(warnings.map((d) => [d.patientId, d.severity, d.scope, d.reason])).toEqual([
      ['S1', 'warning', undefined, '2 lab rows with an implausible lab date: 3024-05-08 (after the import day 2026-11-21); the rows are used unchanged.'],
      ['S2', 'warning', undefined, '3 lab rows with an implausible lab date: 0203-06-05 (before 1927-05-18), 1923-07-18 (before 1927-05-18), 2026-12-15 (after the import day 2026-11-21); the rows are used unchanged.'],
    ])
    expect(warnings[0].rows?.map((r) => [r.row, r.date, r.parameter])).toEqual([[3, '3024-05-08', 'Kreatinin [mg/dl]'], [4, '3024-05-08', 'CRP [mg/l]']])
  })

  it('accepts the import day and 1927-05-18 themselves, and warns one day beyond each', () => {
    const ok = load(['A;2026-11-21;Kreatinin;mg/dl;1,0;w', 'A;1927-05-18;Kreatinin;mg/dl;1,0;w'])
    expect(find(ok.diagnostics, /implausible lab date/)).toEqual([])
    const beyond = load(['A;2026-11-22;Kreatinin;mg/dl;1,0;w', 'B;1927-05-17;Kreatinin;mg/dl;1,0;w'])
    expect(find(beyond.diagnostics, /implausible lab date/).map((d) => d.reason)).toEqual([
      '1 lab row with an implausible lab date: 2026-11-22 (after the import day 2026-11-21); the row is used unchanged.',
      '1 lab row with an implausible lab date: 1927-05-17 (before 1927-05-18); the row is used unchanged.',
    ])
  })

  it('names three dates and counts the rest', () => {
    const { diagnostics } = load(['2030', '2031', '2032', '2033', '2034'].map((year) => `A;${year}-01-01;Kreatinin;mg/dl;1,0;w`))
    expect(find(diagnostics, /implausible lab date/)[0].reason).toBe(
      '5 lab rows with an implausible lab date: 2030-01-01 (after the import day 2026-11-21), 2031-01-01 (after the import day 2026-11-21), 2032-01-01 (after the import day 2026-11-21) and 2 more dates; the rows are used unchanged.')
  })
})

describe('differing values of one parameter on one day', () => {
  it('reports patient-days and patients per parameter and lists all rows of those days', () => {
    const { rows, diagnostics } = load([
      'Z8;2023-10-01;Kreatinin;mg/dl;1,1;w',
      'Z8;2023-10-01;Kreatinin;mg/dl;1,9;w',
      'Z8;2023-10-02;Kreatinin;mg/dl;1,5;w',
      'Z8;2023-10-02;Kreatinin;mg/dl;1.5;w',
      'Z9;2023-10-01;Kreatinin;mg/dl;1,0;m',
      'Z9;2023-10-01;Kreatinin;mg/dl;1,0;m',
      'Z9;2023-10-01;Kreatinin;µmol/l;88;m',
      'Z9;2023-10-05;CRP;mg/l;<5;m',
      'Z9;2023-10-05;CRP;mg/l;5;m',
    ])
    expect(rows).toHaveLength(9)
    const notes = find(diagnostics, /differing values on the same day/)
    expect(notes.map((d) => d.reason)).toEqual([
      'Kreatinin [mg/dl]: 1 patient-day with differing values on the same day for 1 patient; all values are kept and each counts as a separate measurement.',
      'CRP [mg/l]: 1 patient-day with differing values on the same day for 1 patient; all values are kept and each counts as a separate measurement.',
    ])
    expect(notes[0]).toMatchObject({ patientId: null, scope: 'sheet', severity: 'warning' })
    expect(notes[0].rows).toEqual([
      { row: 2, patientId: 'Z8', date: '2023-10-01', parameter: 'Kreatinin [mg/dl]', value: '1,1' },
      { row: 3, patientId: 'Z8', date: '2023-10-01', parameter: 'Kreatinin [mg/dl]', value: '1,9' },
    ])
  })

  it('stays silent for equal numbers, other days and undated rows', () => {
    const { diagnostics } = load(['A;2023-10-01;Kreatinin;mg/dl;1,5;w', 'A;2023-10-01;Kreatinin;mg/dl;1.50;w', 'A;;Kreatinin;mg/dl;1,1;w', 'A;;Kreatinin;mg/dl;1,9;w', 'A;2023-10-02;Kreatinin;mg/dl;1,9;w'])
    expect(find(diagnostics, /differing values/)).toEqual([])
  })
})

describe('unreadable sex codes and similar patient IDs', () => {
  it('quotes each unreadable spelling with its rows and patients, whatever the eGFR setting', () => {
    const { rows, diagnostics } = load([
      'Z3;2023-10-01;HbA1c;%;6,1;x',
      'Z3;2023-11-01;HbA1c;%;6,2;x',
      'Z4;2023-10-01;HbA1c;%;6,1;unbekannt',
      'Z5;2023-10-01;HbA1c;%;6,1;W',
      'Z6;2023-10-01;HbA1c;%;6,1;',
    ])
    expect(rows.map((r) => r.patientSex)).toEqual([null, null, null, 'w', null])
    const [note] = find(diagnostics, /Unreadable sex/)
    expect(note.reason).toBe('Unreadable sex values: "x" (2 rows, 1 patient), "unbekannt" (1 row, 1 patient); read as no sex. Accepted: m / male / männlich, w / f / female / weiblich, d / divers. Correct the source file, supply the sex in the attributes table or enter it under Review and edit patients.')
    expect(note.rows).toEqual([
      { row: 2, patientId: 'Z3', date: '2023-10-01', parameter: 'HbA1c [%]', value: 'x' },
      { row: 3, patientId: 'Z3', date: '2023-11-01', parameter: 'HbA1c [%]', value: 'x' },
      { row: 4, patientId: 'Z4', date: '2023-10-01', parameter: 'HbA1c [%]', value: 'unbekannt' },
    ])
  })

  it('reports IDs that differ only in leading zeros, spaces or letter case and keeps them apart', () => {
    const { rows, diagnostics } = load([
      '0012;2023-10-01;HbA1c;%;6,1;w',
      '12;2023-10-01;HbA1c;%;6,1;w',
      'ab 1;2023-10-01;HbA1c;%;6,1;w',
      'AB1;2023-10-01;HbA1c;%;6,1;w',
      'AB2;2023-10-01;HbA1c;%;6,1;w',
      '120;2023-10-01;HbA1c;%;6,1;w',
    ])
    expect(new Set(rows.map((r) => r.patientId)).size).toBe(6)
    const notes = find(diagnostics, /differ only in leading zeros/)
    expect(notes.map((d) => d.reason)).toEqual([
      'Patient IDs "0012" and "12" differ only in leading zeros, spaces or letter case and are kept as separate patients. Check whether they are the same patient.',
      'Patient IDs "ab 1" and "AB1" differ only in leading zeros, spaces or letter case and are kept as separate patients. Check whether they are the same patient.',
    ])
    expect(notes.map((d) => d.rows?.map((r) => [r.row, r.patientId]))).toEqual([[[2, '0012'], [3, 12]], [[4, 'ab 1'], [5, 'AB1']]])
  })

  it('adds neither warning to a clean file', () => {
    const { diagnostics } = load(['1;2023-10-01;HbA1c;%;6,1;w', '2;2023-10-01;HbA1c;%;6,1;m'])
    expect(diagnostics).toEqual([])
  })
})
