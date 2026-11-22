import { useMemo } from 'react'
import type { PatientId } from '../core/types'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'
import { akiRecoveryHours } from '../core/domains/nephrology/aki/akiModule'
import { akiCriterionLabel, akiEpisodeDialysisLabel, akiEpisodeEndLabel, akiEpisodeRows, akiRecoveryFieldHours, akiStageLabel } from './aki-episodes'
import type { WorkspaceData } from './workspace-data'
import { useAppStore } from './state/store'
import { DraftNumberInput } from './DraftNumberInput'
import { MAX_AKI_RECOVERY_HOURS } from '../core/domains/nephrology/constants'
import { countLabel, sexLabel } from './workspace-labels'
import { WorkspacePeriEventCreatinine } from './WorkspacePeriEventCreatinine'

/** Levels listed per attribute before the rest is summarised as a count. */
const LEVEL_LIMIT = 8

/** What the import produced, by name: parameters, attributes with their
 * levels, the detected AKI episodes and the creatinine after selected events. Counts alone do not show that two
 * spellings of one test became two parameters. */
export function WorkspaceDataOverview({ data, onBrowse }: { data: WorkspaceData; onBrowse: (patientId?: PatientId) => void }) {
  const parameters = useMemo(() => {
    const counts = new Map<string, { values: number; patients: Set<PatientId>; loinc: Set<string>; dated: Map<PatientId, number> }>()
    for (const row of data.rawRows) {
      if (row.bezeichnung === null) continue
      const key = JSON.stringify([row.bezeichnung, row.einheit])
      const entry = counts.get(key) ?? { values: 0, patients: new Set<PatientId>(), loinc: new Set<string>(), dated: new Map<PatientId, number>() }
      entry.dated.set(row.patientId, (entry.dated.get(row.patientId) ?? 0) + (row.labDatum && row.wertNum !== null ? 1 : 0))
      entry.values++; entry.patients.add(row.patientId); counts.set(key, entry)
      if (row.loinc !== null) entry.loinc.add(row.loinc)
    }
    return data.parameters.filter(parameter => !parameter.derived).map(parameter => ({ ...parameter, values: counts.get(parameter.key)?.values ?? 0, patients: counts.get(parameter.key)?.patients.size ?? 0, loinc: [...counts.get(parameter.key)?.loinc ?? []],
      // Patients with fewer than three dated numeric values of this parameter: too few for a supported trend.
      sparse: [...counts.get(parameter.key)?.dated.values() ?? []].filter(n => n < 3).length }))
  }, [data.rawRows, data.parameters])
  const attributes = useMemo(() => {
    const names = [...new Set(data.patients.flatMap(patient => Object.keys(patient.attributes)))].sort()
    return names.map(name => {
      const levels = new Map<string, number>()
      let missing = 0
      for (const patient of data.patients) {
        const value = patient.attributes[name]?.trim()
        if (value) levels.set(value, (levels.get(value) ?? 0) + 1); else missing++
      }
      return { name, levels: [...levels].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })), missing }
    })
  }, [data.patients])
  const recoveryHours = akiRecoveryHours(data.analysisSettings)
  const episodes = useMemo(() => akiEpisodeRows(data.rows, data.events, recoveryHours), [data.rows, data.events, recoveryHours])
  return <div className="data-event-tables">
    <details>
      <summary>Imported parameters ({parameters.length})</summary>
      <p className="muted">One parameter per test name and unit, exactly as written in the file. Different spellings or units of one test are separate parameters and are not merged. LOINC codes are shown as imported and do not separate parameters, with one exception: creatinine with a urine code (2161-8, 14683-7) is its own parameter, named with the code.</p>
      <div className="table-scroll" role="region" aria-label="Imported parameters, horizontal scrolling" tabIndex={0}>
        <table aria-label="Imported parameters"><thead><tr><th>Parameter</th><th>Unit</th><th>LOINC</th><th>Values</th><th>Patients</th><th>Patients with fewer than 3 dated numeric values</th></tr></thead>
          <tbody>{parameters.map(parameter => <tr key={parameter.key}><td>{parameter.bezeichnung}</td><td>{parameter.einheit ?? '–'}</td><td>{parameter.loinc.join(', ') || '–'}</td><td>{parameter.values}</td><td>{parameter.patients}</td><td>{parameter.sparse}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    {attributes.length > 0 && <details>
      <summary>Patient attributes ({attributes.length})</summary>
      <p className="muted">Attributes can be shown as columns and used for grouping under Trajectories, and as factors under Cohort models.</p>
      <ul>{attributes.map(attribute => <li key={attribute.name}><strong>{attribute.name}</strong>: {attribute.levels.length > LEVEL_LIMIT
        ? `${attribute.levels.length} different values`
        : attribute.levels.map(([value, count]) => `${attribute.name === 'sex' ? sexLabel(value) : value} (${count})`).join(', ')}{attribute.missing > 0 ? `; not recorded for ${countLabel(attribute.missing, 'patient')}` : ''}</li>)}</ul>
    </details>}
    <details>
      <summary>Detected AKI episodes ({episodes.length})</summary>
      <p className="muted">Automated screening with the KDIGO creatinine criteria on each serum creatinine parameter; not a diagnosis. Creatinine values are in mg/dl. <a href="#methods/aki">How episodes are detected</a></p>
      <label className="field aki-recovery-field" id="data-aki-recovery">Recovery between episodes (hours)
        <DraftNumberInput min={0} max={MAX_AKI_RECOVERY_HOURS} step={24} value={recoveryHours} aria-describedby="aki-recovery-note"
          normalise={hours => akiRecoveryFieldHours(hours)} onCommit={hours => useAppStore.getState().setAkiRecoveryHours(hours)} />
      </label>
      <p className="muted" id="aki-recovery-note">A new episode starts only after creatinine was back below the criterion for this long, counted in calendar days (48 hours: the next two days), so the value is rounded down to whole days (multiples of 24, at most {MAX_AKI_RECOVERY_HOURS}). It applies to this list, the AKI windows and markers of every column and the export.</p>
      {episodes.length === 0 ? <p>No AKI episode detected.</p> : <div className="table-scroll" role="region" aria-label="Detected AKI episodes, horizontal scrolling" tabIndex={0}>
        <table aria-label="Detected AKI episodes" className="aki-episodes-table"><thead><tr><th>Patient</th><th>Stage</th><th>Onset</th><th>Peak</th><th>Peak value</th><th>Baseline</th><th>Criterion</th><th>Creatinine parameter</th><th>End</th><th>Dialysis start</th></tr></thead>
          <tbody>{episodes.map((episode, index) => <tr key={index}>
            <th><button onClick={() => onBrowse(episode.patientId)}>{episode.patientId}</button></th><td>{akiStageLabel(episode.stage)}</td><td className="aki-date">{formatDisplayDate(episode.onset)}</td><td className="aki-date">{formatDisplayDate(episode.peakDate)}</td>
            <td>{formatDisplayNumber(episode.peakValue)}</td><td>{formatDisplayNumber(episode.baselineValue)} on <span className="aki-date">{formatDisplayDate(episode.baselineDate)}</span></td><td>{akiCriterionLabel(episode.criterion)}</td><td>{episode.parameter} [{episode.unit ?? 'no unit'}]</td>
            <td className="aki-end">{akiEpisodeEndLabel(episode)}</td><td>{akiEpisodeDialysisLabel(episode)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </details>
    <WorkspacePeriEventCreatinine data={data} onBrowse={onBrowse} />
  </div>
}
