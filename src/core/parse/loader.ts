import { patientIdKey, type LabRow, type PatientId, type WertOperator } from '../types'
import type { RawRow } from '../types'
import { parseWert } from './wert'
import { countDateRead, dateReadNotes, describeDateProblem, noDateReads, parseImportDate } from './dates'
import { planUnitHarmonisation } from './units'
import { normaliseSex } from '../demographics/sex'
export { REQUIRED_COLUMNS } from './headers'
import {
  COLUMN_ALIASES,
  REQUIRED_COLUMNS,
  cell,
  collectHeaders,
  describeFoundColumns,
  resolveColumns,
} from './headers'

/** One import finding for the lab sheet. `scope: 'sheet'` marks a summary over
 * many rows (patientId is then null) rather than a statement about one row. */
export interface LabImportIssue {
  patientId: PatientId | null
  severity: 'rejected' | 'warning'
  reason: string
  scope?: 'sheet'
}

export interface LoadedLabRows {
  rows: LabRow[]
  issues: LabImportIssue[]
}

const WERT_OPERATORS: readonly WertOperator[] = ['=', '<', '>', 'range', 'unparseable']

function toWertOperator(v: unknown): WertOperator {
  return WERT_OPERATORS.includes(v as WertOperator) ? (v as WertOperator) : 'unparseable'
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
 * - unit spellings that differ only in case, spacing or micro-sign spelling are
 *   merged per test name into the most frequent spelling (see `unitKey`);
 * - day-first slash dates, Excel serial dates, unreadable birth dates, decimal
 *   commas that could be thousands separators, exact duplicate rows and
 *   censored ("<", ">") values are reported as warnings. Duplicates and
 *   censored values are kept unchanged.
 */
export function loadLabRowsWithDiagnostics(rawRows: RawRow[]): LoadedLabRows {
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
        `are still accepted. ${describeFoundColumns(headers)}`,
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
  const commaThousands: string[] = []

  const out: LabRow[] = []
  for (const r of rawRows) {
    const patientId = toPatientId(cell(r, columns, 'patientId'))
    if (patientId === null) continue

    const rawDate = cell(r, columns, 'labDate')
    const parsedDate = parseImportDate(rawDate)
    if (parsedDate.kind === 'invalid') {
      rejected.push({ patientId, severity: 'rejected', reason: `${describeDateProblem('Lab date', rawDate, parsedDate.problem)}; row not imported.` })
      continue
    }
    const labDatum = parsedDate.kind === 'date' ? parsedDate.date : null
    countDateRead(labDateReads, parsedDate)
    const rawValue = cell(r, columns, 'value')
    const rawWert = toStr(rawValue)

    let wertNum: number | null
    let wertOperator: WertOperator
    if (hasPreParsed) {
      wertNum = toNumber(cell(r, columns, 'valueNum'))
      wertOperator = toWertOperator(cell(r, columns, 'valueOperator'))
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      // A typed numeric xlsx cell is unambiguous. Its text form "1.234" would
      // otherwise hit parseWert's German-thousands guard and stay unparsed.
      wertNum = rawValue
      wertOperator = '='
    } else {
      const parsed = parseWert(rawWert)
      wertNum = parsed.value
      wertOperator = parsed.operator
      if (wertNum !== null && rawWert !== null && COMMA_THOUSANDS_RE.test(rawWert)) commaThousands.push(rawWert)
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
        birthWarnings.set(key, { patientId, severity: 'warning', reason: `${describeDateProblem('Birth date', rawBirth, parsedBirth.problem, 'birth')}; it is ignored.` })
      }
    }

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const age = toNumber(cell(r, columns, 'ageAtLab'))
      patientAgeAtLab = age === null ? null : Math.trunc(age)
    } else if (birthDate) {
      patientAgeAtLab = labDatum ? completedYears(birthDate, labDatum) : null
    }

    out.push({
      patientId,
      labDatum,
      bezeichnung: toStr(cell(r, columns, 'testName')),
      einheit: toStr(cell(r, columns, 'unit')),
      wert: rawWert,
      wertNum,
      wertOperator,
      loinc: toStr(cell(r, columns, 'loinc')),
      patientSex,
      patientSexRaw,
      patientAgeAtLab,
      patientBirthDate: birthDate,
    })
  }

  const notes = [...dateReadNotes('lab date', labDateReads), ...dateReadNotes('birth date', birthDateReads)]

  const units = planUnitHarmonisation(out)
  for (const row of out) row.einheit = units.canonicalFor(row.bezeichnung, row.einheit)
  for (const group of units.merged) {
    const spellings = group.spellings.map((s) => `"${s.unit}" (${s.count})`).join(', ')
    notes.push(`${group.testName ?? 'No test name'}: unit spellings ${spellings} were merged as "${group.canonical}".`)
  }

  notes.push(...commaThousandsNote(commaThousands), ...duplicateNote(out), ...censoredNotes(out))

  const sheetNotes = notes.map((reason): LabImportIssue => ({ patientId: null, severity: 'warning', reason, scope: 'sheet' }))
  return { rows: out, issues: [...rejected, ...birthWarnings.values(), ...sheetNotes] }
}

// "1,234" or "<1,500": read as decimals, but in an English-locale export the
// comma may have been a thousands separator.
const COMMA_THOUSANDS_RE = /^[<>≤≥]?\s*-?\d{1,3},\d{3}$/

function commaThousandsNote(values: string[]): string[] {
  if (values.length === 0) return []
  const example = values[0]
  const decimal = example.replace(',', '.')
  return [values.length === 1
    ? `1 value with three digits after a comma, "${example}", was read as a decimal (${decimal}); check that the comma is not a thousands separator.`
    : `${values.length} values with three digits after a comma, such as "${example}", were read as decimals (${decimal}); check that the comma is not a thousands separator.`]
}

/** Exact duplicates: same patient, date, test, unit and raw value. */
function duplicateNote(rows: readonly LabRow[]): string[] {
  const seen = new Set<string>()
  let duplicates = 0
  const patients = new Set<string>()
  for (const row of rows) {
    const key = JSON.stringify([patientIdKey(row.patientId), row.labDatum?.getTime() ?? null, row.bezeichnung, row.einheit, row.wert])
    if (seen.has(key)) {
      duplicates++
      patients.add(patientIdKey(row.patientId))
    } else {
      seen.add(key)
    }
  }
  if (duplicates === 0) return []
  return [`${plural(duplicates, 'duplicate lab row')} (same patient, date, test, unit and value) for ${plural(patients.size, 'patient')}; ${duplicates === 1 ? 'it is' : 'they are'} kept and counted as separate measurements.`]
}

/** Censored ("<", ">") values per parameter remain in the raw data but are
 * excluded from calculations. */
function censoredNotes(rows: readonly LabRow[]): string[] {
  const censored = new Map<string, { label: string; less: number; greater: number }>()
  for (const row of rows) {
    if (row.wertOperator !== '<' && row.wertOperator !== '>') continue
    const key = JSON.stringify([row.bezeichnung, row.einheit])
    let entry = censored.get(key)
    if (!entry) censored.set(key, (entry = { label: `${row.bezeichnung ?? 'No test name'} [${row.einheit ?? 'no unit'}]`, less: 0, greater: 0 }))
    if (row.wertOperator === '<') entry.less++
    else entry.greater++
  }
  return [...censored.values()].map(({ label, less, greater }) => {
    const parts = [less ? `${less} "<"` : null, greater ? `${greater} ">"` : null].filter(Boolean).join(', ')
    return `${label}: ${plural(less + greater, 'censored value')} (${parts}); retained for display and raw counts, excluded from fits, endpoints and AKI detection.`
  })
}
