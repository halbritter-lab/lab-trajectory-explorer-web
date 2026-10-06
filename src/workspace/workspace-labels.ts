import { exclusionReasonLabel as moduleExclusionReasonLabel } from '../core/analysis/registry'

/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return 'Not recorded'
  return ({ w: 'Female', m: 'Male', d: 'Diverse' } as Record<string, string>)[value] ?? value
}

/** Readable reason a measurement is excluded from the fit, as the module that
 * excludes it names it. */
export function exclusionReasonLabel(reason: string): string {
  return moduleExclusionReasonLabel(reason)
}
