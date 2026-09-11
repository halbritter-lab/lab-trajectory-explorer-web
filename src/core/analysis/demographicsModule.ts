import { conflictId, describeConflict } from '../demographics/describe'
import { resolveDemographics } from '../demographics/resolve'
import type { AnalysisContext, AnalysisContribution } from './types'

/** First module in the pipeline: every later module, and every consumer of
 * analysisResult.rows, sees demographics that have already been made consistent
 * per patient. Takes no settings — resolution is not optional. */
export const demographicsModule = {
  id: 'demographics',
  label: 'Demographics',
  apply: (ctx: AnalysisContext): AnalysisContribution => {
    const { rows, conflicts } = resolveDemographics(
      ctx.rows,
      ctx.patientAttributes,
      ctx.manualDemographics,
    )
    return {
      rows,
      messages: conflicts.map((conflict) => ({
        id: conflictId(conflict),
        text: describeConflict(conflict),
        severity: 'warning' as const,
      })),
    }
  },
}
