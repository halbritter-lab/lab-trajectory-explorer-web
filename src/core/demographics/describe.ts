import { patientIdKey } from '../types'
import type { DemographicsConflict } from './types'

export function conflictId(conflict: DemographicsConflict): string {
  return `demographics:${conflict.kind}:${patientIdKey(conflict.patientId)}`
}

/** One sentence per conflict: what disagreed, and what won. Kept out of the
 * module so the wording can be tested without building a pipeline context. */
export function describeConflict(conflict: DemographicsConflict): string {
  switch (conflict.kind) {
    case 'sex_row_disagreement': {
      const parts = conflict.counts.map(
        (c) => `${c.count} ${c.count === 1 ? 'row says' : 'rows say'} "${c.sex}"`,
      )
      return `Patient ${conflict.patientId}: ${parts.join(', ')} — resolved as "${conflict.resolved}".`
    }
    case 'sex_tie': {
      const parts = conflict.counts.map((c) => `${c.count} × "${c.sex}"`)
      return (
        `Patient ${conflict.patientId}: sex is split evenly (${parts.join(', ')}) — treated as ` +
        `unknown, so no eGFR is computed. Enter it under Patients to resolve.`
      )
    }
    case 'sex_source_disagreement':
      return (
        `Patient ${conflict.patientId}: the attributes table says "${conflict.fromAttributes}", ` +
        `the lab rows say "${conflict.fromRows}" — the attributes table wins.`
      )
    case 'age_no_common_birth_date':
      return (
        `Patient ${conflict.patientId}: the age values fit no single birth date ` +
        `(${conflict.gapDays} days apart) — ages derived from the median instead.`
      )
    case 'age_source_disagreement': {
      const from = conflict.source === 'attributes' ? 'the attributes table' : 'the lab rows'
      return (
        `Patient ${conflict.patientId}: the birth date from ${from} contradicts ` +
        `${conflict.mismatchedRows} of ${conflict.totalRows} stated ages — the birth date wins.`
      )
    }
    case 'birth_date_row_disagreement':
      return (
        `Patient ${conflict.patientId}: the lab rows carry ${conflict.distinctDates} different birth ` +
        `dates — the earliest, ${isoDate(conflict.resolved)}, was used.`
      )
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
