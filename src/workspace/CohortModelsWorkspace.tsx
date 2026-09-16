import { lazy, Suspense, useMemo, useState } from 'react'
import { useAppStore } from '../ui/state/store'
import type { WorkspaceData } from './workspace-data'
import { workspaceSpecs } from './workspace-data'
import { groupColors, groupPatients } from '../core/grouping/grouping'
import { normaliseSex } from '../core/egfr/formulas'
import { patientIdKey } from '../core/types'
import { mixedModelFitConfigHash } from '../core/mixedModel/resultIdentity'
import { mixedModelFormula, mixedModelConfigLabel, validateMixedModelConfig, type MixedModelConfig } from '../core/mixedModel/config'
import { mixedModelRowsFromCohortInputs } from '../core/mixedModel/cohortDataset'
import { prepareMixedModelFactors } from '../core/mixedModel/factors'
import { validateMixedModelRows } from '../core/mixedModel/validation'
import './cohort-models-workspace.css'

const CohortModelPanel = lazy(() =>
  import('../ui/cohort/CohortModelPanel').then(module => ({ default: module.CohortModelPanel }))
)

interface Props {
  data: WorkspaceData
  onBrowseTrajectories: () => void
  onBrowseData: () => void
}

export function CohortModelsWorkspace({ data, onBrowseTrajectories, onBrowseData }: Props) {
  const mixedModelConfig = useAppStore(s => s.mixedModelConfig)
  const setMixedModelConfig = useAppStore(s => s.setMixedModelConfig)
  const showCohortMixedModelLine = useAppStore(s => s.showCohortMixedModelLine)
  const setShowCohortMixedModelLine = useAppStore(s => s.setShowCohortMixedModelLine)
  const cohortModelResults = useAppStore(s => s.cohortModelResults)

  const hasSuccessfulModel = Boolean(
    cohortModelResults && Object.values(cohortModelResults).some(s => s.result.status === 'success')
  )

  const eligibleParameters = useMemo(() => {
    return (data.parameters ?? []).filter(p =>
      (data.rows ?? []).some(r => r.bezeichnung === p.bezeichnung && r.einheit === p.einheit && r.wertNum !== null && Number.isFinite(r.wertNum))
    )
  }, [data.parameters, data.rows])

  const [selectedParamKey, setSelectedParamKey] = useState<string>(() => {
    const egfrParam = eligibleParameters.find(p => p.bezeichnung.toLowerCase().includes('egfr'))
    return egfrParam?.key ?? eligibleParameters[0]?.key ?? ''
  })

  const [groupByAttribute, setGroupByAttribute] = useState<string | null>(null)

  const patientIds = useMemo(() => (data.patients ?? []).map(p => p.id), [data.patients])

  const groupableAttributes = useMemo(() => {
    const merged: Record<string, Record<string, string>> = {}
    for (const r of (data.rows ?? [])) {
      if (r.patientSex === null) continue
      const key = patientIdKey(r.patientId)
      if (merged[key] === undefined) merged[key] = { sex: r.patientSex }
    }
    for (const [key, attributes] of Object.entries(data.patientAttributes ?? {})) {
      if (!attributes) continue
      const normalisedSex = normaliseSex(attributes.sex)
      merged[key] = {
        ...merged[key],
        ...attributes,
        ...(normalisedSex !== null ? { sex: normalisedSex } : {}),
      }
    }
    return merged
  }, [data.rows, data.patientAttributes])

  const availableGroupByAttributes = useMemo(() => {
    const cohortKeys = new Set(patientIds.map(patientIdKey))
    const names = new Set<string>()
    for (const [key, attributes] of Object.entries(groupableAttributes)) {
      if (!cohortKeys.has(key)) continue
      for (const name of Object.keys(attributes)) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [groupableAttributes, patientIds])

  const cohortGroups = useMemo(
    () => (groupByAttribute ? groupPatients(patientIds, groupableAttributes, groupByAttribute) : []),
    [groupByAttribute, patientIds, groupableAttributes],
  )

  const cohortGroupColorMap = useMemo(
    () => (groupByAttribute ? groupColors(cohortGroups) : new Map<string, string>()),
    [groupByAttribute, cohortGroups],
  )

  const activeParamKey = eligibleParameters.some(p => p.key === selectedParamKey)
    ? selectedParamKey
    : (eligibleParameters[0]?.key ?? '')

  const spec = useMemo(() => {
    if (!activeParamKey) return undefined
    const specs = workspaceSpecs(data, [activeParamKey])
    return specs[0]
  }, [data, activeParamKey])

  const paramIndex = useMemo(() => {
    return (data.parameters ?? []).findIndex(p => p.key === activeParamKey)
  }, [data.parameters, activeParamKey])

  const mixedModelRows = useMemo(
    () => spec ? mixedModelRowsFromCohortInputs(data.rows ?? [], patientIds, spec) : [],
    [data.rows, patientIds, spec],
  )

  const fitConfigHash = useMemo(
    () => spec ? mixedModelFitConfigHash(spec, mixedModelConfig) : '',
    [spec, mixedModelConfig],
  )

  const formulaText = useMemo(() => mixedModelFormula(mixedModelConfig), [mixedModelConfig])
  const formulaLabelText = useMemo(() => mixedModelConfigLabel(mixedModelConfig), [mixedModelConfig])

  function validateMixedModelDraftConfig(config: MixedModelConfig): string | null {
    const configValidation = validateMixedModelConfig(config)
    if (!configValidation.ok) return configValidation.message
    const rowValidation = validateMixedModelRows(
      prepareMixedModelFactors(mixedModelRows, config, data.patientAttributes ?? {}, data.rows ?? []).rows,
      config
    )
    return rowValidation.ok ? null : rowValidation.message
  }

  if (!data.rawRows || !data.rawRows.length) {
    return (
      <div className="card">
        <h1>Cohort models</h1>
        <p>Load a dataset first to fit population-level mixed models.</p>
        <button type="button" className="primary" onClick={onBrowseData}>Load data</button>
      </div>
    )
  }

  return (
    <div className="cohort-models-workspace stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">POPULATION MODELS · FIXED & RANDOM EFFECTS</p>
          <h1>Cohort models</h1>
          <p className="muted">
            Linear mixed-effects models (WebR / lme4). Fit population trajectories, evaluate covariates (genotype, age, sex),
            and project target thresholds.
          </p>
        </div>
        <div className="actions">
          {hasSuccessfulModel && (
            <label className="mixed-model-config-check" title="Show the fitted model trajectory on the overlay plot">
              <input
                type="checkbox"
                aria-label="Show cohort model line in overlay"
                checked={showCohortMixedModelLine}
                onChange={e => setShowCohortMixedModelLine(e.target.checked)}
              />
              Show model line in overlay
            </label>
          )}
          <button type="button" onClick={onBrowseTrajectories}>View trajectories →</button>
        </div>
      </header>

      <section className="card wt-controls" aria-label="Cohort model settings">
        <div className="wt-control-grid">
          <label>
            Model parameter
            <select
              aria-label="Model parameter"
              value={activeParamKey}
              onChange={e => setSelectedParamKey(e.target.value)}
            >
              {eligibleParameters.map(p => (
                <option key={p.key} value={p.key}>{p.label}{p.derived ? ' (computed)' : ''}</option>
              ))}
            </select>
          </label>

          <label>
            Model grouping
            <select
              aria-label="Model grouping"
              value={groupByAttribute ?? ''}
              onChange={e => setGroupByAttribute(e.target.value || null)}
            >
              <option value="">No grouping (Whole cohort)</option>
              {availableGroupByAttributes.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {spec ? (
        <Suspense fallback={<div className="card" role="status"><p>Initializing model environment …</p></div>}>
          <CohortModelPanel
            rows={data.rows ?? []}
            patientAttributes={data.patientAttributes ?? {}}
            patientIds={patientIds}
            groups={cohortGroups}
            groupColors={cohortGroupColorMap}
            spec={spec}
            seriesIndex={paramIndex >= 0 ? paramIndex : 0}
            seriesKey={activeParamKey}
            seriesUnit={spec.einheit}
            fitConfigHash={fitConfigHash}
            config={mixedModelConfig}
            formula={formulaText}
            formulaLabel={formulaLabelText}
            dataPolicySummary="Uses selected patients, active parameter, clinical event censoring, AKI exclusions, and time balancing."
            validateConfig={validateMixedModelDraftConfig}
            onConfigChange={setMixedModelConfig}
          />
        </Suspense>
      ) : (
        <div className="card"><p>No numeric measurements available to fit a model.</p></div>
      )}
    </div>
  )
}
