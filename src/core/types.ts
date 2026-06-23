export type WertOperator = '=' | '<' | '>' | 'range' | 'unparseable'

export interface ParsedWert {
  value: number | null
  operator: WertOperator
  raw: string
}

export type Sex = 'm' | 'w' | 'd'

export interface LabRow {
  patientId: number
  labDatum: Date | null
  bezeichnung: string | null
  einheit: string | null
  wert: string | null
  wertNum: number | null
  wertOperator: WertOperator
  loinc: string | null
  patientSex: Sex | null
  patientAgeAtLab: number | null
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
  reason: FitReason
}
