/**
 * The column fit configuration the app uses: the generic base plus the
 * sections of the registered domain modules, and the presets that do not
 * depend on a domain. Domain presets live with their modules; the registry
 * assembles the catalog.
 */
import type { BaseFitConfig } from '../fitPipeline/types'
import { noAkiExclusion, noCensoring, noEndpoints, type NephrologyFitSections } from '../domains/nephrology/fitConfig'

export type FitPreset = 'general_exploration' | 'ckd_progression' | 'acute_review' | 'custom'

export type FitConfig = BaseFitConfig & NephrologyFitSections & { preset: FitPreset }

/** A selectable analysis preset. */
export interface FitPresetDefinition {
  id: string
  name: string
  category: 'Standard' | 'Nephrology'
  description: string
  /** Entry in the preset menu. */
  optionLabel: string
  /** Explanation shown under the menu while the preset is selected. */
  summary: string
  buildConfig: (parameter: FitConfig['parameter']) => FitConfig
}

/** Menu group label per preset category. */
export const FIT_PRESET_CATEGORY_LABELS: Record<FitPresetDefinition['category'], string> = {
  Standard: 'Standard / General',
  Nephrology: 'Nephrology (CKD / AKI)',
}

/** General exploration: global OLS on all numeric measurements, no
 * censoring, exclusions, aggregation or endpoints. */
export function generalExplorationConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'general_exploration',
    xAxis: 'calendar_time',
    censoring: noCensoring(),
    exclusions: noAkiExclusion(),
    timeBalancing: 'raw',
    fitModel: 'ols',
    endpoints: noEndpoints(),
  }
}

/** Theil–Sen robust trend: general exploration with the Theil–Sen estimator.
 * Recorded as a custom configuration (preset 'custom'), as exports have always
 * shown it. */
export function theilSenConfig(parameter: FitConfig['parameter']): FitConfig {
  return { ...generalExplorationConfig(parameter), preset: 'custom', fitModel: 'theil-sen' }
}

/** The domain-independent entries of the preset catalog. */
export const STANDARD_PRESETS: readonly FitPresetDefinition[] = [
  {
    id: 'general_exploration',
    name: 'General exploration',
    category: 'Standard',
    description: 'Unweighted global OLS on all numeric measurements, no event censoring, no time balancing.',
    optionLabel: 'General exploration (unweighted OLS)',
    summary: 'General exploration: global OLS per patient and parameter, unweighted individual measurements, no AKI or event exclusions, and no time aggregation. Slopes are per year. Changing the axis affects the display, not the calculation.',
    buildConfig: generalExplorationConfig,
  },
  {
    id: 'theil_sen',
    name: 'Theil–Sen robust trend',
    category: 'Standard',
    description: 'Non-parametric median slope; resistant to outliers, unweighted, no event censoring.',
    optionLabel: 'Theil–Sen robust trend (outlier resistant)',
    summary: 'Theil–Sen: non-parametric median slope, unweighted, resistant to outliers.',
    buildConfig: theilSenConfig,
  },
]
