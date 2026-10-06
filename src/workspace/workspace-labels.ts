import type { ExclusionReason } from '../core/fitPipeline/types'

/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return 'Not recorded'
  return ({ w: 'Female', m: 'Male', d: 'Diverse' } as Record<string, string>)[value] ?? value
}

const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  aki: 'AKI window',
  acute_dialysis: 'acute dialysis interval',
  unknown_dialysis_interval: 'dialysis of unknown intent',
  post_chronic_dialysis: 'after chronic dialysis start',
  post_kidney_transplant: 'after kidney transplant',
}

/** Readable reason a measurement is excluded from the fit. */
export function exclusionReasonLabel(reason: ExclusionReason): string {
  return EXCLUSION_REASON_LABELS[reason]
}
