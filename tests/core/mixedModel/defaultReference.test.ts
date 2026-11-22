import { describe, expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormulaKey, mixedModelReferencesResolved, resolveMixedModelFactorReferences, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import { validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import { runCohortMixedModels } from '../../../src/core/mixedModel/cohortModelFit'
import { mixedModelDataRCode, mixedModelRScript } from '../../../src/core/mixedModel/rCode'
import { mixedModelExportSheets } from '../../../src/core/mixedModel/modelExport'
import type { RunMixedModelWorkerJobOptions } from '../../../src/core/mixedModel/browserClient'
import type { MixedModelResult, MixedModelSpikeRow } from '../../../src/core/mixedModel/types'

// OD-29 (decided 2026-10-07, implemented 2026-11-22): a categorical factor
// without a chosen reference takes the first level among the unit's model rows.
const config: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [{ key: 'genotype', kind: 'categorical', effect: 'level' }] }
// Twelve patients with genotypes B and C in the model; genotype A exists in
// the dataset only for patients without a model row, so it was the former default.
const unitRows = (levels: readonly string[], prefix = 'p'): MixedModelSpikeRow[] => Array.from({ length: 12 }, (_, i) => `${prefix}${i + 1}`).flatMap((patient_id, i) =>
  [0, 1, 2].map(time_since_baseline => ({ patient_id, time_since_baseline, value: 60 - i - time_since_baseline, factorValues: { factor_0_: levels[i % levels.length] } })))

describe('default reference level from the fitted data (OD-29)', () => {
  it('takes the first level in ascending string order among the rows', () => {
    const resolved = resolveMixedModelFactorReferences(config, unitRows(['C', 'B']))
    expect(resolved.factors).toEqual([{ key: 'genotype', kind: 'categorical', effect: 'level', reference: 'B', referenceSource: 'default' }])
    expect(mixedModelReferencesResolved(config)).toBe(false)
    expect(mixedModelReferencesResolved(resolved)).toBe(true)
    // Code-unit order: digits before upper case before lower case.
    expect(resolveMixedModelFactorReferences(config, unitRows(['b', 'B', '2'])).factors?.[0].reference).toBe('2')
    // Idempotent.
    expect(resolveMixedModelFactorReferences(resolved, unitRows(['A', 'C']))).toBe(resolved)
  })

  it('keeps a reference the user chose, also when the unit lacks it', () => {
    const chosen: MixedModelConfig = { ...config, factors: [{ ...config.factors![0], reference: 'A' }] }
    expect(resolveMixedModelFactorReferences(chosen, unitRows(['C', 'B']))).toBe(chosen)
    const validation = validateMixedModelRows(unitRows(['C', 'B']), chosen)
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.message).toBe('Factor genotype requires variation and an observed reference level.')
  })

  it('validates a unit against its own default, which the former dataset-wide default A blocked', () => {
    expect(validateMixedModelRows(unitRows(['C', 'B']), config).ok).toBe(true)
    // A single level still fails for lack of variation.
    expect(validateMixedModelRows(unitRows(['C']), config).ok).toBe(false)
  })

  it('leaves the reference absent without rows', () => {
    expect(resolveMixedModelFactorReferences(config, [])).toEqual(config)
  })

  it('fits every unit with its own default and a matching formula key', async () => {
    const jobs: RunMixedModelWorkerJobOptions[] = []
    const runJob = async (options: RunMixedModelWorkerJobOptions): Promise<MixedModelResult> => {
      jobs.push(options)
      return { status: 'fit-error', engine: 'webr-lme4', stage: 'fit', code: 'X', message: 'not fitted in jsdom', warnings: [], metadata: { modelConfig: options.config } }
    }
    await runCohortMixedModels({
      entities: [
        { entity: { kind: 'cohort' }, rows: [...unitRows(['C', 'B']), ...unitRows(['D'], 'q')] },
        { entity: { kind: 'group', value: 'g2' }, rows: unitRows(['D', 'C'], 'q') },
      ],
      seriesIndex: 0, seriesKey: 'k', fitConfigHash: 'h', config, formulaKey: mixedModelFormulaKey(config), runJob,
    })
    expect(jobs.map(job => job.config?.factors?.[0].reference)).toEqual(['B', 'C'])
    for (const job of jobs) expect(job.formulaKey).toBe(mixedModelFormulaKey(job.config!))
    // Without categorical defaults the configuration and key pass through unchanged.
    jobs.length = 0
    await runCohortMixedModels({ entities: [{ entity: { kind: 'cohort' }, rows: unitRows(['C', 'B']) }], seriesIndex: 0, seriesKey: 'k', fitConfigHash: 'h', config: DEFAULT_MIXED_MODEL_CONFIG, formulaKey: 'given', runJob })
    expect(jobs[0].config).toBe(DEFAULT_MIXED_MODEL_CONFIG)
    expect(jobs[0].formulaKey).toBe('given')
  })

  it('writes the resolved reference and the type and reference sources to the R code and the export', () => {
    const resolved = resolveMixedModelFactorReferences({ ...config, factors: [{ ...config.factors![0], kindSource: 'user' }] }, unitRows(['C', 'B']))
    expect(mixedModelDataRCode(resolved)).toContain('mm_levels <- c("B", sort(setdiff(unique(mm_factor_0_), "B"), method = "radix"))')
    const result = {
      status: 'success', converged: true, singular: false, warnings: [], nPatients: 12, nMeasurements: 36,
      fixedEffects: { intercept: 50, timeSinceBaseline: -1 }, fixedEffectConfidenceIntervals: { timeSinceBaseline: null },
      randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null }, residualSd: null,
      metadata: { engine: 'webr-lme4', formula: 'value ~ time_since_baseline + factor_0_ + (1 + time_since_baseline | patient_id)', runtimeVersion: '4.4', packageVersions: {}, modelConfig: resolved },
    } as unknown as MixedModelResult
    const script = mixedModelRScript([{ entity: 'Whole cohort', result }])
    expect(script).toContain('  # factor_0_ = genotype: categorical (type chosen by the user), reference B (default: first level among these model rows)')
    const sheets = mixedModelExportSheets([{ entity: 'Whole cohort', result, identity: { seriesKey: 'k' } }] as unknown as Parameters<typeof mixedModelExportSheets>[0])
    const factors = sheets.find(sheet => sheet.name === 'factors')!.rows as Array<Record<string, unknown>>
    expect(factors[0]).toMatchObject({ key: 'genotype', kind: 'categorical', reference: 'B', kind_source: 'user', reference_source: 'default_first_level_in_model' })
    expect(factors[0]).not.toHaveProperty('kindSource')
    expect(factors[0]).not.toHaveProperty('referenceSource')
  })
})
