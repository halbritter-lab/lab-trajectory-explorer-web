import type { ManualDemographics } from '../analysis/types'
import { normaliseSex } from '../egfr/formulas'
import { completedYears } from '../parse/loader'
import { comparePatientIds, patientIdKey, type LabRow } from '../types'
import { resolveBirthAnchor } from './resolveAge'
import { resolveSex } from './resolveSex'
import type { DemographicsConflict } from './types'

export interface DemographicsResolution {
  rows: LabRow[]
  conflicts: DemographicsConflict[]
}

interface Resolved {
  sex: LabRow['patientSex']
  birthAnchor: Date | null
}

function parseAttributeDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Decide one sex and one birth-date anchor per patient, then derive every row's
 * demographics from that decision. Rows whose values already match are returned
 * untouched, and when no patient changes at all the input array itself comes
 * back — consistent data must not produce a new object graph downstream.
 */
export function resolveDemographics(
  rows: LabRow[],
  patientAttributes: Record<string, Record<string, string>>,
  manual: Record<string, ManualDemographics>,
): DemographicsResolution {
  const byPatient = new Map<string, LabRow[]>()
  for (const row of rows) {
    const key = patientIdKey(row.patientId)
    const bucket = byPatient.get(key)
    if (bucket) bucket.push(row)
    else byPatient.set(key, [row])
  }

  const resolved = new Map<string, Resolved>()
  const conflicts: DemographicsConflict[] = []

  for (const [key, patientRows] of byPatient) {
    const patientId = patientRows[0].patientId
    const attributes = patientAttributes[key] ?? {}
    const manualDemo = manual[key]

    const sexResult = resolveSex({
      patientId,
      rowSexes: patientRows.map((r) => r.patientSex),
      attributeSex: normaliseSex(attributes.sex),
      manualSex: manualDemo?.sex ?? null,
    })
    const ageResult = resolveBirthAnchor({
      patientId,
      rows: patientRows.map((r) => ({
        labDatum: r.labDatum,
        ageAtLab: r.patientAgeAtLab,
        birthDate: r.patientBirthDate ?? null,
      })),
      attributeBirthDate: parseAttributeDate(attributes.birthDate),
      manualAge: manualDemo?.age,
    })

    resolved.set(key, { sex: sexResult.sex, birthAnchor: ageResult.birthAnchor })
    conflicts.push(...sexResult.conflicts, ...ageResult.conflicts)
  }

  let changed = false
  const mapped = rows.map((row) => {
    const decision = resolved.get(patientIdKey(row.patientId))
    if (!decision) return row
    const age =
      decision.birthAnchor && row.labDatum
        ? completedYears(decision.birthAnchor, row.labDatum)
        : row.patientAgeAtLab
    if (decision.sex === row.patientSex && age === row.patientAgeAtLab) return row
    changed = true
    return { ...row, patientSex: decision.sex, patientAgeAtLab: age }
  })

  conflicts.sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.kind.localeCompare(b.kind))
  return { rows: changed ? mapped : rows, conflicts }
}
