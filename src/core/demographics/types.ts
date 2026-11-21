import type { LabRow, PatientId, Sex } from '../types'

/** Demographics entered by hand for one patient; they take precedence over
 * imported values. */
export interface ManualDemographics {
  sex?: LabRow['patientSex']
  age?: number
}

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

/** A lab date whose stated age differs from the age derived from the birth
 * anchor; `derived` is null when the anchor lies after the lab date. */
export interface AgeMismatch {
  labDate: Date
  stated: number
  derived: number | null
}

export type DemographicsConflict =
  | { kind: 'sex_row_disagreement'; patientId: PatientId; counts: SexCount[]; resolved: Sex }
  /** `resolved` is null when the tie stands, and the sex that broke it
   * otherwise — an attributes-table entry outranks the rows, so an evenly
   * split patient can still end up with a sex and a computed eGFR. */
  | { kind: 'sex_tie'; patientId: PatientId; counts: SexCount[]; resolved: Sex | null }
  | { kind: 'sex_source_disagreement'; patientId: PatientId; fromAttributes: Sex; fromRows: Sex }
  /** `gapDays` is the gap between the birth-date intervals, not the size of
   * an error, so the message does not quote it. `mismatches` are the lab
   * dates whose stated age the anchor does not reproduce, ascending, one
   * entry per lab date and stated age (several parameters measured on one
   * day share it); `statedDates` counts all such entries with a stated age. */
  | { kind: 'age_no_common_birth_date'; patientId: PatientId; gapDays: number; mismatches?: AgeMismatch[]; statedDates?: number }
  /** Stated ages that are not plausible ages at their lab date (negative, or a
   * birth year in the age column). `example` is the first such stated value. */
  | { kind: 'age_implausible'; patientId: PatientId; rows: number; example: number }
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

