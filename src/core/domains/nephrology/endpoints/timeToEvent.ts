/**
 * Time to a confirmed eGFR endpoint, per patient and per group (issue #78,
 * owner decisions `km`, `death` and `taxonomy` of 2026-11-22). Rules of this
 * tool where no source sets them; see docs/method-algorithms/time-to-event.md.
 *
 * - Entry: the first eligible eGFR measurement (exact, dated, before kidney
 *   replacement therapy and not after death, outside dated acute dialysis
 *   intervals: the endpoint input of the Trajectories table).
 * - Event date: the first crossing of the confirmed endpoint (`firstDate`),
 *   or the date of the first kidney transplant or chronic dialysis start for
 *   the KRT endpoint and the composite.
 * - Exit without the endpoint: the last eligible measurement; a death before
 *   the endpoint ends follow-up at the death date with status death (censored
 *   in Kaplan–Meier, the competing event in Aalen–Johansen).
 * - Time scales: age with delayed entry at the first eligible measurement
 *   (default), or time since that measurement.
 */
import type { SurvivalStatus, SurvivalSubject } from '../../../survival/survival'
import { aalenJohansen, kaplanMeier, logRankTest, type CumulativeIncidenceStep, type KaplanMeierResult, type LogRankResult } from '../../../survival/survival'

const MS_PER_DAY = 86_400_000
export const DAYS_PER_YEAR = 365.25

export type TimeToEventEndpoint = 'observedCkdG4' | 'observedCkdG5' | 'observedDecline40' | 'observedDecline50' | 'observedDecline57' | 'kidneyFailure'
export type TimeToEventScale = 'age' | 'time_since_entry'

export const TIME_TO_EVENT_ENDPOINTS: readonly { id: TimeToEventEndpoint; label: string }[] = [
  { id: 'observedCkdG4', label: 'Confirmed CKD G4 (eGFR below 30)' },
  { id: 'observedCkdG5', label: 'Confirmed CKD G5 (eGFR below 15)' },
  { id: 'observedDecline40', label: 'Confirmed 40% eGFR decline' },
  { id: 'observedDecline50', label: 'Confirmed 50% eGFR decline' },
  { id: 'observedDecline57', label: 'Confirmed 57% eGFR decline' },
  { id: 'kidneyFailure', label: 'Kidney replacement therapy (kidney transplant or chronic dialysis)' },
]

export interface TimeToEventSettings {
  endpoint: TimeToEventEndpoint
  /** The endpoint or kidney replacement therapy, whichever comes first. Ignored for `kidneyFailure`. */
  compositeWithKrt: boolean
  timeScale: TimeToEventScale
  /** Name of the grouping attribute; null for the whole cohort. */
  grouping: string | null
}

export interface TimeToEventPatientInput {
  patientId: string
  /** Value of the grouping attribute; null when the patient has none. */
  group: string | null
  firstEligibleDate: Date | null
  lastEligibleDate: Date | null
  /** First crossing and confirmation of the selected lab endpoint when it is met. */
  endpoint: { firstDate: Date; confirmedDate: Date | null } | null
  kidneyFailure: { type: 'kidney_transplant' | 'chronic_dialysis'; date: Date } | null
  /** Earliest death date. */
  deathDate: Date | null
  birthAnchor: Date | null
  /** The birth anchor comes from ages in whole years or a manual age. */
  ageEstimated: boolean
}

export type TimeToEventExclusion = 'no_group_value' | 'no_eligible_measurement' | 'endpoint_before_entry' | 'no_age' | 'no_follow_up'

export type TimeToEventOutcome = 'endpoint' | 'kidney_replacement_therapy' | 'death' | 'censored'

export interface TimeToEventPatientRow {
  patientId: string
  group: string
  included: boolean
  exclusion: TimeToEventExclusion | null
  /** Readable reason for the exclusion; empty for an included patient. */
  reason: string
  entryDate: Date | null
  exitDate: Date | null
  /** Whole days on the time scale: age in days, or days since entry. */
  entryDays: number | null
  exitDays: number | null
  status: SurvivalStatus | null
  outcome: TimeToEventOutcome | null
  /** Confirmation date of a lab endpoint event; null otherwise. */
  confirmedDate: Date | null
  ageEstimated: boolean
}

export interface TimeToEventGroupResult {
  label: string
  subjects: SurvivalSubject[]
  km: KaplanMeierResult
  /** Present when any included patient of the analysis has a death date. */
  cumulativeIncidence: CumulativeIncidenceStep[] | null
}

export interface TimeToEventAnalysis {
  settings: TimeToEventSettings
  rows: TimeToEventPatientRow[]
  groups: TimeToEventGroupResult[]
  /** Null without grouping or with fewer than two groups. */
  logRank: LogRankResult | null
  /** Any included patient has a recorded death. */
  deathRecorded: boolean
}

const isoDay = (date: Date | null) => date ? date.toISOString().slice(0, 10) : ''
const dayOf = (date: Date) => Math.floor(date.getTime() / MS_PER_DAY)

export function endpointLabel(endpoint: TimeToEventEndpoint, compositeWithKrt: boolean): string {
  const base = TIME_TO_EVENT_ENDPOINTS.find(item => item.id === endpoint)?.label ?? endpoint
  return endpoint !== 'kidneyFailure' && compositeWithKrt ? `${base} or kidney replacement therapy, whichever comes first` : base
}

/** One patient's entry, exit and status, or the reason the patient is left out. */
export function timeToEventRow(input: TimeToEventPatientInput, settings: TimeToEventSettings): TimeToEventPatientRow {
  const usesKrt = settings.endpoint === 'kidneyFailure' || settings.compositeWithKrt
  const base: TimeToEventPatientRow = { patientId: input.patientId, group: input.group ?? '', included: false, exclusion: null, reason: '', entryDate: null, exitDate: null,
    entryDays: null, exitDays: null, status: null, outcome: null, confirmedDate: null, ageEstimated: input.ageEstimated }
  const exclude = (exclusion: TimeToEventExclusion, reason: string): TimeToEventPatientRow => ({ ...base, exclusion, reason })
  if (settings.grouping !== null && (input.group === null || input.group === '')) return exclude('no_group_value', `No value for ${settings.grouping}`)
  const first = input.firstEligibleDate
  const last = input.lastEligibleDate
  if (first === null || last === null) {
    // KRT before the first measurement removes every value from endpoint input.
    if (usesKrt && input.kidneyFailure) return exclude('endpoint_before_entry', `Kidney replacement therapy (${isoDay(input.kidneyFailure.date)}) before the first eligible eGFR measurement`)
    return exclude('no_eligible_measurement', 'No eligible eGFR measurement (exact, dated, before kidney replacement therapy, not after death)')
  }
  const candidates: { date: Date; outcome: TimeToEventOutcome }[] = []
  if (settings.endpoint !== 'kidneyFailure' && input.endpoint) candidates.push({ date: input.endpoint.firstDate, outcome: 'endpoint' })
  if (usesKrt && input.kidneyFailure) candidates.push({ date: input.kidneyFailure.date, outcome: 'kidney_replacement_therapy' })
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime())
  const event = candidates[0] ?? null
  if (event && dayOf(event.date) <= dayOf(first)) {
    return exclude('endpoint_before_entry', `${event.outcome === 'endpoint' ? 'Endpoint' : 'Kidney replacement therapy'} on ${isoDay(event.date)}, at or before the first eligible measurement (${isoDay(first)})`)
  }
  let exitDate: Date
  let outcome: TimeToEventOutcome
  const death = input.deathDate
  // Without the KRT endpoint, KRT ends the observation of native kidney
  // function at the last eligible measurement; a later death is not counted.
  const krtEndsObservation = !usesKrt && input.kidneyFailure !== null && (death === null || dayOf(input.kidneyFailure.date) <= dayOf(death))
  if (death && (event === null || dayOf(death) < dayOf(event.date)) && !krtEndsObservation) {
    exitDate = death
    outcome = 'death'
  } else if (event) {
    exitDate = event.date
    outcome = event.outcome
  } else {
    exitDate = last
    outcome = 'censored'
  }
  let entryDays: number
  let exitDays: number
  if (settings.timeScale === 'age') {
    if (!input.birthAnchor || !Number.isFinite(input.birthAnchor.getTime())) return exclude('no_age', 'No birth date or age (needed on the age scale)')
    entryDays = Math.round((first.getTime() - input.birthAnchor.getTime()) / MS_PER_DAY)
    exitDays = Math.round((exitDate.getTime() - input.birthAnchor.getTime()) / MS_PER_DAY)
    if (entryDays < 0) return exclude('no_age', 'Birth date after the first eligible measurement')
  } else {
    entryDays = 0
    exitDays = dayOf(exitDate) - dayOf(first)
  }
  if (exitDays <= entryDays) return exclude('no_follow_up', `No follow-up after entry: ${outcome === 'death' ? 'death' : 'the last eligible measurement'} on the day of the first (${isoDay(first)})`)
  const status: SurvivalStatus = outcome === 'censored' ? 0 : outcome === 'death' ? 2 : 1
  return { ...base, included: true, entryDate: first, exitDate, entryDays, exitDays, status, outcome,
    confirmedDate: outcome === 'endpoint' ? input.endpoint?.confirmedDate ?? null : null }
}

export function timeToEventAnalysis(inputs: readonly TimeToEventPatientInput[], settings: TimeToEventSettings): TimeToEventAnalysis {
  const rows = inputs.map(input => timeToEventRow(input, settings))
  const included = rows.filter(row => row.included)
  const deathRecorded = included.some(row => inputs.find(input => input.patientId === row.patientId)?.deathDate)
  const labels = settings.grouping === null ? ['All patients']
    : [...new Set(included.map(row => row.group))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const groups = labels.map(label => {
    const members = settings.grouping === null ? included : included.filter(row => row.group === label)
    const subjects = members.map(row => ({ entry: row.entryDays!, exit: row.exitDays!, status: row.status! }))
    return { label, subjects, km: kaplanMeier(subjects), cumulativeIncidence: deathRecorded ? aalenJohansen(subjects) : null }
  })
  const logRank = groups.length >= 2 ? logRankTest(groups.map(group => ({ label: group.label, subjects: group.subjects }))) : null
  return { settings, rows, groups, logRank, deathRecorded }
}
