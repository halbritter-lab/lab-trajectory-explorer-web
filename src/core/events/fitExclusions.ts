import type { SeriesPoint } from '../stats/series'
import type { ClinicalEvent } from './events'
import type { ExclusionReason, FitConfig } from '../fitPipeline/types'

export interface EventFitExclusionResult {
  points: SeriesPoint[]
  excludedIdx: number[]
}

export function filterFitPointsByClinicalEvents(
  points: SeriesPoint[],
  events: ClinicalEvent[] = [],
  censoring?: FitConfig['censoring'],
): EventFitExclusionResult {
  if (events.length === 0) return { points, excludedIdx: [] }

  const kept: SeriesPoint[] = []
  const excludedIdx: number[] = []
  points.forEach((point, index) => {
    if (events.some((event) => excludesPoint(point.date, event, censoring))) {
      excludedIdx.push(index)
    } else {
      kept.push(point)
    }
  })

  return { points: kept, excludedIdx }
}

export function clinicalEventAffectsFit(event: ClinicalEvent, censoring?: FitConfig['censoring']): boolean {
  if (event.type === 'kidney_transplant') return censoring?.censorAfterKidneyTransplant ?? true
  if (event.type !== 'dialysis') return false
  if (event.intent === 'chronic') return censoring?.censorAfterChronicDialysis ?? true
  if (event.intent === 'acute') return (censoring?.excludeAcuteDialysisPeriods ?? true) && event.endDate !== null
  if (event.intent === 'unknown') {
    const policy = censoring?.unknownDialysisPolicy ?? 'exclude-dated-interval'
    if (policy === 'censor-from-start') return true
    return policy === 'exclude-dated-interval' && event.endDate !== null
  }
  return false
}

function excludesPoint(date: Date, event: ClinicalEvent, censoring?: FitConfig['censoring']): boolean {
  return clinicalEventExclusionReason(date, event, censoring) !== null
}

/** Why a measurement on `date` is excluded from the fit by `event` under the
 * given censoring policy, or null when the event does not exclude it. The
 * single source of truth for event-based exclusion; `filterFitPointsByClinicalEvents`
 * is defined in terms of it, so the reason never disagrees with the exclusion. */
export function clinicalEventExclusionReason(
  date: Date,
  event: ClinicalEvent,
  censoring?: FitConfig['censoring'],
): ExclusionReason | null {
  const t = date.getTime()
  if (event.type === 'kidney_transplant') {
    return (censoring?.censorAfterKidneyTransplant ?? true) && t >= event.date.getTime() ? 'post_kidney_transplant' : null
  }
  if (event.type !== 'dialysis') return null
  if (event.intent === 'chronic') {
    return (censoring?.censorAfterChronicDialysis ?? true) && t >= event.date.getTime() ? 'post_chronic_dialysis' : null
  }
  if (event.intent === 'acute') {
    return (censoring?.excludeAcuteDialysisPeriods ?? true) && event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime()
      ? 'acute_dialysis'
      : null
  }
  if (event.intent === 'unknown') {
    const policy = censoring?.unknownDialysisPolicy ?? 'exclude-dated-interval'
    if (policy === 'censor-from-start') return t >= event.date.getTime() ? 'unknown_dialysis_interval' : null
    if (policy === 'exclude-dated-interval') {
      return event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime() ? 'unknown_dialysis_interval' : null
    }
  }
  return null
}
