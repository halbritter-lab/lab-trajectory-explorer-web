import type { SeriesPoint } from '../stats/series'
import type { ClinicalEvent } from './events'
import type { FitConfig } from '../fitPipeline/types'

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
  const t = date.getTime()
  if (event.type === 'kidney_transplant') {
    return (censoring?.censorAfterKidneyTransplant ?? true) && t >= event.date.getTime()
  }
  if (event.type !== 'dialysis') return false
  if (event.intent === 'chronic') {
    return (censoring?.censorAfterChronicDialysis ?? true) && t >= event.date.getTime()
  }
  if (event.intent === 'acute') {
    return (censoring?.excludeAcuteDialysisPeriods ?? true) && event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime()
  }
  if (event.intent === 'unknown') {
    const policy = censoring?.unknownDialysisPolicy ?? 'exclude-dated-interval'
    if (policy === 'censor-from-start') return t >= event.date.getTime()
    if (policy === 'exclude-dated-interval') {
      return event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime()
    }
  }
  return false
}
