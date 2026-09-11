import type { PatientId, Sex } from '../types'
import type { DemographicsConflict, SexCount } from './types'

export interface SexResolutionInput {
  patientId: PatientId
  /** One entry per lab row of this patient; null for missing or unreadable. */
  rowSexes: readonly (Sex | null)[]
  attributeSex: Sex | null
  manualSex: Sex | null
}

export interface SexResolution {
  sex: Sex | null
  conflicts: DemographicsConflict[]
}

/** Votes per spelling, most frequent first; ties broken alphabetically so the
 * order is stable for both the tie check and the message text. */
function tally(rowSexes: readonly (Sex | null)[]): SexCount[] {
  const counts = new Map<Sex, number>()
  for (const sex of rowSexes) {
    if (sex === null) continue
    counts.set(sex, (counts.get(sex) ?? 0) + 1)
  }
  return [...counts]
    .map(([sex, count]) => ({ sex, count }))
    .sort((a, b) => b.count - a.count || a.sex.localeCompare(b.sex))
}

export function resolveSex(input: SexResolutionInput): SexResolution {
  const counts = tally(input.rowSexes)
  const tied = counts.length > 1 && counts[0].count === counts[1].count
  const fromRows = counts.length === 0 || tied ? null : counts[0].sex

  // A manual entry means the user already looked at this patient. Repeating the
  // underlying disagreement would nag about something they have resolved — the
  // same reason unrecognisedSexValues skips patients with manual demographics.
  if (input.manualSex !== null) return { sex: input.manualSex, conflicts: [] }

  // Decide first, report second. The attributes table outranks the rows, so a
  // conflict that named the row majority as the winner would tell the reader
  // the analysis used a sex it did not use.
  const resolved = input.attributeSex !== null ? input.attributeSex : fromRows

  const conflicts: DemographicsConflict[] = []
  if (tied) {
    conflicts.push({ kind: 'sex_tie', patientId: input.patientId, counts, resolved })
  } else if (counts.length > 1) {
    conflicts.push({
      kind: 'sex_row_disagreement',
      patientId: input.patientId,
      counts,
      // Non-null here: more than one spelling and no tie means the rows have a
      // majority, so `resolved` is either that majority or the attributes table.
      resolved: resolved as Sex,
    })
  }

  if (input.attributeSex !== null && fromRows !== null && fromRows !== input.attributeSex) {
    conflicts.push({
      kind: 'sex_source_disagreement',
      patientId: input.patientId,
      fromAttributes: input.attributeSex,
      fromRows,
    })
  }
  return { sex: resolved, conflicts }
}
