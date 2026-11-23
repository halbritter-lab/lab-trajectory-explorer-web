/**
 * The column fit configuration the app uses: the generic base plus the
 * sections of the registered domain modules, and the presets that do not
 * depend on a domain. Domain presets live with their modules; the registry
 * assembles the catalog.
 */
import type { BaseFitConfig } from '../fitPipeline/types'
import { krtCensoring, noAkiExclusion, noEndpoints, type NephrologyFitSections } from '../domains/nephrology/fitConfig'
import { DEFAULT_BOUNDED_VALUE_POLICY } from '../measurements/censored'

export type FitPreset = 'general_exploration' | 'theil_sen' | 'ckd_progression' | 'acute_review' | 'custom'

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

/** General exploration: global OLS on all numeric measurements before kidney
 * replacement therapy (censoring after transplant and chronic dialysis since
 * 2026-11-22), no AKI or dialysis-interval exclusions, aggregation or endpoints. */
export function generalExplorationConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'general_exploration',
    xAxis: 'calendar_time',
    censoring: krtCensoring(),
    exclusions: noAkiExclusion(),
    timeBalancing: 'raw',
    fitModel: 'ols',
    endpoints: noEndpoints(),
    boundedValues: DEFAULT_BOUNDED_VALUE_POLICY,
  }
}

/** Theil–Sen robust trend: general exploration with the Theil–Sen estimator.
 * Recorded under its own preset id, as the app names it (decided 2026-11-21;
 * exports wrote 'custom' before). The id only records how the settings were
 * selected: no fit, identity or stored setting reads `preset`, and the same
 * values set by hand stay 'custom'. */
export function theilSenConfig(parameter: FitConfig['parameter']): FitConfig {
  return { ...generalExplorationConfig(parameter), preset: 'theil_sen', fitModel: 'theil-sen' }
}

/** The domain-independent entries of the preset catalog. */
export const STANDARD_PRESETS: readonly FitPresetDefinition[] = [
  {
    id: 'general_exploration',
    name: 'General exploration',
    category: 'Standard',
    description: 'Unweighted global OLS on all numeric measurements before kidney transplant or chronic dialysis, no time balancing.',
    optionLabel: 'General exploration (unweighted OLS)',
    summary: 'General exploration: global OLS per patient and parameter, unweighted individual measurements, censored from a kidney transplant or chronic dialysis start on, no AKI or dialysis-interval exclusions, and no time aggregation. Slopes are per year. Changing the axis affects the display, not the calculation.',
    buildConfig: generalExplorationConfig,
  },
  {
    id: 'theil_sen',
    name: 'Theil–Sen robust trend',
    category: 'Standard',
    description: 'Non-parametric median slope; resistant to outliers, unweighted, censored from a kidney transplant or chronic dialysis start on.',
    optionLabel: 'Theil–Sen robust trend (outlier resistant)',
    summary: 'Theil–Sen: non-parametric median slope, unweighted, resistant to outliers; censored from a kidney transplant or chronic dialysis start on.',
    buildConfig: theilSenConfig,
  },
]
