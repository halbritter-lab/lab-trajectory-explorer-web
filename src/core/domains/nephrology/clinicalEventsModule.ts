import type { AnalysisModule, SeriesContext, SeriesContribution } from '../../analysis/types'
import { clinicalEventExclusionWindows, type ClinicalEventExclusionReason } from './censoring'

const REASON_LABELS: Record<ClinicalEventExclusionReason, string> = {
  acute_dialysis: 'acute dialysis interval',
  unknown_dialysis_interval: 'dialysis of unknown intent',
  post_chronic_dialysis: 'after chronic dialysis start',
  post_kidney_transplant: 'after kidney transplant',
}

/** Kidney transplant and dialysis events as censoring windows. Which events
 * censor what is configured per column (fit configuration `censoring`); see
 * clinicalEventExclusionWindow. */
export const clinicalEventsModule = {
  id: 'clinicalEvents' as const,
  label: 'Clinical event censoring',
  description: 'Censoring after kidney transplant or chronic dialysis and exclusion of dialysis intervals.',
  exclusionReasonLabels: REASON_LABELS,
  series: (ctx: SeriesContext): SeriesContribution => ({
    censoring: clinicalEventExclusionWindows(ctx.events, ctx.fitConfig?.censoring),
  }),
} satisfies AnalysisModule<undefined, 'clinicalEvents'>
