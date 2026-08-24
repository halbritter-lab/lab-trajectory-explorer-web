import type { PatientId } from '../types'
import { completedYears } from '../parse/loader'
import {
  birthDateInterval,
  intersectBirthIntervals,
  intervalGapDays,
  intervalMidpoint,
  isEmptyInterval,
  medianDate,
} from './birthDate'
import type { DemographicsConflict } from './types'

export interface AgeResolutionRow {
  labDatum: Date | null
  ageAtLab: number | null
  birthDate?: Date | null
}

export interface AgeResolutionInput {
  patientId: PatientId
  rows: readonly AgeResolutionRow[]
  attributeBirthDate: Date | null
  manualAge: number | undefined
}

export interface AgeResolution {
  /** The single birth date every row's age is derived from, or null when the
   * patient carries no age information at all — then the rows keep what they had. */
  birthAnchor: Date | null
  conflicts: DemographicsConflict[]
}

/** An explicit birth date wins on precedence alone, but "no silent resolution"
 * still applies: check it against every row that states an age and report the
 * rows it contradicts. The birth date wins regardless — this only reports. */
function explicitBirthDateConflict(
  patientId: PatientId,
  source: 'attributes' | 'labs',
  birthDate: Date,
  dated: readonly (AgeResolutionRow & { labDatum: Date })[],
): DemographicsConflict | null {
  const withAge = dated.filter((r) => r.ageAtLab !== null)
  const mismatchedRows = withAge.filter(
    (r) => completedYears(birthDate, r.labDatum) !== r.ageAtLab,
  ).length
  if (mismatchedRows === 0) return null
  return {
    kind: 'age_source_disagreement',
    patientId,
    source,
    mismatchedRows,
    totalRows: withAge.length,
  }
}

export function resolveBirthAnchor(input: AgeResolutionInput): AgeResolution {
  const dated = input.rows.filter((r): r is AgeResolutionRow & { labDatum: Date } => r.labDatum !== null)

  // 1. A manual age is the user's answer, read as the age at the first lab date
  //    so it ages across the series instead of freezing.
  if (input.manualAge !== undefined) {
    const earliest = dated.reduce<Date | null>(
      (min, r) => (min === null || r.labDatum.getTime() < min.getTime() ? r.labDatum : min),
      null,
    )
    if (earliest === null) return { birthAnchor: null, conflicts: [] }
    return { birthAnchor: intervalMidpoint(birthDateInterval(earliest, input.manualAge)), conflicts: [] }
  }

  // 2. and 3. An explicit birth date needs no inference, but disagreement with
  //    the stated ages is still worth reporting — see explicitBirthDateConflict.
  if (input.attributeBirthDate !== null) {
    const conflict = explicitBirthDateConflict(input.patientId, 'attributes', input.attributeBirthDate, dated)
    return { birthAnchor: input.attributeBirthDate, conflicts: conflict ? [conflict] : [] }
  }
  const rowBirthDate = dated.find((r) => r.birthDate != null)?.birthDate
  if (rowBirthDate != null) {
    const conflict = explicitBirthDateConflict(input.patientId, 'labs', rowBirthDate, dated)
    return { birthAnchor: rowBirthDate, conflicts: conflict ? [conflict] : [] }
  }

  // 4. Infer from the stated ages.
  const intervals = dated
    .filter((r) => r.ageAtLab !== null)
    .map((r) => birthDateInterval(r.labDatum, r.ageAtLab as number))
  const intersection = intersectBirthIntervals(intervals)
  if (intersection === null) return { birthAnchor: null, conflicts: [] }

  if (!isEmptyInterval(intersection)) {
    return { birthAnchor: intervalMidpoint(intersection), conflicts: [] }
  }

  return {
    birthAnchor: medianDate(intervals.map(intervalMidpoint)),
    conflicts: [
      {
        kind: 'age_no_common_birth_date',
        patientId: input.patientId,
        gapDays: intervalGapDays(intersection),
      },
    ],
  }
}
