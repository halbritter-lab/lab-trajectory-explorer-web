import type { CohortCell } from '../core/cohort/screening'
import { EXPORT_DISCLAIMER_ROWS } from '../core/cohort/screening'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS } from '../core/domains/nephrology/constants'
import { normalizeConfirmationDays } from '../core/domains/nephrology/endpoints/ckdEndpoints'
import { firstDeathEvent } from '../core/domains/nephrology/endpoints/endpointEventPolicy'
import type { CkdEndpointConfig } from '../core/domains/nephrology/fitConfig'
import { DAYS_PER_YEAR, endpointLabel, TIME_TO_EVENT_ENDPOINTS, type TimeToEventAnalysis, type TimeToEventEndpoint, type TimeToEventPatientInput, type TimeToEventScale } from '../core/domains/nephrology/endpoints/timeToEvent'
import type { ClinicalEvent } from '../core/events/events'
import { atRisk, stepValueAt, type SurvivalSubject } from '../core/survival/survival'
import { patientIdKey, type PatientId } from '../core/types'

/** The endpoints of the time-to-event view that the parameter's endpoint
 * settings under Trajectories evaluate: no second copy of the definition. */
export function availableTimeToEventEndpoints(endpoints: Partial<CkdEndpointConfig> | undefined): TimeToEventEndpoint[] {
  return TIME_TO_EVENT_ENDPOINTS.map(item => item.id).filter(id => {
    if (id === 'observedCkdG4') return endpoints?.observedCkdG4 ?? false
    if (id === 'observedCkdG5') return endpoints?.observedCkdG5 ?? false
    if (id === 'observedDecline50') return (endpoints?.percentDecline ?? false) && (endpoints?.observedDecline50 ?? false)
    if (id === 'observedDecline40' || id === 'observedDecline57') return endpoints?.percentDecline ?? false
    return true
  })
}

/** The endpoint definition in words, as the parameter's settings give it. */
export function endpointDefinitionText(endpoint: TimeToEventEndpoint, compositeWithKrt: boolean, endpoints: Partial<CkdEndpointConfig> | undefined, parameterLabel: string): string {
  const days = normalizeConfirmationDays(endpoints?.confirmationDays ?? DEFAULT_CONFIRMATION_DAYS)
  const confirm = `confirmed by a value at least ${days} days and at most 12 calendar months after the first crossing; the event is dated at the first crossing`
  const krt = 'the first kidney transplant or chronic dialysis start of the events sheet'
  let text: string
  if (endpoint === 'observedCkdG4') text = `CKD G4: ${parameterLabel} below ${CKD_G4_EGFR_THRESHOLD} mL/min/1.73 m², ${confirm}`
  else if (endpoint === 'observedCkdG5') text = `CKD G5: ${parameterLabel} below ${CKD_G5_EGFR_THRESHOLD} mL/min/1.73 m², ${confirm}`
  else if (endpoint === 'kidneyFailure') text = `Kidney replacement therapy: ${krt}`
  else {
    const percent = endpoint === 'observedDecline40' ? 40 : endpoint === 'observedDecline50' ? 50 : 57
    text = `${percent}% decline of ${parameterLabel} from the baseline (mean of the eligible values in the first 90 days), ${confirm}`
  }
  return endpoint !== 'kidneyFailure' && compositeWithKrt ? `${text}; or ${krt}, whichever comes first` : text
}

/** Per-patient input from the Trajectories cells of one eGFR parameter. */
export function timeToEventInputs(
  cells: readonly { patientId: PatientId; cell: CohortCell | undefined }[],
  endpoint: TimeToEventEndpoint,
  grouping: string | null,
  groupableAttributes: Record<string, Record<string, string>>,
  events: readonly ClinicalEvent[],
  patients: readonly { id: PatientId; birthAnchor?: Date | null; ageEstimated?: boolean }[],
): TimeToEventPatientInput[] {
  const eventsByPatient = new Map<string, ClinicalEvent[]>()
  for (const event of events) {
    const key = patientIdKey(event.patientId)
    eventsByPatient.set(key, [...(eventsByPatient.get(key) ?? []), event])
  }
  const patientByKey = new Map(patients.map(patient => [patientIdKey(patient.id), patient]))
  return cells.map(({ patientId, cell }) => {
    const key = patientIdKey(patientId)
    const patient = patientByKey.get(key)
    const result = cell && endpoint !== 'kidneyFailure' ? cell.endpoints[endpoint] : null
    return {
      patientId: String(patientId),
      group: grouping === null ? null : groupableAttributes[key]?.[grouping] ?? null,
      firstEligibleDate: cell?.firstEligibleDate ?? null,
      lastEligibleDate: cell?.lastEligibleDate ?? null,
      endpoint: result?.met && result.firstDate ? { firstDate: result.firstDate, confirmedDate: result.confirmedDate } : null,
      kidneyFailure: cell?.endpoints.kidneyFailureReached ?? null,
      deathDate: firstDeathEvent(eventsByPatient.get(key) ?? []),
      birthAnchor: patient?.birthAnchor ?? null,
      ageEstimated: patient?.ageEstimated ?? false,
    }
  })
}

export const TIME_SCALE_LABELS: Record<TimeToEventScale, string> = {
  age: 'Age, with entry at the first eligible measurement (delayed entry)',
  time_since_entry: 'Years since the first eligible measurement',
}

/** Patients at risk at `years` for the table under the chart: entry < t <= exit,
 * as in the estimate; at time 0 of the time-since scale every patient counts. */
export function numberAtRiskAt(subjects: readonly SurvivalSubject[], years: number, scale: TimeToEventScale): number {
  const days = years * DAYS_PER_YEAR
  if (scale === 'time_since_entry' && days === 0) return subjects.length
  return atRisk(subjects, days)
}

const isoDay = (date: Date | null) => date ? date.toISOString().slice(0, 10) : ''
const years = (days: number | null) => days === null ? '' : days / DAYS_PER_YEAR
const blank = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '' : value

export interface TimeToEventExportMeta {
  parameterLabel: string
  parameterKey: string
  definition: string
  workbookName: string
  appVersion: string
  exportedAt?: Date
}

/** The time-to-event workbook: one row per patient first, then the estimates
 * and an R script that reproduces them. */
export function timeToEventExportSheets(analysis: TimeToEventAnalysis, meta: TimeToEventExportMeta): { name: string; rows: object[] }[] {
  const { settings } = analysis
  const scale = settings.timeScale
  const patients = analysis.rows.map(row => ({
    patient_id: row.patientId,
    group: row.group,
    included: row.included ? 'yes' : 'no',
    exclusion_reason: row.reason,
    entry_date: isoDay(row.entryDate),
    exit_date: isoDay(row.exitDate),
    entry_years: years(row.entryDays),
    exit_years: years(row.exitDays),
    entry_days: row.entryDays ?? '',
    exit_days: row.exitDays ?? '',
    status: row.status ?? '',
    outcome: row.outcome ?? '',
    endpoint_confirmed_date: isoDay(row.confirmedDate),
    time_scale: scale,
    age_estimated: scale === 'age' && row.included ? (row.ageEstimated ? 'yes' : 'no') : '',
    endpoint_definition: meta.definition,
    parameter: meta.parameterLabel,
  }))
  const km = analysis.groups.flatMap(group => group.km.steps.map(step => ({ group: group.label, time_years: step.time / DAYS_PER_YEAR, time_days: step.time, n_risk: step.nRisk, n_event: step.nEvent, n_censor: step.nCensor, n_death: step.nDeath,
    survival: step.survival, std_err: blank(step.stdErr), lower_95: blank(step.lower), upper_95: blank(step.upper) })))
  const summary = analysis.groups.map(group => ({ group: group.label, patients: group.km.subjects, events: group.km.events, censored: group.km.censored, of_which_died: group.km.deaths,
    median_years: group.km.median.estimate === null ? 'not reached' : group.km.median.estimate / DAYS_PER_YEAR,
    median_lower_95: group.km.median.lower === null ? '' : group.km.median.lower / DAYS_PER_YEAR,
    median_upper_95: group.km.median.upper === null ? 'not reached' : group.km.median.upper / DAYS_PER_YEAR }))
  const logRank = analysis.logRank ? [
    ...analysis.logRank.groups.map(group => ({ group: group.label, patients: group.subjects, observed: group.observed, expected: group.expected, variance: group.variance, chi_square: '', df: '', p_value: '' })),
    { group: 'test', patients: '', observed: '', expected: '', variance: '', chi_square: blank(analysis.logRank.chiSquare), df: analysis.logRank.df, p_value: blank(analysis.logRank.pValue) },
  ] : [{ group: 'not computed: fewer than two groups', patients: '', observed: '', expected: '', variance: '', chi_square: '', df: '', p_value: '' }]
  const cif = analysis.deathRecorded ? analysis.groups.flatMap(group => (group.cumulativeIncidence ?? []).map(step => ({ group: group.label, time_years: step.time / DAYS_PER_YEAR, time_days: step.time, n_risk: step.nRisk, n_event: step.nEvent, n_death: step.nDeath,
    cumulative_incidence_endpoint: step.endpoint, cumulative_incidence_death: step.death, one_minus_km: 1 - stepValueAt(group.km.steps, s => s.survival, step.time) }))) : []
  const about = [
    ...EXPORT_DISCLAIMER_ROWS,
    { note: `Time to event of ${meta.parameterLabel} (${meta.parameterKey}); app version ${meta.appVersion}; exported ${(meta.exportedAt ?? new Date()).toISOString()}.` },
    { note: `Endpoint: ${endpointLabel(settings.endpoint, settings.compositeWithKrt)}. Definition, from the endpoint settings of this parameter under Trajectories: ${meta.definition}.` },
    { note: `Time scale: ${TIME_SCALE_LABELS[scale]}. ${scale === 'age' ? 'entry_days and exit_days are ages in whole days from the birth date or the birth anchor estimated from ages in completed years (age_estimated = yes, up to a year off); patients are at risk from entry (exclusive) to exit (inclusive), Surv(entry, exit, status) in R.' : 'entry_days is 0 and exit_days the days from the first eligible measurement to exit.'} *_years = *_days / 365.25.` },
    { note: 'Entry: the first eligible eGFR measurement (exact, dated, before the first kidney transplant or chronic dialysis start, not after a death, outside dated acute dialysis intervals). Exit: the event date, a death before the endpoint, or the last eligible measurement. status 1 = endpoint, 2 = death (censored in Kaplan–Meier, the competing event in Aalen–Johansen), 0 = censored. Without the KRT endpoint, kidney replacement therapy ends follow-up at the last eligible measurement (censored).' },
    { note: 'Patients with the endpoint at or before entry, without an eligible measurement, without an age on the age scale, without a group value, or with no follow-up after entry are listed with included = no and the reason.' },
    { note: 'km: product-limit estimate at every exit time, Greenwood standard error and a pointwise 95% log-log interval. km_summary: the median event-free time and its 95% interval by Brookmeyer–Crowley on the log-log interval ("not reached" when the curve stays above 0.5). logrank: observed and expected endpoints per group and the chi-square statistic on the same delayed-entry risk sets. cumulative_incidence (with recorded deaths only): Aalen–Johansen cumulative incidence of the endpoint with death as competing event, beside 1 − KM.' },
    { note: 'The comparison of these numbers with R survival is pending (issue #79); r_script reproduces them.' },
    { note: 'This file contains personal data: patient IDs as imported and dates of measurements and events. Check it before passing it on.' },
  ]
  return [
    { name: 'time_to_event', rows: patients },
    { name: 'km', rows: km.length ? km : [{ group: '', note: 'no patient in the analysis' }] },
    { name: 'km_summary', rows: summary },
    { name: 'logrank', rows: logRank },
    ...(analysis.deathRecorded ? [{ name: 'cumulative_incidence', rows: cif }] : []),
    { name: 'about', rows: about },
    { name: 'r_script', rows: timeToEventRScript(analysis, meta.workbookName).map(line => ({ line })) },
  ]
}

/** R code reproducing the estimates from the `time_to_event` sheet. */
export function timeToEventRScript(analysis: TimeToEventAnalysis, workbookName: string): string[] {
  const grouped = analysis.settings.grouping !== null
  const rhs = grouped ? 'group' : '1'
  const age = analysis.settings.timeScale === 'age'
  return [
    '# Lab Trajectory Explorer: time to event. Research use only.',
    '# Reproduces km, km_summary, logrank and cumulative_incidence of this workbook.',
    'library(readxl)',
    'library(survival)',
    `tte <- read_excel(${JSON.stringify(workbookName)}, sheet = "time_to_event", col_types = "text")`,
    'tte <- tte[tte$included == "yes", ]',
    'tte$entry <- as.numeric(tte$entry_days) / 365.25',
    'tte$exit <- as.numeric(tte$exit_days) / 365.25',
    'tte$status <- as.integer(tte$status)',
    `# ${age ? 'Age scale with delayed entry: at risk from entry (exclusive) to exit (inclusive).' : 'Years since the first eligible measurement (entry 0).'}`,
    `km <- survfit(Surv(entry, exit, status == 1) ~ ${rhs}, data = tte, conf.type = "log-log")`,
    'summary(km)',
    'print(km)  # median and its 95% interval',
    '# Log-rank on the delayed-entry risk sets; survdiff accepts right-censored data only.',
    'logrank_lt <- function(entry, exit, event, group) {',
    '  g <- factor(group); k <- nlevels(g)',
    '  O <- E <- numeric(k); V <- matrix(0, k, k)',
    '  for (t in sort(unique(exit[event]))) {',
    '    r <- entry < t & t <= exit',
    '    n_g <- tabulate(as.integer(g[r]), k); n <- sum(n_g)',
    '    d_g <- tabulate(as.integer(g[event & exit == t]), k); d <- sum(d_g)',
    '    O <- O + d_g; E <- E + d * n_g / n',
    '    if (n > 1) V <- V + d * (n - d) / (n - 1) * (diag(n_g / n, k) - outer(n_g / n, n_g / n))',
    '  }',
    '  used <- head(which(diag(V) > 1e-12), -1)',
    '  u <- (O - E)[used]',
    '  chisq <- drop(t(u) %*% solve(V[used, used, drop = FALSE], u))',
    '  list(observed = O, expected = E, chisq = chisq, df = length(used), p = pchisq(chisq, length(used), lower.tail = FALSE))',
    '}',
    ...(grouped ? [
      'logrank_lt(tte$entry, tte$exit, tte$status == 1, tte$group)',
      ...(age ? [] : ['survdiff(Surv(exit, status == 1) ~ group, data = tte)  # the same test without delayed entry']),
    ] : ['# One group: no log-rank test.']),
    ...(analysis.deathRecorded ? [
      '# Aalen-Johansen cumulative incidence with death as competing event.',
      'tte$state <- factor(tte$status, levels = 0:2, labels = c("censored", "endpoint", "death"))',
      `aj <- survfit(Surv(entry, exit, state) ~ ${rhs}, data = tte, id = patient_id)`,
      'summary(aj)',
    ] : []),
  ]
}
