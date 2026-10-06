import type { CohortSeriesSpec } from '../cohort/screening'
import { seriesContextFor, seriesExclusions } from '../cohort/seriesContributions'
import { applyExclusionWindows } from '../exclusions/windows'
import type { PatientGroup } from '../grouping/grouping'
import { balanceSeriesPoints } from '../stats/timeBalancing'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../types'
import type { MixedModelSpikeRow } from './types'
import { roundTo10Decimals } from './validation'
import { isExactMeasurement } from '../measurements/censored'

const MS_PER_YEAR = 365.25 * 86_400_000
const MS_PER_DAY = 86_400_000
const CHRONIC_CKD_DEFAULT_CUTOFF_DAYS = 90

interface ModelPoint {
  date: Date
  value: number
  age: number | null
}

export type PresetExclusionPolicy = 'apply' | 'skip'

/** Counts only eligible exact dated rows removed by the union of preset windows. */
export function prepareMixedModelCohortRows(
  allRows: readonly LabRow[],
  patientIds: readonly PatientId[],
  spec: CohortSeriesSpec,
  exclusionPolicy: PresetExclusionPolicy = 'apply',
): { rows: MixedModelSpikeRow[]; excludedByPreset: number } {
  return buildMixedModelRows(allRows, patientIds, spec, exclusionPolicy)
}

export function mixedModelRowsFromCohortInputs(
  allRows: readonly LabRow[],
  patientIds: readonly PatientId[],
  spec: CohortSeriesSpec,
): MixedModelSpikeRow[] {
  return buildMixedModelRows(allRows, patientIds, spec, 'apply').rows
}

function buildMixedModelRows(
  allRows: readonly LabRow[],
  patientIds: readonly PatientId[],
  spec: CohortSeriesSpec,
  exclusionPolicy: PresetExclusionPolicy,
): { rows: MixedModelSpikeRow[]; excludedByPreset: number } {
  // Honor the cohort's "no fit" configuration: when fitting is disabled the
  // displayed cohort slope is intentionally blank, so the mixed model must not
  // silently fit rows the rest of the UI is not showing.
  if (spec.fitConfig?.fitModel === 'none') return { rows: [], excludedByPreset: 0 }

  let excludedByPreset = 0

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

  const cache = new Map<string, unknown>()
  for (const patientId of ids) {
    const patientRows = rowsByPatient.get(patientId) ?? []
    const patientKey = patientIdKey(patientId)
    const seriesRows = patientRows
      .filter((row) =>
        row.bezeichnung === spec.bezeichnung
        && (row.einheit ?? null) === (spec.einheit ?? null)
        && row.wertNum !== null
        && row.labDatum !== null
        && isExactMeasurement(row)
      )
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const points: ModelPoint[] = seriesRows.map((row) => ({
      date: row.labDatum!,
      value: row.wertNum!,
      age: Number.isFinite(row.patientAgeAtLab) ? row.patientAgeAtLab : null,
    }))
    // The same censoring and exclusion windows as the cohort cell's fit.
    const windows = exclusionPolicy === 'apply'
      ? seriesExclusions(seriesContextFor(spec, patientId, patientRows, cache))
      : { censoring: [], exclusions: [] }
    const exclusion = applyExclusionWindows(points, [...windows.censoring, ...windows.exclusions])
    excludedByPreset += exclusion.excludedIdx.length
    const included = exclusion.kept

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
        value: point.value,
        time_since_baseline: roundYears((point.date.getTime() - baselineDate) / MS_PER_YEAR),
        baseline_age: baselineAge ?? undefined,
        baseline_age_centered: baselineAge !== null && meanBaselineAge !== null
          ? roundTo10Decimals(baselineAge - meanBaselineAge)
          : undefined,
      })
    }
  }

  return { rows: out, excludedByPreset }
}

/** Build mixed-model rows for each group by reusing the single-cohort row
 * builder with the group's patient ids. Groups that produce no rows (e.g. all
 * points excluded, or no measurements) are omitted; surviving groups keep the
 * input insertion order. Additive sibling of the pooled
 * `mixedModelRowsFromCohortInputs`; the pooled path is unchanged. */
export function mixedModelRowsByGroup(
  allRows: readonly LabRow[],
  groups: readonly PatientGroup[],
  spec: CohortSeriesSpec,
): Record<string, MixedModelSpikeRow[]> {
  const byGroup: Record<string, MixedModelSpikeRow[]> = {}
  for (const group of groups) {
    const rows = mixedModelRowsFromCohortInputs(allRows, group.patientIds, spec)
    if (rows.length === 0) continue
    byGroup[group.value] = rows
  }
  return byGroup
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
