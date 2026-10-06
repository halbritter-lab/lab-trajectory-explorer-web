import { entityGroupValue, entityKey, type CohortModelEntityRows } from '../core/mixedModel/cohortModelEntity'
import { buildMixedModelResultIdentity, mixedModelIdentityEquals } from '../core/mixedModel/resultIdentity'
import { prepareMixedModelCohortRows, type PresetExclusionPolicy } from '../core/mixedModel/cohortDataset'
import { prepareMixedModelFactors } from '../core/mixedModel/factors'
import { mixedModelFactorColumn, mixedModelFactors, mixedModelFormula, mixedModelFormulaForOutcome, type MixedModelConfig } from '../core/mixedModel/config'
import type { CohortSeriesSpec } from '../core/cohort/screening'
import type { PatientGroup } from '../core/grouping/grouping'
import { normaliseSex } from '../core/demographics/sex'
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
  exclusionPolicy: PresetExclusionPolicy = 'apply',
): CohortModelEntityRows[] {
  const list: Array<{ entity: CohortModelEntityRows['entity']; rows: CohortModelEntityRows['rows']; excludedByPreset: number }> = [
    { entity: { kind: 'cohort' }, ...prepareMixedModelCohortRows(rows, patientIds, spec, exclusionPolicy) },
  ]
  if (groups.length > 0) {
    for (const group of groups) {
      const prepared = prepareMixedModelCohortRows(rows, group.patientIds, spec, exclusionPolicy)
      if (prepared.rows.length > 0 || prepared.excludedByPreset > 0) list.push({ entity: { kind: 'group', value: group.value }, ...prepared })
    }
  }
  return list.map(item => {
    const prepared = prepareMixedModelFactors(item.rows, config, patientAttributes, rows)
    return {
      entity: item.entity,
      rows: prepared.rows,
      preparation: { ...prepared.preparation, presetExclusionPolicy: exclusionPolicy, excludedByPreset: item.excludedByPreset },
    }
  })
}

/** Display only: user-provided attribute labels never enter the executable
 * formula, which uses positional column names such as factor_0_. */
export function readableMixedModelFormula(config: MixedModelConfig, outcome: string): string {
  const labels = new Map<string, string>([
    ['time_since_baseline', 'Time (years)'],
    ['patient_id', 'Patient'],
  ])
  mixedModelFactors(config).forEach((factor, index) => {
    const label = factor.key === 'baseline_age' ? 'Baseline age (centered)' : factor.key === 'sex' ? 'Sex' : factor.key
    labels.set(mixedModelFactorColumn(factor, index), JSON.stringify(label))
  })
  return mixedModelFormulaForOutcome(mixedModelFormula(config), outcome).replace(/baseline_age_centered|factor_\d+_|time_since_baseline|patient_id/g, (token) => labels.get(token) ?? token)
}
