import { useEffect, useMemo, useState } from 'react'
import type { RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import { mixedModelFormula, mixedModelFormulaKey, type MixedModelConfig } from '../../core/mixedModel/config'
import type { CohortModelEntityRows } from '../../core/mixedModel/cohortModelEntity'
import { mixedModelRowsByGroup, mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
import type { MixedModelResult } from '../../core/mixedModel/types'
import type { CohortSeriesSpec } from '../../core/cohort/screening'
import type { PatientGroup } from '../../core/grouping/grouping'
import type { LabRow, PatientId } from '../../core/types'
import { CohortModelTable } from './CohortModelTable'

const GROUP_FALLBACK_COLOR = '#475569'

export interface CohortModelPanelProps {
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
  return { ...config, covariates: [...config.covariates] }
}

function sameConfig(a: MixedModelConfig, b: MixedModelConfig): boolean {
  return mixedModelFormulaKey(a) === mixedModelFormulaKey(b)
}

/** The cohort mixed-model surface: shared model settings on top, then one
 * results table over the whole cohort and every group. Computation runs through
 * the central store action; this component only configures and displays. */
export function CohortModelPanel({
  rows,
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

  const draftValidationMessage = useMemo(() => validateConfig(draftConfig), [draftConfig, validateConfig])
  const draftHasBaselineAge = draftConfig.covariates.includes('baseline_age')
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
    return list
  }, [rows, patientIds, groups, spec])

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

  function setDraftBaselineAge(checked: boolean) {
    setDraftConfig((current) => ({ ...current, covariates: checked ? ['baseline_age'] : [] }))
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
            <label className="mixed-model-config-check">
              <input
                type="checkbox"
                checked={draftHasBaselineAge}
                onChange={(event) => setDraftBaselineAge(event.currentTarget.checked)}
              />
              Baseline age
            </label>
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

        {draftValidationMessage && (
          <p className="mixed-model-config-validation" role="alert">
            {draftValidationMessage}
            {draftValidationMessage.includes('patients') ? ' Expand the cohort scope or choose an eGFR series with enough eligible patients.' : ''}
          </p>
        )}

        <div className="mixed-model-config-footer">
          <details className="mixed-model-formula-details">
            <summary>Formula preview</summary>
            <code className="mixed-model-config-formula">{mixedModelFormula(draftConfig)}</code>
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
