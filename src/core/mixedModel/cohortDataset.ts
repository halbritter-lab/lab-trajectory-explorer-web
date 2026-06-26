import type { AkiEpisode } from '../aki/kdigo'
import { episodesForSeries, fitAkiAware } from '../aki/akiAware'
import { fitInputForSeries } from '../analysis/types'
import type { CohortSeriesSpec } from '../cohort/screening'
import { filterFitPointsByClinicalEvents } from '../events/fitExclusions'
import { balanceSeriesPoints } from '../stats/timeBalancing'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../types'
import type { MixedModelSpikeRow } from './types'
import { roundTo10Decimals } from './validation'

const MS_PER_YEAR = 365.25 * 86_400_000
const MS_PER_DAY = 86_400_000
const CHRONIC_CKD_DEFAULT_CUTOFF_DAYS = 90

interface ModelPoint {
  date: Date
  value: number
  age: number | null
}

export function mixedModelRowsFromCohortInputs(
  allRows: readonly LabRow[],
  patientIds: readonly PatientId[],
  spec: CohortSeriesSpec,
): MixedModelSpikeRow[] {
  // Honor the cohort's "no fit" configuration: when fitting is disabled the
  // displayed cohort slope is intentionally blank, so the mixed model must not
  // silently fit rows the rest of the UI is not showing.
  if (spec.fitConfig?.fitModel === 'none') return []

  const patientSeries: Array<{ patientKey: string; selected: ModelPoint[]; baselineAge: number | null }> = []
  const ids = [...new Set(patientIds)].sort(comparePatientIds)

  // Bucket rows by patient once. Otherwise each patient re-scans the full lab
  // table (O(patients × rows)); buildCohortRows uses the same pattern.
  const rowsByPatient = new Map<PatientId, LabRow[]>()
  for (const row of allRows) {
    const bucket = rowsByPatient.get(row.patientId)
    if (bucket) bucket.push(row)
    else rowsByPatient.set(row.patientId, [row])
  }

  for (const patientId of ids) {
    const patientRows = rowsByPatient.get(patientId) ?? []
    const patientKey = patientIdKey(patientId)
    const clinicalEvents = spec.clinicalEventsByPatient?.[patientKey] ?? spec.clinicalEvents ?? []
    const seriesRows = patientRows
      .filter((row) =>
        row.bezeichnung === spec.bezeichnung
        && (row.einheit ?? null) === (spec.einheit ?? null)
        && row.wertNum !== null
        && row.labDatum !== null
      )
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const points: ModelPoint[] = seriesRows.map((row) => ({
      date: row.labDatum!,
      value: row.wertNum!,
      age: Number.isFinite(row.patientAgeAtLab) ? row.patientAgeAtLab : null,
    }))
    const eventExcluded = new Set(filterFitPointsByClinicalEvents(points, clinicalEvents, spec.fitConfig?.censoring).excludedIdx)
    let included = points.filter((_, index) => !eventExcluded.has(index))

    if ((spec.mode === 'aki-aware' || spec.fitConfig?.exclusions.excludeAkiWindows) && included.length > 0) {
      const fitInput = fitInputForSeries(spec.fitInputs ?? [], patientId, {
        bezeichnung: spec.bezeichnung,
        einheit: spec.einheit ?? null,
      })
      const episodes: AkiEpisode[] = fitInput?.episodes ?? episodesForSeries(patientRows, patientId, spec.bezeichnung, spec.einheit ?? null)
      const exclusionDays = spec.exclusionDays ?? fitInput?.exclusionDays ?? spec.fitConfig?.exclusions.akiExclusionDays ?? 30
      const kept = new Set(
        fitAkiAware(included, exclusionDays, episodes).keptIdx,
      )
      included = included.filter((_, index) => kept.has(index))
    }

    const balanced = balanceSeriesPoints(included, spec.fitConfig?.timeBalancing).map((point) => ({
      ...point,
      age: sourceAgeForBalancedPoint(point, included),
    }))

    // chronic-ckd mode drops the early (post-baseline run-in) points before
    // fitting, mirroring summarizeByBezeichnung so the mixed model uses the
    // same measurements as the displayed cohort slope.
    const selected =
      spec.mode === 'chronic-ckd' && balanced.length > 0
        ? (() => {
            const cutoffMs =
              balanced[0].date.getTime() + (spec.cutoffDays ?? CHRONIC_CKD_DEFAULT_CUTOFF_DAYS) * MS_PER_DAY
            return balanced.filter((point) => point.date.getTime() > cutoffMs)
          })()
        : balanced
    if (selected.length === 0) continue

    const baselineAge = Number.isFinite(selected[0].age) ? selected[0].age : null
    patientSeries.push({ patientKey, selected, baselineAge })
  }

  const finiteBaselineAges = patientSeries
    .map((series) => series.baselineAge)
    .filter((age): age is number => Number.isFinite(age))
  const meanBaselineAge = finiteBaselineAges.length > 0
    ? finiteBaselineAges.reduce((sum, age) => sum + age, 0) / finiteBaselineAges.length
    : null

  const out: MixedModelSpikeRow[] = []
  for (const series of patientSeries) {
    const baselineDate = series.selected[0].date.getTime()
    const baselineAge = series.baselineAge
    for (const point of series.selected) {
      out.push({
        patient_id: series.patientKey,
        eGFR: point.value,
        time_since_baseline: roundYears((point.date.getTime() - baselineDate) / MS_PER_YEAR),
        baseline_age: baselineAge ?? undefined,
        baseline_age_centered: baselineAge !== null && meanBaselineAge !== null
          ? roundTo10Decimals(baselineAge - meanBaselineAge)
          : undefined,
      })
    }
  }

  return out
}

function roundYears(value: number): number {
  return roundTo10Decimals(value)
}

function sourceAgeForBalancedPoint(point: { date: Date; value: number }, sourcePoints: readonly ModelPoint[]): number | null {
  const pointTime = point.date.getTime()
  const exactValueMatch = sourcePoints.find(
    (sourcePoint) =>
      sourcePoint.date.getTime() === pointTime &&
      sourcePoint.value === point.value &&
      Number.isFinite(sourcePoint.age),
  )
  if (exactValueMatch) return exactValueMatch.age
  return sourcePoints.find((sourcePoint) => sourcePoint.date.getTime() === pointTime && Number.isFinite(sourcePoint.age))?.age ?? null
}
