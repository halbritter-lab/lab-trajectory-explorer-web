/**
 * Deliberate merging of series (issue #68, owner decisions of 2026-11-16,
 * 2026-11-21 and 2026-11-22). Series of one analyte from different
 * laboratories or methods stay separate by default and are never merged
 * automatically, by name or by LOINC code. The user may merge chosen
 * imported series into one derived series by an explicit mapping; the
 * source series stay as they are, and every derived row records the series
 * it came from (`LabRow.mergedFrom`).
 *
 * Domain-neutral: which units convert into which is supplied by the caller
 * (`UnitConversion`); the nephrology module supplies serum creatinine.
 */
import { unitKey } from '../parse/units'
import type { LabRow } from '../types'

/** One imported series, by test name and unit as imported. */
export interface MergeSeriesRef {
  bezeichnung: string
  einheit: string | null
}

/** One merge: the derived series `name` [`unit`] holds the rows of every
 * series of `sources`, converted to `unit`. `loinc` records the code the
 * sources were chosen by, when they were chosen through the LOINC
 * suggestion; it is documentation only and selects no rows. */
export interface SeriesMerge {
  name: string
  unit: string
  sources: MergeSeriesRef[]
  loinc?: string
}

/** The factor that converts a value of `source` into `targetUnit`, or null
 * when the units are neither the same (by unit key) nor a known pair. */
export type UnitConversion = (source: MergeSeriesRef, targetUnit: string) => number | null

/** Same unit by the import's unit key: factor 1. */
export const sameUnitOnly: UnitConversion = (source, targetUnit) =>
  source.einheit !== null && unitKey(source.einheit) === unitKey(targetUnit) ? 1 : null

export const seriesRefKey = (ref: MergeSeriesRef) => JSON.stringify([ref.bezeichnung, ref.einheit ?? null])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored list of merges, or null when its shape is wrong. Entries are
 * kept as stored; whether they apply to a dataset is decided by
 * `applySeriesMerges`, which reports what it skips. */
export function parseSeriesMerges(value: unknown): SeriesMerge[] | null {
  if (!Array.isArray(value)) return null
  for (const merge of value) {
    if (!isRecord(merge) || typeof merge.name !== 'string' || merge.name.trim() === '' || typeof merge.unit !== 'string' || merge.unit.trim() === '') return null
    if (merge.loinc !== undefined && typeof merge.loinc !== 'string') return null
    if (!Array.isArray(merge.sources) || merge.sources.length < 2) return null
    if (!merge.sources.every((source) => isRecord(source) && typeof source.bezeichnung === 'string' && (source.einheit === null || typeof source.einheit === 'string'))) return null
  }
  return value as SeriesMerge[]
}

/** Why a merge, or one of its source series, was not applied. */
export type MergeSkipReason =
  | 'name_taken'          // the derived name and unit are an imported series
  | 'duplicate_name'      // an earlier merge already produces this name and unit
  | 'source_in_other_merge' // a source series already belongs to an earlier merge
  | 'unit_not_convertible' // a source unit is not the target unit nor a known pair
  | 'too_few_sources'      // fewer than two source series are in the dataset

export interface AppliedMerge {
  merge: SeriesMerge
  /** Rows added per source series, in the order of `merge.sources`; 0 for a
   * source absent from the dataset. */
  counts: number[]
  /** Factor per source, aligned with `merge.sources`. */
  factors: number[]
  /** Source series absent from the dataset. */
  absent: MergeSeriesRef[]
  /** Patient-days on which values of two or more source series meet (OD-80). */
  crossSourceDays: number
}

export interface SeriesMergeResult {
  rows: LabRow[]
  applied: AppliedMerge[]
  skipped: { merge: SeriesMerge; reason: MergeSkipReason; source?: MergeSeriesRef }[]
}

/** Decimals of the value text of a converted row: two, enough for mg/dl
 * creatinine (0.01 mg/dl is 0.9 µmol/l), one above 10. */
function convertedText(value: number): string {
  const decimals = Math.abs(value) >= 10 ? 1 : 2
  return value.toFixed(decimals).replace('.', ',')
}

/**
 * Append one derived row per row of each source series, in the order of the
 * input rows, for every merge that applies. Rules (documented in
 * docs/method-algorithms/series-comparison-and-merge.md):
 * - only imported rows are sources: a row that is itself derived
 *   (`sourceSeries` or `mergedFrom` set) never is;
 * - a merge is skipped when its name and unit equal an imported series or an
 *   earlier merge, when a source already belongs to an earlier merge, when a
 *   source unit does not convert, or when fewer than two of its sources occur
 *   in the rows; absent sources are reported, present ones still merge when at
 *   least two remain;
 * - a converted row takes `wertNum × factor` unrounded; its value text is the
 *   converted number with a decimal comma (two decimals below 10, one from
 *   10); an unconverted row keeps its value text; a row without a number keeps
 *   its text and stays without a number;
 * - the operator, date, time of day, demographics, LOINC code and laboratory
 *   or method are copied; `mergedFrom` names the source series; `sourceRow`
 *   is not copied (derived rows have none);
 * - same-day values of different sources are all kept (OD-80): the merged
 *   series then has several values on such a day, which time balancing, the
 *   fits, endpoints and AKI detection treat like any same-day values.
 * Returns the same array when nothing applies.
 */
export function applySeriesMerges(rows: LabRow[], merges: readonly SeriesMerge[], convert: UnitConversion = sameUnitOnly): SeriesMergeResult {
  const result: SeriesMergeResult = { rows, applied: [], skipped: [] }
  if (merges.length === 0) return result
  const imported = new Set<string>()
  for (const r of rows) if (r.bezeichnung !== null && !r.sourceSeries && !r.mergedFrom) imported.add(seriesRefKey({ bezeichnung: r.bezeichnung, einheit: r.einheit }))
  const produced = new Set<string>()
  const used = new Set<string>()
  const added: LabRow[] = []
  for (const merge of merges) {
    const target = seriesRefKey({ bezeichnung: merge.name, einheit: merge.unit })
    if (imported.has(target)) { result.skipped.push({ merge, reason: 'name_taken' }); continue }
    if (produced.has(target)) { result.skipped.push({ merge, reason: 'duplicate_name' }); continue }
    const factors = merge.sources.map((source) => convert(source, merge.unit))
    const badUnit = merge.sources.find((_, i) => factors[i] === null)
    if (badUnit) { result.skipped.push({ merge, reason: 'unit_not_convertible', source: badUnit }); continue }
    const taken = merge.sources.find((source) => used.has(seriesRefKey(source)))
    if (taken) { result.skipped.push({ merge, reason: 'source_in_other_merge', source: taken }); continue }
    const absent = merge.sources.filter((source) => !imported.has(seriesRefKey(source)))
    if (merge.sources.length - absent.length < 2) { result.skipped.push({ merge, reason: 'too_few_sources' }); continue }
    const index = new Map(merge.sources.map((source, i) => [seriesRefKey(source), i]))
    const counts = merge.sources.map(() => 0)
    const days = new Map<string, Set<number>>()
    for (const r of rows) {
      if (r.bezeichnung === null || r.sourceSeries || r.mergedFrom) continue
      const i = index.get(seriesRefKey({ bezeichnung: r.bezeichnung, einheit: r.einheit }))
      if (i === undefined) continue
      const factor = factors[i]!
      counts[i]++
      const converted = r.wertNum === null ? null : factor === 1 ? r.wertNum : r.wertNum * factor
      const { sourceRow: _sourceRow, ...rest } = r
      added.push({
        ...rest,
        bezeichnung: merge.name,
        einheit: merge.unit,
        wert: factor === 1 || converted === null ? r.wert : convertedText(converted),
        wertNum: converted,
        mergedFrom: { bezeichnung: r.bezeichnung, einheit: r.einheit },
      })
      if (r.labDatum !== null) {
        const day = JSON.stringify([String(r.patientId), r.labDatum.getTime()])
        const sources = days.get(day) ?? new Set<number>()
        sources.add(i)
        days.set(day, sources)
      }
    }
    for (const source of merge.sources) used.add(seriesRefKey(source))
    produced.add(target)
    const crossSourceDays = [...days.values()].filter((sources) => sources.size > 1).length
    result.applied.push({ merge, counts, factors: factors as number[], absent, crossSourceDays })
  }
  if (added.length) result.rows = [...rows, ...added]
  return result
}

/** The (name, unit) keys of the series the merges produce, as `seriesRefKey`. */
export function mergedSeriesKeys(merges: readonly SeriesMerge[]): Set<string> {
  return new Set(merges.map((merge) => seriesRefKey({ bezeichnung: merge.name, einheit: merge.unit })))
}
