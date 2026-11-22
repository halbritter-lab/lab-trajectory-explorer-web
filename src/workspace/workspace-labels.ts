import { exclusionReasonLabel as moduleExclusionReasonLabel } from '../core/analysis/registry'
import { CENSORED_VALUE_REASON } from '../core/measurements/censored'
import { ANCHOR_WINDOW_REASON } from '../core/cohort/anchorComparison'
import { msg, t, tp, type MessageKey } from '../i18n'

/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return t('Not recorded')
  return ({ w: t('Female'), m: t('Male'), d: t('Diverse') } as Record<string, string>)[value] ?? value
}

/** Readable reason a measurement is excluded from the fit, as the module that
 * excludes it names it. */
export function exclusionReasonLabel(reason: string): string {
  if (reason === CENSORED_VALUE_REASON) return t('censored value (limit, not exact)')
  if (reason === ANCHOR_WINDOW_REASON) return t('exclusion window after the anchor event, after-anchor slope only')
  return moduleExclusionReasonLabel(reason)
}

/** File name the bundled demo dataset is loaded under. */
export const DEMO_FILE_NAME = 'test_labs.xlsx (Demo)'

/** How a parameter (test name and unit) is shown everywhere. */
export function parameterLabel(bezeichnung: string, einheit: string | null): string {
  return `${bezeichnung} [${einheit ?? t('no unit')}]`
}

/** The count messages of `countLabel`: singular and plural with `{n}`. */
const COUNT_NOUNS = {
  value: [msg('{n} value'), msg('{n} values')],
  measurement: [msg('{n} measurement'), msg('{n} measurements')],
  'fitted point': [msg('{n} fitted point'), msg('{n} fitted points')],
  'fitted measurement': [msg('{n} fitted measurement'), msg('{n} fitted measurements')],
  'monthly median': [msg('{n} monthly median'), msg('{n} monthly medians')],
  'quarterly median': [msg('{n} quarterly median'), msg('{n} quarterly medians')],
  event: [msg('{n} event'), msg('{n} events')],
  'other selected event': [msg('{n} other selected event'), msg('{n} other selected events')],
  warning: [msg('{n} warning'), msg('{n} warnings')],
  trajectory: [msg('{n} trajectory'), msg('{n} trajectories')],
  row: [msg('{n} row'), msg('{n} rows')],
  'attribute row': [msg('{n} attribute row'), msg('{n} attribute rows')],
  'patient-day': [msg('{n} patient-day'), msg('{n} patient-days')],
  patient: [msg('{n} patient'), msg('{n} patients')],
  'lab value': [msg('{n} lab value'), msg('{n} lab values')],
  'creatinine value': [msg('{n} creatinine value'), msg('{n} creatinine values')],
  day: [msg('{n} day'), msg('{n} days')],
  date: [msg('{n} date'), msg('{n} dates')],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>
export type CountNoun = keyof typeof COUNT_NOUNS

/** "1 row", "3 rows": the count with the matching noun form, in the
 * interface language (English inside an export). */
export function countLabel(count: number, noun: CountNoun): string {
  const [one, other] = COUNT_NOUNS[noun]
  return tp(one, other, count)
}

/** What one fitted point of a column is: a measurement, or under time
 * balancing the median of a calendar month or quarter. Counts of fitted
 * points must use this noun, or "8 fitted measurements" is said of eight
 * quarterly medians built from 24 measurements. */
export function fittedPointNoun(timeBalancing: 'raw' | 'monthly-median' | 'quarterly-median'): CountNoun {
  return timeBalancing === 'monthly-median' ? 'monthly median' : timeBalancing === 'quarterly-median' ? 'quarterly median' : 'fitted measurement'
}
