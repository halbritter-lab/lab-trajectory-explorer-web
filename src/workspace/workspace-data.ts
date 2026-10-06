import { useMemo } from 'react'
import { useAppStore } from './state/store'
import { clinicalEventsByPatient, cohortSeriesSpec } from '../core/cohort/specs'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../core/types'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../core/analysis/types'
import type { ClinicalEvent } from '../core/events/events'
import type { CohortSeriesSpec } from '../core/cohort/screening'
import type { FitConfig } from '../core/analysis/fitConfig'
import { loadBundledFixtureData, loadDatasetFromWorkbook } from '../io/loadDataset'
import { resolveBirthAnchor } from '../core/demographics/resolveAge'
import { parseAttributeDate } from '../core/demographics/resolve'

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
      // Same rule as the model grouping (workspaceGroupableAttributes): the first row with a sex.
      const sex = patientRows.find(r => r.patientSex !== null)?.patientSex ?? null
      if (sex) resolvedAttributes.sex = sex
      patientAttributes[patientIdKey(id)] = resolvedAttributes
      const rawPatientRows = rawBuckets.get(id) ?? []
      const dateText = attributes[patientIdKey(id)]?.birthDate
      const attributeDate = parseAttributeDate(dateText)
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
  const context = { clinicalEventsByPatient: clinicalEventsByPatient(data.events), fitInputs: data.analysis?.fitInputs ?? Object.create(null) }
  return parameterKeys.flatMap(key => {
    const parameter = parameters.get(key)
    return parameter ? [cohortSeriesSpec(parameter, fitConfigByParameterKey?.[key], context)] : []
  })
}

/** Session-only imports; reset dependent choices only after a usable replacement. */
export async function importWorkspaceFile(file?: File): Promise<void> {
  if (useAppStore.getState().busy) return
  useAppStore.setState({ busy: true, notice: null })
  try {
    const dataset = file ? loadDatasetFromWorkbook(await file.arrayBuffer()) : { ...await loadBundledFixtureData(), diagnostics: [], rejectedEvents: [] }
    if (!dataset.rows.length) throw new Error('No usable lab values in this file.')
    const rejected = dataset.diagnostics.filter(d => d.severity === 'rejected').length
    // replaceDataset aborts running model jobs and commits data and defaults
    // together, so observers never see new rows with old overrides.
    useAppStore.getState().replaceDataset({
      rows: dataset.rows, events: dataset.events, rejectedEvents: dataset.rejectedEvents,
      patientAttributes: dataset.patientAttributes, fileName: file?.name ?? 'test_labs.xlsx (Demo)',
      notice: { kind: 'info', text: `${dataset.rows.length} lab values, ${dataset.events.length} events and ${Object.keys(dataset.patientAttributes).length} attribute rows loaded. ${rejected} rows rejected; ${dataset.diagnostics.length - rejected} warnings.`, details: dataset.diagnostics },
    })
  } catch (error) {
    useAppStore.setState({ busy: false, notice: { kind: 'error', text: error instanceof Error ? error.message : String(error) } })
  }
}
