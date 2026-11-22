import { applySeriesMerges, parseSeriesMerges, type MergeSeriesRef, type SeriesMerge, type UnitConversion } from '../../analysis/seriesMerge'
import type { AnalysisContext, AnalysisContribution, AnalysisMessage, SettingsModule } from '../../analysis/types'
import { COMPUTED_EGFR_UNIT, computedEgfrName, EGFR_FORMULA_LABELS, isCreatinineName, isNonSerumName, isSerumCreatinineSeries, normaliseUnit } from './analytes'
import type { FormulaName } from './egfr/series'
import { MGDL_PER_UMOLL } from './constants'

export interface SeriesMergeModuleSettings {
  merges: SeriesMerge[]
}

/**
 * The unit conversions a merge may use (issue #68): the same unit by unit
 * key (factor 1), and serum creatinine between mg/dl and µmol/l with
 * 88.42 µmol/l per mg/dl, the factor eGFR and AKI detection use. A series
 * counts as serum creatinine by `isSerumCreatinineSeries` (creatinine name,
 * no non-serum material, unit mg/dl or µmol/l). No other pair converts.
 */
export const mergeUnitConversion: UnitConversion = (source: MergeSeriesRef, targetUnit: string) => {
  const from = normaliseUnit(source.einheit)
  const to = normaliseUnit(targetUnit)
  if (source.einheit !== null && from === to) return 1
  if (!isSerumCreatinineSeries(source.bezeichnung, source.einheit)) return null
  if (from === 'µmol/l' && to === 'mg/dl') return 1 / MGDL_PER_UMOLL
  if (from === 'mg/dl' && to === 'µmol/l') return MGDL_PER_UMOLL
  return null
}

/** Creatinine sources of different materials (code review of wave 3): when
 * any source has a creatinine name, the sources must all be serum or plasma
 * (`isNonSerumName` false) or all another material (urine, dialysate, ...).
 * Serum and urine creatinine are different measurements, whatever the unit. */
export function mergeMaterialMismatch(sources: readonly MergeSeriesRef[]): boolean {
  if (!sources.some((source) => isCreatinineName(source.bezeichnung))) return false
  const nonSerum = sources.map((source) => isNonSerumName(source.bezeichnung))
  return nonSerum.some(Boolean) && nonSerum.some((value) => !value)
}

/** The series the eGFR module computes, one per formula, in its unit: a
 * merge may not take such a name, whichever formula is selected now, since
 * switching the formula would make the two series collide. */
export const COMPUTED_EGFR_SERIES: readonly MergeSeriesRef[] = (Object.keys(EGFR_FORMULA_LABELS) as FormulaName[])
  .map((formula) => ({ bezeichnung: computedEgfrName(formula), einheit: COMPUTED_EGFR_UNIT }))

const label = (ref: MergeSeriesRef) => `${ref.bezeichnung} [${ref.einheit ?? 'no unit'}]`

const SKIP_TEXT = {
  name_taken: 'its name and unit are an imported series',
  duplicate_name: 'an earlier merge already produces this name and unit',
  source_in_other_merge: 'a source series already belongs to an earlier merge',
  unit_not_convertible: 'a source unit is neither the target unit nor a known pair (creatinine mg/dl and µmol/l)',
  too_few_sources: 'fewer than two of its source series are in this dataset',
  name_reserved: 'its name and unit are those of a computed eGFR',
  material_differs: 'its creatinine sources are of different materials (serum or plasma and another material)',
} as const

/** Deliberately merged series (issue #68). Runs after demographics, so the
 * derived rows carry resolved sex and age, and before eGFR, so a merged
 * creatinine series can be chosen as the eGFR source. */
export const seriesMergeModule = {
  id: 'seriesMerge' as const,
  label: 'Merged series',
  description: 'Series merged by an explicit mapping; the source series stay, each derived value names its source.',
  defaultSettings: { merges: [] } as SeriesMergeModuleSettings,
  parseSettings: (value: unknown): SeriesMergeModuleSettings | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const merges = parseSeriesMerges((value as Record<string, unknown>).merges)
    if (merges === null) return null
    const stored = value as SeriesMergeModuleSettings
    return merges === stored.merges ? stored : { ...stored, merges }
  },
  apply: (ctx: AnalysisContext, settings: SeriesMergeModuleSettings): AnalysisContribution => {
    if (!settings.merges.length) return {}
    const result = applySeriesMerges(ctx.rows, settings.merges, mergeUnitConversion, { reserved: COMPUTED_EGFR_SERIES, sourcesMismatch: mergeMaterialMismatch })
    const messages: AnalysisMessage[] = [
      ...result.applied.filter((applied) => applied.absent.length).map((applied): AnalysisMessage => ({
        id: `series-merge-absent:${applied.merge.name}|${applied.merge.unit}`,
        severity: 'warning',
        text: `Merged series ${label({ bezeichnung: applied.merge.name, einheit: applied.merge.unit })}: ${applied.absent.map(label).join(', ')} not in this dataset.`,
      })),
      ...result.skipped.map(({ merge, reason, source }): AnalysisMessage => ({
        id: `series-merge-skipped:${merge.name}|${merge.unit}`,
        severity: 'warning',
        text: `Merged series ${label({ bezeichnung: merge.name, einheit: merge.unit })} not formed: ${SKIP_TEXT[reason]}${source ? ` (${label(source)})` : ''}.`,
      })),
    ]
    return { rows: result.rows, messages }
  },
} satisfies SettingsModule<SeriesMergeModuleSettings, 'seriesMerge'>

/** The dataset's merges, from the analysis settings; none when absent. */
export function seriesMerges(settings: Readonly<Record<string, unknown>> | undefined): SeriesMerge[] {
  const stored = (settings?.seriesMerge as SeriesMergeModuleSettings | undefined)?.merges
  return Array.isArray(stored) ? stored : []
}
