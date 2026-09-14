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
    const reason = !r.labDatum ? 'Datum fehlt' : r.wertNum === null ? 'Numerischer Wert fehlt' : !(r.wertNum > 0) ? 'Kreatinin muss positiv sein' : !r.patientSex ? 'Geschlecht fehlt oder ist nicht auflösbar' : r.patientAgeAtLab === null ? 'Alter fehlt' : r.patientAgeAtLab < 18 ? 'Alter unter 18 Jahren' : null
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
      if (useAppStore.getState().rows !== originalRows) throw new Error('Datensatz wurde während des Imports ersetzt. Bitte erneut importieren.')
      if (kind === 'events') {
        const { valid, rejected } = validateClinicalEvents(normalizeClinicalEvents(raw), originalRows)
        if (!valid.length) throw new Error(`Keine verwendbaren Ereignisse. ${rejected.map(r => r.reason).join(', ')}`)
        store.setEvents(valid)
        store.setNotice({ kind: 'info', text: `${valid.length} Ereignisse importiert; ${rejected.length} Zeilen abgelehnt.`, details: [
          ...rejected.map(r => ({ sheet: file.name, patientId: r.event.patientId, severity: 'rejected' as const, reason: r.reason })),
          ...valid.filter(r => r.warning).map(r => ({ sheet: file.name, patientId: r.patientId, severity: 'warning' as const, reason: r.warning })),
        ] })
      } else {
        const { byPatient, valid, rejected } = validatePatientAttributes(normalizePatientAttributes(raw), originalRows)
        if (!valid.length) throw new Error(`Keine verwendbaren Attribute. ${rejected.map(r => r.reason).join(', ')}`)
        store.setPatientAttributes(byPatient)
        store.setNotice({ kind: 'info', text: `${valid.length} Attributzeilen importiert; ${rejected.length} Zeilen abgelehnt.`, details: [
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
    <header className="page-heading"><div><p className="eyebrow">DATEN · QUALITÄT · ABLEITUNG</p><h1>Daten vorbereiten</h1><p className="muted">Laborwerte importieren, Angaben prüfen und Berechnungen nachvollziehen.</p></div><button disabled={!data.rawRows.length} onClick={() => onBrowse()}>Verläufe öffnen →</button></header>
    <section className="card"><h2>1 · Datensatz importieren</h2><p>CSV oder Excel; mehrere Tabellenblätter für Laborwerte, Ereignisse und Attribute werden gemeinsam gelesen. Alle Daten bleiben in dieser Sitzung.</p>
      <div className="data-import-grid"><label className="field">Laborwerte / Workbook<input aria-label="Laborwerte importieren" type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importWorkspaceFile(file) }} /></label><button disabled={busy} onClick={() => void importWorkspaceFile()}>Demodaten laden</button></div>
      <div className="actions">{['labs', 'events', 'attributes'].map((name, i) => <a key={name} download={`template_${name}.csv`} href={`${import.meta.env.BASE_URL}template_${name}.csv`}>{['Laborvorlage', 'Ereignisvorlage', 'Attributvorlage'][i]}</a>)}</div>
      {busy && <p role="status">Datei wird geprüft …</p>}
      {notice && <div className={`notice ${notice.kind === 'error' ? 'amber' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}><p>{notice.text}</p>{!!notice.details?.length && <details><summary>{notice.details.length} Importdiagnosen anzeigen</summary><ul>{notice.details.map((d, i) => <li key={i}>{d.sheet} · {d.patientId ?? 'ohne ID'} · {d.severity === 'rejected' ? 'abgelehnt' : 'Warnung'}: {d.reason}</li>)}</ul></details>}</div>}
      {data.rawRows.length > 0 && <><p><strong>{data.fileName ?? 'Datensatz'}</strong></p><div className="data-metrics"><span><strong>{data.patients.length}</strong> Personen</span><span><strong>{data.rawRows.length}</strong> importierte Werte</span><span><strong>{data.parameters.filter(p => !p.derived).length}</strong> Parameter / Einheiten</span><span><strong>{data.events.length}</strong> Ereignisse</span></div>
        <p className="muted">{data.rawRows.filter(r => !r.labDatum).length} Werte ohne Datum · {data.rawRows.filter(r => r.wertNum === null).length} Werte ohne numerischen Messwert · {data.rawRows.filter(r => !r.bezeichnung).length} Werte ohne Parametername</p>
        <div className="data-import-grid">{(['events', 'attributes'] as const).map(kind => <label className="field" key={kind}>{kind === 'events' ? 'Ereignisse ersetzen' : 'Attribute ersetzen'}<input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void supplementary(f, kind) }} /></label>)}</div><p className="muted">Zusatzdateien ersetzen die jeweilige Tabelle. Attribute: eine Zeile je patientId, weitere Spalten frei wählbar.</p></>}
    </section>
    {data.rawRows.length > 0 && <><section className="card"><h2>2 · Demografie und Datenqualität</h2><p>{missingSex} Personen ohne aufgelöstes Geschlecht · {missingAge} ohne Alter am ersten Labordatum · {resolution.conflicts.length} Konflikte</p>
      {!!resolution.conflicts.length && <details><summary>Konflikte und verwendete Auflösung</summary><ul>{resolution.conflicts.map((c, i) => <li key={i}>{describeConflict(c)}</li>)}</ul></details>}
      <details><summary>Personen prüfen und bearbeiten ({data.patients.length})</summary><div className="table-scroll"><table><thead><tr><th>Person</th><th>Geschlecht</th><th>Alter bei erster Messung</th><th>Qualität</th><th>Aktion</th></tr></thead><tbody>{data.patients.map(p => <tr key={JSON.stringify(p.id)}><th><button onClick={() => onBrowse(p.id)}>{p.label}</button></th><td>{p.attributes.sex ?? 'Fehlt'}</td><td>{p.baselineAge ?? 'Fehlt'}</td><td>{resolution.conflicts.filter(c => c.patientId === p.id).length ? 'Konflikt' : !p.attributes.sex || p.baselineAge === null ? 'Unvollständig' : 'Vollständig'}{data.manualDemographics[patientIdKey(p.id)] && Object.keys(data.manualDemographics[patientIdKey(p.id)]).length > 0 ? ' · manuell' : ''}</td><td><button aria-label={`Demografie bearbeiten: ${p.label}`} onClick={() => edit(p.id)}>Bearbeiten</button></td></tr>)}</tbody></table></div></details>
    </section><section className="card"><h2>3 · eGFR ableiten</h2><p>Vorschau vor dem Anwenden. Importierte Messwerte bleiben erhalten; berechnete Werte werden als eigene Parameter geführt.</p><div className="data-import-grid"><label className="field">eGFR-Formel<select value={formula} onChange={e => setFormula(e.target.value as FormulaName | 'off')}><option value="off">Aus</option><option value="ckd-epi-2021">CKD-EPI 2021</option><option value="mdrd-4">MDRD-4</option><option value="ekfc-2021">EKFC 2021</option></select></label><label className="field">Kreatininquelle<select value={sourceKey} onChange={e => setSourceKey(e.target.value)}><option value="null">Automatisch{defaultCreatinineSource(options) ? `: ${defaultCreatinineSource(options)!.join(' · ')}` : ': keine geeignete Quelle'}</option>{options.map(s => <option key={JSON.stringify(s)} value={JSON.stringify(s)}>{s.join(' · ')}</option>)}</select></label></div>
      <p role="status">{computed.length} berechnete Werte in der Vorschau</p><p className="muted">Aktiv: {data.analysisSettings.egfr.formula === 'off' ? 'Aus' : data.analysisSettings.egfr.formula} · {data.rows.length - data.rawRows.length} berechnete Werte</p>
      {formula !== 'off' && <>{!source && <p>Keine geeignete Serum-Kreatininquelle (mg/dl oder µmol/l) vorhanden.</p>}<p>{candidates.length} Quellwerte · {candidates.length - computed.length} nicht berechenbar</p><ul>{[...reasons].map(([reason, n]) => <li key={reason}>{n}: {reason}</li>)}</ul><p className="muted">Erwachsenenformeln ab 18 Jahren. Bei „d“ verwendet der bestehende Rechenkern männliche Koeffizienten.</p></>}
      {!!computed.length && <details><summary>Berechnete Werte ansehen ({computed.length})</summary><div className="table-scroll"><table><thead><tr><th>Person</th><th>Datum</th><th>Parameter</th><th>Wert</th></tr></thead><tbody>{computed.map((r, i) => <tr key={i}><td>{r.patientId}</td><td>{r.labDatum?.toISOString().slice(0, 10)}</td><td>{r.bezeichnung}</td><td>{r.wertOperator === '=' ? '' : r.wertOperator}{r.wert} {r.einheit}</td></tr>)}</tbody></table></div></details>}
      {outputCollision && <p role="alert" className="notice amber">„{outputName}“ ist bereits als importierter Parameter vorhanden (ml/min/1,73m²). Die Berechnung ist gesperrt, damit importierte und neu berechnete Werte nicht zusammengeführt werden. Verwenden Sie die importierte Reihe mit „Aus“, wählen Sie eine andere Formel oder benennen Sie die importierte Reihe vor einem erneuten Import um. Eine andere Kreatininquelle ändert den Ausgabenamen nicht.</p>}
      <button className="primary" disabled={outputCollision} onClick={() => { if (outputCollision) return; useAppStore.getState().setEgfrSource(source); useAppStore.getState().setEgfrFormula(formula) }}>Berechnung anwenden</button>
    </section></>}
    <dialog ref={dialog} aria-labelledby="demographics-title" onCancel={() => setEditing(null)} onClose={() => setEditing(null)}><form onSubmit={e => { e.preventDefault(); if (editing === null) return; useAppStore.getState().setManualDemographics(editing, { ...(sex ? { sex: sex as Sex } : {}), ...(age !== '' ? { age: Number(age) } : {}) }); dialog.current?.close(); setEditing(null) }}><h2 id="demographics-title">Demografie · {editing}</h2><p>Manuelle Angaben haben Vorrang. Leere Felder verwenden wieder die importierten Angaben.</p><p>Referenzdatum: <strong>{referenceDate?.toISOString().slice(0, 10) ?? 'Kein Labordatum vorhanden'}</strong> (erste Messung). Das Alter wird für spätere Messungen fortgeschrieben.</p><label className="field">Geschlecht<select value={sex} onChange={e => setSex(e.target.value)}><option value="">Import verwenden</option><option value="w">Weiblich</option><option value="m">Männlich</option><option value="d">Divers</option></select></label><label className="field">Alter am Referenzdatum<input type="number" min="0" max="130" step="1" value={age} onChange={e => setAge(e.target.value)} /></label><div className="actions"><button type="button" onClick={() => { dialog.current?.close(); setEditing(null) }}>Abbrechen</button><button className="primary" type="submit">Speichern</button></div></form></dialog>
  </div>
}
