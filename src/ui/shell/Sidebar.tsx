import { useState } from 'react'
import { useAppStore } from '../state/store'
import { allSourceOptions, creatinineSourceOptions, defaultCreatinineSource, isSerumCreatinineSource, type FormulaName } from '../../core/egfr/series'
import { comparePatientIds, patientIdKey, type PatientId, type Sex } from '../../core/types'
import { effectForEvent, normalizeClinicalEvents, validateClinicalEvents, type ClinicalEvent, type RejectedClinicalEvent } from '../../core/events/events'
import type { FitConfig, FitPreset, FitModel, TimeBalancing, UnknownDialysisPolicy } from '../../core/fitPipeline/types'
import { isEgfrUnit } from '../../core/analysis/rapidEgfrDeclineModule'
import { readWorkbook } from '../../io/readWorkbook'

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const [showAllEgfrSources, setShowAllEgfrSources] = useState(false)
  const [showMissingDemographics, setShowMissingDemographics] = useState(false)
  const [demoDraft, setDemoDraft] = useState<{ patientId: PatientId; sex: Sex | ''; age: string } | null>(null)
  const [fitSeriesIndex, setFitSeriesIndex] = useState(0)
  const analysisSettings = useAppStore((s) => s.analysisSettings)
  const egfrFormula = analysisSettings.egfr.formula
  const setEgfrFormula = useAppStore((s) => s.setEgfrFormula)
  const egfrSource = analysisSettings.egfr.source
  const setEgfrSource = useAppStore((s) => s.setEgfrSource)
  const manualDemographics = useAppStore((s) => s.manualDemographics)
  const setManualDemographics = useAppStore((s) => s.setManualDemographics)
  const rows = useAppStore((s) => s.rows)
  const cohortPatientMode = useAppStore((s) => s.cohortPatientMode)
  const setCohortPatientMode = useAppStore((s) => s.setCohortPatientMode)
  const selectedPatientIds = useAppStore((s) => s.selectedPatientIds)
  const setSelectedPatientIds = useAppStore((s) => s.setSelectedPatientIds)
  const events = useAppStore((s) => s.events)
  const setEvents = useAppStore((s) => s.setEvents)
  const showEvents = useAppStore((s) => s.showEvents)
  const setShowEvents = useAppStore((s) => s.setShowEvents)
  const showAki = useAppStore((s) => s.showAki)
  const setShowAki = useAppStore((s) => s.setShowAki)
  const seriesConfigs = useAppStore((s) => s.seriesConfigs)
  const setSeriesFitPreset = useAppStore((s) => s.setSeriesFitPreset)
  const setSeriesFitConfig = useAppStore((s) => s.setSeriesFitConfig)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const setConnectPoints = useAppStore((s) => s.setConnectPoints)
  const rapidEgfrThreshold = useAppStore((s) => s.analysisSettings.rapidEgfrDecline.threshold)
  const setRapidEgfrThreshold = useAppStore((s) => s.setRapidEgfrThreshold)
  const mixedModelResult = useAppStore((s) => s.mixedModelResult)
  const showCohortMixedModelLine = useAppStore((s) => s.showCohortMixedModelLine)
  const setMixedModelDialogOpen = useAppStore((s) => s.setMixedModelDialogOpen)
  const setShowCohortMixedModelLine = useAppStore((s) => s.setShowCohortMixedModelLine)
  const [eventNote, setEventNote] = useState('')
  const [rejectedEvents, setRejectedEvents] = useState<RejectedClinicalEvent[]>([])
  const patientIds = [...new Set(rows.map((r) => r.patientId))].sort(comparePatientIds)
  const activeFitSeriesIndex = Math.min(fitSeriesIndex, seriesConfigs.length - 1)
  const primaryFitConfig = seriesConfigs[activeFitSeriesIndex].fitConfig
  const hasCohortMixedModelResult = mixedModelResult?.result.status === 'success'
  const hasActiveEgfrCohortSeries = seriesConfigs.some((cfg) =>
    Boolean(cfg.bezeichnung?.toLowerCase().includes('egfr') || isEgfrUnit(cfg.einheit)),
  )

  const autoSourceOptions = creatinineSourceOptions(rows)
  const sourceOptions = showAllEgfrSources ? allSourceOptions(rows) : autoSourceOptions
  const selectedSource = egfrSource ?? defaultCreatinineSource(autoSourceOptions)
  const selectedSourceKey = selectedSource ? `${selectedSource[0]}|${selectedSource[1]}` : ''
  const selectedSourceIsEligible = selectedSource ? isSerumCreatinineSource(selectedSource) : false
  const sourcePatientIds = selectedSource && selectedSourceIsEligible
    ? [...new Set(rows
        .filter((r) => r.bezeichnung === selectedSource[0] && r.einheit === selectedSource[1])
        .map((r) => r.patientId))]
        .sort(comparePatientIds)
    : []
  const missingDemoPatientIds = selectedSource && selectedSourceIsEligible
    ? [...new Set(rows
        .filter((r) => r.bezeichnung === selectedSource[0] && r.einheit === selectedSource[1])
        .filter((r) => {
          const manual = manualDemographics[patientIdKey(r.patientId)]
          const age = manual?.age ?? r.patientAgeAtLab
          return (manual?.sex ?? r.patientSex) == null || age == null || age < 18
        })
        .map((r) => r.patientId))]
        .sort(comparePatientIds)
    : []
  const manualDemoPatientIds = sourcePatientIds.filter((pid) => manualDemographics[patientIdKey(pid)])
  const demoPanelPatientIds = [...new Set([...(showMissingDemographics ? missingDemoPatientIds : []), ...manualDemoPatientIds])].sort(comparePatientIds)

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

  function openDemographicsDialog(patientId: PatientId) {
    const current = manualDemographics[patientIdKey(patientId)]
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

  async function onEventFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const rawEvents = normalizeClinicalEvents(readWorkbook(buf))
      const { valid, rejected } = validateClinicalEvents(rawEvents, rows)
      const warnings = valid.filter((event) => event.warning).length
      setEvents(valid)
      setRejectedEvents(rejected)
      setEventNote(
        `Loaded ${valid.length} ${pluralize(valid.length, 'event')}` +
        `${rejected.length ? `; rejected ${rejected.length} ${pluralize(rejected.length, 'row')}` : ''}` +
        `${warnings ? `; ${warnings} ${pluralize(warnings, 'warning')}` : ''}.`,
      )
    } catch (err) {
      setEvents([])
      setRejectedEvents([])
      setEventNote(err instanceof Error ? err.message : String(err))
    } finally {
      input.value = ''
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
            {egfrFormula !== 'off' && selectedSource && selectedSourceIsEligible && missingDemoPatientIds.length > 0 && (
              <label className="sidebar-check">
                <input
                  type="checkbox"
                  aria-label="Show missing demographics"
                  checked={showMissingDemographics}
                  onChange={(e) => setShowMissingDemographics(e.target.checked)}
                />
                Show missing demographics
              </label>
            )}
            {egfrFormula !== 'off' && demoPanelPatientIds.length > 0 && (
              <div className="manual-demo">
                {showMissingDemographics && missingDemoPatientIds.length > 0 && (
                  <p className="sidebar-note">{missingDemoPatientIds.length} patient(s) missing demographics for computed eGFR.</p>
                )}
                <p className="sidebar-note">Manual age is applied to all lab dates for that patient.</p>
                {demoPanelPatientIds.map((pid) => (
                  <div className="manual-demo-row" key={pid}>
                    <span>{manualDemographics[patientIdKey(pid)] ? `Patient ${pid}: ${manualDemographics[patientIdKey(pid)].sex}, age ${manualDemographics[patientIdKey(pid)].age}` : `Patient ${pid}: missing`}</span>
                    <button type="button" aria-label={`${manualDemographics[patientIdKey(pid)] ? 'Edit' : 'Enter'} demographics for patient ${pid}`} onClick={() => openDemographicsDialog(pid)}>
                      {manualDemographics[patientIdKey(pid)] ? 'Edit' : 'Enter demographics'}
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

          <section className="sidebar-group">
            <h3 className="sidebar-group-title">Nephro / CKD progression</h3>
            <label className="sidebar-field">Series
              <select
                aria-label="Fit settings series"
                value={activeFitSeriesIndex}
                onChange={(e) => setFitSeriesIndex(Number(e.target.value))}
              >
                {seriesConfigs.map((cfg, index) => (
                  <option key={index} value={index}>
                    {`Series ${index + 1}${cfg.bezeichnung ? `: ${cfg.bezeichnung}` : ''}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="sidebar-field">Preset
              <select aria-label="Fit preset" value={primaryFitConfig.preset} onChange={(e) => setSeriesFitPreset(activeFitSeriesIndex, e.target.value as FitPreset)}>
                <option value="general_exploration">General exploration</option>
                <option value="ckd_progression">CKD progression</option>
                <option value="acute_review">Acute review</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <div className="sidebar-subgroup-title">Data filter</div>
            <label className="sidebar-check">
              <input
                type="checkbox"
                aria-label="Censor after kidney transplant"
                checked={primaryFitConfig.censoring.censorAfterKidneyTransplant}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { censoring: { censorAfterKidneyTransplant: e.target.checked } })}
              />
              Censor after kidney transplant
            </label>
            <label className="sidebar-check">
              <input
                type="checkbox"
                aria-label="Censor after chronic dialysis"
                checked={primaryFitConfig.censoring.censorAfterChronicDialysis}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { censoring: { censorAfterChronicDialysis: e.target.checked } })}
              />
              Censor after chronic dialysis
            </label>
            <label className="sidebar-check">
              <input
                type="checkbox"
                aria-label="Exclude acute dialysis intervals"
                checked={primaryFitConfig.censoring.excludeAcuteDialysisPeriods}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { censoring: { excludeAcuteDialysisPeriods: e.target.checked } })}
              />
              Exclude acute dialysis intervals
            </label>
            <label className="sidebar-field">Unknown dialysis
              <select
                aria-label="Unknown dialysis policy"
                value={primaryFitConfig.censoring.unknownDialysisPolicy}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { censoring: { unknownDialysisPolicy: e.target.value as UnknownDialysisPolicy } })}
              >
                <option value="flag-only">Flag only</option>
                <option value="exclude-dated-interval">Exclude dated interval</option>
                <option value="censor-from-start">Censor from start</option>
              </select>
            </label>
            <div className="sidebar-subgroup-title">Detected events</div>
            <label className="sidebar-check">
              <input type="checkbox" checked={showAki} onChange={(e) => setShowAki(e.target.checked)} />
              Show AKI episodes
            </label>
            <label className="sidebar-check">
              <input
                type="checkbox"
                aria-label="Exclude AKI windows from trend fits"
                checked={primaryFitConfig.exclusions.excludeAkiWindows}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { exclusions: { excludeAkiWindows: e.target.checked } })}
              />
              Exclude AKI windows from trend fits
            </label>
            <label className="sidebar-field">AKI exclusion window
              <input
                type="number"
                min={0}
                aria-label="AKI exclusion window days"
                value={primaryFitConfig.exclusions.akiExclusionDays}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { exclusions: { akiExclusionDays: Math.max(0, Number(e.target.value) || 0) } })}
              />
            </label>
            <div className="sidebar-subgroup-title">Aggregation</div>
            <label className="sidebar-field">Time balancing
              <select
                aria-label="Time balancing"
                value={primaryFitConfig.timeBalancing}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { timeBalancing: e.target.value as TimeBalancing })}
              >
                <option value="raw">Raw</option>
                <option value="monthly-median">Monthly median</option>
                <option value="quarterly-median">Quarterly median</option>
              </select>
            </label>
            <div className="sidebar-subgroup-title">Fit model</div>
            <label className="sidebar-field">Model
              <select
                aria-label="Fit model"
                value={primaryFitConfig.fitModel}
                onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { fitModel: e.target.value as FitModel })}
              >
                <option value="none">None</option>
                <option value="ols">OLS</option>
                <option value="theil-sen">Theil-Sen</option>
                <option value="rolling-ols">Rolling OLS</option>
                <option value="segmented-ols">Segmented OLS</option>
              </select>
            </label>
            <div className="sidebar-control-frame" role="group" aria-label="Cohort mixed model">
              <div className="sidebar-control-frame-title">
                <span>Cohort mixed model</span>
                <span className="experimental-badge">Experimental</span>
              </div>
              <button
                type="button"
                className="sidebar-action"
                disabled={!hasActiveEgfrCohortSeries}
                onClick={() => setMixedModelDialogOpen(true)}
              >
                Open eGFR cohort model
              </button>
              {!hasActiveEgfrCohortSeries && (
                <p className="sidebar-note">Select an eGFR cohort series to enable the experimental model.</p>
              )}
              <label className="sidebar-check">
                <input
                  type="checkbox"
                  aria-label="Cohort model line"
                  checked={hasCohortMixedModelResult && showCohortMixedModelLine}
                  disabled={!hasCohortMixedModelResult}
                  onChange={(e) => setShowCohortMixedModelLine(e.currentTarget.checked)}
                />
                Cohort model line
              </label>
            </div>
            <div className="sidebar-subgroup-title">Endpoints</div>
            {([
              ['percentDecline', 'Percent eGFR decline'],
              ['observedCkdG5', 'Observed CKD G5'],
              ['projectedAgeToCkdG5', 'Projected age to CKD G5'],
            ] as Array<[keyof FitConfig['endpoints'], string]>).map(([key, label]) => (
              <label className="sidebar-check" key={key}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={primaryFitConfig.endpoints[key]}
                  onChange={(e) => setSeriesFitConfig(activeFitSeriesIndex, { endpoints: { [key]: e.target.checked } })}
                />
                {label}
              </label>
            ))}
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
            <h3 className="sidebar-group-title">Events</h3>
            <label className="sidebar-check">
              <input type="checkbox" aria-label="Show events on plot" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
              Show on plot
            </label>
            <label className="sidebar-field">Events
              <input type="file" aria-label="Events" accept=".xlsx,.csv" onChange={onEventFile} />
            </label>
            {eventNote && <p className="sidebar-note sidebar-status" role="status" aria-live="polite">{eventNote}</p>}
            {events.length > 0 && <EventTable events={events} fitConfig={primaryFitConfig} />}
            {rejectedEvents.length > 0 && <RejectedEventTable rejected={rejectedEvents} />}
          </section>
        </div>
      )}
    </aside>
  )
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function EventTable({ events, fitConfig }: { events: ClinicalEvent[]; fitConfig: FitConfig }) {
  const sorted = [...events].sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.date.getTime() - b.date.getTime())
  const placeholder = '-'
  return (
    <div className="event-table-scroll">
      <table className="event-table" aria-label="Loaded events">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Date</th>
            <th>Type</th>
            <th>Title</th>
            <th>Intent</th>
            <th>End</th>
            <th>Effect</th>
            <th>Warning</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((event, index) => (
            <tr key={`${event.patientId}-${event.date.getTime()}-${index}`}>
              <td>{event.patientId}</td>
              <td>{event.date.toISOString().slice(0, 10)}</td>
              <td>{event.type}</td>
              <td>{event.title}</td>
              <td>{event.intent ?? placeholder}</td>
              <td>{event.endDate?.toISOString().slice(0, 10) ?? placeholder}</td>
              <td>{configuredEventEffectLabel(event, fitConfig)}</td>
              <td>{event.warning || placeholder}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function configuredEventEffectLabel(event: ClinicalEvent, fitConfig: FitConfig): string {
  const effect = effectForEvent(event)
  if (event.type === 'other') return effect.label
  if (eventEffectActive(event, fitConfig.censoring)) return effect.label
  if (effect.effect === 'warning_no_exclusion') return effect.label
  return 'display only for selected series'
}

function eventEffectActive(event: ClinicalEvent, censoring: FitConfig['censoring']): boolean {
  if (event.type === 'kidney_transplant') return censoring.censorAfterKidneyTransplant
  if (event.type !== 'dialysis') return false
  if (event.intent === 'chronic') return censoring.censorAfterChronicDialysis
  if (event.intent === 'acute') return censoring.excludeAcuteDialysisPeriods && event.endDate !== null
  if (event.intent === 'unknown') {
    if (censoring.unknownDialysisPolicy === 'censor-from-start') return true
    return censoring.unknownDialysisPolicy === 'exclude-dated-interval' && event.endDate !== null
  }
  return false
}

function RejectedEventTable({ rejected }: { rejected: RejectedClinicalEvent[] }) {
  const placeholder = '-'
  return (
    <table className="event-table" aria-label="Rejected events">
      <thead>
        <tr>
          <th>Patient</th>
          <th>Date</th>
          <th>Type</th>
          <th>Title</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rejected.map(({ event, reason }, index) => (
          <tr key={`${event.patientId ?? 'unknown'}-${event.date?.getTime() ?? 'nodate'}-${index}`}>
            <td>{event.patientId ?? placeholder}</td>
            <td>{event.date?.toISOString().slice(0, 10) ?? placeholder}</td>
            <td>{event.type || placeholder}</td>
            <td>{event.title || placeholder}</td>
            <td>{reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
