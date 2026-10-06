import type { SlopeMode } from '../stats/summarize'
import type { FitModel } from './types'

/** The slope mode that runs a fit model: Theil–Sen is the robust global
 * fit, rolling and segmented OLS are their own modes, everything else is the
 * global OLS fit ('none' included; it is not fitted at all). */
export function modeForFitModel(fitModel: FitModel): SlopeMode {
  if (fitModel === 'theil-sen') return 'global-robust'
  if (fitModel === 'rolling-ols') return 'rolling'
  if (fitModel === 'segmented-ols') return 'gap-split'
  return 'global'
}
