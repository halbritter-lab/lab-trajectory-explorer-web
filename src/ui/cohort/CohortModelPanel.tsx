import { useEffect, useMemo, useState } from 'react'
import type { RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import { mixedModelFormula, mixedModelFormulaKey, mixedModelFactors, mixedModelFactorColumn, type MixedModelFactor, type MixedModelConfig } from '../../core/mixedModel/config'
import type { CohortModelEntityRows } from '../../core/mixedModel/cohortModelEntity'
import { mixedModelRowsByGroup, mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
import type { MixedModelResult } from '../../core/mixedModel/types'
import type { CohortSeriesSpec } from '../../core/cohort/screening'
import type { PatientGroup } from '../../core/grouping/grouping'
import type { LabRow, PatientId } from '../../core/types'
import { CohortModelTable } from './CohortModelTable'

import { availableMixedModelFactors, prepareMixedModelFactors } from '../../core/mixedModel/factors'

const EMPTY_ATTRIBUTES: Record<string, Record<string, string>> = {}
const GROUP_FALLBACK_COLOR = '#475569'

export interface CohortModelPanelProps {
  patientAttributes?: Record<string, Record<string, string>>
  rows: LabRow[]
  patientIds: PatientId[]
  /** Cohort groups in display order; empty when grouping is inactive. */
  groups: PatientGroup[]
  groupColors: Map<string, string>
  spec: CohortSeriesSpec
  seriesIndex: number
  seriesKey: string
  seriesUnit: string | null
  fitConfigHash: string
  config: MixedModelConfig
  formula: string
  formulaLabel: string
  dataPolicySummary: string
  validateConfig: (config: MixedModelConfig) => string | null
  onConfigChange: (config: MixedModelConfig) => void
  /** Injectable worker seam (tests); forwarded to the results table. */
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

function cloneConfig(config: MixedModelConfig): MixedModelConfig {
  return { ...config, covariates: [...config.covariates], ...(config.factors ? { factors: config.factors.map((factor) => ({ ...factor })) } : {}) }
}

function sameConfig(a: MixedModelConfig, b: MixedModelConfig): boolean {
  return mixedModelFormulaKey(a) === mixedModelFormulaKey(b)
}

/** Display only: user-provided attribute labels never enter the executable formula. */
function readableFormula(config: MixedModelConfig): string {
  const labels = new Map<string, string>([
    ['time_since_baseline', 'Time (years)'],
    ['patient_id', 'Patient'],
  ])
  mixedModelFactors(config).forEach((factor, index) => {
    const label = factor.key === 'baseline_age' ? 'Baseline age (centered)' : factor.key === 'sex' ? 'Sex' : factor.key
    labels.set(mixedModelFactorColumn(factor, index), JSON.stringify(label))
  })
  return mixedModelFormula(config).replace(/baseline_age_centered|factor_\d+_|time_since_baseline|patient_id/g, (token) => labels.get(token) ?? token)
}

/** The cohort mixed-model surface: shared model settings on top, then one
 * results table over the whole cohort and every group. Computation runs through
 * the central store action; this component only configures and displays. */
export function CohortModelPanel({
  rows,
  patientAttributes = EMPTY_ATTRIBUTES,
  patientIds,
  groups,
  groupColors,
  spec,
  seriesIndex,
  seriesKey,
  seriesUnit,
  fitConfigHash,
  config,
  formula,
  formulaLabel,
  dataPolicySummary,
  validateConfig,
  onConfigChange,
  runJob,
}: CohortModelPanelProps) {
  const [draftConfig, setDraftConfig] = useState<MixedModelConfig>(() => cloneConfig(config))
  useEffect(() => {
    setDraftConfig(cloneConfig(config))
  }, [config])

  const available = useMemo(() => {
    const ids = new Set(patientIds.map(String))
    const found = availableMixedModelFactors(rows.filter((row) => ids.has(String(row.patientId))), Object.fromEntries(Object.entries(patientAttributes).filter(([id]) => ids.has(id))))
    for (const factor of mixedModelFactors(draftConfig)) {
      if (!found.some((item) => item.key === factor.key)) found.push({key: factor.key, label: factor.key, levels: [], numeric: factor.kind === 'numeric'})
    }
    return found
  }, [rows, patientIds, patientAttributes, draftConfig])
  const draftFactors = mixedModelFactors(draftConfig)
  const missingReference = draftFactors.find((factor) => factor.kind === 'categorical' && !factor.reference)
  const draftValidationMessage = missingReference ? `Choose a reference category for ${missingReference.key}.` : validateConfig(draftConfig)
  const preview = useMemo(() => prepareMixedModelFactors(mixedModelRowsFromCohortInputs(rows, patientIds, spec), draftConfig, patientAttributes, rows), [rows, patientIds, spec, draftConfig, patientAttributes])
  const draftChanged = !sameConfig(draftConfig, config)

  const entities = useMemo<CohortModelEntityRows[]>(() => {
    const list: CohortModelEntityRows[] = [
      { entity: { kind: 'cohort' }, rows: mixedModelRowsFromCohortInputs(rows, patientIds, spec) },
    ]
    if (groups.length > 0) {
      const byGroup = mixedModelRowsByGroup(rows, groups, spec)
      for (const group of groups) {
        const groupRows = byGroup[group.value]
        if (groupRows) list.push({ entity: { kind: 'group', value: group.value }, rows: groupRows })
      }
    }
    return list.map((item) => ({ entity: item.entity, ...prepareMixedModelFactors(item.rows, config, patientAttributes, rows) }))
  }, [rows, patientIds, groups, spec, config, patientAttributes])

  const entityLabels = useMemo(() => {
    const map = new Map<string, string>([['cohort', 'Whole cohort']])
    for (const group of groups) map.set(`group:${group.value}`, group.value)
    return map
  }, [groups])

  const entityColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) map.set(`group:${group.value}`, groupColors.get(group.value) ?? GROUP_FALLBACK_COLOR)
    return map
  }, [groups, groupColors])

  function updateFactor(key: string, patch: Partial<MixedModelFactor> | null) {
    setDraftConfig((current) => {
      const factors = [...mixedModelFactors(current)]
      const index = factors.findIndex((factor) => factor.key === key)
      if (patch) {
        const factor: MixedModelFactor = { key, kind: key === 'baseline_age' ? 'numeric' : 'categorical', effect: 'level', ...(index >= 0 ? factors[index] : {}), ...patch }
        if (index >= 0) factors[index] = factor
        else factors.push(factor)
      } else if (index >= 0) factors.splice(index, 1)
      return { ...current, factors }
    })
  }

  function genotypeExample() {
    setDraftConfig((current) => ({ ...current, factors: [
      {key: 'genotype', kind: 'categorical', effect: 'level_slope'},
      {key: 'baseline_age', kind: 'numeric', effect: 'level_slope'},
      {key: 'sex', kind: 'categorical', effect: 'level_slope'},
    ] }))
  }

  function setDraftRandomEffects(randomEffects: MixedModelConfig['randomEffects']) {
    setDraftConfig((current) => ({ ...current, randomEffects }))
  }

  function applyDraftConfig() {
    if (draftValidationMessage || !draftChanged) return
    onConfigChange(cloneConfig(draftConfig))
  }

  return (
    <div className="cohort-model">
      <section className="mixed-model-inline-config" aria-label="Model settings">
        <div className="mixed-model-config-summary">
          <p className="export-hint mixed-model-message">{dataPolicySummary}</p>
          <p className="mixed-model-message">Model: {formulaLabel}</p>
        </div>

        <div className="mixed-model-options-grid">
          <div className="mixed-model-config-modal-section" aria-label="Fixed effects">
            <span className="mixed-model-config-label">Fixed effects</span>
            <dl className="mixed-model-config-pairs">
              <div>
                <dt>Time axis</dt>
                <dd>time_since_baseline</dd>
              </div>
            </dl>
            {available.some((item) => item.key === 'genotype') && <button type="button" onClick={genotypeExample}>Use genotype example</button>}
            {available.map((item) => {
              const factor = draftFactors.find((entry) => entry.key === item.key)
              const label = item.key === 'baseline_age' ? 'Baseline age' : item.key === 'sex' ? 'Sex' : item.label
              return <fieldset key={item.key} className="mixed-model-config-fieldset">
                <legend>{label}</legend>
                <label>Effect <select aria-label={`${label} effect`} value={factor?.effect ?? 'excluded'} onChange={(event) => updateFactor(item.key, event.target.value === 'excluded' ? null : {effect: event.target.value as MixedModelFactor['effect']})}>
                  <option value="excluded">Excluded</option><option value="level">Level</option><option value="level_slope">Level and slope</option>
                </select></label>
                {factor && <>
                  <label>Interpretation <select aria-label={`${label} interpretation`} value={factor.kind} disabled={item.key === 'baseline_age'} onChange={(event) => updateFactor(item.key, {kind: event.target.value as MixedModelFactor['kind'], reference: undefined})}>
                    <option value="categorical">Categorical</option><option value="numeric">Numeric (centered)</option>
                  </select></label>
                  {factor.kind === 'categorical' && <label>Reference <select aria-label={`${label} reference`} value={factor.reference ?? ''} onChange={(event) => updateFactor(item.key, {reference: event.target.value || undefined})}>
                    <option value="">Choose reference</option>{item.levels.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select></label>}
                </>}
              </fieldset>
            })}
          </div>

          <fieldset className="mixed-model-config-fieldset">
            <legend>Random effects</legend>
            <label className="mixed-model-config-check">
              <input
                type="radio"
                name="cohort-model-random-effects"
                checked={draftConfig.randomEffects === 'intercept'}
                onChange={() => setDraftRandomEffects('intercept')}
              />
              Patient intercept
            </label>
            <label className="mixed-model-config-check">
              <input
                type="radio"
                name="cohort-model-random-effects"
                checked={draftConfig.randomEffects === 'intercept_slope'}
                onChange={() => setDraftRandomEffects('intercept_slope')}
              />
              Patient intercept/slope
            </label>
          </fieldset>
        </div>

        <section aria-label="Model population preview">
          <p>Draft: {new Set(preview.rows.map((row) => row.patient_id)).size} patients / {preview.preparation.nPatientsBefore}; {preview.rows.length} measurements / {preview.preparation.nMeasurementsBefore}.</p>
          <p>Time: years since each patient's first retained measurement. Missing selected factors exclude the patient from this model only; no imputation.</p>
          {preview.preparation.excludedPatients.length > 0 && <details open><summary>Excluded patients ({preview.preparation.excludedPatients.length})</summary><ul>{preview.preparation.excludedPatients.map((patient) => <li key={patient.patientId}>{patient.patientId}: {patient.reasons.join('; ')}</li>)}</ul></details>}
        </section>
        {draftValidationMessage && (
          <p className="mixed-model-config-validation" role="alert">
            {draftValidationMessage}
            {draftValidationMessage.includes('patients') ? ' Expand the cohort scope or choose an eGFR series with enough eligible patients.' : ''}
          </p>
        )}

        <div className="mixed-model-config-footer">
          <details className="mixed-model-formula-details">
            <summary>Formula preview</summary>
            <code className="mixed-model-config-formula" aria-label="Readable formula">{readableFormula(draftConfig)}</code>
          </details>
          <div className="mixed-model-config-actions">
            <button type="button" onClick={applyDraftConfig} disabled={draftValidationMessage !== null || !draftChanged}>
              Apply settings
            </button>
          </div>
        </div>
      </section>

      <CohortModelTable
        entities={entities}
        entityLabels={entityLabels}
        entityColors={entityColors}
        seriesIndex={seriesIndex}
        seriesKey={seriesKey}
        seriesUnit={seriesUnit}
        fitConfigHash={fitConfigHash}
        config={config}
        formula={formula}
        runJob={runJob}
      />
    </div>
  )
}
