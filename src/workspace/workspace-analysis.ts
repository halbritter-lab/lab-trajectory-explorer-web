import type { FitConfig, FitModel, FitPreset, TimeBalancing, UnknownDialysisPolicy } from '../core/fitPipeline/types'
import { ckdProgressionConfig, generalExplorationConfig, acuteReviewConfig } from '../core/fitPipeline/types'

export interface AnalysisCatalogPreset {
  id: string
  name: string
  category: 'Standard' | 'Nephrology' | 'Custom'
  description: string
  buildConfig: (parameter: { bezeichnung: string; einheit: string | null }) => FitConfig
}

export const ANALYSIS_CATALOG: AnalysisCatalogPreset[] = [
  {
    id: 'general_exploration',
    name: 'General exploration',
    category: 'Standard',
    description: 'Unweighted global OLS on all numeric measurements, no event censoring, no time balancing.',
    buildConfig: generalExplorationConfig,
  },
  {
    id: 'theil_sen',
    name: 'Theil–Sen robust trend',
    category: 'Standard',
    description: 'Non-parametric median slope; resistant to outliers, unweighted, no event censoring.',
    buildConfig: (param) => ({
      ...generalExplorationConfig(param),
      preset: 'custom',
      fitModel: 'theil-sen',
    }),
  },
  {
    id: 'ckd_progression',
    name: 'CKD progression',
    category: 'Nephrology',
    description: 'Quarterly medians, censored after transplant and chronic dialysis, 30-day AKI exclusion, G5 endpoints, OLS trend.',
    buildConfig: ckdProgressionConfig,
  },
  {
    id: 'acute_review',
    name: 'Acute review',
    category: 'Nephrology',
    description: 'Day-level raw measurements without trend fit, focusing on KDIGO AKI episodes.',
    buildConfig: acuteReviewConfig,
  },
]

export interface WorkspaceFitSettings {
  presetId: string
  fitModel: FitModel
  timeBalancing: TimeBalancing
  censoring: {
    censorAfterKidneyTransplant: boolean
    censorAfterChronicDialysis: boolean
    excludeAcuteDialysisPeriods: boolean
    unknownDialysisPolicy: UnknownDialysisPolicy
  }
  exclusions: {
    excludeAkiWindows: boolean
    akiExclusionDays: number
  }
  endpoints: {
    percentDecline: boolean
    observedCkdG5: boolean
    projectedAgeToCkdG5: boolean
  }
  rapidEgfrThreshold: number
}

export function defaultFitSettings(presetId: string = 'general_exploration'): WorkspaceFitSettings {
  if (presetId === 'ckd_progression') {
    return {
      presetId: 'ckd_progression',
      fitModel: 'ols',
      timeBalancing: 'quarterly-median',
      censoring: {
        censorAfterKidneyTransplant: true,
        censorAfterChronicDialysis: true,
        excludeAcuteDialysisPeriods: true,
        unknownDialysisPolicy: 'exclude-dated-interval',
      },
      exclusions: {
        excludeAkiWindows: true,
        akiExclusionDays: 30,
      },
      endpoints: {
        percentDecline: true,
        observedCkdG5: true,
        projectedAgeToCkdG5: true,
      },
      rapidEgfrThreshold: 5.0,
    }
  }

  if (presetId === 'theil_sen') {
    return {
      presetId: 'theil_sen',
      fitModel: 'theil-sen',
      timeBalancing: 'raw',
      censoring: {
        censorAfterKidneyTransplant: false,
        censorAfterChronicDialysis: false,
        excludeAcuteDialysisPeriods: false,
        unknownDialysisPolicy: 'flag-only',
      },
      exclusions: {
        excludeAkiWindows: false,
        akiExclusionDays: 30,
      },
      endpoints: {
        percentDecline: false,
        observedCkdG5: false,
        projectedAgeToCkdG5: false,
      },
      rapidEgfrThreshold: 5.0,
    }
  }

  if (presetId === 'acute_review') {
    return {
      presetId: 'acute_review',
      fitModel: 'none',
      timeBalancing: 'raw',
      censoring: {
        censorAfterKidneyTransplant: false,
        censorAfterChronicDialysis: false,
        excludeAcuteDialysisPeriods: false,
        unknownDialysisPolicy: 'flag-only',
      },
      exclusions: {
        excludeAkiWindows: false,
        akiExclusionDays: 30,
      },
      endpoints: {
        percentDecline: false,
        observedCkdG5: false,
        projectedAgeToCkdG5: false,
      },
      rapidEgfrThreshold: 5.0,
    }
  }

  // default: general_exploration
  return {
    presetId: 'general_exploration',
    fitModel: 'ols',
    timeBalancing: 'raw',
    censoring: {
      censorAfterKidneyTransplant: false,
      censorAfterChronicDialysis: false,
      excludeAcuteDialysisPeriods: false,
      unknownDialysisPolicy: 'flag-only',
    },
    exclusions: {
      excludeAkiWindows: false,
      akiExclusionDays: 30,
    },
    endpoints: {
      percentDecline: false,
      observedCkdG5: false,
      projectedAgeToCkdG5: false,
    },
    rapidEgfrThreshold: 5.0,
  }
}

export function toFitConfig(
  settings: WorkspaceFitSettings,
  parameter: { bezeichnung: string; einheit: string | null },
): FitConfig {
  const preset: FitPreset = settings.presetId === 'ckd_progression'
    ? 'ckd_progression'
    : settings.presetId === 'acute_review'
      ? 'acute_review'
      : settings.presetId === 'general_exploration'
        ? 'general_exploration'
        : 'custom'

  return {
    parameter,
    preset,
    xAxis: preset === 'ckd_progression' ? 'age' : 'calendar_time',
    censoring: { ...settings.censoring },
    exclusions: { ...settings.exclusions },
    timeBalancing: settings.timeBalancing,
    fitModel: settings.fitModel,
    endpoints: { ...settings.endpoints },
  }
}

import type { CkdEndpoints } from '../core/endpoints/ckdEndpoints'
import { projectedG5Label } from '../ui/qualityLabels'

export function endpointBadge(endpoints: CkdEndpoints, hasFit: boolean): { label: string; title: string } | null {
  const labelParts: string[] = []
  const titleParts: string[] = []
  const decline = endpoints.percentDecline.value
  if (hasFit && decline !== null) {
    const change = -decline
    labelParts.push(`${change > 0 ? '+' : ''}${change.toFixed(0)}%`)
    titleParts.push(`total eGFR change ${change.toFixed(1)}% from baseline (not per year)`)
  }
  if (endpoints.observedCkdG5.met) {
    labelParts.push('CKD G5')
    const confirmed = endpoints.observedCkdG5.confirmedDate?.toISOString().slice(0, 10)
    titleParts.push(confirmed ? `observed CKD G5 confirmed ${confirmed}` : 'observed CKD G5')
  } else if (hasFit && endpoints.projectedAgeToCkdG5.value !== null) {
    const age = endpoints.projectedAgeToCkdG5.value
    labelParts.push(`G5 @ ${age.toFixed(1)}y`)
    titleParts.push(`projected age to CKD G5 ${age.toFixed(1)} years`)
  } else {
    const unavailable = projectedG5Label(endpoints)
    if (unavailable) {
      labelParts.push(unavailable.label)
      titleParts.push(unavailable.title)
    }
  }
  return labelParts.length > 0 ? { label: labelParts.join(' · '), title: titleParts.join(' · ') } : null
}

