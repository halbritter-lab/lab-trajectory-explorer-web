import type { MixedModelSpikeRow } from './types'

/** A unit to fit a cohort mixed model for: either the pooled whole cohort or one
 * group. Domain-neutral — a group value is whatever the chosen attribute holds. */
export type CohortModelEntity =
  | { kind: 'cohort' }
  | { kind: 'group'; value: string }

export interface CohortModelEntityRows {
  entity: CohortModelEntity
  rows: MixedModelSpikeRow[]
}

/** Stable map/selection key. `'cohort'` for the pooled fit; `'group:<value>'` for
 * a group. The `group:` prefix prevents a group literally named "cohort" from
 * colliding with the pooled key. */
export function entityKey(entity: CohortModelEntity): string {
  return entity.kind === 'cohort' ? 'cohort' : `group:${entity.value}`
}

/** The group value an entity discriminates by, or undefined for the pooled
 * cohort (so its result identity stays byte-for-byte the pooled shape). */
export function entityGroupValue(entity: CohortModelEntity): string | undefined {
  return entity.kind === 'group' ? entity.value : undefined
}
