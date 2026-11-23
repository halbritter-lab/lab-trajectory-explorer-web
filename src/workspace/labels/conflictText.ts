/**
 * Demographic conflicts as the Data page lists them (issue #71). English is
 * `describeConflict` of the core, also used for the analysis messages and
 * the export; German composes the same sentence from the catalog.
 */
import { describeConflict } from '../../core/demographics/describe'
import type { DemographicsConflict } from '../../core/demographics/types'
import { getLanguage, t, tp } from '../../i18n'

const iso = (date: Date) => date.toISOString().slice(0, 10)

export function conflictText(conflict: DemographicsConflict): string {
  if (getLanguage() === 'en') return describeConflict(conflict)
  const patient = conflict.patientId
  switch (conflict.kind) {
    case 'sex_row_disagreement':
      return t('Patient {patient}: {parts} — resolved as "{resolved}".', { patient, resolved: conflict.resolved ?? '', parts: conflict.counts.map(c => tp('{n} row says "{sex}"', '{n} rows say "{sex}"', c.count, { sex: c.sex })).join(', ') })
    case 'sex_tie': {
      const parts = conflict.counts.map(c => `${c.count} × "${c.sex}"`).join(', ')
      return conflict.resolved !== null
        ? t('Patient {patient}: sex is split evenly ({parts}) — the attributes table says "{resolved}", which was used.', { patient, parts, resolved: conflict.resolved })
        : t('Patient {patient}: sex is split evenly ({parts}) — treated as unknown, so no eGFR is computed. Enter it under Patients to resolve.', { patient, parts })
    }
    case 'sex_source_disagreement':
      return t('Patient {patient}: the attributes table says "{attributes}", the lab rows say "{rows}" — the attributes table wins.', { patient, attributes: conflict.fromAttributes, rows: conflict.fromRows })
    case 'age_no_common_birth_date': {
      const head = t('Patient {patient}: the age values fit no single birth date — ages derived from the median instead.', { patient })
      const mismatches = conflict.mismatches ?? []
      if (!mismatches.length) return head
      const named = mismatches.slice(0, 3).map(m => t('{date} (stated {stated}, derived {derived})', { date: iso(m.labDate), stated: m.stated, derived: m.derived ?? t('none') })).join(', ')
      const more = mismatches.length > 3 ? ` ${t('and {n} more', { n: mismatches.length - 3 })}` : ''
      return `${head} ${tp('The stated age differs from the derived age on {mismatches} of {n} lab date: {named}.', 'The stated age differs from the derived age on {mismatches} of {n} lab dates: {named}.', conflict.statedDates ?? mismatches.length, { mismatches: mismatches.length, named: named + more })}`
    }
    case 'age_implausible':
      return tp('Patient {patient}: {n} stated age, such as {example}, is not a plausible age at the lab date — replaced by the age derived from the resolved birth date, or left empty.', 'Patient {patient}: {n} stated ages, such as {example}, are not plausible ages at the lab date — replaced by the age derived from the resolved birth date, or left empty.', conflict.rows, { patient, example: conflict.example })
    case 'age_source_disagreement':
      return (conflict.source === 'attributes'
        ? t('Patient {patient}: the birth date from the attributes table contradicts {mismatched} of {total} stated ages — the birth date wins.', { patient, mismatched: conflict.mismatchedRows, total: conflict.totalRows })
        : t('Patient {patient}: the birth date from the lab rows contradicts {mismatched} of {total} stated ages — the birth date wins.', { patient, mismatched: conflict.mismatchedRows, total: conflict.totalRows }))
    case 'birth_date_row_disagreement':
      return t('Patient {patient}: the lab rows carry {n} different birth dates — the one on the earliest lab row, {date}, was used.', { patient, n: conflict.distinctDates, date: iso(conflict.resolved) })
    case 'birth_date_source_disagreement':
      return t('Patient {patient}: the attributes table birth date ({attributes}) disagrees with the lab rows ({rows}) — the attributes table wins.', { patient, attributes: iso(conflict.fromAttributes), rows: iso(conflict.fromRows) })
  }
}
