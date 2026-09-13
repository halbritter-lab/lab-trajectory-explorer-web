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
  /** `resolved` is null when the tie stands, and the sex that broke it
   * otherwise — an attributes-table entry outranks the rows, so an evenly
   * split patient can still end up with a sex and a computed eGFR. */
  | { kind: 'sex_tie'; patientId: PatientId; counts: SexCount[]; resolved: Sex | null }
  | { kind: 'sex_source_disagreement'; patientId: PatientId; fromAttributes: Sex; fromRows: Sex }
  | { kind: 'age_no_common_birth_date'; patientId: PatientId; gapDays: number }
  | {
      kind: 'age_source_disagreement'
      patientId: PatientId
      source: 'attributes' | 'labs'
      mismatchedRows: number
      totalRows: number
    }
  | {
      kind: 'birth_date_row_disagreement'
      patientId: PatientId
      distinctDates: number
      resolved: Date
    }
  | {
      kind: 'birth_date_source_disagreement'
      patientId: PatientId
      fromAttributes: Date
      fromRows: Date
    }

