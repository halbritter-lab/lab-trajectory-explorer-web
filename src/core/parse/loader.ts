import type { LabRow, PatientId, WertOperator } from '../types'
import type { RawRow } from '../../io/readWorkbook'
import { parseWert } from './wert'
import { normaliseSex } from '../egfr/formulas'

const WERT_OPERATORS: readonly WertOperator[] = ['=', '<', '>', 'range', 'unparseable']

function toWertOperator(v: unknown): WertOperator {
  return WERT_OPERATORS.includes(v as WertOperator) ? (v as WertOperator) : 'unparseable'
}

export const REQUIRED_COLUMNS = [
  'PatientID',
  'LabDatum',
  'Bezeichnung',
  'Einheit',
  'Wert',
] as const

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
function completedYears(birth: Date, ref: Date): number | null {
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null
  let years = ref.getUTCFullYear() - birth.getUTCFullYear()
  const birthdayReached =
    ref.getUTCMonth() > birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() >= birth.getUTCDate())
  if (!birthdayReached) years -= 1
  return years < 0 ? null : years
}

/**
 * Convert raw workbook rows into typed LabRow records. Columns are detected
 * from the first row's keys, so rows must share a uniform key set — which is
 * what `readWorkbook` (SheetJS with `defval: null`) always produces.
 */
export function loadLabRows(rawRows: RawRow[]): LabRow[] {
  // Union of all rows' keys rather than just the first row's, so a column left
  // blank in the first data row can't cause its header to be missed (defensive;
  // readWorkbook's defval:null normally makes every row share the same keys).
  const headers = new Set<string>()
  for (const r of rawRows) for (const k of Object.keys(r)) headers.add(k)
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.has(c))
  if (rawRows.length > 0 && missing.length > 0) {
    throw new Error(
      `File is missing required column(s): ${missing.join(', ')}. ` +
        `Required columns are: ${REQUIRED_COLUMNS.join(', ')}.`,
    )
  }

  const hasPreParsed = headers.has('Wert_num') && headers.has('Wert_operator')
  const hasAge = headers.has('PatientAgeAtLab')
  const hasBirth = headers.has('PatientGeburtsdatum')

  const out: LabRow[] = []
  for (const r of rawRows) {
    const patientId = toPatientId(r.PatientID)
    if (patientId === null) continue

    const labDatum = toDate(r.LabDatum)
    const rawWert = toStr(r.Wert)

    let wertNum: number | null
    let wertOperator: WertOperator
    if (hasPreParsed) {
      const n = r.Wert_num
      wertNum = n === null || n === undefined || n === '' ? null : Number(n)
      if (wertNum !== null && Number.isNaN(wertNum)) wertNum = null
      wertOperator = toWertOperator(r.Wert_operator)
    } else {
      const parsed = parseWert(rawWert)
      wertNum = parsed.value
      wertOperator = parsed.operator
    }

    const patientSex = normaliseSex(toStr(r.PatientSex))

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const a = r.PatientAgeAtLab
      patientAgeAtLab =
        a === null || a === undefined || a === '' ? null : Math.trunc(Number(a))
      if (patientAgeAtLab !== null && Number.isNaN(patientAgeAtLab)) patientAgeAtLab = null
    } else if (hasBirth) {
      const birth = toDate(r.PatientGeburtsdatum)
      patientAgeAtLab = birth && labDatum ? completedYears(birth, labDatum) : null
    }

    out.push({
      patientId,
      labDatum,
      bezeichnung: toStr(r.Bezeichnung),
      einheit: toStr(r.Einheit),
      wert: rawWert,
      wertNum,
      wertOperator,
      loinc: toStr(r.LOINC),
      patientSex,
      patientAgeAtLab,
    })
  }
  return out
}
