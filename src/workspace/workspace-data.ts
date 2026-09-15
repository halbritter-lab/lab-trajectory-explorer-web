import { useMemo } from 'react'
import { useAppStore } from '../ui/state/store'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../core/types'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../core/analysis/types'
import type { ClinicalEvent } from '../core/events/events'
import type { CohortSeriesSpec } from '../core/cohort/screening'
import type { FitConfig } from '../core/fitPipeline/types'
import { generalExplorationConfig } from '../core/fitPipeline/types'
import { loadBundledFixtureData, loadDatasetFromWorkbook } from '../ui/data/loadDataset'
import { resolveBirthAnchor } from '../core/demographics/resolveAge'

export interface WorkspaceParameter { key: string; label: string; bezeichnung: string; einheit: string | null; derived: boolean }
export interface WorkspacePatient { id: PatientId; label: string; attributes: Record<string, string>; baselineAge: number | null; birthAnchor?: Date | null; ageEstimated?: boolean }
export interface WorkspaceData {
  rawRows: LabRow[]; rows: LabRow[]; fileName: string | null;
  parameters: WorkspaceParameter[]; patients: WorkspacePatient[];
  events: ClinicalEvent[]; patientAttributes: Record<string, Record<string, string>>;
  analysis: AnalysisResult; analysisSettings: AnalysisSettings;
  manualDemographics: Record<string, ManualDemographics>;
}

export function useWorkspaceData(): WorkspaceData {
  const rawRows = useAppStore(s => s.rows)
  const fileName = useAppStore(s => s.fileName)
  const events = useAppStore(s => s.events)
  const attributes = useAppStore(s => s.patientAttributes)
  const analysisSettings = useAppStore(s => s.analysisSettings)
  const manualDemographics = useAppStore(s => s.manualDemographics)
  return useMemo(() => {
    const analysis = useAppStore.getState().analysisResult()
    const rows = analysis.rows
    const rawKeys = new Set(rawRows.map(r => JSON.stringify([r.bezeichnung, r.einheit])))
    const parameterMap = new Map<string, WorkspaceParameter>()
    const buckets = new Map<PatientId, LabRow[]>()
    const rawBuckets = new Map<PatientId, LabRow[]>()
    for (const row of rawRows) {
      const bucket = rawBuckets.get(row.patientId) ?? []
      bucket.push(row); rawBuckets.set(row.patientId, bucket)
    }
    for (const row of rows) {
      const bucket = buckets.get(row.patientId) ?? []
      bucket.push(row); buckets.set(row.patientId, bucket)
      if (row.bezeichnung === null) continue
      const key = JSON.stringify([row.bezeichnung, row.einheit])
      if (!parameterMap.has(key)) parameterMap.set(key, { key, bezeichnung: row.bezeichnung, einheit: row.einheit, label: `${row.bezeichnung} [${row.einheit ?? 'no unit'}]`, derived: !rawKeys.has(key) })
    }
    const patientAttributes = { ...attributes }
    const patients = [...buckets].sort(([a], [b]) => comparePatientIds(a, b)).map(([id, patientRows]) => {
      const earliest = patientRows.filter(r => r.labDatum && Number.isFinite(r.labDatum.getTime())).sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())[0]
      const resolvedAttributes = { ...attributes[patientIdKey(id)] }
      // Never let an unresolved imported sex masquerade as resolved demographics.
      delete resolvedAttributes.sex
      const sex = patientRows[0].patientSex
      if (sex) resolvedAttributes.sex = sex
      patientAttributes[patientIdKey(id)] = resolvedAttributes
      const rawPatientRows = rawBuckets.get(id) ?? []
      const dateText = attributes[patientIdKey(id)]?.birthDate
      const attributeDate = dateText ? new Date(dateText.length <= 10 ? `${dateText}T00:00:00.000Z` : dateText) : null
      const manualAge = manualDemographics[patientIdKey(id)]?.age
      const { birthAnchor } = resolveBirthAnchor({ patientId: id, attributeBirthDate: attributeDate, manualAge,
        rows: rawPatientRows.map(r => ({ labDatum: r.labDatum, ageAtLab: r.patientAgeAtLab, birthDate: r.patientBirthDate })) })
      const explicitDateAvailable = (attributeDate !== null && Number.isFinite(attributeDate.getTime())) || rawPatientRows.some(r => r.labDatum && Number.isFinite(r.labDatum.getTime()) && r.patientBirthDate && Number.isFinite(r.patientBirthDate.getTime()))
      const ageEstimated = manualAge !== undefined || (birthAnchor !== null && !explicitDateAvailable)
      return { id, label: String(id), attributes: resolvedAttributes, baselineAge: earliest?.patientAgeAtLab ?? null, birthAnchor, ageEstimated }
    })
    return { rawRows, rows, fileName, parameters: [...parameterMap.values()], patients, events, patientAttributes, analysis, analysisSettings, manualDemographics }
  }, [rawRows, fileName, events, attributes, analysisSettings, manualDemographics])
}

export function workspaceSpecs(data: WorkspaceData, parameterKeys: string[], fitConfigByParameterKey?: Record<string, FitConfig>): CohortSeriesSpec[] {
  const parameters = new Map(data.parameters.map(p => [p.key, p]))
  const clinicalEventsByPatient: Record<string, ClinicalEvent[]> = Object.create(null)
  for (const event of data.events) (clinicalEventsByPatient[patientIdKey(event.patientId)] ??= []).push(event)
  return parameterKeys.flatMap(key => {
    const parameter = parameters.get(key)
    if (!parameter) return []
    const fitConfig = fitConfigByParameterKey?.[key] ?? generalExplorationConfig(parameter)
    const mode = fitConfig.fitModel === 'theil-sen' ? 'global-robust' as const : 'global' as const
    return [{ bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, mode,
      fitConfig, exclusionDays: fitConfig.exclusions.akiExclusionDays,
      clinicalEventsByPatient, fitInputs: data.analysis.fitInputs }]
  })
}

/** Session-only imports; reset dependent choices only after a usable replacement. */
export async function importWorkspaceFile(file?: File): Promise<void> {
  if (useAppStore.getState().busy) return
  useAppStore.setState({ busy: true, notice: null })
  try {
    const dataset = file ? loadDatasetFromWorkbook(await file.arrayBuffer()) : { ...await loadBundledFixtureData(), diagnostics: [] }
    if (!dataset.rows.length) throw new Error('No usable lab values in this file.')
    const ids = [...new Set(dataset.rows.map(r => r.patientId))].sort(comparePatientIds)
    const rejected = dataset.diagnostics.filter(d => d.severity === 'rejected').length
    // Abort active legacy model jobs before replacing the session. All data and
    // defaults commit together, so observers never see new rows with old overrides.
    useAppStore.getState().clearMixedModelResult()
    useAppStore.setState({
      ...useAppStore.getInitialState(), rows: dataset.rows, events: dataset.events,
      patientAttributes: dataset.patientAttributes, fileName: file?.name ?? 'test_labs.xlsx (Demo)',
      selectedPatientId: ids[0] ?? null, selectedPatientIds: ids, view: 'cohort',
      notice: { kind: 'info', text: `${dataset.rows.length} lab values, ${dataset.events.length} events and ${Object.keys(dataset.patientAttributes).length} attribute rows loaded. ${rejected} rows rejected; ${dataset.diagnostics.length - rejected} warnings.`, details: dataset.diagnostics },
    })
  } catch (error) {
    useAppStore.setState({ busy: false, notice: { kind: 'error', text: error instanceof Error ? error.message : String(error) } })
  }
}
