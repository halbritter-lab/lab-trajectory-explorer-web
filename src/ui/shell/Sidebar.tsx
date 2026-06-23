import { useState } from 'react'
import { useAppStore } from '../state/store'
import { allSourceOptions, creatinineSourceOptions, defaultCreatinineSource, isSerumCreatinineSource, type FormulaName } from '../../core/egfr/series'
import type { Sex } from '../../core/types'

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const [showAllEgfrSources, setShowAllEgfrSources] = useState(false)
  const [demoDraft, setDemoDraft] = useState<{ patientId: number; sex: Sex | ''; age: string } | null>(null)
  const egfrFormula = useAppStore((s) => s.egfrFormula)
  const setEgfrFormula = useAppStore((s) => s.setEgfrFormula)
  const egfrSource = useAppStore((s) => s.egfrSource)
  const setEgfrSource = useAppStore((s) => s.setEgfrSource)
  const manualDemographics = useAppStore((s) => s.manualDemographics)
  const setManualDemographics = useAppStore((s) => s.setManualDemographics)
  const rows = useAppStore((s) => s.rows)
  const cohortPatientMode = useAppStore((s) => s.cohortPatientMode)
  const setCohortPatientMode = useAppStore((s) => s.setCohortPatientMode)
  const selectedPatientIds = useAppStore((s) => s.selectedPatientIds)
  const setSelectedPatientIds = useAppStore((s) => s.setSelectedPatientIds)
  const setAnnotations = useAppStore((s) => s.setAnnotations)
  const showAnnotations = useAppStore((s) => s.showAnnotations)
  const setShowAnnotations = useAppStore((s) => s.setShowAnnotations)
  const showAki = useAppStore((s) => s.showAki)
  const setShowAki = useAppStore((s) => s.setShowAki)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const setConnectPoints = useAppStore((s) => s.setConnectPoints)
  const rapidEgfrThreshold = useAppStore((s) => s.rapidEgfrThreshold)
  const setRapidEgfrThreshold = useAppStore((s) => s.setRapidEgfrThreshold)
  const [annNote, setAnnNote] = useState('')
  const patientIds = [...new Set(rows.map((r) => r.patientId))].sort((a, b) => a - b)

  const autoSourceOptions = creatinineSourceOptions(rows)
  const sourceOptions = showAllEgfrSources ? allSourceOptions(rows) : autoSourceOptions
  const selectedSource = egfrSource ?? defaultCreatinineSource(autoSourceOptions)
  const selectedSourceKey = selectedSource ? `${selectedSource[0]}|${selectedSource[1]}` : ''
  const selectedSourceIsEligible = selectedSource ? isSerumCreatinineSource(selectedSource) : false
  const sourcePatientIds = selectedSource && selectedSourceIsEligible
    ? [...new Set(rows
        .filter((r) => r.bezeichnung === selectedSource[0] && r.einheit === selectedSource[1])
        .map((r) => r.patientId))]
        .sort((a, b) => a - b)
    : []
  const missingDemoPatientIds = selectedSource && selectedSourceIsEligible
    ? [...new Set(rows
        .filter((r) => r.bezeichnung === selectedSource[0] && r.einheit === selectedSource[1])
        .filter((r) => {
          const manual = manualDemographics[r.patientId]
          const age = manual?.age ?? r.patientAgeAtLab
          return (manual?.sex ?? r.patientSex) == null || age == null || age < 18
        })
        .map((r) => r.patientId))]
        .sort((a, b) => a - b)
    : []
  const manualDemoPatientIds = sourcePatientIds.filter((pid) => manualDemographics[pid])
  const demoPanelPatientIds = [...new Set([...missingDemoPatientIds, ...manualDemoPatientIds])].sort((a, b) => a - b)

  function setSourceFromKey(key: string) {
    const src = sourceOptions.find((s) => `${s[0]}|${s[1]}` === key) ?? null
    setEgfrSource(src)
  }

  function toggleAllEgfrSources(checked: boolean) {
    setShowAllEgfrSources(checked)
    if (!checked && egfrSource && !autoSourceOptions.some((s) => s[0] === egfrSource[0] && s[1] === egfrSource[1])) {
      setEgfrSource(defaultCreatinineSource(autoSourceOptions))
    }
  }

  function openDemographicsDialog(patientId: number) {
    const current = manualDemographics[patientId]
    const sourceRows = selectedSource
      ? rows.filter((r) => r.patientId === patientId && r.bezeichnung === selectedSource[0] && r.einheit === selectedSource[1])
      : []
    const sourceSex = sourceRows.find((r) => r.patientSex !== null)?.patientSex ?? ''
    const sourceAge = sourceRows.find((r) => r.patientAgeAtLab !== null)?.patientAgeAtLab
    setDemoDraft({
      patientId,
      sex: current?.sex ?? sourceSex,
      age: current?.age !== undefined ? String(current.age) : sourceAge !== undefined && sourceAge !== null ? String(sourceAge) : '',
    })
  }

  function applyDemographicsDraft() {
    if (!demoDraft || demoDraft.sex === '') return
    const age = Math.trunc(Number(demoDraft.age))
    if (!Number.isFinite(age) || age < 18) return
    setManualDemographics(demoDraft.patientId, { sex: demoDraft.sex, age })
    setDemoDraft(null)
  }

  async function onAnnFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    try {
      const { normalizeAnnotations, validateAnnotations } = await import('../../core/annotations/annotations')
      const { readWorkbook } = await import('../../io/readWorkbook')
      const anns = normalizeAnnotations(readWorkbook(buf))
      const { valid, rejects } = validateAnnotations(anns, rows)
      setAnnotations(valid)
      setAnnNote(`${valid.length} loaded${rejects.length ? `, ${rejects.length} rejected` : ''}`)
    } catch (err) {
      setAnnNote(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <aside className={open ? 'sidebar open' : 'sidebar collapsed'}>
      <button className="sidebar-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle sidebar" aria-expanded={open} aria-controls="sidebar-body">
        {open ? '«' : '»'}
      </button>
      {open && (
        <div className="sidebar-body" id="sidebar-body">
          <h2 className="sidebar-title">Display options</h2>

          <section className="sidebar-group">
            <h3 className="sidebar-group-title">Analysis</h3>
            <label className="sidebar-field">Compute eGFR
              <select aria-label="Compute eGFR" value={egfrFormula} onChange={(e) => setEgfrFormula(e.target.value as FormulaName | 'off')}>
                <option value="off">Off (no eGFR)</option>
                <option value="ckd-epi-2021">CKD-EPI 2021</option>
                <option value="mdrd-4">MDRD-4</option>
                <option value="ekfc-2021">EKFC 2021</option>
              </select>
            </label>
            {egfrFormula !== 'off' && rows.length > 0 && (
              <>
                <label className="sidebar-check">
                  <input
                    type="checkbox"
                    aria-label="Show all series in source picker"
                    checked={showAllEgfrSources}
                    onChange={(e) => toggleAllEgfrSources(e.target.checked)}
                  />
                  Show all series in source picker
                </label>
                {sourceOptions.length > 0 && (
                  <label className="sidebar-field">Creatinine source
                    <select aria-label="Creatinine source" value={selectedSourceKey} onChange={(e) => setSourceFromKey(e.target.value)}>
                      {sourceOptions.map((s) => (
                        <option key={`${s[0]}|${s[1]}`} value={`${s[0]}|${s[1]}`}>{s[0]} ({s[1]})</option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedSource && !selectedSourceIsEligible && (
                  <p className="sidebar-note">Selected source is not eligible for eGFR; use serum creatinine in mg/dl or µmol/l.</p>
                )}
              </>
            )}
            {egfrFormula !== 'off' && demoPanelPatientIds.length > 0 && (
              <div className="manual-demo">
                {missingDemoPatientIds.length > 0 && (
                  <p className="sidebar-note">{missingDemoPatientIds.length} patient(s) missing demographics for computed eGFR.</p>
                )}
                <p className="sidebar-note">Manual age is applied to all lab dates for that patient.</p>
                {demoPanelPatientIds.map((pid) => (
                  <div className="manual-demo-row" key={pid}>
                    <span>{manualDemographics[pid] ? `Patient ${pid}: ${manualDemographics[pid].sex}, age ${manualDemographics[pid].age}` : `Patient ${pid}: missing`}</span>
                    <button type="button" aria-label={`${manualDemographics[pid] ? 'Edit' : 'Enter'} demographics for patient ${pid}`} onClick={() => openDemographicsDialog(pid)}>
                      {manualDemographics[pid] ? 'Edit' : 'Enter demographics'}
                    </button>
                  </div>
                ))}
                {demoDraft && (
                  <div className="manual-demo-dialog" role="dialog" aria-modal="true" aria-label={`Manual demographics for patient ${demoDraft.patientId}`}>
                    <div className="manual-demo-dialog-title">Patient {demoDraft.patientId}</div>
                    <label className="sidebar-field">Sex
                      <select
                        aria-label={`Manual sex for patient ${demoDraft.patientId}`}
                        value={demoDraft.sex}
                        onChange={(e) => setDemoDraft({ ...demoDraft, sex: e.target.value as Sex | '' })}
                      >
                        <option value="" disabled>Choose sex</option>
                        <option value="m">m</option>
                        <option value="w">w</option>
                        <option value="d">d</option>
                      </select>
                    </label>
                    <label className="sidebar-field">Age
                      <input
                        type="number"
                        min={18}
                        aria-label={`Manual age for patient ${demoDraft.patientId}`}
                        value={demoDraft.age}
                        onChange={(e) => setDemoDraft({ ...demoDraft, age: e.target.value })}
                      />
                    </label>
                    <div className="manual-demo-actions">
                      <button type="button" onClick={applyDemographicsDraft}>Apply demographics</button>
                      <button type="button" onClick={() => setDemoDraft(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <label className="sidebar-check">
              <input type="checkbox" checked={showAki} onChange={(e) => setShowAki(e.target.checked)} />
              Show AKI episodes
            </label>
            <p className="sidebar-note">eGFR (ƒ) is computed from serum creatinine and demographics; AKI episodes use KDIGO criteria. Both are added as overlays, not measured data.</p>
            <label className="sidebar-field" title="KDIGO rapid CKD progression: eGFR decline faster than this many mL/min/1.73m² per year. Set 0 to disable.">
              Rapid eGFR decline ≥ (mL/min/1.73m²/yr)
              <input
                type="number"
                min={0}
                step={0.5}
                aria-label="Rapid eGFR decline threshold per year"
                value={rapidEgfrThreshold}
                onChange={(e) => setRapidEgfrThreshold(Number(e.target.value))}
              />
            </label>
            <p className="sidebar-note">Cohort eGFR series declining faster than this are flagged <span className="rapid-badge rapid-badge-inline">rapid ↓</span>. KDIGO defines rapid progression as &gt; 5/yr. Set 0 to disable.</p>
          </section>

          {patientIds.length > 0 && (
            <section className="sidebar-group">
              <h3 className="sidebar-group-title">Patients</h3>
              <label className="sidebar-check">
                <input
                  type="radio"
                  name="cohort-patient-mode"
                  aria-label="All eligible patients"
                  checked={cohortPatientMode === 'all'}
                  onChange={() => setCohortPatientMode('all')}
                />
                All eligible
              </label>
              <label className="sidebar-check">
                <input
                  type="radio"
                  name="cohort-patient-mode"
                  aria-label="Selected patients"
                  checked={cohortPatientMode === 'selected'}
                  onChange={() => setCohortPatientMode('selected')}
                />
                Selected
              </label>
              {cohortPatientMode === 'selected' && (
                <div className="patient-checks">
                  {patientIds.map((pid) => (
                    <label className="sidebar-check" key={pid}>
                      <input
                        type="checkbox"
                        aria-label={`Include patient ${pid}`}
                        checked={selectedPatientIds.includes(pid)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedPatientIds, pid]
                            : selectedPatientIds.filter((id) => id !== pid)
                          setSelectedPatientIds(next)
                        }}
                      />
                      {pid}
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="sidebar-group">
            <h3 className="sidebar-group-title">Display</h3>
            <label className="sidebar-check">
              <input type="checkbox" aria-label="Connect data points" checked={connectPoints} onChange={(e) => setConnectPoints(e.target.checked)} />
              Connect data points
            </label>
            <p className="sidebar-note">When off, plots and cohort mini-graphs show individual measurements only, without the line joining them.</p>
          </section>

          <section className="sidebar-group">
            <h3 className="sidebar-group-title">Annotations</h3>
            <label className="sidebar-check">
              <input type="checkbox" aria-label="Show annotations on plot" checked={showAnnotations} onChange={(e) => setShowAnnotations(e.target.checked)} />
              Show on plot
            </label>
            <label className="sidebar-field">Upload event markers
              <input type="file" aria-label="Annotations" accept=".xlsx,.csv" onChange={onAnnFile} />
            </label>
            {annNote && <p className="sidebar-note sidebar-status" role="status" aria-live="polite">{annNote}</p>}
          </section>
        </div>
      )}
    </aside>
  )
}
