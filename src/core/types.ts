export type WertOperator = '=' | '<' | '>' | 'range' | 'unparseable'

export interface ParsedWert {
  value: number | null
  operator: WertOperator
  raw: string
}

export type Sex = 'm' | 'w' | 'd'

/** One spreadsheet row as read from a file: header → cell value. */
export type RawRow = Record<string, unknown>

/** The row of the source file a raw row came from, counted as a spreadsheet
 * shows it (header row = 1, first data row = 2), or undefined when the row was
 * not read from a file. `readWorkbook` attaches the position as a
 * non-enumerable `__rowNum__`. */
export function sourceRowNumber(row: RawRow): number | undefined {
  const rowNum = (row as { __rowNum__?: unknown }).__rowNum__
  return typeof rowNum === 'number' && Number.isFinite(rowNum) ? rowNum + 1 : undefined
}

export type PatientId = number | string

export function patientIdKey(patientId: PatientId): string {
  return String(patientId)
}

export function comparePatientIds(a: PatientId, b: PatientId): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export interface LabRow {
  patientId: PatientId
  labDatum: Date | null
  /** Time of day of the measurement in milliseconds after midnight, when the
   * source gave one (see `parseImportDate`). A sort key only: it orders the
   * values of one day in AKI detection and is neither shown nor exported;
   * `labDatum` stays the calendar day. Absent when the source gave no time,
   * on datasets persisted before this field existed and on derived rows. */
  labTime?: number
  bezeichnung: string | null
  einheit: string | null
  wert: string | null
  wertNum: number | null
  wertOperator: WertOperator
  loinc: string | null
  patientSex: Sex | null
  /** The sex cell as written in the file, kept so the UI can tell "no sex
   * recorded" apart from "sex recorded in a spelling we could not read" —
   * patientSex is null in both cases. Optional: datasets persisted before this
   * field existed, and row literals in tests, simply omit it. */
  patientSexRaw?: string | null
  patientAgeAtLab: number | null
  /** The birth date as read from the file, when the column was present. Kept so
   * demographics resolution can anchor ages exactly instead of inferring an
   * anchor from integer ages. Optional: datasets persisted before this field
   * existed, and row literals in tests, simply omit it. */
  patientBirthDate?: Date | null
  /** Row of the source file the measurement was read from (header row = 1),
   * so import findings and data checks can name it. Absent on derived rows,
   * on rows not read from a file and in datasets saved before 2026-11-21. */
  sourceRow?: number
  /** On a derived row (computed eGFR): the (name, unit) of the imported series
   * it was computed from, so AKI detection for the derived series uses that
   * series. Absent on imported rows. */
  sourceSeries?: { bezeichnung: string; einheit: string }
  /** On a computed eGFR row: the equation that produced it (issue #66; one
   * series can mix equations, e.g. CKiD U25 for a child and CKD-EPI 2021 from
   * 18). Absent on imported rows and on derived rows of saved copies, which
   * are derived again on load. */
  egfrFormula?: 'ckd-epi-2021' | 'ckd-epi-2009' | 'mdrd-4' | 'ekfc-2021' | 'ckid-u25' | 'schwartz-bedside'
  /** On a computed CKiD U25 or bedside Schwartz row: the height in cm the
   * value used, measured on the date or interpolated (unrounded). */
  egfrHeightCm?: number
}

export type FitReason =
  | 'n_below_threshold'
  | 'identical_timestamps'
  | null

export interface OlsFit {
  slope: number
  intercept: number
  r2: number
  ciLow: number
  ciHigh: number
  /** Standard error of the slope, sqrt(SSres / (n − 2) / Sxx). Set by the OLS
   * kernel only; absent for the exact two-point line and for Theil-Sen. */
  slopeSe?: number
  reason: FitReason
}
