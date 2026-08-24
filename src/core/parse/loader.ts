import type { LabRow, PatientId, WertOperator } from '../types'
import type { RawRow } from '../../io/readWorkbook'
import { parseWert } from './wert'
import { normaliseSex } from '../egfr/formulas'

const WERT_OPERATORS: readonly WertOperator[] = ['=', '<', '>', 'range', 'unparseable']

function toWertOperator(v: unknown): WertOperator {
  return WERT_OPERATORS.includes(v as WertOperator) ? (v as WertOperator) : 'unparseable'
}

/**
 * Column concepts and the header spellings accepted for each. The first entry
 * is the canonical name used by the download templates and the demo files; the
 * remaining entries keep workbooks written against the older mixed
 * German/English headers loading unchanged.
 *
 * Alias order decides only between spellings that normalise differently (e.g.
 * `value` vs `Wert`). `patientId` and `PatientID` — like `loinc` and `LOINC` —
 * normalise to the same key, so they are indistinguishable here; that is
 * harmless, since they denote the same column either way. Two *different*
 * columns collapsing to one key is not harmless and is rejected below.
 */
const COLUMN_ALIASES = {
  patientId: ['patientId', 'PatientID'],
  labDate: ['labDate', 'LabDatum'],
  testName: ['testName', 'Bezeichnung'],
  unit: ['unit', 'Einheit'],
  value: ['value', 'Wert'],
  loinc: ['loinc', 'LOINC'],
  sex: ['sex', 'PatientSex'],
  ageAtLab: ['ageAtLab', 'PatientAgeAtLab'],
  birthDate: ['birthDate', 'PatientGeburtsdatum'],
  valueNum: ['valueNum', 'Wert_num'],
  valueOperator: ['valueOperator', 'Wert_operator'],
} as const satisfies Record<string, readonly string[]>

type ColumnKey = keyof typeof COLUMN_ALIASES

export const REQUIRED_COLUMNS = [
  'patientId',
  'labDate',
  'testName',
  'unit',
  'value',
] as const satisfies readonly ColumnKey[]

/** Header spellings are compared case-insensitively and without separators, so
 * "patient id", "Patient_ID" and "PatientID" all resolve to the same concept. */
function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

type ResolvedColumns = Partial<Record<ColumnKey, string>>

/** Map each column concept to the header actually present in the file. */
function resolveColumns(headers: Iterable<string>): ResolvedColumns {
  const byNormalised = new Map<string, string>()
  const consumedKeys = new Set(
    Object.values(COLUMN_ALIASES).flatMap((aliases) => aliases.map(normaliseHeader)),
  )
  for (const header of headers) {
    const key = normaliseHeader(header)
    // Extra workbook metadata is ignored by this loader. Collisions between
    // those unused columns cannot discard a value the app consumes.
    if (!consumedKeys.has(key)) continue
    const seen = byNormalised.get(key)
    // Two distinct headers that normalise alike (e.g. "Patient ID" and
    // "patient_id") are genuinely ambiguous. Silently keeping one would drop a
    // whole column and still report a clean import, so refuse the file instead.
    // SheetJS already disambiguates exact duplicates as "Wert", "Wert_1", which
    // normalise differently and so do not trip this.
    if (seen !== undefined && seen !== header) {
      throw new Error(
        `Ambiguous columns: "${seen}" and "${header}" are read as the same column. ` +
          `Rename one of them.`,
      )
    }
    if (seen === undefined) byNormalised.set(key, header)
  }
  const resolved: ResolvedColumns = {}
  for (const [concept, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][]) {
    for (const alias of aliases) {
      const actual = byNormalised.get(normaliseHeader(alias))
      if (actual !== undefined) {
        resolved[concept] = actual
        break
      }
    }
  }
  return resolved
}

/** Read a cell by column concept; undefined when the file lacks that column. */
function cell(row: RawRow, columns: ResolvedColumns, concept: ColumnKey): unknown {
  const header = columns[concept]
  return header === undefined ? undefined : row[header]
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
 * Convert raw workbook rows into typed LabRow records. Headers are resolved
 * once against COLUMN_ALIASES, so both the canonical camelCase names and the
 * older German/PascalCase ones load; matching ignores case and separators.
 */
export function loadLabRows(rawRows: RawRow[]): LabRow[] {
  // Union of all rows' keys rather than just the first row's, so a column left
  // blank in the first data row can't cause its header to be missed (defensive;
  // readWorkbook's defval:null normally makes every row share the same keys).
  const headers = new Set<string>()
  for (const r of rawRows) for (const k of Object.keys(r)) headers.add(k)
  const columns = resolveColumns(headers)
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

    let patientAgeAtLab: number | null = null
    if (hasAge) {
      const a = cell(r, columns, 'ageAtLab')
      patientAgeAtLab =
        a === null || a === undefined || a === '' ? null : Math.trunc(Number(a))
      if (patientAgeAtLab !== null && Number.isNaN(patientAgeAtLab)) patientAgeAtLab = null
    } else if (hasBirth) {
      const birth = toDate(cell(r, columns, 'birthDate'))
      patientAgeAtLab = birth && labDatum ? completedYears(birth, labDatum) : null
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
    })
  }
  return out
}
