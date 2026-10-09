import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { useAppStore } from './state/store'
import type { WorkspaceData } from './workspace-data'
import { workspaceModelSpec } from './workspace-data'
import { describeModelPreparation, modelPreparationKey, modelPreparationSource } from './workspace-analysis'
import { groupColors, groupPatients } from '../core/grouping/grouping'
import { patientIdKey } from '../core/types'
import { mentionsEgfr } from '../core/domains/nephrology/analytes'
import { mixedModelFitConfigHash } from '../core/mixedModel/resultIdentity'
import {
  mixedModelFormula,
  type MixedModelConfig,
  type MixedModelFactor,
  mixedModelFactors,
} from '../core/mixedModel/config'
import { prepareMixedModelCohortRows } from '../core/mixedModel/cohortDataset'
import { availableMixedModelFactors, prepareMixedModelFactors } from '../core/mixedModel/factors'
import { validateMixedModelRows } from '../core/mixedModel/validation'
import type { CohortModelEntityRows } from '../core/mixedModel/cohortModelEntity'
import { CohortModelPlotPreview } from './CohortModelPlotPreview'
import { currentWorkspaceModels, groupInteractionFactor, readableMixedModelFormula, workspaceGroupableAttributes, workspaceModelEntities } from './workspace-model-results'
import './cohort-models-workspace.css'

const CohortModelTable = lazy(() =>
  import('./models/CohortModelTable').then(module => ({ default: module.CohortModelTable }))
)

export type CohortModelPreset = 'unadjusted' | 'stratified' | 'demographic' | 'interaction' | 'custom'

interface Props {
  data: WorkspaceData
  onBrowseTrajectories: () => void
  onBrowseData: () => void
}

export function CohortModelsWorkspace({ data, onBrowseTrajectories, onBrowseData }: Props) {
  const fitFeedbackId = useId()
  const [invocationFeedback, setInvocationFeedback] = useState<string | null>(null)
  const mixedModelConfig = useAppStore(s => s.mixedModelConfig)
  const setMixedModelConfig = useAppStore(s => s.setMixedModelConfig)
  const presetExclusionPolicy = useAppStore(s => s.presetExclusionPolicy)
  const setPresetExclusionPolicy = useAppStore(s => s.setPresetExclusionPolicy)
  const showCohortMixedModelLine = useAppStore(s => s.showCohortMixedModelLine)
  const setShowCohortMixedModelLine = useAppStore(s => s.setShowCohortMixedModelLine)
  const cohortModelResults = useAppStore(s => s.cohortModelResults)
  const cohortModelRunning = useAppStore(s => s.cohortModelRunning)
  const cohortModelProgress = useAppStore(s => s.cohortModelProgress)
  const runCohortModels = useAppStore(s => s.runCohortModels)


  const eligibleParameters = useMemo(() => {
    return (data.parameters ?? []).filter(p =>
      (data.rows ?? []).some(r => r.bezeichnung === p.bezeichnung && r.einheit === p.einheit && r.wertNum !== null && Number.isFinite(r.wertNum))
    )
  }, [data.parameters, data.rows])

  const [selectedParamKey, setSelectedParamKey] = useState<string>(() => {
    const egfrParam = eligibleParameters.find(p => mentionsEgfr(p.bezeichnung))
    return egfrParam?.key ?? eligibleParameters[0]?.key ?? ''
  })

  const [groupByAttribute, setGroupByAttribute] = useState<string | null>(null)
  const [preset, setPreset] = useState<CohortModelPreset>('unadjusted')

  const patientIds = useMemo(() => (data.patients ?? []).map(p => p.id), [data.patients])

  const groupableAttributes = useMemo(
    () => workspaceGroupableAttributes(data.rows ?? [], data.patientAttributes ?? {}),
    [data.rows, data.patientAttributes],
  )

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

  const groupValuesByPatient = useMemo(() => {
    const map = new Map<string, string>()
    if (!groupByAttribute) return map
    for (const pId of patientIds) {
      const key = patientIdKey(pId)
      const val = groupableAttributes[key]?.[groupByAttribute]
      if (val) map.set(String(pId), val)
    }
    return map
  }, [groupByAttribute, patientIds, groupableAttributes])

  const availableFactors = useMemo(() => {
    const ids = new Set(patientIds.map(String))
    const rowsInScope = (data.rows ?? []).filter(row => ids.has(String(row.patientId)))
    const attrsInScope = Object.fromEntries(
      Object.entries(data.patientAttributes ?? {}).filter(([id]) => ids.has(id))
    )
    return availableMixedModelFactors(rowsInScope, attrsInScope)
  }, [data.rows, patientIds, data.patientAttributes])

  const activeParamKey = eligibleParameters.some(p => p.key === selectedParamKey)
    ? selectedParamKey
    : (eligibleParameters[0]?.key ?? '')

  // The measurements follow the analysis settings chosen for this parameter
  // under Trajectories, so the model sees what the trajectory fit sees.
  // Keyed on the settings that reach the model, so unrelated edits under
  // Trajectories do not rebuild the model rows.
  const preparationKey = useAppStore(s => modelPreparationKey(s.trajectoryFitSettings, activeParamKey))
  const preparationSource = useAppStore(s => modelPreparationSource(s.trajectoryFitSettings, activeParamKey))
  const spec = useMemo(() => {
    if (!activeParamKey) return undefined
    return workspaceModelSpec(data, activeParamKey, useAppStore.getState().trajectoryFitSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeParamKey, preparationKey])
  const noFit = spec?.fitConfig?.fitModel === 'none'

  const paramIndex = useMemo(() => {
    return (data.parameters ?? []).findIndex(p => p.key === activeParamKey)
  }, [data.parameters, activeParamKey])

  const modelSample = useMemo(
    () => spec ? prepareMixedModelCohortRows(data.rows ?? [], patientIds, spec, presetExclusionPolicy) : { rows: [], excludedByPreset: 0 },
    [data.rows, patientIds, spec, presetExclusionPolicy],
  )
  const mixedModelRows = modelSample.rows

  const fitConfigHash = useMemo(
    () => spec ? mixedModelFitConfigHash(spec, mixedModelConfig, presetExclusionPolicy) : '',
    [spec, mixedModelConfig, presetExclusionPolicy],
  )

  const formulaText = useMemo(() => mixedModelFormula(mixedModelConfig), [mixedModelConfig])

  const entities = useMemo<CohortModelEntityRows[]>(
    () => spec ? workspaceModelEntities(data.rows ?? [], patientIds, spec, mixedModelConfig, data.patientAttributes ?? {}, cohortGroups, presetExclusionPolicy) : [],
    [data.rows, patientIds, cohortGroups, spec, mixedModelConfig, data.patientAttributes, presetExclusionPolicy],
  )

  const validatedEntities = useMemo(() => entities.map(entity => ({ entity,
    validation: validateMixedModelRows(entity.rows, mixedModelConfig),
  })), [entities, mixedModelConfig])
  const eligibleEntities = validatedEntities.filter(item => item.validation.ok).map(item => item.entity)
  const invalidEntities = validatedEntities.filter(item => !item.validation.ok)
  const validationReasons = invalidEntities.map(({ entity, validation }) =>
    `${entity.entity.kind === 'cohort' ? 'Whole cohort' : entity.entity.value}: ${!validation.ok ? validation.message : ''}`,
  ).join(' ')
  const canFit = eligibleEntities.length > 0 && !cohortModelRunning && !noFit
  const fitUnavailableReason = cohortModelRunning
    ? (cohortModelProgress ? `Fitting ${cohortModelProgress.completed + 1} of ${cohortModelProgress.total} …` : 'Fitting model …')
    : noFit ? 'Model fitting is disabled under Trajectories because No fit is selected. Choose a fit model under Trajectories.'
    : eligibleEntities.length === 0 ? `No model can be fitted with the current data and settings. ${validationReasons || 'Mixed model fitting requires at least one measurement row.'}`
    : null
  const fitFeedback = fitUnavailableReason ?? (invalidEntities.length > 0
    ? `${invalidEntities.length} unit${invalidEntities.length === 1 ? '' : 's'} skipped. ${validationReasons}` : invocationFeedback)

  const currentModels = useMemo(() => currentWorkspaceModels(cohortModelResults, entities,
    paramIndex, activeParamKey, fitConfigHash), [cohortModelResults, entities, paramIndex, activeParamKey, fitConfigHash])
  const hasSuccessfulModel = Object.keys(currentModels).length > 0

  const entityLabels = useMemo(() => {
    const map = new Map<string, string>([['cohort', 'Whole cohort']])
    for (const group of cohortGroups) map.set(`group:${group.value}`, group.value)
    return map
  }, [cohortGroups])

  const entityColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of cohortGroups) map.set(`group:${group.value}`, cohortGroupColorMap.get(group.value) ?? '#475569')
    return map
  }, [cohortGroups, cohortGroupColorMap])

  // Preset switching logic
  function selectPreset(newPreset: CohortModelPreset, targetAttr?: string | null) {
    setPreset(newPreset)

    if (newPreset === 'unadjusted') {
      setGroupByAttribute(null)
      setMixedModelConfig({
        timeAxis: 'time_since_baseline',
        covariates: [],
        factors: [],
        randomEffects: 'intercept_slope',
      })
    } else if (newPreset === 'stratified') {
      const attr = targetAttr !== undefined ? targetAttr : groupByAttribute ?? availableGroupByAttributes[0] ?? null
      setGroupByAttribute(attr)
      setMixedModelConfig({
        timeAxis: 'time_since_baseline',
        covariates: [],
        factors: [],
        randomEffects: 'intercept_slope',
      })
    } else if (newPreset === 'demographic') {
      setGroupByAttribute(null)
      const sexFactor = availableFactors.find(f => f.key === 'sex')
      const defaultSexRef = sexFactor?.levels[0] ?? 'w'
      setMixedModelConfig({
        timeAxis: 'time_since_baseline',
        covariates: ['baseline_age'],
        factors: [
          { key: 'baseline_age', kind: 'numeric', effect: 'level' },
          { key: 'sex', kind: 'categorical', effect: 'level', reference: defaultSexRef },
        ],
        randomEffects: 'intercept_slope',
      })
    } else if (newPreset === 'interaction') {
      const attr = targetAttr ?? (availableGroupByAttributes.find(a => a !== 'sex') ?? availableGroupByAttributes[0] ?? 'genotype')
      setGroupByAttribute(null)
      setMixedModelConfig({
        timeAxis: 'time_since_baseline',
        covariates: [],
        factors: [groupInteractionFactor(attr, availableFactors.find(f => f.key === attr))],
        randomEffects: 'intercept_slope',
      })
    }
  }

  // Factor manipulation in custom mode or active chips
  function updateFactor(key: string, patch: Partial<MixedModelFactor> | null) {
    setPreset('custom')
    const currentFactors = [...mixedModelFactors(mixedModelConfig)]
    const index = currentFactors.findIndex(f => f.key === key)

    if (patch) {
      const factorDef = availableFactors.find(f => f.key === key)
      const defaultKind = key === 'baseline_age' || (factorDef?.numeric ?? false) ? 'numeric' : 'categorical'
      const defaultRef = factorDef?.levels[0] ?? undefined
      const updated: MixedModelFactor = {
        key,
        kind: defaultKind,
        effect: 'level',
        reference: defaultKind === 'categorical' ? defaultRef : undefined,
        ...(index >= 0 ? currentFactors[index] : {}),
        ...patch,
      }
      if (index >= 0) currentFactors[index] = updated
      else currentFactors.push(updated)
    } else if (index >= 0) {
      currentFactors.splice(index, 1)
    }

    setMixedModelConfig({
      ...mixedModelConfig,
      factors: currentFactors,
    })
  }

  function setRandomEffects(re: MixedModelConfig['randomEffects']) {
    setPreset('custom')
    setMixedModelConfig({
      ...mixedModelConfig,
      randomEffects: re,
    })
  }

  async function handleFitAll() {
    if (!spec || noFit || cohortModelRunning) return
    // Validate again at invocation; availability must never submit an invalid unit.
    const invocationValidation = entities.map(entity => ({ entity,
      validation: validateMixedModelRows(entity.rows, mixedModelConfig),
    }))
    const eligibleEntities = invocationValidation.filter(item => item.validation.ok).map(item => item.entity)
    if (eligibleEntities.length === 0) {
      setInvocationFeedback(`No model can be fitted with the current data and settings. ${invocationValidation.map(({ entity, validation }) => validation.ok ? '' :
        `${entity.entity.kind === 'cohort' ? 'Whole cohort' : entity.entity.value}: ${validation.message}`,
      ).join(' ') || 'Mixed model fitting requires at least one measurement row.'}`)
      return
    }
    setInvocationFeedback(null)
    await runCohortModels({
      entities: eligibleEntities,
      seriesIndex: paramIndex >= 0 ? paramIndex : 0,
      seriesKey: activeParamKey,
      fitConfigHash,
      config: mixedModelConfig,
      formula: formulaText,
    })
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

  const activeFactors = mixedModelFactors(mixedModelConfig)
  // Categorical estimates are contrasts against this level; it is shown, not
  // left implicit, because the default is simply the first level found.
  const categoricalReferences = activeFactors.flatMap(factor => {
    if (factor.kind !== 'categorical') return []
    const levels = availableFactors.find(f => f.key === factor.key)?.levels ?? []
    const reference = factor.reference ?? levels[0]
    if (reference === undefined) return []
    return [{ label: factor.key === 'sex' ? 'Sex' : factor.key, reference, isDefault: reference === levels[0] }]
  })
  const inactiveFactors = availableFactors.filter(f => !activeFactors.some(af => af.key === f.key))
  const sampleSummary = prepareMixedModelFactors(mixedModelRows, mixedModelConfig, data.patientAttributes ?? {}, data.rows ?? [])

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

      {/* Model Studio Card */}
      <section className="cm-studio-card card" aria-label="Model Studio">
        <div className="cm-primary-controls">
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

          {(preset === 'stratified' || preset === 'custom' || groupByAttribute) && (
            <label>
              Model grouping
              <select
                aria-label="Model grouping"
                value={groupByAttribute ?? ''}
                onChange={e => {
                  const val = e.target.value || null
                  setGroupByAttribute(val)
                  if (preset === 'stratified') selectPreset('stratified', val)
                }}
              >
                <option value="">No grouping (Whole cohort)</option>
                {availableGroupByAttributes.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Preset Selector */}
        <div className="cm-preset-section">
          <div className="cm-preset-bar" role="group" aria-label="Model presets">
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'unadjusted' ? 'active' : ''}`}
              aria-pressed={preset === 'unadjusted'}
              onClick={() => selectPreset('unadjusted')}
            >
              <span>🔬 Standard (Overall)</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'stratified' ? 'active' : ''}`}
              aria-pressed={preset === 'stratified'}
              onClick={() => selectPreset('stratified')}
            >
              <span>👥 Subgroup comparison</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'demographic' ? 'active' : ''}`}
              aria-pressed={preset === 'demographic'}
              onClick={() => selectPreset('demographic')}
            >
              <span>⚖️ Demographic adjustment</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'interaction' ? 'active' : ''}`}
              aria-pressed={preset === 'interaction'}
              onClick={() => selectPreset('interaction')}
            >
              <span>🧬 Group interaction</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'custom' ? 'active' : ''}`}
              onClick={() => setPreset('custom')}
            >
              <span>🛠️ Custom model</span>
            </button>
          </div>

          <p className="cm-preset-desc">
            {preset === 'unadjusted' && 'Standard trajectory: Y ~ Time + (1 + Time | Patient). Evaluates overall progression rate without covariates.'}
            {preset === 'stratified' && 'Stratified analysis: Fits independent mixed models for each subgroup of the selected attribute.'}
            {preset === 'demographic' && 'Standard epidemiological model: Y ~ Time + Baseline age + Sex + (1 + Time | Patient).'}
            {preset === 'interaction' && 'Slope interaction test: Y ~ Time * Group + (1 + Time | Patient). Estimates slope differences with 95% confidence intervals; no p-values are computed.'}
            {preset === 'custom' && 'Full custom model: Select specific covariates, effects, reference categories, and random effects.'}
          </p>
        </div>

        {/* Covariates & Factor Chips (Shown if custom or active factors exist) */}
        {(preset === 'custom' || activeFactors.length > 0) && (
          <div className="cm-factors-container">
            <div className="cm-factors-header">
              <strong>Active covariates ({activeFactors.length})</strong>
              <div className="cm-random-effects-toggle">
                <span>Random effects:</span>
                <label>
                  <input
                    type="radio"
                    name="cm-re"
                    checked={mixedModelConfig.randomEffects === 'intercept_slope'}
                    onChange={() => setRandomEffects('intercept_slope')}
                  />
                  Patient intercept &amp; slope
                </label>
                <label>
                  <input
                    type="radio"
                    name="cm-re"
                    checked={mixedModelConfig.randomEffects === 'intercept'}
                    onChange={() => setRandomEffects('intercept')}
                  />
                  Intercept only
                </label>
              </div>
            </div>

            <div className="cm-factors-chips">
              {activeFactors.map(factor => {
                const factorDef = availableFactors.find(f => f.key === factor.key)
                const label = factor.key === 'baseline_age' ? 'Baseline age' : factor.key === 'sex' ? 'Sex' : (factorDef?.label ?? factor.key)
                return (
                  <div key={factor.key} className="cm-chip">
                    <span className="cm-chip-name">{label}</span>
                    <select
                      aria-label={`${label} effect`}
                      value={factor.effect}
                      onChange={e => updateFactor(factor.key, { effect: e.target.value as MixedModelFactor['effect'] })}
                    >
                      <option value="level">Level (Shift)</option>
                      <option value="level_slope">Level &amp; Slope (Interaction)</option>
                    </select>

                    {factor.kind === 'categorical' && factorDef?.levels && factorDef.levels.length > 0 && (
                      <select
                        aria-label={`${label} reference`}
                        value={factor.reference ?? factorDef.levels[0]}
                        onChange={e => updateFactor(factor.key, { reference: e.target.value })}
                      >
                        {factorDef.levels.map(lvl => (
                          <option key={lvl} value={lvl}>Ref: {lvl}</option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      className="cm-chip-remove"
                      title={`Remove ${label}`}
                      aria-label={`Remove ${label}`}
                      onClick={() => updateFactor(factor.key, null)}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              {inactiveFactors.length > 0 && (
                <div className="cm-add-factor-wrap">
                  <select
                    aria-label="Add covariate"
                    value=""
                    onChange={e => {
                      if (e.target.value) updateFactor(e.target.value, {})
                    }}
                  >
                    <option value="" disabled>+ Add covariate …</option>
                    {inactiveFactors.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Formula strip and sample coverage */}
        <label className="mixed-model-config-check">
          <input type="checkbox" checked={presetExclusionPolicy === 'apply'} onChange={event => setPresetExclusionPolicy(event.target.checked ? 'apply' : 'skip')} />
          Apply preset event and AKI exclusions
        </label>
        {!noFit && <p className="muted">Preset windows: {presetExclusionPolicy === 'apply' ? 'applied' : 'skipped'}; {modelSample.excludedByPreset} eligible measurements excluded. Count precedes time balancing, run-in and factor exclusions.</p>}
        {spec?.fitConfig && <p className={noFit ? 'notice amber' : 'muted'} role={noFit ? 'status' : undefined} data-testid="model-preparation">Measurements follow the Trajectories analysis settings for this parameter. {describeModelPreparation(spec.fitConfig, preparationSource)}{noFit ? ' Choose a fit model for it under Trajectories to fit a cohort model.' : `${presetExclusionPolicy === 'skip' ? ' The event and AKI windows are skipped by the choice above; time aggregation still applies.' : ''} Changing these settings under Trajectories discards the models fitted for this parameter.`}</p>}
        <div className="cm-formula-strip">
          <div>
            <span>Model: </span>
            <span className="cm-formula-code" aria-label="Readable formula">{readableMixedModelFormula(mixedModelConfig, spec?.bezeichnung ?? 'Outcome')}</span>
          </div>
          <div className="cm-sample-meta">
            Complete cases: {sampleSummary.rows.length > 0 ? new Set(sampleSummary.rows.map(r => r.patient_id)).size : 0} patients / {data.patients.length} ({sampleSummary.rows.length} measurements)
          </div>
        </div>
        {categoricalReferences.length > 0 && <p className="cm-reference-levels" aria-label="Reference categories">
          Reference categories: {categoricalReferences.map(item => `${item.label} = ${item.reference}${item.isDefault ? ' (first level by default; change it next to the factor)' : ''}`).join(' · ')}
        </p>}
        <p className="muted cm-population-note">Time: years since each patient's first retained measurement. Missing selected factors exclude the patient from this model only; no imputation.</p>
        {sampleSummary.preparation.excludedPatients.length > 0 && <details className="cm-excluded-patients">
          <summary>Excluded patients ({sampleSummary.preparation.excludedPatients.length})</summary>
          <ul aria-label="Patients excluded from the model">{sampleSummary.preparation.excludedPatients.map(patient => <li key={String(patient.patientId)}>{patient.patientId}: {patient.reasons.join('; ')}</li>)}</ul>
        </details>}

        {/* Studio Footer with Primary Fit Action */}
        <div className="cm-studio-footer">
          <div>
            <span className="muted">
              One linear mixed-effects model per selected unit. Fit runs in-browser via WebR (lme4).
            </span>
          </div>
          <button
            type="button"
            className="primary cm-fit-button"
            disabled={!canFit}
            aria-describedby={fitFeedback ? fitFeedbackId : undefined}
            onClick={handleFitAll}
          >
            {cohortModelRunning
              ? (cohortModelProgress ? `Fitting ${cohortModelProgress.completed + 1} of ${cohortModelProgress.total} …` : 'Running model …')
              : `▶ Fit model${eligibleEntities.length > 1 ? `s (${eligibleEntities.length} units)` : ''}`}
          </button>
        </div>
        <p id={fitFeedbackId} className="muted" role="status" aria-live="polite">{fitFeedback}</p>
      </section>

      {/* Model Trajectory Preview Plot */}
      {spec && (
        <CohortModelPlotPreview
          parameterLabel={spec.bezeichnung}
          parameterUnit={spec.einheit}
          spikeRows={mixedModelRows}
          groups={cohortGroups}
          groupColors={cohortGroupColorMap}
          groupValuesByPatient={groupValuesByPatient}
          cohortModelResults={currentModels}
          modelRowsByEntity={Object.fromEntries(entities.map(item => [item.entity.kind === 'cohort' ? 'cohort' : `group:${item.entity.value}`, item.rows]))}
          isFitting={cohortModelRunning}
          onFit={handleFitAll}
          canFit={canFit}
          fitUnavailableReason={fitUnavailableReason}
          fitFeedbackId={fitFeedbackId}
        />
      )}

      {/* Results Table & Projections */}
      {spec && (
        <Suspense fallback={<div className="card" role="status"><p>Loading results table …</p></div>}>
          <CohortModelTable
            entities={entities}
            entityLabels={entityLabels}
            entityColors={entityColors}
            seriesIndex={paramIndex >= 0 ? paramIndex : 0}
            seriesKey={activeParamKey}
            seriesUnit={spec.einheit}
            sourceResponse={{ outcome: spec.bezeichnung, unit: spec.einheit ?? '' }}
            fitConfigHash={fitConfigHash}
            config={mixedModelConfig}
            formula={formulaText}
          />
        </Suspense>
      )}
    </div>
  )
}
