import { isAkiCreatinineSource, isUnderDialysis } from '../core/domains/nephrology/aki/akiAware'
import type { ClinicalEvent } from '../core/events/events'

import { t } from '../i18n'

/** Shown wherever a creatinine value is left out of AKI detection; capitalised at the start of a cell. */
export function notUsedForAkiDetection(capital = false): string {
  return capital ? t('Not used for AKI detection (dialysis)') : t('not used for AKI detection (dialysis)')
}

/** Whether a value of this series, measured on `date`, is left out of AKI
 * detection because it was measured under dialysis. Display only: it asks the
 * rule the detection itself applies (`isUnderDialysis`) and concerns serum
 * creatinine series alone, the only ones detection reads. Independent of the
 * column's preset and of any fit exclusion. `events` are those of the patient. */
export function skippedByAkiDetection(series: { bezeichnung: string; einheit: string | null }, date: Date | null, events: readonly ClinicalEvent[]): boolean {
  return date !== null && events.length > 0 && isAkiCreatinineSource(series.bezeichnung, series.einheit) && isUnderDialysis(date, events)
}
