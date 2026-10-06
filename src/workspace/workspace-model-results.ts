import { entityGroupValue, entityKey, type CohortModelEntityRows } from '../core/mixedModel/cohortModelEntity'
import { buildMixedModelResultIdentity, mixedModelIdentityEquals } from '../core/mixedModel/resultIdentity'
import type { StoredMixedModelResult } from '../ui/state/store'

/** Apply the same source-identity contract as the result table to chart output. */
export function currentWorkspaceModels(
  results: Record<string, StoredMixedModelResult> | null,
  entities: CohortModelEntityRows[],
  seriesIndex: number,
  seriesKey: string,
  fitConfigHash: string,
): Record<string, StoredMixedModelResult> {
  const current: Record<string, StoredMixedModelResult> = {}
  for (const item of entities) {
    const key = entityKey(item.entity)
    const stored = results?.[key]
    if (!stored || stored.result.status !== 'success' || !stored.result.converged) continue
    const identity = buildMixedModelResultIdentity({ seriesIndex, seriesKey, fitConfigHash,
      rows: item.rows, patientIds: item.rows.map(row => row.patient_id),
      preparation: item.preparation, groupValue: entityGroupValue(item.entity) })
    if (mixedModelIdentityEquals(identity, stored.identity)) current[key] = stored
  }
  return current
}
