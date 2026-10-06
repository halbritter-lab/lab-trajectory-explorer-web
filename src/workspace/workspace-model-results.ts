import { entityGroupValue, entityKey, type CohortModelEntityRows } from '../core/mixedModel/cohortModelEntity'
import { buildMixedModelResultIdentity, mixedModelIdentityEquals } from '../core/mixedModel/resultIdentity'
import { mixedModelRowsByGroup, mixedModelRowsFromCohortInputs } from '../core/mixedModel/cohortDataset'
import { prepareMixedModelFactors } from '../core/mixedModel/factors'
import type { MixedModelConfig } from '../core/mixedModel/config'
import type { CohortSeriesSpec } from '../core/cohort/screening'
import type { PatientGroup } from '../core/grouping/grouping'
import { normaliseSex } from '../core/egfr/formulas'
import { patientIdKey, type LabRow, type PatientId } from '../core/types'
import type { StoredMixedModelResult } from './state/store'

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

/** Attributes the cohort models can group by: imported attributes plus the
 * resolved sex from the lab rows, with sex codes normalised. Shared by the
 * model workspace and the trajectory overlay so both build identical groups. */
export function workspaceGroupableAttributes(
  rows: readonly LabRow[],
  patientAttributes: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = {}
  for (const r of rows) {
    if (r.patientSex === null) continue
    const key = patientIdKey(r.patientId)
    if (merged[key] === undefined) merged[key] = { sex: r.patientSex }
  }
  for (const [key, attributes] of Object.entries(patientAttributes)) {
    if (!attributes) continue
    const normalisedSex = normaliseSex(attributes.sex)
    merged[key] = {
      ...merged[key],
      ...attributes,
      ...(normalisedSex !== null ? { sex: normalisedSex } : {}),
    }
  }
  return merged
}

/** The pooled cohort entity followed by one entity per group, each prepared
 * for the configured factors. The single construction used for fitting and for
 * every chart that looks fitted results up by identity. */
export function workspaceModelEntities(
  rows: readonly LabRow[],
  patientIds: readonly PatientId[],
  spec: CohortSeriesSpec,
  config: MixedModelConfig,
  patientAttributes: Record<string, Record<string, string>>,
  groups: readonly PatientGroup[],
): CohortModelEntityRows[] {
  const list: Array<{ entity: CohortModelEntityRows['entity']; rows: CohortModelEntityRows['rows'] }> = [
    { entity: { kind: 'cohort' }, rows: mixedModelRowsFromCohortInputs(rows, patientIds, spec) },
  ]
  if (groups.length > 0) {
    const byGroup = mixedModelRowsByGroup(rows, groups, spec)
    for (const group of groups) {
      const groupRows = byGroup[group.value]
      if (groupRows) list.push({ entity: { kind: 'group', value: group.value }, rows: groupRows })
    }
  }
  return list.map(item => ({
    entity: item.entity,
    ...prepareMixedModelFactors(item.rows, config, patientAttributes, rows),
  }))
}
