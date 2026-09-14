import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../ui/state/store'
import { patientIdKey, type PatientId, type Sex } from '../core/types'
import { resolveDemographics } from '../core/demographics/resolve'
import { describeConflict } from '../core/demographics/describe'
import { computeAnalysisResult } from '../core/analysis/registry'
import { creatinineSourceOptions, defaultCreatinineSource, type FormulaName, type Source } from '../core/egfr/series'
import { normalizeClinicalEvents, validateClinicalEvents } from '../core/events/events'
import { normalizePatientAttributes, validatePatientAttributes } from '../core/attributes/attributes'
import { readWorkbook } from '../io/readWorkbook'
import { importWorkspaceFile, useWorkspaceData } from './workspace-data'
import { sexLabel } from './workspace-labels'
import './data-workspace.css'

export function DataWorkspace({ onBrowse }: { onBrowse: (patientId?: PatientId) => void }) {
  const data = useWorkspaceData()
  const busy = useAppStore(s => s.busy)
  const notice = useAppStore(s => s.notice)
  const [formula, setFormula] = useState<FormulaName | 'off'>(data.analysisSettings.egfr.formula)
  const [sourceKey, setSourceKey] = useState(JSON.stringify(data.analysisSettings.egfr.source))
  const [editing, setEditing] = useState<PatientId | null>(null)
  const [sex, setSex] = useState('')
  const [age, setAge] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const options = useMemo(() => creatinineSourceOptions(data.rawRows), [data.rawRows])
  const source: Source | null = sourceKey === 'null' ? defaultCreatinineSource(options) : JSON.parse(sourceKey)
  const resolution = useMemo(() => resolveDemographics(data.rawRows, useAppStore.getState().patientAttributes, data.manualDemographics), [data.rawRows, data.patientAttributes, data.manualDemographics])
  const preview = useMemo(() => computeAnalysisResult({ rows: data.rawRows, events: data.events, patientAttributes: useAppStore.getState().patientAttributes, manualDemographics: data.manualDemographics, settings: { ...data.analysisSettings, egfr: { formula, source } } }), [data.rawRows, data.events, data.patientAttributes, data.manualDemographics, data.analysisSettings, formula, sourceKey, options])
  const computed = preview.rows.slice(data.rawRows.length)
  const outputName = formula === 'off' ? null : `eGFR (${{ 'ckd-epi-2021': 'CKD-EPI 2021', 'mdrd-4': 'MDRD-4', 'ekfc-2021': 'EKFC 2021' }[formula]}, computed)`
  const outputCollision = outputName !== null && data.rawRows.some(r => r.bezeichnung === outputName && r.einheit === 'ml/min/1,73m²')
  const candidates = resolution.rows.filter(r => source && r.bezeichnung === source[0] && r.einheit === source[1])
  const reasons = new Map<string, number>()
  for (const r of candidates) {
    const reason = !r.labDatum ? 'Date missing' : r.wertNum === null ? 'Numeric value missing' : !(r.wertNum > 0) ? 'Creatinine must be positive' : !r.patientSex ? 'Sex missing or unresolved' : r.patientAgeAtLab === null ? 'Age missing' : r.patientAgeAtLab < 18 ? 'Age under 18' : null
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }
  useEffect(() => {
    setFormula(data.analysisSettings.egfr.formula)
    setSourceKey(JSON.stringify(data.analysisSettings.egfr.source))
  }, [data.rawRows, data.analysisSettings.egfr.formula, data.analysisSettings.egfr.source])
  useEffect(() => { if (editing !== null) dialog.current?.showModal() }, [editing])
  useEffect(() => { setEditing(null); dialog.current?.close() }, [data.rawRows])

  async function supplementary(file: File, kind: 'events' | 'attributes') {
    const store = useAppStore.getState()
    const originalRows = store.rows
    useAppStore.setState({ busy: true, notice: null })
    try {
      const raw = readWorkbook(await file.arrayBuffer())
      if (useAppStore.getState().rows !== originalRows) throw new Error('Dataset replaced during import. Please import the file again.')
      if (kind === 'events') {
        const { valid, rejected } = validateClinicalEvents(normalizeClinicalEvents(raw), originalRows)
        if (!valid.length) throw new Error(`No usable events. ${rejected.map(r => r.reason).join(', ')}`)
        store.setEvents(valid)
        store.setNotice({ kind: 'info', text: `${valid.length} events imported; ${rejected.length} rows rejected.`, details: [
          ...rejected.map(r => ({ sheet: file.name, patientId: r.event.patientId, severity: 'rejected' as const, reason: r.reason })),
          ...valid.filter(r => r.warning).map(r => ({ sheet: file.name, patientId: r.patientId, severity: 'warning' as const, reason: r.warning })),
        ] })
      } else {
        const { byPatient, valid, rejected } = validatePatientAttributes(normalizePatientAttributes(raw), originalRows)
        if (!valid.length) throw new Error(`No usable attributes. ${rejected.map(r => r.reason).join(', ')}`)
        store.setPatientAttributes(byPatient)
        store.setNotice({ kind: 'info', text: `${valid.length} attribute rows imported; ${rejected.length} rows rejected.`, details: [
          ...rejected.map(r => ({ sheet: file.name, patientId: r.row.patientId, severity: 'rejected' as const, reason: r.reason })),
          ...valid.filter(r => r.warning).map(r => ({ sheet: file.name, patientId: r.patientId, severity: 'warning' as const, reason: r.warning })),
        ] })
      }
    } catch (error) { store.setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) }) }
    finally { useAppStore.setState({ busy: false }) }
  }
  function edit(id: PatientId) {
    const manual = data.manualDemographics[patientIdKey(id)]
    setSex(manual?.sex ?? ''); setAge(manual?.age === undefined ? '' : String(manual.age)); setEditing(id)
  }
  const referenceDate = editing === null ? null : data.rawRows.filter(r => r.patientId === editing && r.labDatum).map(r => r.labDatum!).sort((a, b) => a.getTime() - b.getTime())[0]
  const missingSex = data.patients.filter(p => !p.attributes.sex).length
  const missingAge = data.patients.filter(p => p.baselineAge === null).length
  return <div className="data-workspace stack">
    <header className="page-heading"><div><p className="eyebrow">DATA · QUALITY · DERIVATION</p><h1>Prepare data</h1><p className="muted">Import lab values, review patient details and inspect calculations.</p></div><button disabled={!data.rawRows.length} onClick={() => onBrowse()}>Open trajectories →</button></header>
    <section className="card"><h2>1 · Import a dataset</h2><p>CSV or Excel; sheets containing lab values, events and attributes are read together. All data stays in this session.</p>
      <div className="data-import-grid"><label className="field">Lab values / workbook<input aria-label="Import lab values" type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importWorkspaceFile(file) }} /></label><button disabled={busy} onClick={() => void importWorkspaceFile()}>Load demo data</button></div>
      <div className="actions">{['labs', 'events', 'attributes'].map((name, i) => <a key={name} download={`template_${name}.csv`} href={`${import.meta.env.BASE_URL}template_${name}.csv`}>{['Lab template', 'Event template', 'Attribute template'][i]}</a>)}</div>
      {busy && <p role="status">Checking file …</p>}
      {notice && <div className={`notice ${notice.kind === 'error' ? 'amber' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}><p>{notice.text}</p>{!!notice.details?.length && <details><summary>{notice.details.length} import diagnostics — show details</summary><ul>{notice.details.map((d, i) => <li key={i}>{d.sheet} · {d.patientId ?? 'no ID'} · {d.severity === 'rejected' ? 'rejected' : 'Warning'}: {d.reason}</li>)}</ul></details>}</div>}
      {data.rawRows.length > 0 && <><p><strong>{data.fileName ?? 'Dataset'}</strong></p><div className="data-metrics"><span><strong>{data.patients.length}</strong> patients</span><span><strong>{data.rawRows.length}</strong> imported values</span><span><strong>{data.parameters.filter(p => !p.derived).length}</strong> Parameter–unit combinations</span><span><strong>{data.events.length}</strong> events</span></div>
        <p className="muted">{data.rawRows.filter(r => !r.labDatum).length} values without a date · {data.rawRows.filter(r => r.wertNum === null).length} values without a numeric measurement · {data.rawRows.filter(r => !r.bezeichnung).length} values without a parameter name</p>
        <div className="data-import-grid">{(['events', 'attributes'] as const).map(kind => <label className="field" key={kind}>{kind === 'events' ? 'Replace events' : 'Replace attributes'}<input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void supplementary(f, kind) }} /></label>)}</div><p className="muted">Supplementary files replace the corresponding table. Attributes: one row per patientId; additional columns can be freely named.</p></>}
    </section>
    {data.rawRows.length > 0 && <><section className="card"><h2>2 · Demographics and data quality</h2><p>{missingSex} patients without resolved sex · {missingAge} without age at the first lab date · {resolution.conflicts.length} conflicts</p>
      {!!resolution.conflicts.length && <details><summary>Conflicts and their resolution</summary><ul>{resolution.conflicts.map((c, i) => <li key={i}>{describeConflict(c)}</li>)}</ul></details>}
      <details><summary>Review and edit patients ({data.patients.length})</summary><div className="table-scroll"><table><thead><tr><th>Patient</th><th>Sex</th><th>Age at first measurement</th><th>Quality</th><th>Action</th></tr></thead><tbody>{data.patients.map(p => <tr key={JSON.stringify(p.id)}><th><button onClick={() => onBrowse(p.id)}>{p.label}</button></th><td>{sexLabel(p.attributes.sex)}</td><td>{p.baselineAge ?? 'Missing'}</td><td>{resolution.conflicts.filter(c => c.patientId === p.id).length ? 'Conflict' : !p.attributes.sex || p.baselineAge === null ? 'Incomplete' : 'Complete'}{data.manualDemographics[patientIdKey(p.id)] && Object.keys(data.manualDemographics[patientIdKey(p.id)]).length > 0 ? ' · manual' : ''}</td><td><button aria-label={`Edit demographics: ${p.label}`} onClick={() => edit(p.id)}>Edit</button></td></tr>)}</tbody></table></div></details>
    </section><section className="card"><h2>3 · Derive eGFR</h2><p>Preview before applying. Imported measurements are preserved; computed values appear as separate parameters.</p><div className="data-import-grid"><label className="field">eGFR formula<select value={formula} onChange={e => setFormula(e.target.value as FormulaName | 'off')}><option value="off">Off</option><option value="ckd-epi-2021">CKD-EPI 2021</option><option value="mdrd-4">MDRD-4</option><option value="ekfc-2021">EKFC 2021</option></select></label><label className="field">Creatinine source<select value={sourceKey} onChange={e => setSourceKey(e.target.value)}><option value="null">Automatic{defaultCreatinineSource(options) ? `: ${defaultCreatinineSource(options)!.join(' · ')}` : ': no eligible source'}</option>{options.map(s => <option key={JSON.stringify(s)} value={JSON.stringify(s)}>{s.join(' · ')}</option>)}</select></label></div>
      <p role="status">{computed.length} computed values in preview</p><p className="muted">Active: {data.analysisSettings.egfr.formula === 'off' ? 'Off' : data.analysisSettings.egfr.formula} · {data.rows.length - data.rawRows.length} computed values</p>
      {formula !== 'off' && <>{!source && <p>No eligible serum creatinine source (mg/dl or µmol/l) is available.</p>}<p>{candidates.length} source values · {candidates.length - computed.length} cannot be computed</p><ul>{[...reasons].map(([reason, n]) => <li key={reason}>{n}: {reason}</li>)}</ul><p className="muted">Adult formulas for ages 18 and over. For sex code “d”, the existing calculation uses male coefficients.</p></>}
      {outputCollision && <p role="alert" className="notice amber">“{outputName}” already exists as an imported parameter (ml/min/1,73m²). Calculation is blocked to keep imported and newly computed values separate. Use the imported series with “Off”, choose another formula, or rename the imported series before importing it again. Changing the creatinine source does not change the output name.</p>}
      <button className="primary" disabled={outputCollision} onClick={() => { if (outputCollision) return; useAppStore.getState().setEgfrSource(source); useAppStore.getState().setEgfrFormula(formula) }}>Apply calculation</button>
      {!!computed.length && <details><summary>Inspect computed values ({computed.length})</summary><div className="table-scroll data-preview-scroll" role="region" aria-label="Computed value preview" tabIndex={0}><table><thead><tr><th>Patient</th><th>Date</th><th>Parameter</th><th>Value</th></tr></thead><tbody>{computed.map((r, i) => <tr key={i}><td>{r.patientId}</td><td>{r.labDatum?.toISOString().slice(0, 10)}</td><td>{r.bezeichnung}</td><td>{r.wertOperator === '=' ? '' : r.wertOperator}{r.wertNum?.toFixed(1)} {r.einheit}</td></tr>)}</tbody></table></div></details>}
    </section></>}
    <dialog ref={dialog} aria-labelledby="demographics-title" onCancel={() => setEditing(null)} onClose={() => setEditing(null)}><form onSubmit={e => { e.preventDefault(); if (editing === null) return; useAppStore.getState().setManualDemographics(editing, { ...(sex ? { sex: sex as Sex } : {}), ...(age !== '' ? { age: Number(age) } : {}) }); dialog.current?.close(); setEditing(null) }}><h2 id="demographics-title">Demographics · {editing}</h2><p>Manual entries take precedence. Leave fields blank to use the imported values again.</p><p>Reference date: <strong>{referenceDate?.toISOString().slice(0, 10) ?? 'No lab date available'}</strong> (first measurement). Age advances for subsequent measurements.</p><label className="field">Sex<select value={sex} onChange={e => setSex(e.target.value)}><option value="">Use imported value</option><option value="w">Female</option><option value="m">Male</option><option value="d">Diverse</option></select></label><label className="field">Age at reference date<input type="number" min="0" max="130" step="1" value={age} onChange={e => setAge(e.target.value)} /></label><div className="actions"><button type="button" onClick={() => { dialog.current?.close(); setEditing(null) }}>Cancel</button><button className="primary" type="submit">Save</button></div></form></dialog>
  </div>
}
