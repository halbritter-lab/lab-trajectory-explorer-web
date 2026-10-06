import type { AnalysisContribution, SeriesContext, SeriesContribution } from '../../analysis/types'
import { clinicalEventExclusionWindows } from './censoring'

/** Kidney transplant and dialysis events as censoring windows. Which events
 * censor what is configured per column (fit configuration `censoring`); see
 * clinicalEventExclusionWindow. */
export const clinicalEventsModule = {
  id: 'clinicalEvents',
  label: 'Clinical event censoring',
  apply: (): AnalysisContribution => ({}),
  series: (ctx: SeriesContext): SeriesContribution => ({
    censoring: clinicalEventExclusionWindows(ctx.events, ctx.fitConfig?.censoring),
  }),
}
