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

/** A valid Date with a finite timestamp, or null. `toDate` in the loader
 * returns the value unchecked when the cell already is a `Date`, so an
 * Invalid Date can flow through from the attributes table or a lab row's
 * birthDate — the same hazard `labDatum` is guarded against above. Left
 * unchecked, it would become `birthAnchor` directly and turn
 * `completedYears` — and with it the patient's whole age series — into null
 * for every row, instead of falling through to the next precedence rule. */
function validDate(date: Date | null | undefined): Date | null {
  return date != null && Number.isFinite(date.getTime()) ? date : null
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
  // `!= null` alone would let an Invalid Date through: it is not null, but its
  // NaN timestamp loses every comparison in intersectBirthIntervals (NaN > x
  // and NaN < x are both false), so it can silently drag the anchor to NaN
  // without isEmptyInterval ever flagging it. Require a valid time instead.
  const dated = input.rows.filter(
    (r): r is AgeResolutionRow & { labDatum: Date } =>
      r.labDatum !== null && Number.isFinite(r.labDatum.getTime()),
  )

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
  const attributeBirthDate = validDate(input.attributeBirthDate)
  if (attributeBirthDate !== null) {
    const conflict = explicitBirthDateConflict(input.patientId, 'attributes', attributeBirthDate, dated)
    return { birthAnchor: attributeBirthDate, conflicts: conflict ? [conflict] : [] }
  }
  const rowsWithBirthDate = dated
    .map((r) => ({ row: r, birthDate: validDate(r.birthDate) }))
    .filter((x): x is { row: typeof dated[number]; birthDate: Date } => x.birthDate !== null)
  if (rowsWithBirthDate.length > 0) {
    // Take the earliest lab row's birth date rather than the first one in file
    // order, so the winner is deterministic and does not depend on row order.
    // Distinct dates across the rows are a contradiction in their own right —
    // a merge artefact or a typo — independent of whatever the stated ages
    // say, so that disagreement is reported even when it does not conflict
    // with any row's ageAtLab.
    const earliest = rowsWithBirthDate.reduce((min, x) =>
      x.row.labDatum.getTime() < min.row.labDatum.getTime() ? x : min,
    )
    const rowBirthDate = earliest.birthDate
    const distinctDates = new Set(rowsWithBirthDate.map((x) => x.birthDate.getTime())).size

    const conflicts: DemographicsConflict[] = []
    if (distinctDates > 1) {
      conflicts.push({
        kind: 'birth_date_row_disagreement',
        patientId: input.patientId,
        distinctDates,
        resolved: rowBirthDate,
      })
    }
    const ageConflict = explicitBirthDateConflict(input.patientId, 'labs', rowBirthDate, dated)
    if (ageConflict) conflicts.push(ageConflict)
    return { birthAnchor: rowBirthDate, conflicts }
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
