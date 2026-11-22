/** Mixed-model reference cases (issue #79): synthetic lab rows prepared by the
 * app's own cohort-model path (`workspaceModelEntities`, quarterly medians),
 * so the model rows, the formula and the R data code are what the browser
 * sends to webR. Shared by `scripts/reference/mixed_model_inputs.mjs`, which
 * writes them to `tests/reference/inputs/mixed_models.json` for the native R
 * fit, and `tests/reference/mixedModels.test.ts`, which checks that the
 * stored input still equals what the app builds. All data are synthetic. */
import { generalExplorationConfig } from '../../src/core/analysis/fitConfig'
import { mixedModelFormula, resolveMixedModelFactorReferences, type MixedModelConfig } from '../../src/core/mixedModel/config'
import { lme4ModelCall, mixedModelDataRCode } from '../../src/core/mixedModel/rCode'
import type { MixedModelSpikeRow } from '../../src/core/mixedModel/types'
import type { LabRow } from '../../src/core/types'
import { workspaceModelEntities } from '../../src/workspace/workspace-model-results'

export interface MixedModelReferenceCase {
  name: string
  description: string
  config: MixedModelConfig
  formula: string
  /** The R code the worker and the exported script build `mm_data` with. */
  dataRCode: string
  /** The exact lmer call the worker evaluates. */
  modelCall: string
  rows: MixedModelSpikeRow[]
}

const UNIT = 'ml/min/1.73m2'

/** Deterministic noise in [-1, 1): a fixed linear congruential sequence. */
function noiseSequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  }
}

function labRows(patients: number, seed: number): { rows: LabRow[]; attributes: Record<string, Record<string, string>> } {
  const noise = noiseSequence(seed)
  const rows: LabRow[] = []
  const attributes: Record<string, Record<string, string>> = {}
  for (let i = 0; i < patients; i++) {
    const id = `p${String(i + 1).padStart(2, '0')}`
    const group = i % 3 === 0 ? 'B' : 'A'
    attributes[id] = { genotype: group, dose: String(10 + (i % 4) * 5) }
    const intercept = 62 + 10 * noise() + (group === 'B' ? 4 : 0)
    const slope = -2.2 + 0.9 * noise() + (group === 'B' ? -1.1 : 0)
    const years = 3 + (i % 4)
    for (let t = 0; t <= years; t++) {
      for (const day of [10, 120]) {
        const yearFraction = t + day / 365.25
        const value = intercept + slope * yearFraction + 3 * noise()
        rows.push({
          patientId: id,
          labDatum: new Date(Date.UTC(2018 + t, 0, day)),
          bezeichnung: 'eGFR',
          einheit: UNIT,
          wert: value.toFixed(1),
          wertNum: Number(value.toFixed(1)),
          wertOperator: '=',
          loinc: null,
          patientSex: null,
          patientAgeAtLab: 40 + (i * 7) % 35 + t,
        })
      }
    }
  }
  return { rows, attributes }
}

function buildCase(name: string, description: string, config: MixedModelConfig, patients: number, seed: number): MixedModelReferenceCase {
  const { rows, attributes } = labRows(patients, seed)
  const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: UNIT })
  fitConfig.timeBalancing = 'quarterly-median'
  const spec = { bezeichnung: 'eGFR', einheit: UNIT, mode: 'global' as const, fitConfig }
  const [cohort] = workspaceModelEntities(rows, Object.keys(attributes), spec, config, attributes, [])
  const resolved = resolveMixedModelFactorReferences(config, cohort.rows)
  return {
    name,
    description,
    config: resolved,
    formula: mixedModelFormula(resolved),
    dataRCode: mixedModelDataRCode(resolved),
    modelCall: lme4ModelCall(resolved),
    // The columns R reads (bindRows in webr.worker.ts) and the raw baseline
    // age the worker's validation checks.
    rows: cohort.rows.map((row) => ({
      patient_id: row.patient_id,
      value: row.value,
      time_since_baseline: row.time_since_baseline,
      ...(row.baseline_age === undefined ? {} : { baseline_age: row.baseline_age }),
      ...(row.baseline_age_centered === undefined ? {} : { baseline_age_centered: row.baseline_age_centered }),
      ...(row.factorValues === undefined ? {} : { factorValues: row.factorValues }),
    })),
  }
}

export function mixedModelReferenceCases(): MixedModelReferenceCase[] {
  return [
    buildCase(
      'random_slope_no_factors',
      'Random intercept and slope per patient, no covariates; 18 patients, quarterly medians.',
      { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope' },
      18, 79001,
    ),
    buildCase(
      'categorical_and_numeric_factor',
      'Random intercept and slope; genotype (categorical, level and slope, reference A) and dose (numeric, level); 24 patients.',
      {
        timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope',
        factors: [
          { key: 'genotype', kind: 'categorical', effect: 'level_slope', reference: 'A' },
          { key: 'dose', kind: 'numeric', effect: 'level' },
        ],
      },
      24, 79002,
    ),
    buildCase(
      'random_intercept_baseline_age',
      'Random intercept only, baseline age (centred) as covariate through the legacy covariates field; 15 patients.',
      { timeAxis: 'time_since_baseline', covariates: ['baseline_age'], randomEffects: 'intercept' },
      15, 79003,
    ),
  ]
}
