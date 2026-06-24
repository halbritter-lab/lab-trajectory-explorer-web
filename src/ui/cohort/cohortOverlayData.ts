import type { LabRow } from '../../core/types'
import type { CohortOverlayXAxis } from '../state/store'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export type CohortOverlayPoint = {
  patientId: number
  x: number | Date
  value: number
  date: Date
  age: number | null
  highlighted: boolean
}

interface CohortOverlayPointsParams {
  rows: LabRow[]
  bezeichnung: string
  einheit: string | null
  patientIds: number[]
  axis: CohortOverlayXAxis
  highlightedPatientIds: number[]
}

function yearsBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_YEAR
}

export function cohortOverlayPointsForSeries({
  rows,
  bezeichnung,
  einheit,
  patientIds,
  axis,
  highlightedPatientIds,
}: CohortOverlayPointsParams): CohortOverlayPoint[] {
  const scoped = new Set(patientIds)
  const highlighted = new Set(highlightedPatientIds)
  const seriesRows = rows
    .filter((r) =>
      scoped.has(r.patientId) &&
      r.bezeichnung === bezeichnung &&
      (r.einheit ?? null) === einheit &&
      r.wertNum !== null &&
      r.labDatum !== null,
    )
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())

  const baselineDateByPatient = new Map<number, Date>()
  const ageAnchorByPatient = new Map<number, { date: Date; age: number }>()
  for (const r of seriesRows) {
    const date = r.labDatum as Date
    if (!baselineDateByPatient.has(r.patientId)) baselineDateByPatient.set(r.patientId, date)
    if (!ageAnchorByPatient.has(r.patientId) && Number.isFinite(r.patientAgeAtLab)) {
      ageAnchorByPatient.set(r.patientId, { date, age: r.patientAgeAtLab as number })
    }
  }

  return seriesRows
    .map((r): CohortOverlayPoint | null => {
      const date = r.labDatum as Date
      let x: number | Date | null = null
      if (axis === 'calendar_time') {
        x = date
      } else if (axis === 'time_since_baseline') {
        const baseline = baselineDateByPatient.get(r.patientId)
        x = baseline ? yearsBetween(baseline, date) : null
      } else {
        const anchor = ageAnchorByPatient.get(r.patientId)
        x = anchor ? anchor.age + yearsBetween(anchor.date, date) : null
      }
      if (x === null) return null
      return {
        patientId: r.patientId,
        x,
        value: r.wertNum as number,
        date,
        age: Number.isFinite(r.patientAgeAtLab) ? r.patientAgeAtLab as number : null,
        highlighted: highlighted.has(r.patientId),
      }
    })
    .filter((p): p is CohortOverlayPoint => p !== null)
}

export function isEgfrLike(bezeichnung: string, einheit: string | null): boolean {
  return /egfr/i.test(bezeichnung) || /ml\/min/i.test(einheit ?? '')
}

export function patientIdFromPlotDatum(
  datum: unknown,
  points: readonly Pick<CohortOverlayPoint, 'patientId'>[],
): number | null {
  const index = Array.isArray(datum) ? datum[0] : datum
  if (typeof index !== 'number') return null
  return points[index]?.patientId ?? null
}
