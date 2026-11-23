import type { ClinicalEvent } from '../events/events'
import { CLINICAL_EVENT_TYPES } from '../events/events'
import { patientIdKey } from '../types'
import { mixedModelFactorColumn, mixedModelFactors, type MixedModelConfig } from './config'
import type { MixedModelSpikeRow } from './types'

/**
 * Dropout of the patients of one fitted unit, by reason (decision `dropout`
 * of 2026-11-22, issue #4; Vonesh EF et al., Stat Med 2006;25:143). Rules of
 * this tool, not a published standard:
 *
 * - The follow-up of a patient starts at the date of the first model row
 *   (model time 0) and the last model row is the last date of the series in
 *   the model.
 * - `krt`: a kidney transplant or the start of chronic dialysis dated on or
 *   after the first model row.
 * - `death`: an event of the type `death` dated on or after the first model
 *   row, counted only when the app has that event type.
 * - With both, the earlier date decides; on the same day `krt`.
 * - `loss`: neither, and the last model row lies more than
 *   `LOSS_TO_FOLLOW_UP_DAYS` days before the end of the data, the latest lab
 *   date of the whole dataset.
 * - `in_follow_up`: every other patient.
 */
export const LOSS_TO_FOLLOW_UP_DAYS = 365
/** Above this share of patients with KRT or death within follow-up, the R
 * script suggests a joint-model sensitivity analysis (strictly greater). */
export const INFORMATIVE_DROPOUT_SHARE = 0.1

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.25 * MS_PER_DAY

export type DropoutReason = 'krt' | 'death' | 'loss' | 'in_follow_up'

export interface DropoutPatient {
  patientId: string
  /** Model level per categorical factor key. */
  levels: Record<string, string>
  baselineDate: string
  lastModelDate: string
  reason: DropoutReason
  /** Date of the KRT or death event; empty otherwise. */
  eventDate: string
  /** Years from the first model row to the event, or to the last model row without one. */
  yearsToEnd: number
}

export interface DropoutCount {
  /** Empty for the whole unit. */
  factor: string
  /** `all` for the whole unit. */
  level: string
  patients: number
  krt: number
  /** Null when the app has no event type `death`. */
  death: number | null
  loss: number
  inFollowUp: number
  /** (krt + death) / patients. */
  krtOrDeathShare: number
}

export interface MixedModelDropout {
  patients: DropoutPatient[]
  counts: DropoutCount[]
  deathRecorded: boolean
  /** The share of the whole unit is above `INFORMATIVE_DROPOUT_SHARE`. */
  informative: boolean
  dataEnd: string
}

/** Whether the event types include `death` (another package adds it). */
export function deathEventTypeExists(): boolean {
  return (CLINICAL_EVENT_TYPES as readonly string[]).includes('death')
}

/** The latest lab date of the dataset, or null without one. */
export function datasetEnd(rows: readonly { labDatum: Date | null }[]): Date | null {
  let end: number | null = null
  for (const row of rows) if (row.labDatum instanceof Date && Number.isFinite(row.labDatum.getTime()) && (end === null || row.labDatum.getTime() > end)) end = row.labDatum.getTime()
  return end === null ? null : new Date(end)
}

export function mixedModelDropout(
  rows: readonly MixedModelSpikeRow[],
  config: MixedModelConfig,
  events: readonly ClinicalEvent[],
  dataEnd: Date | null,
): MixedModelDropout {
  const deathRecorded = deathEventTypeExists()
  const categorical = mixedModelFactors(config).flatMap((factor, index) => factor.kind === 'categorical' ? [{ key: factor.key, column: mixedModelFactorColumn(factor, index) }] : [])
  const eventsByPatient = new Map<string, ClinicalEvent[]>()
  for (const event of events) {
    const key = patientIdKey(event.patientId)
    const bucket = eventsByPatient.get(key)
    if (bucket) bucket.push(event)
    else eventsByPatient.set(key, [event])
  }
  const byPatient = new Map<string, MixedModelSpikeRow[]>()
  for (const row of rows) {
    const bucket = byPatient.get(row.patient_id)
    if (bucket) bucket.push(row)
    else byPatient.set(row.patient_id, [row])
  }
  const endDay = dataEnd === null ? null : utcDay(dataEnd)
  const patients: DropoutPatient[] = []
  for (const [patientId, patientRows] of byPatient) {
    const dated = patientRows.filter(row => row.date).map(row => Date.parse(`${row.date}T00:00:00Z`)).filter(Number.isFinite)
    if (dated.length === 0) continue
    const baseline = Math.min(...dated)
    const last = Math.max(...dated)
    const after = (eventsByPatient.get(patientId) ?? []).filter(event => event.date instanceof Date && utcDay(event.date) >= baseline)
    const firstOf = (match: (event: ClinicalEvent) => boolean) => after.filter(match).map(event => utcDay(event.date)).sort((a, b) => a - b)[0]
    const krt = firstOf(event => event.type === 'kidney_transplant' || (event.type === 'dialysis' && event.intent === 'chronic'))
    const death = deathRecorded ? firstOf(event => (event.type as string) === 'death') : undefined
    let reason: DropoutReason
    let eventDay: number | undefined
    if (krt !== undefined && (death === undefined || krt <= death)) { reason = 'krt'; eventDay = krt }
    else if (death !== undefined) { reason = 'death'; eventDay = death }
    else reason = endDay !== null && endDay - last > LOSS_TO_FOLLOW_UP_DAYS * MS_PER_DAY ? 'loss' : 'in_follow_up'
    patients.push({
      patientId,
      levels: Object.fromEntries(categorical.map(({ key, column }) => [key, String(patientRows[0].factorValues?.[column] ?? '')])),
      baselineDate: isoDay(baseline),
      lastModelDate: isoDay(last),
      reason,
      eventDate: eventDay === undefined ? '' : isoDay(eventDay),
      yearsToEnd: Math.round((((eventDay ?? last) - baseline) / MS_PER_YEAR) * 1e10) / 1e10,
    })
  }
  const count = (factor: string, level: string, members: readonly DropoutPatient[]): DropoutCount => {
    const n = (reason: DropoutReason) => members.filter(patient => patient.reason === reason).length
    const krt = n('krt')
    const death = deathRecorded ? n('death') : null
    return { factor, level, patients: members.length, krt, death, loss: n('loss'), inFollowUp: n('in_follow_up'), krtOrDeathShare: members.length === 0 ? 0 : (krt + (death ?? 0)) / members.length }
  }
  const counts = [count('', 'all', patients)]
  for (const { key } of categorical) {
    const levels = [...new Set(patients.map(patient => patient.levels[key]))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const level of levels) counts.push(count(key, level, patients.filter(patient => patient.levels[key] === level)))
  }
  return { patients, counts, deathRecorded, informative: counts[0].krtOrDeathShare > INFORMATIVE_DROPOUT_SHARE, dataEnd: endDay === null ? '' : isoDay(endDay) }
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
