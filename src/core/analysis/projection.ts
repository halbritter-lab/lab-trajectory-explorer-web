import { defaultProjectionSettings, type ProjectionResponse, type ProjectionSettings } from '../projection/projectionSnapshot'
import type { MixedModelSuccess } from '../mixedModel/types'
import { projectionTargetPresets } from './registry'

/** Default projection settings with the targets the modules offer for this
 * outcome (e.g. the CKD G4/G5 boundaries for eGFR). */
export function createDefaultProjectionSettings(result: MixedModelSuccess, response: ProjectionResponse): ProjectionSettings {
  return defaultProjectionSettings(result, projectionTargetPresets(response))
}
