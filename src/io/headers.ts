import type { RawRow } from './readWorkbook'

/** Header spellings are compared case-insensitively and without separators, so
 * "patient id", "Patient_ID" and "PatientID" all resolve to the same concept. */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Union of all column keys present across all rows in a raw row set. */
export function collectHeaders(rows: readonly RawRow[]): Set<string> {
  const headers = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headers.add(key)
    }
  }
  return headers
}

export type ResolvedColumns<K extends string> = Partial<Record<K, string>>

/**
 * Map each column concept to the header actually present in the file.
 *
 * Checks for ambiguous columns: if two distinct headers normalize to the same
 * consumed alias, throws an error.
 */
export function resolveColumns<K extends string>(
  headers: Iterable<string>,
  aliasMap: Record<K, readonly string[]>,
): ResolvedColumns<K> {
  const byNormalised = new Map<string, string>()
  const consumedKeys = new Set(
    Object.values<readonly string[]>(aliasMap).flatMap((aliases) => aliases.map(normaliseHeader)),
  )

  for (const header of headers) {
    const key = normaliseHeader(header)
    if (!consumedKeys.has(key)) continue
    const seen = byNormalised.get(key)
    if (seen !== undefined && seen !== header) {
      throw new Error(
        `Ambiguous columns: "${seen}" and "${header}" are read as the same column. ` +
          `Rename one of them.`,
      )
    }
    if (seen === undefined) byNormalised.set(key, header)
  }

  const resolved: ResolvedColumns<K> = {}
  for (const [concept, aliases] of Object.entries(aliasMap) as [K, readonly string[]][]) {
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

/** Read a cell by resolved column concept; undefined when the file lacks that column. */
export function cell<K extends string>(
  row: RawRow,
  columns: ResolvedColumns<K>,
  concept: K,
): unknown {
  const header = columns[concept]
  return header === undefined ? undefined : row[header]
}

/**
 * Ensure all required column concepts are present in the resolved mapping.
 * Throws a clear user-facing error if any are missing.
 */
export function checkRequiredColumns<K extends string>(
  resolved: ResolvedColumns<K>,
  required: readonly K[],
  fileLabel: string,
): void {
  const missing = required.filter((concept) => resolved[concept] === undefined)
  if (missing.length > 0) {
    throw new Error(`${fileLabel} missing required column(s): ${missing.join(', ')}.`)
  }
}

export const LAB_COLUMN_ALIASES = {
  patientId: ['patientId', 'PatientID'],
  labDate: ['labDate', 'LabDatum'],
  testName: ['testName', 'Bezeichnung'],
  unit: ['unit', 'Einheit'],
  value: ['value', 'Wert'],
  loinc: ['loinc', 'LOINC'],
  sex: ['sex', 'PatientSex'],
  ageAtLab: ['ageAtLab', 'PatientAgeAtLab'],
  birthDate: ['birthDate', 'PatientGeburtsdatum', 'Geburtsdatum'],
  valueNum: ['valueNum', 'Wert_num'],
  valueOperator: ['valueOperator', 'Wert_operator'],
} as const satisfies Record<string, readonly string[]>

export type LabColumnKey = keyof typeof LAB_COLUMN_ALIASES

export const REQUIRED_LAB_COLUMNS = [
  'patientId',
  'labDate',
  'testName',
  'unit',
  'value',
] as const satisfies readonly LabColumnKey[]

export const COLUMN_ALIASES = LAB_COLUMN_ALIASES
export const REQUIRED_COLUMNS = REQUIRED_LAB_COLUMNS

export const EVENTS_COLUMN_ALIASES = {
  patientId: ['patientId', 'PatientID'],
  type: ['type', 'Type', 'EventType', 'Typ'],
  date: ['date', 'Date', 'EventDate', 'Datum'],
  title: ['title', 'Title', 'Label', 'Titel'],
  description: ['description', 'Description', 'Beschreibung'],
  endDate: ['endDate', 'EndDate', 'EndDatum'],
  intent: ['intent', 'Intent'],
} as const satisfies Record<string, readonly string[]>

export type EventsColumnKey = keyof typeof EVENTS_COLUMN_ALIASES

export const REQUIRED_EVENTS_COLUMNS = [
  'patientId',
  'type',
  'date',
  'title',
] as const satisfies readonly EventsColumnKey[]

export const ATTRIBUTES_DEMOGRAPHICS_ALIASES = {
  patientId: ['patientId', 'PatientID'],
  sex: ['sex', 'PatientSex', 'Sex', 'Geschlecht'],
  birthDate: ['birthDate', 'PatientGeburtsdatum', 'Geburtsdatum', 'BirthDate'],
} as const satisfies Record<string, readonly string[]>
