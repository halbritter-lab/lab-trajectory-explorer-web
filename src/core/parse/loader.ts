import type { LabRow, PatientId, WertOperator } from '../types'
import type { RawRow } from '../../io/readWorkbook'
import { parseWert } from './wert'
import { normaliseSex } from '../egfr/formulas'
export { REQUIRED_COLUMNS } from '../../io/headers'
import {
  COLUMN_ALIASES,
  REQUIRED_COLUMNS,
  cell,
  collectHeaders,
  resolveColumns,
  type ResolvedColumns,
} from '../../io/headers'

const WERT_OPERATORS: readonly WertOperator[] = ['=', '<', '>', 'range', 'unparseable']

function toWertOperator(v: unknown): WertOperator {
  return WERT_OPERATORS.includes(v as WertOperator) ? (v as WertOperator) : 'unparseable'
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v
  const s = String(v).trim()
  // German/European CSV dates "DD.MM.YYYY" (optionally with a time component)
  // are not parsed by the JS Date constructor; map them to UTC midnight to match
  // the UTC-midnight normalisation readWorkbook applies to xlsx Date cells.
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dmy) {
    const [, dd, mm, yyyy] = dmy
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
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
 */
export function loadLabRows(rawRows: RawRow[]): LabRow[] {
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
        `are still accepted.`,
    )
  }

  const hasPreParsed = columns.valueNum !== undefined && columns.valueOperator !== undefined
  const hasAge = columns.ageAtLab !== undefined
  const hasBirth = columns.birthDate !== undefined

  const out: LabRow[] = []
  for (const r of rawRows) {
    const patientId = toPatientId(cell(r, columns, 'patientId'))
    if (patientId === null) continue

    const labDatum = toDate(cell(r, columns, 'labDate'))
    const rawWert = toStr(cell(r, columns, 'value'))

    let wertNum: number | null
    let wertOperator: WertOperator
    if (hasPreParsed) {
      const n = cell(r, columns, 'valueNum')
      wertNum = n === null || n === undefined || n === '' ? null : Number(n)
      if (wertNum !== null && Number.isNaN(wertNum)) wertNum = null
      wertOperator = toWertOperator(cell(r, columns, 'valueOperator'))
    } else {
      const parsed = parseWert(rawWert)
      wertNum = parsed.value
      wertOperator = parsed.operator
    }

    const patientSexRaw = toStr(cell(r, columns, 'sex'))
    const patientSex = normaliseSex(patientSexRaw)

    const birthDate = hasBirth ? toDate(cell(r, columns, 'birthDate')) : null

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const a = cell(r, columns, 'ageAtLab')
      patientAgeAtLab =
        a === null || a === undefined || a === '' ? null : Math.trunc(Number(a))
      if (patientAgeAtLab !== null && Number.isNaN(patientAgeAtLab)) patientAgeAtLab = null
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
  return out
}
