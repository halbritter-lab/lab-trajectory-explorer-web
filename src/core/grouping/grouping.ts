import { patientIdKey, type PatientId } from '../types'

/** Sentinel group value for patients with no value for the chosen attribute. */
export const UNGROUPED = '(ungrouped)'

export interface PatientGroup {
  /** The attribute value, or the UNGROUPED sentinel. */
  value: string
  patientIds: PatientId[]
}

/** High-contrast categorical palette for plot lines and swatches. Avoids pale
 * yellow because it is hard to read on the app's light chart backgrounds. */
const GROUP_COLOR_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4b5563',
]

/** Neutral gray reserved for the UNGROUPED group, regardless of palette order. */
const UNGROUPED_COLOR = '#4b5563'

/** The group value for a single patient under the given attribute: the trimmed
 * attribute value, or UNGROUPED when missing/blank. Shared by the grouping model
 * and any caller that needs to stamp a patient's group (e.g. cohort rows). */
export function groupValueForPatient(
  patientId: PatientId,
  byPatient: Record<string, Record<string, string>>,
  attributeName: string,
): string {
  const raw = byPatient[patientIdKey(patientId)]?.[attributeName]
  const trimmed = raw?.trim()
  return trimmed ? trimmed : UNGROUPED
}

/** Build ordered groups for the given cohort patients and chosen attribute.
 * Named values are sorted numeric-aware; UNGROUPED is always last. Each group's
 * patientIds preserve the input order. */
export function groupPatients(
  patientIds: readonly PatientId[],
  byPatient: Record<string, Record<string, string>>,
  attributeName: string,
): PatientGroup[] {
  const byValue = new Map<string, PatientId[]>()
  for (const id of patientIds) {
    const value = groupValueForPatient(id, byPatient, attributeName)
    const bucket = byValue.get(value)
    if (bucket) bucket.push(id)
    else byValue.set(value, [id])
  }
  const named = [...byValue.keys()]
    .filter((value) => value !== UNGROUPED)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const ordered = byValue.has(UNGROUPED) ? [...named, UNGROUPED] : named
  return ordered.map((value) => ({ value, patientIds: byValue.get(value)! }))
}

/** Stable value->color map: named groups take palette colors in group order
 * (cycling beyond 8); UNGROUPED is a fixed neutral gray. */
export function groupColors(groups: readonly PatientGroup[]): Map<string, string> {
  const colors = new Map<string, string>()
  let namedIndex = 0
  for (const group of groups) {
    if (group.value === UNGROUPED) {
      colors.set(group.value, UNGROUPED_COLOR)
      continue
    }
    colors.set(group.value, GROUP_COLOR_PALETTE[namedIndex % GROUP_COLOR_PALETTE.length])
    namedIndex += 1
  }
  return colors
}
