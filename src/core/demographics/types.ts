import type { PatientId, Sex } from '../types'

/** An inclusive range of candidate birth dates. `lo > hi` means the constraints
 * that produced it contradict each other — check with `isEmptyInterval`. */
export interface BirthInterval {
  lo: Date
  hi: Date
}

export interface SexCount {
  sex: Sex
  count: number
}

export type DemographicsConflict =
  | { kind: 'sex_row_disagreement'; patientId: PatientId; counts: SexCount[]; resolved: Sex }
  | { kind: 'sex_tie'; patientId: PatientId; counts: SexCount[] }
  | { kind: 'sex_source_disagreement'; patientId: PatientId; fromAttributes: Sex; fromRows: Sex }
  | { kind: 'age_no_common_birth_date'; patientId: PatientId; gapDays: number }
  | {
      kind: 'age_source_disagreement'
      patientId: PatientId
      source: 'attributes' | 'labs'
      mismatchedRows: number
      totalRows: number
    }
