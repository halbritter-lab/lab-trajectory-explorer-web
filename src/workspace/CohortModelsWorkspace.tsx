import { seriesMerges } from '../core/domains/nephrology/seriesMergeModule'
import { useId, useMemo, useRef, useState } from 'react'
import { trajectorySettingsDiscardModels, useAppStore } from './state/store'
import type { WorkspaceData } from './workspace-data'
import { workspaceModelSpec } from './workspace-data'
import { ANALYSIS_CATALOG, describeModelPreparation, modelPreparationKey, presetSettingsKeepingAnchor, modelPreparationSource } from './workspace-analysis'
import { PresetOptions } from './WorkspaceAnalysisSettings'
import { STANDARD_PRESETS } from '../core/analysis/fitConfig'
import { groupColors, groupPatients } from '../core/grouping/grouping'
import { patientIdKey } from '../core/types'
import { buildCohortRows } from '../core/cohort/screening'
import { MIN_SLOPE_DECIMALS, slopeDisplayDecimals } from '../core/format'
import { mixedModelFitConfigHash } from '../core/mixedModel/resultIdentity'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  LOG_BASELINE_UACR_KEY,
  MIN_LEVEL_MEASUREMENTS,
  MIN_LEVEL_PATIENTS,
  mixedModelFactorLabel,
  mixedModelFormula,
  POOLED_LEVEL,
  type MixedModelConfig,
  type MixedModelFactor,
  mixedModelFactors,
  resolveMixedModelFactorReferences,
} from '../core/mixedModel/config'
import { prepareMixedModelCohortRows } from '../core/mixedModel/cohortDataset'
import { availableMixedModelFactors, prepareMixedModelFactors } from '../core/mixedModel/factors'
import { MIN_QUALIFYING_PATIENTS, mixedModelFactorLevelCounts, qualifyingMixedModelPatients, validateMixedModelRows } from '../core/mixedModel/validation'
import { entityKey, type CohortModelEntityRows } from '../core/mixedModel/cohortModelEntity'
import { datasetEnd, INFORMATIVE_DROPOUT_SHARE, LOSS_TO_FOLLOW_UP_DAYS, mixedModelDropout, type MixedModelDropout } from '../core/mixedModel/dropout'
import type { MixedModelLevelPooling } from '../core/mixedModel/types'
import { CohortModelPlotPreview } from './CohortModelPlotPreview'
import { defaultModelParameterKey } from './cohort-model-parameter'
import { currentWorkspaceModels, groupInteractionFactor, readableMixedModelFormula, workspaceGroupableAttributes, workspaceModelEntities } from './workspace-model-results'
// Part of the main bundle on purpose: the page is rendered (hidden) as soon as
// data are loaded, so a separately fetched chunk failed for everyone who lost
// the connection or kept a tab open across a deployment.
import { CohortModelTable } from './models/CohortModelTable'
import { TimeToEventPanel } from './models/TimeToEventPanel'
import { R_FIRST_FIT_DOWNLOAD_MB } from '../core/mixedModel/rRuntime'
import './cohort-models-workspace.css'
import { msg, t, tp, tx } from '../i18n'

export type CohortModelPreset = 'unadjusted' | 'stratified' | 'demographic' | 'interaction' | 'custom'

interface Props {
  data: WorkspaceData
  onBrowseTrajectories: () => void
  onBrowseData: () => void
}

export function CohortModelsWorkspace({ data, onBrowseTrajectories, onBrowseData }: Props) {
  const fitFeedbackId = useId()
  const preparationScopeId = useId()
  const [preparationNotice, setPreparationNotice] = useState<{ key: string | undefined; text: string } | null>(null)
  const [invocationFeedback, setInvocationFeedback] = useState<string | null>(null)
  const fitButton = useRef<HTMLButtonElement>(null)
  // Cancel removes itself: say what happened and hand the focus to the fit button.
  const cancelFit = () => {
    useAppStore.getState().cancelCohortModels()
    setInvocationFeedback(t('Fit cancelled. Nothing of this run was stored; models fitted before are kept.'))
    requestAnimationFrame(() => fitButton.current?.focus())
  }
  const mixedModelConfig = useAppStore(s => s.mixedModelConfig)
  const setMixedModelConfig = useAppStore(s => s.setMixedModelConfig)
  const setConfig = setMixedModelConfig
  const presetExclusionPolicy = useAppStore(s => s.presetExclusionPolicy)
  const setPresetExclusionPolicy = useAppStore(s => s.setPresetExclusionPolicy)
  const showCohortMixedModelLine = useAppStore(s => s.showCohortMixedModelLine)
  const setShowCohortMixedModelLine = useAppStore(s => s.setShowCohortMixedModelLine)
  const cohortModelResults = useAppStore(s => s.cohortModelResults)
  const cohortModelRunning = useAppStore(s => s.cohortModelRunning)
  const cohortModelProgress = useAppStore(s => s.cohortModelProgress)
  const runtimeLoaded = useAppStore(s => s.cohortModelRuntimeLoaded)
  const runCohortModels = useAppStore(s => s.runCohortModels)


  // Merged series (issue #68) are derived but not computed.
  const mergedKeys = new Set(seriesMerges(data.analysisSettings).map(merge => JSON.stringify([merge.name, merge.unit])))
  const eligibleParameters = useMemo(() => {
    return (data.parameters ?? []).filter(p =>
      (data.rows ?? []).some(r => r.bezeichnung === p.bezeichnung && r.einheit === p.einheit && r.wertNum !== null && Number.isFinite(r.wertNum))
    )
  }, [data.parameters, data.rows])

  // Null until the user picks a parameter: the preselection follows the data, so a
  // computed eGFR applied later under Data can take over from an unfittable import.
  const [selectedParamKey, setSelectedParamKey] = useState<string | null>(null)

  const [groupByAttribute, setGroupByAttribute] = useState<string | null>(null)
  const [preset, setPreset] = useState<CohortModelPreset>('unadjusted')
  // Two areas on this page (decision `taxonomy`, 2026-11-22): slope models and time to event.
  const [area, setArea] = useState<'slope' | 'tte'>('slope')
  const areaId = useId()

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

  // The candidate must survive the real preparation (Trajectories settings, windows,
  // time balancing) and validation under the standard model, not only the row count.
  const trajectoryFitSettings = useAppStore(s => s.trajectoryFitSettings)
  const defaultParamKey = useMemo(
    () => defaultModelParameterKey(eligibleParameters, data.rows ?? [], new Set(patientIds.map(String)), key => {
      const candidate = workspaceModelSpec(data, key, trajectoryFitSettings)
      if (!candidate) return false
      const [cohort] = workspaceModelEntities(data.rows ?? [], patientIds, candidate, DEFAULT_MIXED_MODEL_CONFIG, data.patientAttributes ?? {}, [], presetExclusionPolicy)
      return cohort !== undefined && validateMixedModelRows(cohort.rows, DEFAULT_MIXED_MODEL_CONFIG).ok
    }),
    [eligibleParameters, data, patientIds, trajectoryFitSettings, presetExclusionPolicy],
  )
  const activeParamKey = selectedParamKey !== null && eligibleParameters.some(p => p.key === selectedParamKey)
    ? selectedParamKey
    : defaultParamKey

  // The measurements follow the analysis settings of this parameter, the same
  // ones Trajectories uses, so the model sees what the trajectory fit sees.
  // Keyed on the settings that reach the model, so unrelated edits under
  // Trajectories do not rebuild the model rows.
  const preparationKey = useAppStore(s => modelPreparationKey(s.trajectoryFitSettings, activeParamKey))
  const preparationSource = useAppStore(s => modelPreparationSource(s.trajectoryFitSettings, activeParamKey))
  const activePrepSettings = (activeParamKey ? trajectoryFitSettings.columns[activeParamKey] : undefined) ?? trajectoryFitSettings.shared
  const ownPrepSettings = activeParamKey !== undefined && trajectoryFitSettings.columns[activeParamKey] !== undefined
  const affectedParameters = data.parameters.filter(parameter => ownPrepSettings
    ? parameter.key === activeParamKey
    : !trajectoryFitSettings.columns[parameter.key])
  const affectedParameterCount = tp('{n} parameter', '{n} parameters', affectedParameters.length)
  // Specialist presets always belong to the selected parameter. General
  // presets retain the existing own/shared scope. The parameter is
  // pinned first, because the preselection depends on these settings and
  // would otherwise move to another parameter.
  function changeDataPreparation(presetId: string) {
    const state = useAppStore.getState()
    const current = state.trajectoryFitSettings
    const ownTarget = Boolean(activeParamKey && (current.columns[activeParamKey] || !STANDARD_PRESETS.some(preset => preset.id === presetId)))
    const nextSettings = presetSettingsKeepingAnchor(presetId, activeParamKey && ownTarget ? current.columns[activeParamKey] ?? current.shared : current.shared)
    const next = activeParamKey && ownTarget
      ? { ...current, columns: { ...current.columns, [activeParamKey]: nextSettings } }
      : { ...current, shared: nextSettings }
    // Ask only when the store would discard models or stop a fit (the same rule it applies).
    if (trajectorySettingsDiscardModels(state, next)) {
      const fitted = Object.keys(state.cohortModelResults ?? {}).length > 0
      const question = fitted && state.cohortModelRunning ? t('Changing the data preparation discards the fitted models and stops the running fit. Continue?')
        : fitted ? t('Changing the data preparation discards the fitted models. Continue?') : t('Changing the data preparation stops the running fit. Continue?')
      if (!window.confirm(question)) return
    }
    if (activeParamKey) setSelectedParamKey(activeParamKey)
    useAppStore.getState().setTrajectoryFitSettings(next)
    const presetName = tx(ANALYSIS_CATALOG.find(item => item.id === nextSettings.presetId)?.name ?? nextSettings.presetId)
    setPreparationNotice({ key: activeParamKey, text: ownTarget ? t('Parameter preparation updated for 1 parameter: {preset}. Refit affected models before interpreting results.', { preset: presetName }) : t('Shared preparation updated for {parameters}: {preset}. Refit affected models before interpreting results.', { parameters: affectedParameterCount, preset: presetName }) })
  }
  const spec = useMemo(() => {
    if (!activeParamKey) return undefined
    return workspaceModelSpec(data, activeParamKey, useAppStore.getState().trajectoryFitSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeParamKey, preparationKey])
  const noFit = spec?.fitConfig?.fitModel === 'none'
  // Whether the parameter's settings can exclude anything by an event or an AKI
  // window. Since 2026-11-22 every setting does: values after kidney
  // replacement therapy are censored, or fitted as a separate segment when
  // included, and in either case left out of the model.
  const definesWindows = Boolean(spec?.fitConfig)

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

  // How follow-up ended for the patients of each unit (decision `dropout`, 2026-11-22).
  const dropoutByEntity = useMemo(() => {
    const end = datasetEnd(data.rows ?? [])
    return new Map<string, MixedModelDropout>(entities.map(item => [entityKey(item.entity), mixedModelDropout(item.rows, mixedModelConfig, data.events ?? [], end)]))
  }, [entities, mixedModelConfig, data.events, data.rows])

  const validatedEntities = useMemo(() => entities.map(entity => ({ entity,
    validation: validateMixedModelRows(entity.rows, mixedModelConfig),
  })), [entities, mixedModelConfig])
  const eligibleEntities = validatedEntities.filter(item => item.validation.ok).map(item => item.entity)
  const invalidEntities = validatedEntities.filter(item => !item.validation.ok)
  const validationReasons = invalidEntities.map(({ entity, validation }) =>
    `${entity.entity.kind === 'cohort' ? t('Whole cohort') : entity.entity.value}: ${!validation.ok ? validation.message : ''}`,
  ).join(' ')
  const canFit = eligibleEntities.length > 0 && !cohortModelRunning && !noFit
  const fitUnavailableReason = cohortModelRunning
    ? `${cohortModelProgress ? t('Fitting {n} of {total} …', { n: cohortModelProgress.completed + 1, total: cohortModelProgress.total }) : t('Fitting model …')}${runtimeLoaded ? '' : ` ${t('The first fit of a session loads R into the browser; this can take a few minutes. Later fits take seconds.')}`}`
    : noFit ? t('Model fitting is disabled because the data preparation uses No fit. Choose another data preparation above or a fit model under Trajectories.')
    : eligibleEntities.length === 0 ? `${t('No model can be fitted with the current data and settings.')} ${validationReasons || t('Mixed model fitting requires at least one measurement row.')}`
    : null
  // Patients each group contributes, so a comparison that cannot work is visible
  // before fitting rather than as skipped rows afterwards.
  const groupSizes = validatedEntities.filter(item => item.entity.entity.kind === 'group').map(item => ({
    label: item.entity.entity.kind === 'group' ? item.entity.entity.value : '',
    patients: qualifyingMixedModelPatients(item.entity.rows, mixedModelConfig),
    fits: item.validation.ok,
    tooFew: !item.validation.ok && (item.validation.code === 'INSUFFICIENT_PATIENTS' || item.validation.code === 'INSUFFICIENT_REPEATED_MEASURES'),
  }))
  const largestGroup = groupSizes.reduce<(typeof groupSizes)[number] | null>((largest, group) => largest && largest.patients >= group.patients ? largest : group, null)
  // Only meaningful while the pooled cohort itself can still be fitted.
  // The size explanation applies only when every group fails for lack of patients;
  // any other reason (factors, duplicate times) keeps the per-unit messages.
  const noGroupFits = groupByAttribute !== null && largestGroup !== null && groupSizes.every(group => group.tooFew) && eligibleEntities.length > 0
  const fitFeedback = fitUnavailableReason ?? (noGroupFits && largestGroup
    ? t('No {attribute} group can be fitted on its own: each needs at least {min} patients with enough measurement times, and the largest, {largest}, has {n}. Only the whole cohort will be fitted.', { attribute: groupByAttribute, min: MIN_QUALIFYING_PATIENTS, largest: largestGroup.label, n: largestGroup.patients })
    : invalidEntities.length > 0
      ? `${tp('{n} group skipped.', '{n} groups skipped.', invalidEntities.length)} ${validationReasons}` : invocationFeedback)

  const currentModels = useMemo(() => currentWorkspaceModels(cohortModelResults, entities,
    paramIndex, activeParamKey, fitConfigHash), [cohortModelResults, entities, paramIndex, activeParamKey, fitConfigHash])
  const hasSuccessfulModel = Object.keys(currentModels).length > 0
  // The decimals of this parameter's slope column under Trajectories: from the
  // patients' own slopes under the same settings. Needed only once a model shows.
  const slopeDecimals = useMemo(() => spec && hasSuccessfulModel
    ? slopeDisplayDecimals(buildCohortRows(data.rows, patientIds, [spec]).map(row => row.cells[0].slope))
    : MIN_SLOPE_DECIMALS, [spec, hasSuccessfulModel, data.rows, patientIds])
  // Every unit the button would submit already has a current, usable fit: the
  // button stays available for a refit but no longer reads as the next step.
  const allEligibleFitted = eligibleEntities.length > 0 && eligibleEntities.every(item => currentModels[entityKey(item.entity)] !== undefined)

  const entityLabels = useMemo(() => {
    // Groups only: the cohort's label is translated where it is shown or
    // exported (cohortModelEntityLabel), never fixed here in one language.
    const map = new Map<string, string>()
    for (const group of cohortGroups) map.set(`group:${group.value}`, group.value)
    return map
  }, [cohortGroups])

  const entityColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of cohortGroups) map.set(`group:${group.value}`, cohortGroupColorMap.get(group.value) ?? '#55686e')
    return map
  }, [cohortGroups, cohortGroupColorMap])

  // Preset switching logic
  function selectPreset(newPreset: CohortModelPreset, targetAttr?: string | null) {
    setPreset(newPreset)
    // The handling of small levels is kept across presets.
    const setMixedModelConfig = (next: MixedModelConfig) => setConfig(mixedModelConfig.smallLevelPolicy ? { ...next, smallLevelPolicy: mixedModelConfig.smallLevelPolicy } : next)

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
      setMixedModelConfig({
        timeAxis: 'time_since_baseline',
        covariates: ['baseline_age'],
        factors: [
          { key: 'baseline_age', kind: 'numeric', effect: 'level' },
          // Reference: the first sex code among each model's patients (OD-29).
          { key: 'sex', kind: 'categorical', effect: 'level' },
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
      const automaticKind = key === 'baseline_age' || (factorDef?.numeric ?? false) ? 'numeric' : 'categorical'
      // A categorical factor without a reference takes the first level among
      // the patients of each fitted model (OD-29).
      const merged: MixedModelFactor = {
        key,
        kind: automaticKind,
        effect: 'level',
        // The UACR series of the optional covariate (decision `uacr`).
        ...(key === LOG_BASELINE_UACR_KEY && factorDef?.series ? { series: factorDef.series } : {}),
        ...(index >= 0 ? currentFactors[index] : {}),
        ...patch,
      }
      const { reference, kindSource: _kindSource, referenceSource: _referenceSource, ...rest } = merged
      const updated: MixedModelFactor = {
        ...rest,
        ...(merged.kind === 'categorical' && reference !== undefined ? { reference } : {}),
        // Recorded only when the type differs from the automatic one (OD-22).
        ...(merged.kind !== automaticKind ? { kindSource: 'user' as const } : {}),
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
      setInvocationFeedback(`${t('No model can be fitted with the current data and settings.')} ${invocationValidation.map(({ entity, validation }) => validation.ok ? '' :
        `${entity.entity.kind === 'cohort' ? t('Whole cohort') : entity.entity.value}: ${validation.message}`,
      ).join(' ') || t('Mixed model fitting requires at least one measurement row.')}`)
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
        <h1>{t('Cohort models')}</h1><a href="#methods/cohort/preparation">{t('Model assumptions, inputs and warnings')}</a>
        <p>{t('Load a dataset first to fit population-level mixed models.')}</p>
        <button type="button" className="primary" onClick={onBrowseData}>{t('Load data')}</button>
      </div>
    )
  }

  const activeFactors = mixedModelFactors(mixedModelConfig)
  // Categorical estimates are contrasts against this level; it is shown, not
  // left implicit. The default is the first level among each model's
  // patients (OD-29), so the whole cohort and a group can differ.
  const categoricalReferences = activeFactors.flatMap((factor, index) => {
    if (factor.kind !== 'categorical') return []
    const label = factor.key === 'sex' ? t('Sex') : factor.key
    if (factor.reference !== undefined) return [`${label} = ${factor.reference} ${t('(chosen)')}`]
    const perUnit = entities.flatMap(item => {
      const resolved = resolveMixedModelFactorReferences(mixedModelConfig, item.rows).factors?.[index]?.reference
      return resolved === undefined ? [] : [{ unit: item.entity.kind === 'cohort' ? t('the whole cohort') : item.entity.value, reference: resolved }]
    })
    if (perUnit.length === 0) return []
    const note = ` ${t('(default: the first level among the patients in the model; choose another next to the factor)')}`
    return new Set(perUnit.map(item => item.reference)).size === 1
      ? [`${label} = ${perUnit[0].reference}${note}`]
      : [`${label} = ${perUnit.map(item => t('{level} in {unit}', { level: item.reference, unit: item.unit })).join(', ')}${note}`]
  })
  // OD-29 follow-up (2026-11-22): default references that differ between units make
  // their reference estimates incomparable, so the page says so.
  const differingDefaults = activeFactors.flatMap((factor, index) => {
    if (factor.kind !== 'categorical' || factor.reference !== undefined) return []
    const perUnit = entities.flatMap(item => {
      const resolved = resolveMixedModelFactorReferences(mixedModelConfig, item.rows).factors?.[index]?.reference
      return resolved === undefined ? [] : [{ reference: resolved, text: t('{level} in {unit}', { level: resolved, unit: item.entity.kind === 'cohort' ? t('the whole cohort') : item.entity.value }) }]
    })
    return new Set(perUnit.map(item => item.reference)).size > 1 ? [`${factor.key} (${perUnit.map(item => item.text).join(', ')})`] : []
  })
  const hasCategorical = activeFactors.some(factor => factor.kind === 'categorical')
  const pooling = (mixedModelConfig.smallLevelPolicy ?? 'pool') === 'pool'
  // The minimum per level (decision `genomin`): what each unit did with its small levels.
  const poolingNotes = entities.flatMap(item => {
    const unit = item.entity.kind === 'cohort' ? t('Whole cohort') : item.entity.value
    const byFactor = new Map<string, MixedModelLevelPooling[]>()
    for (const record of item.preparation?.levelPooling ?? []) if (record.action !== 'kept') byFactor.set(record.factor, [...(byFactor.get(record.factor) ?? []), record])
    const parts = [...byFactor].map(([factor, list]) => {
      const describe = (record: MixedModelLevelPooling) => `${record.level} (${record.patientsWithRepeated} of ${record.patients})`
      const pooled = list.filter(record => record.action === 'pooled')
      const kept = list.filter(record => record.action === 'kept_below_minimum')
      const removed = list.filter(record => record.action === 'excluded_not_tested')
      const pooledPatients = pooled.reduce((sum, record) => sum + record.patientsWithRepeated, 0)
      return [
        pooled.length ? `${t('{factor} {levels} pooled into “{pooled}”', { factor, levels: pooled.map(describe).join(', '), pooled: POOLED_LEVEL })}${pooledPatients < MIN_LEVEL_PATIENTS ? `, ${t('which still has fewer than {n}', { n: MIN_LEVEL_PATIENTS })}` : ''}` : '',
        kept.length ? t('{factor} {levels} below the minimum, kept', { factor, levels: kept.map(describe).join(', ') }) : '',
        removed.length ? t('{factor} {levels} left out with its patients', { factor, levels: removed.map(describe).join(', ') }) : '',
      ].filter(Boolean).join('; ')
    })
    return parts.length ? [`${unit}: ${parts.join('; ')}`] : []
  })
  const dropoutRows = entities.flatMap(item => {
    const dropout = dropoutByEntity.get(entityKey(item.entity))
    if (!dropout || dropout.patients.length === 0) return []
    const unit = item.entity.kind === 'cohort' ? t('Whole cohort') : item.entity.value
    return dropout.counts.map(count => ({ unit, key: `${entityKey(item.entity)}|${count.factor}|${count.level}`, count }))
  })
  const informativeUnits = entities.filter(item => dropoutByEntity.get(entityKey(item.entity))?.informative)
    .map(item => item.entity.kind === 'cohort' ? t('the whole cohort') : item.entity.value)
  const deathRecorded = [...dropoutByEntity.values()].some(dropout => dropout.deathRecorded)
  const uacrSource = availableFactors.find(f => f.key === LOG_BASELINE_UACR_KEY)?.series
  const inactiveFactors = availableFactors.filter(f => !activeFactors.some(af => af.key === f.key))
    // Not offered as a covariate of a model of the UACR series itself.
    .filter(f => f.key !== LOG_BASELINE_UACR_KEY || !(spec && uacrSource && spec.bezeichnung === uacrSource.name && (spec.einheit ?? null) === uacrSource.unit))
  const sampleSummary = prepareMixedModelFactors(mixedModelRows, mixedModelConfig, data.patientAttributes ?? {}, data.rows ?? [])
  // Every patient behind the count in the fit summary: left out for a factor value, or
  // without a usable measurement of the outcome after data preparation.
  const completePatients = new Set(sampleSummary.rows.map(r => String(r.patient_id)))
  const factorReasons = new Map(sampleSummary.preparation.excludedPatients.map(patient => [String(patient.patientId), patient.reasons.join('; ')]))
  const patientsNotInModel = data.patients.map(patient => String(patient.id)).filter(id => !completePatients.has(id))
    .map(patientId => ({ patientId, reason: factorReasons.get(patientId) ?? t('No usable measurement of this parameter after data preparation') }))
  const levelCounts = [...mixedModelFactorLevelCounts(sampleSummary.rows, mixedModelConfig)]
  // Without a categorical factor no level count is shown, so the number of
  // patients that count towards the minimum is named for the whole cohort.
  const qualifyingPatients = qualifyingMixedModelPatients(sampleSummary.rows, mixedModelConfig)
  // The model in words, built from the configuration; the R formula is in the details.
  const factorPhrases = activeFactors.map(factor => {
    const name = factor.key === 'baseline_age' ? t('baseline age') : factor.key === 'sex' ? t('sex') : availableFactors.find(f => f.key === factor.key)?.label ?? factor.key
    return `${name} (${factor.effect === 'level_slope' ? t('shifts level and slope') : t('shifts the level')})`
  })
  // With a factor on level and slope the time coefficient is the slope at the
  // reference level, not an average over the groups (approved 2026-11-17).
  const slopeFactors = activeFactors.filter(factor => factor.effect === 'level_slope')
  const outcome = spec?.bezeichnung ?? t('the parameter')
  const sentenceSubject = slopeFactors.length === 0 ? t('Average change of {outcome} per year', { outcome })
    : slopeFactors.every(factor => factor.kind === 'categorical') ? t('Change of {outcome} per year for the reference group', { outcome }) : t('Change of {outcome} per year for the reference profile', { outcome })
  const modelSentence = t('{subject} across {n} of {total} patients ({measurements} measurements)', { subject: sentenceSubject, n: completePatients.size, total: data.patients.length, measurements: sampleSummary.rows.length })
    + `${factorPhrases.length ? `, ${t('with {factors}', { factors: factorPhrases.join(` ${t('and')} `) })}` : ''}.`
    + ` ${mixedModelConfig.randomEffects === 'intercept' ? t('Each patient has an own starting level; the rate is common to all.') : t('Each patient has an own starting level and rate.')}`

  return (
    <div className="cohort-models-workspace stack">
      <header className="page-heading">
        <div>
          <h1>{t('Cohort models')}</h1>
          <p className="muted cm-page-intro">{t("A cohort model estimates the average change per year of one parameter across patients. Each patient keeps an own starting level and, by default, an own rate; the model reports the average and how much patients differ. Use it to describe a cohort or to compare groups. For one patient's course, use Trajectories.")}</p>
          <a href="#methods/cohort/preparation">{t('Model assumptions, inputs and warnings')}</a>
        </div>
        <div className="actions">
          {hasSuccessfulModel && (
            <label className="mixed-model-config-check" title={t('Show the fitted model trajectory on the overlay plot')}>
              <input
                type="checkbox"
                aria-label={t('Show cohort model line in overlay')}
                checked={showCohortMixedModelLine}
                onChange={e => setShowCohortMixedModelLine(e.target.checked)}
              />
              {t('Show model line in overlay')}
            </label>
          )}
          <button type="button" onClick={onBrowseTrajectories}>{t('View trajectories →')}</button>
        </div>
      </header>

      <div className="cm-area-tabs" role="tablist" aria-label={t('Cohort analysis')}>
        <button type="button" role="tab" id={`${areaId}-slope`} aria-selected={area === 'slope'} aria-controls={`${areaId}-slope-panel`} className={area === 'slope' ? 'active' : ''} onClick={() => setArea('slope')}>{t('Slope models')}</button>
        <button type="button" role="tab" id={`${areaId}-tte`} aria-selected={area === 'tte'} aria-controls={`${areaId}-tte-panel`} className={area === 'tte' ? 'active' : ''} data-opens-control="cohort-model-time-to-event" onClick={() => setArea('tte')}>{t('Time to event')}</button>
      </div>
      {area === 'tte' && <div className="cm-area-panel" role="tabpanel" id={`${areaId}-tte-panel`} aria-labelledby={`${areaId}-tte`}>
        <TimeToEventPanel data={data} onBrowseTrajectories={onBrowseTrajectories} />
      </div>}
      <div className="cm-area-panel" role="tabpanel" id={`${areaId}-slope-panel`} aria-labelledby={`${areaId}-slope`} hidden={area !== 'slope'}>

      {/* Model Studio Card */}
      <section className="cm-studio-card card" aria-label={t('Model Studio')}>
        <div className="cm-primary-controls">
          <label>
            {t('Model parameter')}
            <select
              aria-label={t('Model parameter')}
              value={activeParamKey}
              onChange={e => setSelectedParamKey(e.target.value)}
            >
              {eligibleParameters.map(p => (
                <option key={p.key} value={p.key}>{p.label}{p.derived && !/computed/i.test(p.label) ? mergedKeys.has(p.key) ? ' (merged)' : ' (computed)' : ''}</option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('Data preparation')} <strong className="cm-preparation-scope">{ownPrepSettings ? t('This parameter') : t('Shared')}</strong></span>
            <select
              aria-label={t('Data preparation')}
              aria-describedby={preparationScopeId}
              value={activePrepSettings.presetId}
              onChange={e => changeDataPreparation(e.target.value)}
            >
              <PresetOptions presetId={activePrepSettings.presetId} />
            </select>
            <small id={preparationScopeId} className="cm-preparation-impact">{t(ownPrepSettings ? msg('Parameter preparation affects {count} in Cohort models and Trajectories: {parameters}.') : msg('Shared preparation affects {count} in Cohort models and Trajectories: {parameters}.'), { count: affectedParameterCount, parameters: affectedParameters.slice(0, 3).map(parameter => parameter.label).join(', ') + (affectedParameters.length > 3 ? ` ${t('and {n} more', { n: affectedParameters.length - 3 })}` : '') })}
              {' '}{t('Specialist presets apply only to the selected parameter. Existing model fits for affected parameters are discarded when their inputs change.')}</small>
          </label>

          {(preset === 'stratified' || preset === 'custom' || groupByAttribute) && (
            <label>
              {t('Model grouping')}
              <select
                aria-label={t('Model grouping')}
                value={groupByAttribute ?? ''}
                onChange={e => {
                  const val = e.target.value || null
                  setGroupByAttribute(val)
                  if (preset === 'stratified') selectPreset('stratified', val)
                }}
              >
                <option value="">{t('No grouping (Whole cohort)')}</option>
                {availableGroupByAttributes.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {groupByAttribute && groupSizes.length > 0 && (
            <p className="muted cm-group-sizes">
              {t('Patients with enough measurement times per group: {value}. Each group needs at least {MIN_QUALIFYING_PATIENTS}.', { value: groupSizes.map(group => `${group.label}: ${group.patients}`).join(', '), MIN_QUALIFYING_PATIENTS })}
            </p>
          )}
        </div>
        <p className={preparationNotice && preparationNotice.key === activeParamKey ? 'notice cm-preparation-notice' : 'sr-only'} role="status" aria-label={t('Preparation change')} aria-atomic="true">{preparationNotice && preparationNotice.key === activeParamKey ? preparationNotice.text : ''}</p>

        {/* Preset Selector */}
        <div className="cm-preset-section" id="cohort-model-settings">
          <div className="cm-preset-bar" role="group" aria-label={t('Model presets')}>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'unadjusted' ? 'active' : ''}`}
              aria-pressed={preset === 'unadjusted'}
              onClick={() => selectPreset('unadjusted')}
            >
              <span>{t('Whole cohort')}</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'stratified' ? 'active' : ''}`}
              aria-pressed={preset === 'stratified'}
              onClick={() => selectPreset('stratified')}
            >
              <span>{t('Separate model per group')}</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'demographic' ? 'active' : ''}`}
              aria-pressed={preset === 'demographic'}
              onClick={() => selectPreset('demographic')}
            >
              <span>{t('Adjusted for age and sex')}</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'interaction' ? 'active' : ''}`}
              aria-pressed={preset === 'interaction'}
              onClick={() => selectPreset('interaction')}
            >
              <span>{t('Difference between groups')}</span>
            </button>
            <button
              type="button"
              className={`cm-preset-btn ${preset === 'custom' ? 'active' : ''}`}
              aria-pressed={preset === 'custom'}
              onClick={() => setPreset('custom')}
            >
              <span>{t('Custom model')}</span>
            </button>
          </div>

          <p className="cm-preset-desc">
            {preset === 'unadjusted' && t('Average change per year across all patients, without further factors.')}
            {preset === 'stratified' && t("One model for each group of the chosen attribute. The groups' slopes are shown side by side. Their difference and its interval are not estimated; for that, use “Difference between groups”.")}
            {preset === 'demographic' && t('Adds baseline age and sex. Both shift the level only; they do not change the slope unless set to “Shifts level and slope”.')}
            {preset === 'interaction' && t('One model with the group as a factor. Reports how much faster or slower each group changes than the reference group, with a 95% interval. No p-values are computed.')}
            {preset === 'custom' && t('Choose the factors, their effect, the reference levels and the random effects yourself.')}
          </p>
        </div>

        {/* Covariates & Factor Chips (Shown if custom or active factors exist) */}
        {(preset === 'custom' || activeFactors.length > 0) && (
          <div className="cm-factors-container">
            <div className="cm-factors-header">
              <strong>{t('Active covariates ({activeFactors})', { activeFactors: activeFactors.length })}</strong>
              <div className="cm-random-effects-toggle">
                <span>{t('Random effects:')}</span>
                <label>
                  <input
                    type="radio"
                    name="cm-re"
                    checked={mixedModelConfig.randomEffects === 'intercept_slope'}
                    onChange={() => setRandomEffects('intercept_slope')}
                  />
                  {t('Patient intercept & slope')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="cm-re"
                    checked={mixedModelConfig.randomEffects === 'intercept'}
                    onChange={() => setRandomEffects('intercept')}
                  />
                  {t('Intercept only')}
                </label>
              </div>
            </div>

            <div className="cm-factors-chips">
              {activeFactors.map(factor => {
                const factorDef = availableFactors.find(f => f.key === factor.key)
                const label = factor.key === 'baseline_age' || factor.key === 'sex' || factor.key === LOG_BASELINE_UACR_KEY ? mixedModelFactorLabel(factor.key) : (factorDef?.label ?? factor.key)
                return (
                  <div key={factor.key} className="cm-chip">
                    <span className="cm-chip-name">{label}</span>
                    <select
                      aria-label={t('{label} effect', { label })}
                      value={factor.effect}
                      onChange={e => updateFactor(factor.key, { effect: e.target.value as MixedModelFactor['effect'] })}
                    >
                      <option value="level">{t('Shifts the level')}</option>
                      <option value="level_slope">{t('Shifts level and slope')}</option>
                    </select>

                    {factorDef?.typeSwitchable && (
                      <select
                        aria-label={t('{label} type', { label })}
                        value={factor.kind}
                        onChange={e => updateFactor(factor.key, { kind: e.target.value as MixedModelFactor['kind'], reference: undefined })}
                      >
                        <option value="numeric" disabled={!factorDef.anyNumericLevel && factor.kind !== 'numeric'}>{factorDef.numeric ? t('Numeric (automatic)') : t('Numeric')}</option>
                        <option value="categorical">{factorDef.numeric ? t('Categorical') : t('Categorical (automatic)')}</option>
                      </select>
                    )}

                    {factor.kind === 'categorical' && factorDef?.levels && factorDef.levels.length > 0 && (
                      <select
                        aria-label={t('{label} reference', { label })}
                        value={factor.reference ?? ''}
                        onChange={e => updateFactor(factor.key, { reference: e.target.value === '' ? undefined : e.target.value })}
                      >
                        <option value="">{t('Ref: first level in the model')}</option>
                        {factorDef.levels.map(lvl => (
                          <option key={lvl} value={lvl}>{t('Ref: {lvl}', { lvl })}</option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      className="cm-chip-remove"
                      title={t('Remove {label}', { label })}
                      aria-label={t('Remove {label}', { label })}
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
                    aria-label={t('Add covariate')}
                    value=""
                    onChange={e => {
                      if (e.target.value) updateFactor(e.target.value, {})
                    }}
                  >
                    <option value="" disabled>{t('+ Add covariate …')}</option>
                    {inactiveFactors.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="cm-fit-summary" aria-label={t('Fit summary')} id="cohort-model-fit-summary">
        <h2>{t('Fit summary')}</h2>
        {spec && !noFit && <p className="cm-sample-meta cm-model-sentence">{modelSentence}</p>}
        <label className="mixed-model-config-check">
          <input type="checkbox" checked={presetExclusionPolicy === 'apply'} onChange={event => setPresetExclusionPolicy(event.target.checked ? 'apply' : 'skip')} />
          {t('Apply preset event and AKI exclusions')}
        </label>
        {spec && !noFit && (presetExclusionPolicy === 'apply' && !definesWindows
          ? <p className="muted">{t('The settings of this parameter define no event or AKI windows, so nothing is excluded. To leave out values after transplant or dialysis and in AKI windows, choose “CKD progression” under Data preparation.')}</p>
          : <p className="muted">{t(presetExclusionPolicy === 'apply' ? msg('Preset windows: applied; {n} eligible measurements excluded. Count precedes time balancing, run-in and factor exclusions.') : msg('Preset windows: skipped; {n} eligible measurements excluded. Count precedes time balancing, run-in and factor exclusions.'), { n: modelSample.excludedByPreset })}</p>)}
        {categoricalReferences.length > 0 && <p className="cm-reference-levels" aria-label={t('Reference categories')}>
          {t('Reference categories: {value}', { value: categoricalReferences.join('; ') })}
        </p>}
        {differingDefaults.length > 0 && <p className="notice cm-reference-warning" role="note" aria-label={t('Different reference levels')}>
          {t('The models use different default reference levels for {value}. Their reference starting levels, slopes and contrasts refer to different groups and cannot be compared directly. Choose a reference next to the factor to use the same level in every model.', { value: differingDefaults.join('; ') })}
        </p>}
        {hasCategorical && <label className="mixed-model-config-check">
          <input type="checkbox" checked={pooling} onChange={event => {
            setPreset('custom')
            const { smallLevelPolicy: _policy, ...rest } = mixedModelConfig
            setMixedModelConfig(event.target.checked ? rest : { ...rest, smallLevelPolicy: 'keep' })
          }} />
          {t('Pool small levels into “{POOLED_LEVEL}”', { POOLED_LEVEL })}
        </label>}
        {hasCategorical && <p className="muted cm-level-minimum" aria-label={t('Minimum per level')}>
          {t('A level needs at least {MIN_LEVEL_PATIENTS} patients with {MIN_LEVEL_MEASUREMENTS} or more measurements in the model (a rule of this tool).', { MIN_LEVEL_PATIENTS, MIN_LEVEL_MEASUREMENTS })} {pooling ? t('Smaller levels are pooled; a small “not tested” level is left out instead, as it is never merged with other levels.') : t('Small levels are kept as they are.')}
          {poolingNotes.length > 0 ? ` ${poolingNotes.join('. ')}. ${t('In brackets: patients with {n} or more measurements of all patients of the level.', { n: MIN_LEVEL_MEASUREMENTS })}` : ` ${t('Every level meets it.')}`}
        </p>}
        {levelCounts.length > 0 && <p className="muted cm-level-counts" aria-label={t('Patients per level')}>
          {t('Whole cohort, patients per level (with enough measurement times): {value}', { value: levelCounts.map(([key, levels]) => `${key === 'sex' ? t('Sex') : key}: ${levels.map(item => `${item.level} ${item.patients} (${item.qualifying})`).join(', ')}`).join('; ') })}
        </p>}
        {spec && !noFit && levelCounts.length === 0 && completePatients.size > 0 && <p className="muted cm-level-counts" aria-label={t('Patients with enough measurement times')}>
          {t('Whole cohort, patients with enough measurement times: {qualifyingPatients} of {size}.', { qualifyingPatients, size: completePatients.size })}
        </p>}
        {(noFit || !spec) ? <p className="muted" aria-label={t('Patients not in the model')}>{noFit ? t('No patient is in the model: the data preparation of this parameter is No fit.') : t('No patient is in the model: no parameter is selected.')}</p> : patientsNotInModel.length > 0 && <details className="cm-excluded-patients">
          <summary>{t('Patients not in the model ({patientsNotInModel})', { patientsNotInModel: patientsNotInModel.length })}</summary>
          <ul aria-label={t('Patients not in the model')}>{patientsNotInModel.map(patient => <li key={patient.patientId}>{patient.patientId}: {patient.reason}</li>)}</ul>
        </details>}

        {informativeUnits.length > 0 && <p className="notice cm-dropout-warning" role="note" aria-label={t('Dropout warning')}>
          {t(deathRecorded ? msg('More than {round} % of the patients in {units} reached kidney replacement therapy or died within follow-up (a rule of this tool). When dropout depends on the course of the parameter, the slope can be biased; the R script of the model export outlines a joint-model sensitivity analysis.') : msg('More than {round} % of the patients in {units} reached kidney replacement therapy within follow-up (a rule of this tool). When dropout depends on the course of the parameter, the slope can be biased; the R script of the model export outlines a joint-model sensitivity analysis.'), { round: Math.round(INFORMATIVE_DROPOUT_SHARE * 100), units: informativeUnits.join(', ') })}
        </p>}
        {dropoutRows.length > 0 && <details className="cm-dropout">
          <summary>{t('Follow-up and dropout')}</summary>
          <p className="muted">{t(deathRecorded ? msg('How follow-up ended for the patients in each model: kidney replacement therapy (KRT: kidney transplant or chronic dialysis on or after the first model measurement), death, loss to follow-up (last model measurement more than {days} days before the latest lab date of the dataset), or still in follow-up. Rules of this tool.') : msg('How follow-up ended for the patients in each model: kidney replacement therapy (KRT: kidney transplant or chronic dialysis on or after the first model measurement), loss to follow-up (last model measurement more than {days} days before the latest lab date of the dataset), or still in follow-up. Rules of this tool.'), { days: LOSS_TO_FOLLOW_UP_DAYS })}</p>
          <div className="cm-dropout-table-wrap">
            <table aria-label={t('Dropout by reason')}>
              <thead><tr><th scope="col">{t('Model')}</th><th scope="col">{t('Level')}</th><th scope="col">{t('Patients')}</th><th scope="col">{t('KRT')}</th>{deathRecorded && <th scope="col">{t('Death')}</th>}<th scope="col">{t('Lost')}</th><th scope="col">{t('In follow-up')}</th><th scope="col">{deathRecorded ? t('KRT or death') : t('KRT')}</th></tr></thead>
              <tbody>{dropoutRows.map(({ unit, key, count }) => <tr key={key}>
                <td>{unit}</td><td>{count.factor ? `${count.factor} = ${count.level}` : t('All')}</td><td>{count.patients}</td><td>{count.krt}</td>{deathRecorded && <td>{count.death ?? ''}</td>}<td>{count.loss}</td><td>{count.inFollowUp}</td><td>{(count.krtOrDeathShare * 100).toFixed(1)} %</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>}

        {/* Studio Footer with Primary Fit Action */}
        <div className="cm-studio-footer">
          <button
            type="button"
            className={allEligibleFitted ? 'cm-fit-button' : 'primary cm-fit-button'}
            ref={fitButton}
            disabled={!canFit}
            aria-describedby={fitFeedback ? fitFeedbackId : undefined}
            onClick={handleFitAll}
          >
            {cohortModelRunning
              ? (cohortModelProgress ? t('Fitting {n} of {total} …', { n: cohortModelProgress.completed + 1, total: cohortModelProgress.total }) : t('Running model …'))
              : noGroupFits
                ? (allEligibleFitted ? t('Refit whole cohort only') : t('Fit whole cohort only'))
                : eligibleEntities.length > 1 ? (allEligibleFitted ? t('Refit models ({n})', { n: eligibleEntities.length }) : t('Fit models ({n})', { n: eligibleEntities.length })) : allEligibleFitted ? t('Refit model') : t('Fit model||verb')}
          </button>
          {cohortModelRunning && <button type="button" className="cm-cancel-button" onClick={cancelFit}>{t('Cancel')}</button>}
        </div>
        <p id={fitFeedbackId} className="muted cm-fit-feedback" role="status" aria-live="polite">{fitFeedback}</p>
        {!runtimeLoaded && <p className="muted cm-runtime-note" data-testid="runtime-download-note">{t('The first fit of a session loads the R runtime and R packages, which are served with this app from its own address ({size}). These are downloads only; no measurements are sent.', { size: t('about {n} MB', { n: R_FIRST_FIT_DOWNLOAD_MB }) })} <a href="#methods/data/network">{t('Network access and local storage')}</a></p>}
        </section>
        <details className="cm-preparation-details">
          <summary>{t('Preparation and fitting details')}</summary>
          {spec?.fitConfig && <p data-testid="model-preparation">{t('Measurements follow the analysis settings of this parameter, shared with Trajectories.')} {describeModelPreparation(spec.fitConfig, preparationSource)}{noFit ? ` ${t('Choose another data preparation above or a fit model under Trajectories to fit a cohort model.')}` : `${presetExclusionPolicy === 'skip' ? ` ${t('The event and AKI windows are skipped by the choice above; time aggregation still applies.')}` : ''} ${t('Changing these settings here or under Trajectories discards the models fitted for this parameter.')}`}</p>}
          <p>{t("Time: years since each patient's first retained measurement. Missing selected factors exclude the patient from this model only; no imputation.")}</p>
          <p>{t('Model formula (R syntax):')} <span className="cm-formula-code" aria-label={t('Readable formula')}>{readableMixedModelFormula(mixedModelConfig, spec?.bezeichnung ?? 'Outcome')}</span></p>
          <p>{t('One linear mixed-effects model per selected group. Fit runs in-browser via WebR (lme4).')}</p>
        </details>
      </section>

      {/* Model trajectory preview plot; fitting is started above or from the results table. */}
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
          canFit={canFit}
          slopeDecimals={slopeDecimals}
        />
      )}

      {/* Results Table & Projections */}
      {spec && (
          <CohortModelTable
            entities={entities}
            entityLabels={entityLabels}
            entityColors={entityColors}
            seriesIndex={paramIndex >= 0 ? paramIndex : 0}
            seriesKey={activeParamKey}
            seriesUnit={spec.einheit}
            definesWindows={definesWindows}
            slopeDecimals={slopeDecimals}
            sourceResponse={{ outcome: spec.bezeichnung, unit: spec.einheit ?? '' }}
            fitConfigHash={fitConfigHash}
            config={mixedModelConfig}
            formula={formulaText}
            dropoutByEntity={dropoutByEntity}
          />
      )}
      </div>
    </div>
  )
}
