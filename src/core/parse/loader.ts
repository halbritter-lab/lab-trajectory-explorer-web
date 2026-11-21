import { patientIdKey, sourceRowNumber, type LabRow, type PatientId, type WertOperator } from '../types'
import type { RawRow } from '../types'
import { parseWert } from './wert'
import { countDateRead, dateReadNotes, describeDateProblem, EARLIEST_PLAUSIBLE_MEASUREMENT_DATE, noDateReads, parseImportDate } from './dates'
import { planUnitHarmonisation } from './units'
import { isUnrecognisedSex, normaliseSex } from '../demographics/sex'
export { REQUIRED_COLUMNS } from './headers'
import {
  COLUMN_ALIASES,
  REQUIRED_COLUMNS,
  cell,
  collectHeaders,
  describeFoundColumns,
  normaliseHeader,
  resolveColumns,
  shadowedColumnNotes,
} from './headers'

/** Affected rows listed per collective finding; further rows are counted in
 * `affected` only. */
export const AFFECTED_ROWS_LIMIT = 1000

/** One source row behind an import finding: where it is in the file and what
 * it holds, as written. */
export interface ImportDiagnosticRow {
  /** Row in the source file (header row = 1); null when not read from a file. */
  row: number | null
  patientId: PatientId | null
  /** ISO calendar date, or '' when the row has none. */
  date: string
  /** "name [unit]", or '' when the finding is not about a measurement. */
  parameter: string
  /** The cell the finding is about, as written. */
  value: string
}

/** One import finding for the lab sheet. `scope: 'sheet'` marks a summary over
 * many rows (patientId is then null) rather than a statement about one row. */
export interface LabImportIssue {
  patientId: PatientId | null
  severity: 'rejected' | 'warning'
  reason: string
  scope?: 'sheet'
  /** Source row of a finding about a single row (header row = 1). */
  row?: number
  /** The rows a collective finding counts, in file order, at most
   * AFFECTED_ROWS_LIMIT. */
  rows?: ImportDiagnosticRow[]
  /** Total number of affected rows, set only when `rows` was cut off. */
  affected?: number
}

export interface LoadedLabRows {
  rows: LabRow[]
  issues: LabImportIssue[]
}

export interface LabImportOptions {
  /** The import day for the lab-date plausibility warning; defaults to now.
   * Only its local calendar day is used. */
  today?: Date
  /**
   * A rule that moves rows into a separate, labelled series by test name and
   * LOINC code. It returns the series name to store instead of the test name
   * and a clause saying what follows from it, or null to keep the row where
   * it is. The loader has no such rule of its own; `loadDatasetFromWorkbook`
   * supplies the one for non-serum creatinine codes.
   */
  separateSeries?: (testName: string | null, loinc: string | null) => { name: string; consequence: string } | null
}

const WERT_OPERATORS: readonly WertOperator[] = ['=', '<', '>', 'range', 'unparseable']

/** Pre-parsed operator cell. Surrounding whitespace is ignored. An empty cell
 * beside a number means an exact value; any other unknown content is
 * unparseable. */
function toWertOperator(v: unknown, hasNumber: boolean): WertOperator {
  const text = toStr(v)
  if (text === null) return hasNumber ? '=' : 'unparseable'
  return WERT_OPERATORS.includes(text as WertOperator) ? (text as WertOperator) : 'unparseable'
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** A plain number from a typed cell or from text with a decimal point or a
 * decimal comma ("46", "1.5", "1,5"); null for anything else. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = toStr(v)
  if (s === null) return null
  const text = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function toPatientId(v: unknown): PatientId | null {
  const id = toStr(v)
  if (id === null) return null
  const numeric = Number(id)
  return Number.isFinite(numeric) && String(numeric) === id ? numeric : id
}

/** Completed calendar years between birth and a reference date. */
export function completedYears(birth: Date, ref: Date): number | null {
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null
  let years = ref.getUTCFullYear() - birth.getUTCFullYear()
  const birthdayReached =
    ref.getUTCMonth() > birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() >= birth.getUTCDate())
  if (!birthdayReached) years -= 1
  return years < 0 ? null : years
}

/**
 * Convert raw workbook rows into typed LabRow records. Headers are resolved
 * once against COLUMN_ALIASES, so both the canonical camelCase names and the
 * older German/PascalCase ones load; matching ignores case and separators.
 * See `loadLabRowsWithDiagnostics` for what is rejected, merged and reported.
 */
export function loadLabRows(rawRows: RawRow[]): LabRow[] {
  return loadLabRowsWithDiagnostics(rawRows).rows
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * `loadLabRows` plus the import findings:
 * - rows whose lab date is present but not a date (impossible calendar day,
 *   number outside the plausible Excel serial range, unrecognised text) are
 *   rejected; rows with an empty date are kept, as before;
 * - rows without a patient ID are rejected, unless the row is empty in every
 *   recognised column, in which case it is skipped;
 * - unit spellings that differ only in case, spacing or micro-sign spelling are
 *   merged per test name into the most frequent spelling (see `unitKey`);
 * - day-first slash dates, Excel serial dates, unreadable birth dates, values
 *   with three digits after a comma or point that could be thousands notation,
 *   two columns for one field, exact duplicate rows, censored ("<", ">")
 *   values, differing values of one parameter on one day, lab dates after the
 *   import day or before 1927-05-18, unreadable sex spellings and patient IDs
 *   that differ only in leading zeros, spaces or letter case are reported as
 *   warnings. None of these changes a row.
 * Findings name the source row; collective findings list their rows.
 */
export function loadLabRowsWithDiagnostics(rawRows: RawRow[], options: LabImportOptions = {}): LoadedLabRows {
  // Union of all rows' keys rather than just the first row's, so a column left
  // blank in the first data row can't cause its header to be missed (defensive;
  // readWorkbook's defval:null normally makes every row share the same keys).
  const headers = collectHeaders(rawRows)
  const columns = resolveColumns(headers, COLUMN_ALIASES)
  const missing = REQUIRED_COLUMNS.filter((c) => columns[c] === undefined)
  if (rawRows.length > 0 && missing.length > 0) {
    throw new Error(
      `File is missing required column(s): ${missing.join(', ')}. ` +
        `Required columns are: ${REQUIRED_COLUMNS.join(', ')}. ` +
        `The older German headers (${COLUMN_ALIASES.patientId[1]}, ${COLUMN_ALIASES.labDate[1]}, ` +
        `${COLUMN_ALIASES.testName[1]}, ${COLUMN_ALIASES.unit[1]}, ${COLUMN_ALIASES.value[1]}) ` +
        `are still accepted. ${describeFoundColumns(headers)}${layoutHint(headers, missing)}`,
    )
  }

  const hasPreParsed = columns.valueNum !== undefined && columns.valueOperator !== undefined
  const hasAge = columns.ageAtLab !== undefined
  const hasBirth = columns.birthDate !== undefined

  const rejected: LabImportIssue[] = []
  const birthWarnings = new Map<string, LabImportIssue>()
  const labDateReads = noDateReads()
  const birthDateReads = noDateReads()
  const birthDatesSeen = new Set<string>()
  const commaThousands: LabRow[] = []
  const dotThousands: LabRow[] = []
  const separated = new Map<string, { imported: string | null; code: string | null; name: string; consequence: string; rows: LabRow[] }>()

  const out: LabRow[] = []
  for (const r of rawRows) {
    const sourceRow = sourceRowNumber(r)
    const at = sourceRow === undefined ? {} : { row: sourceRow }
    const patientId = toPatientId(cell(r, columns, 'patientId'))
    if (patientId === null) {
      const hasContent = Object.values<string | undefined>(columns).some((header) => header !== undefined && toStr(r[header]) !== null)
      if (hasContent) rejected.push({ patientId: null, severity: 'rejected', reason: 'Patient ID missing; row not imported.', ...at })
      continue
    }

    const rawDate = cell(r, columns, 'labDate')
    const parsedDate = parseImportDate(rawDate)
    if (parsedDate.kind === 'invalid') {
      rejected.push({ patientId, severity: 'rejected', reason: `${describeDateProblem('Lab date', rawDate, parsedDate.problem)}; row not imported.`, ...at })
      continue
    }
    const labDatum = parsedDate.kind === 'date' ? parsedDate.date : null
    countDateRead(labDateReads, parsedDate)
    const rawValue = cell(r, columns, 'value')
    const rawWert = toStr(rawValue)

    let wertNum: number | null
    let wertOperator: WertOperator
    let commaThousand = false
    let dotThousand = false
    if (hasPreParsed) {
      wertNum = toNumber(cell(r, columns, 'valueNum'))
      wertOperator = toWertOperator(cell(r, columns, 'valueOperator'), wertNum !== null)
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      // A typed numeric xlsx cell is unambiguous and needs no thousands note.
      wertNum = rawValue
      wertOperator = '='
    } else {
      const parsed = parseWert(rawWert)
      wertNum = parsed.value
      wertOperator = parsed.operator
      commaThousand = wertNum !== null && rawWert !== null && COMMA_THOUSANDS_RE.test(rawWert)
      dotThousand = wertNum !== null && rawWert !== null && DOT_THOUSANDS_RE.test(rawWert)
    }

    const patientSexRaw = toStr(cell(r, columns, 'sex'))
    const patientSex = normaliseSex(patientSexRaw)

    let birthDate: Date | null = null
    if (hasBirth) {
      const rawBirth = cell(r, columns, 'birthDate')
      const parsedBirth = parseImportDate(rawBirth, 'birth')
      // Birth dates repeat on every row; count and report each value once per patient.
      const key = JSON.stringify([patientIdKey(patientId), String(rawBirth)])
      const firstSeen = !birthDatesSeen.has(key)
      birthDatesSeen.add(key)
      if (parsedBirth.kind === 'date') {
        birthDate = parsedBirth.date
        if (firstSeen) countDateRead(birthDateReads, parsedBirth)
      }
      if (parsedBirth.kind === 'invalid' && firstSeen) {
        birthWarnings.set(key, { patientId, severity: 'warning', reason: `${describeDateProblem('Birth date', rawBirth, parsedBirth.problem, 'birth')}; it is ignored.`, ...at })
      }
    }

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const age = toNumber(cell(r, columns, 'ageAtLab'))
      patientAgeAtLab = age === null ? null : Math.trunc(age)
    } else if (birthDate) {
      patientAgeAtLab = labDatum ? completedYears(birthDate, labDatum) : null
    }

    const testName = toStr(cell(r, columns, 'testName'))
    const loinc = toStr(cell(r, columns, 'loinc'))
    const separate = options.separateSeries?.(testName, loinc) ?? null
    const row: LabRow = {
      patientId,
      labDatum,
      bezeichnung: separate?.name ?? testName,
      einheit: toStr(cell(r, columns, 'unit')),
      wert: rawWert,
      wertNum,
      wertOperator,
      loinc,
      patientSex,
      patientSexRaw,
      patientAgeAtLab,
      patientBirthDate: birthDate,
    }
    if (sourceRow !== undefined) row.sourceRow = sourceRow
    out.push(row)
    if (separate !== null) {
      const key = JSON.stringify([testName, separate.name])
      let entry = separated.get(key)
      if (!entry) separated.set(key, (entry = { imported: testName, code: loinc, ...separate, rows: [] }))
      entry.rows.push(row)
    }
    if (commaThousand) commaThousands.push(row)
    if (dotThousand) dotThousands.push(row)
  }

  const notes = [
    ...shadowedColumnNotes(headers, COLUMN_ALIASES),
    ...dateReadNotes('lab date', labDateReads),
    ...dateReadNotes('birth date', birthDateReads),
  ]

  const units = planUnitHarmonisation(out)
  for (const row of out) row.einheit = units.canonicalFor(row.bezeichnung, row.einheit)
  for (const group of units.merged) {
    const spellings = group.spellings.map((s) => `"${s.unit}" (${s.count})`).join(', ')
    notes.push(`${group.testName ?? 'No test name'}: unit spellings ${spellings} were merged as "${group.canonical}".`)
  }

  const sheetNotes = notes.map((reason): LabImportIssue => ({ patientId: null, severity: 'warning', reason, scope: 'sheet' }))
  const collective = [
    ...[...separated.values()].map(({ imported, name, code, consequence, rows: affected }) => collectiveWarning(
      `${imported ?? 'No test name'}: ${plural(affected.length, 'value')} with LOINC code ${code ?? 'none'} ${affected.length === 1 ? 'was' : 'were'} imported as the separate parameter "${name}"; ${consequence}.`, affected)),
    ...loincCodeNotes(out),
    ...commaThousandsNote(commaThousands),
    ...dotThousandsNote(dotThousands),
    ...duplicateNote(out),
    ...sameDayDifferenceNotes(out),
    ...censoredNotes(out),
    ...unreadableSexNote(out),
    ...similarPatientIdNote(out),
  ]
  return { rows: out, issues: [...rejected, ...birthWarnings.values(), ...implausibleLabDateWarnings(out, options.today ?? new Date()), ...sheetNotes, ...collective] }
}

/**
 * One more sentence for the missing-columns error when the cause is the table
 * layout rather than a misspelt header:
 * - a found column name contains a semicolon or a tab: the header line was
 *   split at the wrong field separator;
 * - test name, unit and value are all missing and at least two columns match
 *   no accepted header: the file probably has one column per lab test.
 * Message text only; no column is mapped.
 */
function layoutHint(headers: Iterable<string>, missing: readonly string[]): string {
  const found = [...headers]
  const split = found.find((h) => h.includes(';') || h.includes('\t'))
  if (split !== undefined) {
    const semicolon = split.includes(';')
    return ` A column name contains ${semicolon ? 'a semicolon' : 'a tab'}, so the header line was probably split at the wrong field separator. ` +
      `Save the file with one separator throughout, or put the line "sep=${semicolon ? ';' : '<tab>'}" first.`
  }
  const accepted = new Set(Object.values<readonly string[]>(COLUMN_ALIASES).flatMap((aliases) => aliases.map(normaliseHeader)))
  const unrecognised = found.filter((h) => !/^__EMPTY/.test(h) && !accepted.has(normaliseHeader(h)))
  if (['testName', 'unit', 'value'].every((c) => missing.includes(c)) && unrecognised.length >= 2) {
    return ' This file seems to have one column per lab test; one row per measurement is required. ' +
      'Use the lab template under "Templates and example files". Example: the header line ' +
      '"patientId,labDate,testName,unit,value" followed by one line such as "1,2024-01-31,Creatinine,mg/dl,1.1" for each measurement.'
  }
  return ''
}

const isoDay = (date: Date | null): string => (date === null ? '' : date.toISOString().slice(0, 10))
const seriesLabel = (row: Pick<LabRow, 'bezeichnung' | 'einheit'>) => `${row.bezeichnung ?? 'No test name'} [${row.einheit ?? 'no unit'}]`

/** A lab row as listed under a finding: source row, patient, date, parameter
 * and the value cell as written (or `value`, for findings about another cell). */
export function diagnosticRow(row: LabRow, value: string = row.wert ?? ''): ImportDiagnosticRow {
  return { row: row.sourceRow ?? null, patientId: row.patientId, date: isoDay(row.labDatum), parameter: row.bezeichnung === null && row.einheit === null ? '' : seriesLabel(row), value }
}

/** A warning over `rows`; about the sheet unless `patientId` is given. */
function collectiveWarning(reason: string, rows: readonly LabRow[], patientId: PatientId | null = null, value?: (row: LabRow) => string): LabImportIssue {
  const listed = rows.slice(0, AFFECTED_ROWS_LIMIT).map((row) => diagnosticRow(row, value?.(row)))
  return {
    patientId,
    severity: 'warning',
    reason,
    ...(patientId === null ? { scope: 'sheet' as const } : {}),
    rows: listed,
    ...(rows.length > listed.length ? { affected: rows.length } : {}),
  }
}

/**
 * One warning per patient with a lab date after the import day or before
 * 1927-05-18 (decided 2026-11-21). Dates are compared as calendar days; the
 * import day is the local calendar day of `now`. Rows stay unchanged.
 */
function implausibleLabDateWarnings(rows: readonly LabRow[], now: Date): LabImportIssue[] {
  const DATES_NAMED = 3
  const importDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const earliest = EARLIEST_PLAUSIBLE_MEASUREMENT_DATE.getTime()
  const byPatient = new Map<string, LabRow[]>()
  for (const row of rows) {
    if (row.labDatum === null) continue
    const time = row.labDatum.getTime()
    if (time <= importDay && time >= earliest) continue
    const key = patientIdKey(row.patientId)
    byPatient.set(key, [...(byPatient.get(key) ?? []), row])
  }
  return [...byPatient.values()].map((affected) => {
    const dates = [...new Set(affected.map((row) => row.labDatum!.getTime()))].sort((a, b) => a - b)
    const named = dates.slice(0, DATES_NAMED).map((time) => `${isoDay(new Date(time))} (${time > importDay ? `after the import day ${isoDay(new Date(importDay))}` : `before ${isoDay(EARLIEST_PLAUSIBLE_MEASUREMENT_DATE)}`})`)
    const more = dates.length > DATES_NAMED ? ` and ${plural(dates.length - DATES_NAMED, 'more date')}` : ''
    const reason = `${plural(affected.length, 'lab row')} with an implausible lab date: ${named.join(', ')}${more}; ${affected.length === 1 ? 'the row is' : 'the rows are'} used unchanged.`
    return collectiveWarning(reason, affected, affected[0].patientId)
  })
}

// "1,234" or "<1,500": read as decimals, but in an English-locale export the
// comma may have been a thousands separator.
const COMMA_THOUSANDS_RE = /^[<>≤≥]?\s*-?\d{1,3},\d{3}$/

function commaThousandsNote(rows: readonly LabRow[]): LabImportIssue[] {
  if (rows.length === 0) return []
  const example = rows[0].wert as string
  const decimal = example.replace(',', '.')
  return [collectiveWarning(rows.length === 1
    ? `1 value with three digits after a comma, "${example}", was read as a decimal (${decimal}); check that the comma is not a thousands separator.`
    : `${rows.length} values with three digits after a comma, such as "${example}", were read as decimals (${decimal}); check that the comma is not a thousands separator.`, rows)]
}

// "1.234", "0.850" or "<1.500": read as decimals, but in a German-locale export
// the point may have been a thousands separator (1.234 meaning 1234).
const DOT_THOUSANDS_RE = /^[<>≤≥]?\s*-?\d{1,3}\.\d{3}$/

function dotThousandsNote(rows: readonly LabRow[]): LabImportIssue[] {
  if (rows.length === 0) return []
  const example = rows[0].wert as string
  return [collectiveWarning(rows.length === 1
    ? `1 value with three digits after a point, "${example}", was read as a decimal; check that the point is not a thousands separator.`
    : `${rows.length} values with three digits after a point, such as "${example}", were read as decimals; check that the point is not a thousands separator.`, rows)]
}

/** Exact duplicates: same patient, date, test, unit and raw value. The rows
 * listed are the repeats, not the first occurrence. */
function duplicateNote(rows: readonly LabRow[]): LabImportIssue[] {
  const seen = new Set<string>()
  const duplicates: LabRow[] = []
  const patients = new Set<string>()
  for (const row of rows) {
    const key = JSON.stringify([patientIdKey(row.patientId), row.labDatum?.getTime() ?? null, row.bezeichnung, row.einheit, row.wert])
    if (seen.has(key)) {
      duplicates.push(row)
      patients.add(patientIdKey(row.patientId))
    } else {
      seen.add(key)
    }
  }
  if (duplicates.length === 0) return []
  return [collectiveWarning(`${plural(duplicates.length, 'duplicate lab row')} (same patient, date, test, unit and value) for ${plural(patients.size, 'patient')}; ${duplicates.length === 1 ? 'it is' : 'they are'} kept and counted as separate measurements.`, duplicates)]
}

/**
 * Differing values of one parameter on one day: per parameter (test name and
 * unit), the patient-days that carry at least two different numbers. Only
 * dated rows with a number and a test name are compared, by number and
 * operator, so "1,5" and "1.5" do not differ. All rows of such a day are
 * listed. Nothing is changed: every value stays a separate measurement.
 */
function sameDayDifferenceNotes(rows: readonly LabRow[]): LabImportIssue[] {
  const days = new Map<string, { series: string; patient: string; rows: LabRow[]; values: Set<string> }>()
  for (const row of rows) {
    if (row.labDatum === null || row.wertNum === null || row.bezeichnung === null) continue
    const series = JSON.stringify([row.bezeichnung, row.einheit])
    const key = JSON.stringify([series, patientIdKey(row.patientId), row.labDatum.getTime()])
    let day = days.get(key)
    if (!day) days.set(key, (day = { series, patient: patientIdKey(row.patientId), rows: [], values: new Set() }))
    day.rows.push(row)
    day.values.add(`${row.wertOperator}${row.wertNum}`)
  }
  const bySeries = new Map<string, { label: string; days: number; patients: Set<string>; rows: LabRow[] }>()
  for (const day of days.values()) {
    if (day.values.size < 2) continue
    let entry = bySeries.get(day.series)
    if (!entry) bySeries.set(day.series, (entry = { label: seriesLabel(day.rows[0]), days: 0, patients: new Set(), rows: [] }))
    entry.days++
    entry.patients.add(day.patient)
    entry.rows.push(...day.rows)
  }
  return [...bySeries.values()].map(({ label, days: n, patients, rows: affected }) =>
    collectiveWarning(`${label}: ${plural(n, 'patient-day')} with differing values on the same day for ${plural(patients.size, 'patient')}; all values are kept and each counts as a separate measurement.`, affected))
}

/**
 * Parameters (test name and unit) whose rows carry more than one LOINC code,
 * with the number of values per code. Rows without a code are not counted.
 * Report only: apart from rows moved by `LabImportOptions.separateSeries`,
 * LOINC neither separates nor joins series.
 */
function loincCodeNotes(rows: readonly LabRow[]): LabImportIssue[] {
  const series = new Map<string, { label: string; codes: Map<string, number> }>()
  for (const row of rows) {
    if (row.bezeichnung === null || row.loinc === null) continue
    const key = JSON.stringify([row.bezeichnung, row.einheit])
    let entry = series.get(key)
    if (!entry) series.set(key, (entry = { label: seriesLabel(row), codes: new Map() }))
    entry.codes.set(row.loinc, (entry.codes.get(row.loinc) ?? 0) + 1)
  }
  return [...series.values()].filter(({ codes }) => codes.size > 1).map(({ label, codes }): LabImportIssue => ({
    patientId: null,
    severity: 'warning',
    scope: 'sheet',
    reason: `${label}: ${codes.size} LOINC codes in one parameter: ${[...codes].map(([code, n]) => `${code} (${plural(n, 'value')})`).join(', ')}. The values stay one series; check that they are the same test and material.`,
  }))
}

/** Censored ("<", ">") values per parameter remain in the raw data but are
 * excluded from calculations. */
function censoredNotes(rows: readonly LabRow[]): LabImportIssue[] {
  const censored = new Map<string, { label: string; less: number; greater: number; rows: LabRow[] }>()
  for (const row of rows) {
    if (row.wertOperator !== '<' && row.wertOperator !== '>') continue
    const key = JSON.stringify([row.bezeichnung, row.einheit])
    let entry = censored.get(key)
    if (!entry) censored.set(key, (entry = { label: seriesLabel(row), less: 0, greater: 0, rows: [] }))
    if (row.wertOperator === '<') entry.less++
    else entry.greater++
    entry.rows.push(row)
  }
  return [...censored.values()].map(({ label, less, greater, rows: affected }) => {
    const parts = [less ? `${less} "<"` : null, greater ? `${greater} ">"` : null].filter(Boolean).join(', ')
    return collectiveWarning(`${label}: ${plural(less + greater, 'censored value')} (${parts}); retained for display and raw counts, excluded from fits, endpoints and AKI detection.`, affected)
  })
}

/** Sex cells in a spelling that is not read (see `normaliseSex`), by spelling
 * with the number of rows and patients. The rows carry no sex. */
function unreadableSexNote(rows: readonly LabRow[]): LabImportIssue[] {
  const SPELLINGS_NAMED = 6
  const affected = rows.filter((row) => row.patientSex === null && isUnrecognisedSex(row.patientSexRaw))
  if (affected.length === 0) return []
  const spellings = new Map<string, { rows: number; patients: Set<string> }>()
  for (const row of affected) {
    const raw = row.patientSexRaw as string
    let entry = spellings.get(raw)
    if (!entry) spellings.set(raw, (entry = { rows: 0, patients: new Set() }))
    entry.rows++
    entry.patients.add(patientIdKey(row.patientId))
  }
  const named = [...spellings].slice(0, SPELLINGS_NAMED).map(([raw, n]) => `"${raw}" (${plural(n.rows, 'row')}, ${plural(n.patients.size, 'patient')})`)
  const more = spellings.size > SPELLINGS_NAMED ? ` and ${spellings.size - SPELLINGS_NAMED} more` : ''
  return [collectiveWarning(
    `Unreadable sex ${spellings.size === 1 ? 'value' : 'values'}: ${named.join(', ')}${more}; read as no sex. ` +
      'Accepted: m / male / männlich, w / f / female / weiblich, d / divers. Correct the source file, supply the sex in the attributes table or enter it under Review and edit patients.',
    affected, null, (row) => row.patientSexRaw as string)]
}

/** Comparison form of a patient ID for the similarity warning: letter case,
 * whitespace and leading zeros removed. IDs themselves are never changed. */
function similarIdKey(id: PatientId): string {
  return String(id).normalize('NFC').toLowerCase().replace(/\s+/g, '').replace(/^0+(?=.)/, '')
}

/** Patient IDs that differ only in leading zeros, whitespace or letter case
 * ("0012" and "12"). They remain separate patients; the first row of each ID
 * is listed. */
function similarPatientIdNote(rows: readonly LabRow[]): LabImportIssue[] {
  const GROUPS_NAMED = 5
  const firstRow = new Map<string, LabRow>()
  for (const row of rows) if (!firstRow.has(patientIdKey(row.patientId))) firstRow.set(patientIdKey(row.patientId), row)
  const groups = new Map<string, LabRow[]>()
  for (const row of firstRow.values()) {
    const key = similarIdKey(row.patientId)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const similar = [...groups.values()].filter((group) => group.length > 1)
  if (similar.length === 0) return []
  const named = similar.slice(0, GROUPS_NAMED).map((group) => group.map((row) => `"${row.patientId}"`).join(' and '))
  const more = similar.length > GROUPS_NAMED ? `; and ${plural(similar.length - GROUPS_NAMED, 'more group')}` : ''
  return [collectiveWarning(
    `Patient IDs that differ only in leading zeros, spaces or letter case are kept as separate patients: ${named.join('; ')}${more}. Check whether they are the same patient.`,
    similar.flat(), null, () => '')]
}
