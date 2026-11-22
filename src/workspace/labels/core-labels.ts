/**
 * Fixed texts the core modules give the interface (event effects, presets,
 * module settings, exclusion reasons …). The core keeps them in English for
 * the exports; listing them here puts them in the catalogs, so `tx()` shows
 * them translated. A core text that is not listed stays English.
 */
import { msg } from '../../i18n'

export const CORE_LABELS = [
  // Event effects (nephrology/censoring.ts)
  msg('display only in fits; ends follow-up for endpoints and time to event'),
  msg('display only'),
  msg('warning, not excluded from fit'),
  msg('censor from event date'),
  msg('censor from dialysis start, unknown intent without end date'),
  msg('censor from dialysis start under the policy “Dated interval, else from start” (CKD progression) or “Censor from start”; not excluded under the other policies (unknown intent without end date)'),
  msg('censor from dialysis start, unknown intent'),
  msg('censor from dialysis start'),
  msg('exclude dialysis interval, unknown intent'),
  msg('exclude dialysis interval'),
] as const
