import { useEffect, useRef, useState } from 'react'
import { analysisRecord, analysisVersions, type RecordEntry, type SettingControl } from './analysis-record'
import { applyExportedSettings, readExportedSettings, type AppliedSettings } from './exported-settings'
import { useAppStore } from './state/store'
import type { WorkspaceData } from './workspace-data'
import './analysis-record.css'

export interface AnalysisRecordProps {
  data: WorkspaceData
  /** The parameters shown under Trajectories, in order. */
  parameters: ReadonlyArray<{ key: string; label: string }>
  trendKeys: readonly string[]
  groupBy: string
  onClose: () => void
  /** Go to the control of an entry; the dialog is closed first. */
  onChange: (control: SettingControl, parameterKey?: string, label?: string) => void
  /** Show the parameters and Trend of applied settings. */
  onApplyView: (parameterKeys: string[] | null, trendKeys: string[]) => void
}

/**
 * The analysis record (issue #83): every setting that changes an exported
 * number, with its effective value, highlighted where it differs from its
 * default, and a way to the control that changes it. Also applies the
 * settings of an exported workbook and lists what could not be applied.
 */
export function AnalysisRecordDialog({ data, parameters, trendKeys, groupBy, onClose, onChange, onApplyView }: AnalysisRecordProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const state = useAppStore()
  const [report, setReport] = useState<{ file: string; result: AppliedSettings } | { file: string; error: string } | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open && typeof element.showModal === 'function') element.showModal()
    return () => element?.close?.()
  }, [])
  const sections = analysisRecord({
    analysisSettings: state.analysisSettings, manualDemographics: state.manualDemographics, trajectoryFitSettings: state.trajectoryFitSettings,
    parameters: parameters.map(parameter => ({ ...parameter, trend: trendKeys.includes(parameter.key) })),
    groupBy, mixedModelConfig: state.mixedModelConfig, presetExclusionPolicy: state.presetExclusionPolicy, cohortModelResults: state.cohortModelResults,
  })
  const deviations = sections.reduce((sum, section) => sum + section.entries.filter(entry => entry.deviates).length, 0)
  const versions = analysisVersions(state)

  async function apply(file: File) {
    try {
      const exported = readExportedSettings(new Uint8Array(await file.arrayBuffer()))
      const current = useAppStore.getState()
      const result = applyExportedSettings(exported, {
        parameterKeys: new Set(data.parameters.map(parameter => parameter.key)),
        importedParameters: data.parameters.filter(parameter => !parameter.derived).map(parameter => [parameter.bezeichnung, parameter.einheit] as const),
        analysisSettings: current.analysisSettings, trajectoryFitSettings: current.trajectoryFitSettings, trendKeys,
      })
      current.applyAnalysisSettings(result.analysisSettings)
      useAppStore.getState().setTrajectoryFitSettings(result.trajectoryFitSettings)
      onApplyView(result.parameterKeys, result.trendKeys)
      setReport({ file: file.name, result })
    } catch (cause) {
      setReport({ file: file.name, error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const entryRow = (entry: RecordEntry, sectionTitle: string) => <li key={entry.path} className={entry.deviates ? 'ar-entry ar-deviates' : 'ar-entry'}>
    <div className="ar-text">
      <span className="ar-label">{entry.label}</span>
      <span className="ar-value">{entry.value}{entry.deviates && <span className="ar-flag"> (changed)</span>}</span>
      {entry.deviates && <span className="ar-default">Default: {entry.defaultValue}</span>}
    </div>
    {entry.control
      ? <button type="button" aria-label={`Change ${entry.label} (${sectionTitle})`} onClick={() => { onClose(); onChange(entry.control!, entry.parameterKey, entry.label) }}>Change</button>
      : <span className="ar-fixed">No control</span>}
  </li>

  return <dialog ref={dialog} className="wt-parameter-dialog ar-dialog" aria-labelledby="ar-title" open={typeof HTMLDialogElement.prototype.showModal !== 'function' ? true : undefined} onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id="ar-title">Analysis record</h2>
    <div className="ar-body">
      <p>Every setting that changes a number in the export, as it applies now, from Data, Trajectories and Cohort models. {deviations ? `${deviations} ${deviations === 1 ? 'value differs' : 'values differ'} from the default and ${deviations === 1 ? 'is' : 'are'} marked “changed”.` : 'All values are the defaults.'} Display choices (chart axis, size, overlays) change no number and are not listed. Research use only.</p>
      {sections.map(section => <section key={section.id} className="ar-section" aria-labelledby={`ar-${section.id}`}>
        <h3 id={`ar-${section.id}`}>{section.title}</h3>
        {section.note && <p className="ar-note">{section.note}</p>}
        <ul className="ar-list">{section.entries.map(entry => entryRow(entry, section.title))}</ul>
      </section>)}
      <section className="ar-section" aria-labelledby="ar-versions">
        <h3 id="ar-versions">Versions</h3>
        <ul className="ar-list">{versions.map(version => <li key={version.label} className="ar-entry"><div className="ar-text"><span className="ar-label">{version.label}</span><span className="ar-value">{version.value}</span></div></li>)}</ul>
      </section>
      <section className="ar-section" aria-labelledby="ar-apply">
        <h3 id="ar-apply">Apply settings from an export</h3>
        <p className="ar-note">Reads the settings sheet of a cohort or patient workbook exported by this app and applies its dataset settings, the analysis settings of its parameters, the parameter selection and Trend to the loaded data. What does not fit the loaded data (a parameter it lacks, for example) is listed and keeps its current value.</p>
        <label className="ar-file">Workbook (XLSX)<input type="file" accept=".xlsx" aria-label="Apply settings from an exported workbook" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void apply(file) }} /></label>
        {report && <div role="status" className="ar-report">
          {'error' in report ? <p className="notice amber">{report.file}: {report.error}</p> : <>
            <p><strong>{report.file}</strong>: applied {report.result.applied.length ? report.result.applied.join('; ') : 'nothing'}.</p>
            {report.result.notApplied.length ? <><p>Not applied:</p><ul>{report.result.notApplied.map(item => <li key={item}>{item}</li>)}</ul></> : <p>Every setting of the file was applied.</p>}
          </>}
        </div>}
      </section>
    </div>
    <div className="wt-toolbar"><button type="button" onClick={onClose}>Close</button></div>
  </dialog>
}
