import { exclusionReasonLabel as moduleExclusionReasonLabel } from '../core/analysis/registry'
import { CENSORED_VALUE_REASON } from '../core/measurements/censored'

/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return 'Not recorded'
  return ({ w: 'Female', m: 'Male', d: 'Diverse' } as Record<string, string>)[value] ?? value
}

/** Readable reason a measurement is excluded from the fit, as the module that
 * excludes it names it. */
export function exclusionReasonLabel(reason: string): string {
  if (reason === CENSORED_VALUE_REASON) return 'censored value (limit, not exact)'
  return moduleExclusionReasonLabel(reason)
}
