import { useEffect, useMemo, useRef, useState } from 'react'
import { composedNotice, useAppStore } from './state/store'
import { patientIdKey, type PatientId, type Sex } from '../core/types'
import { resolveDemographics } from '../core/demographics/resolve'
import { conflictText } from './labels/conflictText'
import { computeAnalysisResult } from '../core/analysis/registry'
import { isUnrecognisedSex } from '../core/demographics/sex'
import { applySeriesMerges, mergedSeriesKeys, seriesRefKey } from '../core/analysis/seriesMerge'
import { mergeUnitConversion, seriesMerges } from '../core/domains/nephrology/seriesMergeModule'
import { WorkspaceSeriesMerge } from './WorkspaceSeriesMerge'
import { creatinineSourceOptions, defaultCreatinineSource, importedCreatinineSourceOptions, egfrFormulaSwitches, HEIGHT_MATCH_DAYS, implausiblyHighEgfrCount, patientCreatinineSources, patientHeights, type FormulaName, type PaediatricRule, type Source } from '../core/domains/nephrology/egfr/series'
import { IMPLAUSIBLE_CREATININE_ABOVE_MGDL, IMPLAUSIBLE_EGFR_ABOVE } from '../core/domains/nephrology/constants'
import { COMPUTED_EGFR_UNIT, computedEgfrName, DEFAULT_PAEDIATRIC_RULE, isSerumCreatinineSeries, PAEDIATRIC_RULE_LABELS, type RowEgfrFormula } from '../core/domains/nephrology/analytes'
import { egfrFormulaLabel, paediatricRuleLabel, rowEgfrFormulaLabel } from './labels/egfrLabels'
import { implausiblyHighCreatinineCount, nonPositiveCreatinineCount, sameDayUnorderedCreatinine } from '../core/domains/nephrology/aki/akiAware'
import { describeEventRejection, normalizeClinicalEventsWithNotes, validateClinicalEvents } from '../core/events/events'
import { describeAttributeRejection, normalizePatientAttributes, validatePatientAttributes } from '../core/attributes/attributes'
import { readWorkbook } from '../io/readWorkbook'
import { attributeDiagnostics, eventDiagnostics, type ImportDiagnostic } from '../io/loadDataset'
import { importWorkspaceFile, useWorkspaceData } from './workspace-data'
import { sexLabel } from './workspace-labels'
import './data-workspace.css'
import { WorkspaceStorageControls } from './WorkspaceStorageControls'
import { WorkspaceEventTables } from './WorkspaceEventTables'
import { WorkspaceDataOverview } from './WorkspaceDataOverview'
import { AffectedRows, WorkspaceImportDiagnostics } from './WorkspaceImportDiagnostics'
import { dataChecks } from './import-diagnostics'
import { egfrGapContext, egfrGapReason, egfrGapText, heightSourceText } from './egfr-gaps'
import { t, tp, useLanguage } from '../i18n'
import { importMessage } from './labels/importMessages'

/** "Kreatinin (mg/dl)": parameter name with its unit. */
const sourceLabel = ([name, unit]: Source) => `${name} (${unit})`

export function DataWorkspace({ onBrowse }: { onBrowse: (patientId?: PatientId) => void }) {
  const data = useWorkspaceData()
  const busy = useAppStore(s => s.busy)
  const notice = useAppStore(s => s.notice)
  // Memoised texts below (the data checks) are composed in the interface language.
  const language = useLanguage()
  const importDiagnostics = useAppStore(s => s.importDiagnostics)
  const [formula, setFormula] = useState<FormulaName | 'off'>(data.analysisSettings.egfr.formula)
  const [sourceKey, setSourceKey] = useState(JSON.stringify(data.analysisSettings.egfr.source))
  const [paediatric, setPaediatric] = useState<PaediatricRule>(data.analysisSettings.egfr.paediatric ?? DEFAULT_PAEDIATRIC_RULE)
  const [editing, setEditing] = useState<PatientId | null>(null)
  const [sex, setSex] = useState('')
  const [age, setAge] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  // The imported rows with the merged series (issue #68): a merged creatinine
  // series is offered as a source, never chosen automatically.
  const mergedRows = useMemo(() => applySeriesMerges(data.rawRows, seriesMerges(data.analysisSettings), mergeUnitConversion).rows, [data.rawRows, data.analysisSettings])
  const options = useMemo(() => creatinineSourceOptions(mergedRows), [mergedRows])
  const automatic = defaultCreatinineSource(importedCreatinineSourceOptions(data.rawRows))
  const source: Source | null = sourceKey === 'null' ? automatic : JSON.parse(sourceKey)
  const resolution = useMemo(() => resolveDemographics(data.rawRows, useAppStore.getState().patientAttributes, data.manualDemographics), [data.rawRows, data.patientAttributes, data.manualDemographics])
  const preview = useMemo(() => computeAnalysisResult({ rows: data.rawRows, events: data.events, patientAttributes: useAppStore.getState().patientAttributes, manualDemographics: data.manualDemographics, settings: { ...data.analysisSettings, egfr: { formula, source, paediatric } } }), [data.rawRows, data.events, data.patientAttributes, data.manualDemographics, data.analysisSettings, formula, sourceKey, options, paediatric])
  // Computed eGFR rows only: merged rows (issue #68) are derived too, but not computed.
  const computed = preview.rows.filter(r => r.sourceSeries)
  const outputName = formula === 'off' ? null : computedEgfrName(formula)
  const outputCollision = outputName !== null && data.rawRows.some(r => r.bezeichnung === outputName && r.einheit === COMPUTED_EGFR_UNIT)
  // Each patient's one series (issue #65): the selected source, or the patient's µmol/l fallback.
  const perPatient = useMemo(() => source && isSerumCreatinineSeries(source[0], source[1]) ? patientCreatinineSources(mergedRows, source) : null, [mergedRows, sourceKey, options])
  const usesRow = (r: { patientId: PatientId; bezeichnung: string | null; einheit: string | null }) => {
    const own = perPatient ? perPatient.get(patientIdKey(r.patientId))?.source : source
    return !!own && r.bezeichnung === own[0] && r.einheit === own[1]
  }
  const resolvedMergedRows = useMemo(() => applySeriesMerges(resolution.rows, seriesMerges(data.analysisSettings), mergeUnitConversion).rows, [resolution.rows, data.analysisSettings])
  const candidates = resolvedMergedRows.filter(usesRow)
  // Eligible serum-creatinine values that no patient's eGFR reads: series are never merged.
  const unusedSources = source ? options.map(o => [o, mergedRows.filter(r => r.bezeichnung === o[0] && r.einheit === o[1] && !usesRow(r)).length] as const)
    .filter(([, n]) => n > 0).map(([o, n]) => `${sourceLabel(o)}, ${tp('{n} value', '{n} values', n)}`) : []
  const perPatientValues = [...(perPatient?.values() ?? [])]
  const fallbackSources = [...new Set(perPatientValues.filter(p => p.fallback).map(p => JSON.stringify(p.source)))].map(key => {
    const pair = JSON.parse(key) as Source
    return t('{source} for {patients}', { source: sourceLabel(pair), patients: tp('{n} patient', '{n} patients', perPatientValues.filter(p => p.fallback && JSON.stringify(p.source) === key).length) })
  })
  const otherMgdlPatients = perPatientValues.filter(p => p.gap === 'other_mgdl').length
  const severalUmollPatients = perPatientValues.filter(p => p.gap === 'several_umoll').length
  const relevantDiverseSex = formula !== 'off' && computed.some(r => r.patientSex === 'd' && r.egfrFormula !== 'schwartz-bedside')
  // The raw spelling is quoted, but whether a row is still unresolved comes from
  // the resolved sex: attributes or a manual entry can supply it.
  const unreadableSex = [...new Set(candidates.filter(r => r.patientSex === null && isUnrecognisedSex(r.patientSexRaw)).map(r => r.patientSexRaw as string))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const gapContext = useMemo(() => egfrGapContext({ formula, paediatric }, data.rawRows), [formula, paediatric, data.rawRows])
  const reasons = new Map<string, number>()
  for (const r of candidates) {
    const code = egfrGapReason(r, gapContext)
    const reason = code && egfrGapText(code)
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }
  // Issue #66: the equation of each previewed value, the heights found, and the patients whose equation changes.
  const usesHeight = formula === 'ckid-u25-ekfc' || (formula !== 'off' && paediatric !== 'off')
  const heights = useMemo(() => patientHeights(data.rawRows), [data.rawRows])
  const heightValues = [...heights.values()].reduce((sum, points) => sum + points.length, 0)
  const rowFormulas = [...computed.reduce((counts, r) => r.egfrFormula ? counts.set(r.egfrFormula, (counts.get(r.egfrFormula) ?? 0) + 1) : counts, new Map<RowEgfrFormula, number>())]
  const switches = egfrFormulaSwitches(computed)
  const switchKinds = [...new Set([...switches.values()].flat().map(change => `${rowEgfrFormulaLabel(change.from)} → ${rowEgfrFormulaLabel(change.to)}`))]
  useEffect(() => {
    setFormula(data.analysisSettings.egfr.formula)
    setSourceKey(JSON.stringify(data.analysisSettings.egfr.source))
    setPaediatric(data.analysisSettings.egfr.paediatric ?? DEFAULT_PAEDIATRIC_RULE)
  }, [data.rawRows, data.analysisSettings.egfr.formula, data.analysisSettings.egfr.source, data.analysisSettings.egfr.paediatric])
  useEffect(() => { if (editing !== null) dialog.current?.showModal() }, [editing])
  useEffect(() => { setEditing(null); dialog.current?.close() }, [data.rawRows])

  async function supplementary(file: File, kind: 'events' | 'attributes') {
    const store = useAppStore.getState()
    const originalRows = store.rows
    useAppStore.setState({ busy: true, notice: null })
    try {
      const raw = readWorkbook(await file.arrayBuffer())
      if (useAppStore.getState().rows !== originalRows) throw new Error(t('Dataset replaced during import. Please import the file again.'))
      // A file rejected as a whole leaves the loaded table and its findings as they were; its
      // rejected rows are listed beside them under "<file> (rejected upload)", even when the
      // file has the name of the loaded one. A further failed upload of that name replaces
      // only those rows (2026-11-22).
      const rejectedSheet = `${file.name} (rejected upload)`
      const listRejected = (diagnostics: ImportDiagnostic[]) => store.setImportDiagnostics(kind, [
        ...useAppStore.getState().importDiagnostics.filter(d => d.source === kind && d.sheet !== rejectedSheet), ...diagnostics])
      if (kind === 'events') {
        const normalized = normalizeClinicalEventsWithNotes(raw)
        const validation = validateClinicalEvents(normalized.events, originalRows)
        const { valid, rejected } = validation
        if (!valid.length) {
          listRejected(eventDiagnostics(rejectedSheet, normalized.dateReads, validation, normalized.notes))
          throw new Error(`${t('No usable events.')} ${[...new Set(rejected.map(describeEventRejection))].join(' ')}`)
        }
        store.setEvents(valid)
        useAppStore.setState({ rejectedEvents: rejected })
        store.setImportDiagnostics('events', eventDiagnostics(file.name, normalized.dateReads, validation, normalized.notes))
        store.setNotice(composedNotice('info', () => `${tp('{n} event imported;', '{n} events imported;', valid.length)} ${tp('{n} row rejected.', '{n} rows rejected.', rejected.length)}`))
      } else {
        const validation = validatePatientAttributes(normalizePatientAttributes(raw), originalRows)
        const { byPatient, valid, rejected } = validation
        if (!valid.length) {
          listRejected(attributeDiagnostics(rejectedSheet, validation))
          throw new Error(`${t('No usable attributes.')} ${[...new Set(rejected.map(describeAttributeRejection))].join(' ')}`)
        }
        store.setPatientAttributes(byPatient)
        store.setImportDiagnostics('attributes', attributeDiagnostics(file.name, validation))
        store.setNotice(composedNotice('info', () => `${tp('{n} attribute row imported;', '{n} attribute rows imported;', valid.length)} ${tp('{n} row rejected.', '{n} rows rejected.', rejected.length)}`))
      }
    } catch (error) {
      // The listed rejections belonged to the previous file; the kept events have none.
      if (kind === 'events') useAppStore.setState({ rejectedEvents: [] })
      store.setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    }
    finally { useAppStore.setState({ busy: false }) }
  }
  function edit(id: PatientId) {
    const manual = data.manualDemographics[patientIdKey(id)]
    setSex(manual?.sex ?? ''); setAge(manual?.age === undefined ? '' : String(manual.age)); setEditing(id)
  }
  const referenceDate = editing === null ? null : data.rawRows.filter(r => r.patientId === editing && r.labDatum).map(r => r.labDatum!).sort((a, b) => a.getTime() - b.getTime())[0]
  // The selection is a draft: only "Apply calculation" writes it into the analysis.
  const active = data.analysisSettings.egfr
  const formulaLabel = (f: FormulaName | 'off') => f === 'off' ? t('Off') : egfrFormulaLabel(f)
  const unapplied = formula !== active.formula ? t('{selected} is selected, but the analysis uses {active}.', { selected: formulaLabel(formula), active: formulaLabel(active.formula) })
    : formula !== 'off' && sourceKey !== JSON.stringify(active.source) ? t('The selected creatinine source is not the one the analysis uses ({formula}).', { formula: formulaLabel(active.formula) })
    : formula !== 'off' && formula !== 'ckid-u25-ekfc' && paediatric !== (active.paediatric ?? DEFAULT_PAEDIATRIC_RULE) ? t('The selected rule under 18 ({selected}) is not the one the analysis uses ({active}).', { selected: paediatricRuleLabel(paediatric), active: paediatricRuleLabel(active.paediatric ?? DEFAULT_PAEDIATRIC_RULE) }) : null
  const apply = () => { if (outputCollision) return; const store = useAppStore.getState(); store.setEgfrSource(source); store.setEgfrPaediatric(paediatric); store.setEgfrFormula(formula) }
  // Dated numeric values and their period per patient, across all imported parameters.
  const coverage = useMemo(() => {
    const byPatient = new Map<PatientId, { values: number; first: number; last: number }>()
    for (const r of data.rawRows) {
      if (!r.labDatum || r.wertNum === null) continue
      const time = r.labDatum.getTime()
      const entry = byPatient.get(r.patientId)
      if (!entry) byPatient.set(r.patientId, { values: 1, first: time, last: time })
      else { entry.values++; entry.first = Math.min(entry.first, time); entry.last = Math.max(entry.last, time) }
    }
    return byPatient
  }, [data.rawRows])
  const isoDay = (time: number | undefined) => time === undefined ? '–' : new Date(time).toISOString().slice(0, 10)
  const missingSex = data.patients.filter(p => !p.attributes.sex).length
  const implausibleCreatinine = useMemo(() => nonPositiveCreatinineCount(data.rawRows), [data.rawRows])
  const highCreatinine = useMemo(() => implausiblyHighCreatinineCount(data.rawRows), [data.rawRows])
  const unorderedCreatinine = useMemo(() => sameDayUnorderedCreatinine(data.rawRows), [data.rawRows])
  const checks = useMemo(() => dataChecks(data.rawRows), [data.rawRows, language])
  const checkRows = (id: (typeof checks)[number]['id'], summary: string) => {
    const check = checks.find(c => c.id === id)
    return check ? <AffectedRows rows={check.rows} summary={summary} /> : null
  }
  const highEgfr = implausiblyHighEgfrCount(computed)
  const activeComputed = data.rows.filter(r => r.sourceSeries).length
  const mergedKeys = mergedSeriesKeys(seriesMerges(data.analysisSettings))
  // A chosen merged source that no merge produces any more (removed, or not formed).
  const missingMergedSource = source !== null && isSerumCreatinineSeries(source[0], source[1]) && !options.some(o => o[0] === source[0] && o[1] === source[1]) && sourceKey !== 'null'
  const missingAge = data.patients.filter(p => p.baselineAge === null).length
  return <div className="data-workspace stack">
    <header className="page-heading"><div><p className="eyebrow">{t('Data preparation')}</p><h1>{t('Prepare data')}</h1><p className="muted">{t('Import lab values, review patient details and inspect calculations.')}</p></div><div className="data-heading-actions">{unapplied && data.rawRows.length > 0 && <span className="data-unapplied">{t('eGFR preview not applied')} <button type="button" disabled={outputCollision} onClick={apply}>{t('Apply')}</button></span>}<button disabled={!data.rawRows.length} onClick={() => onBrowse()}>{t('Open trajectories →')}</button></div></header>
    <section className="card"><h2>{t('1. Import a dataset')}</h2><p>{t('CSV or Excel; sheets containing lab values, events and attributes are read together. Data is processed in your browser.')}</p>
      <p className="muted" data-testid="pseudonymisation-note">{t('Nothing is pseudonymised: patient IDs appear as imported on screen, in the copy saved on this device, in exports and in export file names, and exports name the imported file. Use pseudonymous IDs.')}</p>
      <div className="data-import-row"><label className="field">{t('Lab values / workbook')}<input aria-label={t('Import lab values')} type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importWorkspaceFile(file) }} /></label><span className="muted" aria-hidden="true">{t('or')}</span><button disabled={busy} onClick={() => void importWorkspaceFile()}>{t('Load demo data')}</button></div>
      <details className="data-downloads"><summary>{t('Templates and example files')}</summary>
        <div className="data-download-row" role="group" aria-label={t('Templates')}><span className="data-download-label" aria-hidden="true">{t('Empty templates')}</span>{['labs', 'events', 'attributes'].map((name, i) => <a key={name} className="data-download" download={`template_${name}.csv`} href={`${import.meta.env.BASE_URL}template_${name}.csv`}><span aria-hidden="true">↓</span>{[t('Lab template'), t('Event template'), t('Attribute template')][i]}</a>)}</div>
        <div className="data-download-row" role="group" aria-label={t('Demo files')}><span className="data-download-label" aria-hidden="true">{t('Example files')}</span>{([['test_labs.xlsx', t('Demo workbook')], ['test_events.csv', t('Demo events')], ['test_attributes.csv', t('Demo attributes')]] as const).map(([file, label]) => <a key={file} className="data-download" download={file} href={`${import.meta.env.BASE_URL}${file}`}><span aria-hidden="true">↓</span>{label}</a>)}<span className="muted">{t('Synthetic example files in the expected format.')}</span></div>
        <p className="muted">{t('Lab template: one row per measurement.')} <code>patientId</code> {t('is not pseudonymised: it is shown, saved and exported as imported, so enter a pseudonymous ID.')} <code>labDate</code> {t('as 2024-01-31 or 31.01.2024;')} <code>value</code> {t('with a decimal point or comma, “<0.3” is read as a bound;')} <code>sex</code> {t('as m, w, d or male, female, diverse;')} <code>ageAtLab</code> {t('in years, or add a')} <code>birthDate</code> {t('column instead.')} <code>loinc</code>, <code>sex</code> {t('and the age columns are optional.')} <a href="#methods/data">{t('Import details')}</a></p>
        <p className="muted">{t('Event template: one row per event.')} <code>type</code> {t('is exactly')} <code>kidney_transplant</code>, <code>dialysis</code>, <code>other</code> {t('or')} <code>death</code> {t('(also written')} <code>deceased</code>, <code>Tod</code> {t('or')} <code>verstorben</code>{t('); any other word rejects the row.')} <code>intent</code> (<code>chronic</code>, <code>acute</code> {t('or')} <code>unknown</code>{t(') is allowed for dialysis only.')} <code>date</code> {t('and the optional')} <code>endDate</code> {t('as 2024-01-31 or 31.01.2024; a transplant or a death has no end date.')} <code>other</code> {t('events, such as the start of a therapy, are shown in charts and change no calculation. “Demo events” is a filled example.')}</p>
        <p className="muted">{t('The demo workbook mirrors a German laboratory export: German test names such as “Kreatinin”, sex codes “w” and “m”, and decimal commas. English test names such as “Creatinine”, “male” and “female”, and decimal points are read the same way.')}</p>
      </details>
      {busy && <p role="status">{t('Checking file …')}</p>}
      {notice && <div className={`notice ${notice.kind === 'error' ? 'amber' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}><p>{notice.compose ? notice.compose() : importMessage(notice.text)}</p></div>}
      <WorkspaceImportDiagnostics diagnostics={importDiagnostics} rows={data.rawRows} />
      {data.rawRows.length > 0 && <><p><strong>{data.fileName ?? t('Dataset')}</strong></p><div className="data-metrics"><span><strong>{data.patients.length}</strong> {t('patients')}</span><span><strong>{data.rawRows.length}</strong> {t('imported values')}</span><span><strong>{data.parameters.filter(p => !p.derived).length}</strong> {t('Parameter–unit combinations')}</span><span><strong>{data.events.length}</strong> {t('events')}</span></div>
        <p className="muted">{[tp('{n} value without a date', '{n} values without a date', data.rawRows.filter(r => !r.labDatum).length), tp('{n} value without a numeric measurement', '{n} values without a numeric measurement', data.rawRows.filter(r => r.wertNum === null).length), tp('{n} value recorded as a bound (< or >)', '{n} values recorded as a bound (< or >)', data.rawRows.filter(r => r.wertOperator === '<' || r.wertOperator === '>').length), tp('{n} value without a parameter name', '{n} values without a parameter name', data.rawRows.filter(r => !r.bezeichnung).length)].join(', ')}</p>
        {checkRows('no_date', t('Show the values without a date'))}{checkRows('no_number', t('Show the values without a numeric measurement'))}
        <div className="data-import-grid">{(['events', 'attributes'] as const).map(kind => <label className="field" key={kind}>{kind === 'events' ? t('Replace events') : t('Replace attributes')}<input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void supplementary(f, kind) }} /></label>)}</div><p className="muted">{t('Supplementary files replace the corresponding table. Attributes: one row per patientId; additional columns can be freely named.')}</p><WorkspaceEventTables /><WorkspaceDataOverview data={data} onBrowse={onBrowse} /></>}
      <WorkspaceStorageControls hasData={data.rawRows.length > 0} />
    </section>
    {data.rawRows.length > 0 && <><section className="card" id="data-demographics"><h2>{t('2. Demographics and data quality')}</h2><p>{[tp('{n} patient without resolved sex', '{n} patients without resolved sex', missingSex), t('{n} without age at the first lab date', { n: missingAge }), tp('{n} conflict', '{n} conflicts', resolution.conflicts.length)].join(', ')}</p>
      {implausibleCreatinine > 0 && <p className="notice amber" role="status">{tp('{n} serum creatinine value of zero or less: not plausible, so not used for AKI detection or eGFR.', '{n} serum creatinine values of zero or less: not plausible, so not used for AKI detection or eGFR.', implausibleCreatinine)}</p>}
      {checkRows('creatinine_non_positive', t('Show the creatinine values of zero or less'))}
      {highCreatinine > 0 && <p className="notice amber" role="status">{tp('{n} serum creatinine value above {limit} mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.', '{n} serum creatinine values above {limit} mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.', highCreatinine, { limit: IMPLAUSIBLE_CREATININE_ABOVE_MGDL })}</p>}
      {checkRows('creatinine_high', t('Show the creatinine values above {limit} mg/dl', { limit: IMPLAUSIBLE_CREATININE_ABOVE_MGDL }))}
      {unorderedCreatinine.patientDays > 0 && <p className="notice amber" role="status">{t('{days} in {patients} with several serum creatinine values whose order within the day is unknown (no time of day, or the same time): AKI detection compares these values with earlier values only, not with each other.', { days: tp('{n} patient-day', '{n} patient-days', unorderedCreatinine.patientDays), patients: tp('{n} patient', '{n} patients', unorderedCreatinine.patients) })}</p>}
      {!!resolution.conflicts.length && <details><summary>{t('Conflicts and their resolution')}</summary><ul>{resolution.conflicts.map((c, i) => <li key={i}>{conflictText(c)}</li>)}</ul></details>}
      <details><summary>{t('Review and edit patients ({patients})', { patients: data.patients.length })}</summary><div className="table-scroll"><table><thead><tr><th>{t('Patient')}</th><th>{t('Sex')}</th><th>{t('Age at first measurement')}</th><th>{t('Dated numeric values')}</th><th>{t('First date')}</th><th>{t('Last date')}</th><th>{t('Quality')}</th><th>{t('Action')}</th></tr></thead><tbody>{data.patients.map(p => <tr key={JSON.stringify(p.id)}><th><button onClick={() => onBrowse(p.id)}>{p.label}</button></th><td>{sexLabel(p.attributes.sex)}</td><td>{p.baselineAge ?? t('Missing')}</td><td>{coverage.get(p.id)?.values ?? 0}</td><td>{isoDay(coverage.get(p.id)?.first)}</td><td>{isoDay(coverage.get(p.id)?.last)}</td><td>{resolution.conflicts.filter(c => c.patientId === p.id).length ? t('Conflict') : !p.attributes.sex || p.baselineAge === null ? t('Incomplete') : t('Complete')}{data.manualDemographics[patientIdKey(p.id)] && Object.keys(data.manualDemographics[patientIdKey(p.id)]).length > 0 ? ` ${t('(manual)')}` : ''}</td><td><button aria-label={t('Edit demographics: {label}', { label: p.label })} onClick={() => edit(p.id)}>{t('Edit')}</button></td></tr>)}</tbody></table></div></details>
    </section><section className="card" id="data-egfr"><h2>{t('3. Derive eGFR')}</h2><a href="#methods/data/egfr">{t('eGFR prerequisites and calculation details')}</a><p>{t('Preview before applying. Imported measurements are preserved; computed values appear as separate parameters.')}</p><div className="data-import-grid"><label className="field">{t('eGFR formula')}<select value={formula} onChange={e => setFormula(e.target.value as FormulaName | 'off')}><option value="off">{t('Off')}</option><option value="ckd-epi-2021">CKD-EPI 2021</option><option value="ckd-epi-2009">{t('CKD-EPI 2009 (race-free)')}</option><option value="mdrd-4">MDRD-4</option><option value="ekfc-2021">EKFC 2021</option><option value="ckid-u25-ekfc">{t('CKiD U25 / EKFC (full age range)')}</option></select></label><label className="field">{t('Under 18 years')}<select value={paediatric} disabled={formula === 'off' || formula === 'ckid-u25-ekfc'} onChange={e => setPaediatric(e.target.value as PaediatricRule)}>{(Object.keys(PAEDIATRIC_RULE_LABELS) as PaediatricRule[]).map(rule => <option key={rule} value={rule}>{paediatricRuleLabel(rule)}</option>)}</select></label><label className="field">{t('Creatinine source')}<select value={sourceKey} onChange={e => setSourceKey(e.target.value)}><option value="null">{automatic ? t('Automatic: {source}', { source: sourceLabel(automatic) }) : t('Automatic: no eligible source')}</option>{options.map(s => <option key={JSON.stringify(s)} value={JSON.stringify(s)}>{sourceLabel(s)}{mergedKeys.has(seriesRefKey({ bezeichnung: s[0], einheit: s[1] })) ? ` – ${t('merged series')}` : ''}</option>)}</select></label></div>
      <p role="status">{tp('{n} computed value in preview', '{n} computed values in preview', computed.length)}</p>{highEgfr > 0 && <p className="notice amber" role="status">{tp('{n} computed eGFR value above {limit} mL/min/1.73 m²: not plausible, check the creatinine source and its unit. The values are used unchanged.', '{n} computed eGFR values above {limit} mL/min/1.73 m²: not plausible, check the creatinine source and its unit. The values are used unchanged.', highEgfr, { limit: IMPLAUSIBLE_EGFR_ABOVE })}</p>}<p className="muted">{t('Active: {formula}, {values}', { formula: formulaLabel(data.analysisSettings.egfr.formula), values: tp('{n} computed value', '{n} computed values', activeComputed) })}</p>
      {formula !== 'off' && <>{!source && <p>{t('No eligible serum creatinine source (mg/dl or µmol/l) is available.')}</p>}{missingMergedSource && <p className="notice amber" role="status">{t('The selected creatinine source {sourceLabel} is not in this dataset, so no eGFR is computed from it. Choose another source or Automatic.', { sourceLabel: sourceLabel(source!) })}</p>}{source && !isSerumCreatinineSeries(source[0], source[1]) && <p className="notice amber" role="status">{t('The selected creatinine source {sourceLabel} is not serum creatinine (another material such as urine or a body fluid, or another unit), so no eGFR is computed from it. Choose another source or Automatic.', { sourceLabel: sourceLabel(source) })}</p>}<p>{tp('{n} source value, {failed} cannot be computed', '{n} source values, {failed} cannot be computed', candidates.length, { failed: candidates.length - computed.length })}</p>{fallbackSources.length > 0 && <p role="status">{t('Patients without serum creatinine in mg/dl use their µmol/l series: {value}.', { value: fallbackSources.join('; ') })}</p>}{unusedSources.length > 0 && <p className="notice amber" role="status">{t("Not used for this eGFR: {value}. Each patient's eGFR reads one series: the selected source, or, for a patient without serum creatinine in mg/dl, that patient's µmol/l series. Series are not merged.", { value: unusedSources.join('; ') })}</p>}{otherMgdlPatients > 0 && <p className="notice amber" role="status">{tp('{n} patient without the selected source has serum creatinine in mg/dl under another name only: no eGFR, and no µmol/l fallback.', '{n} patients without the selected source have serum creatinine in mg/dl under another name only: no eGFR, and no µmol/l fallback.', otherMgdlPatients)}</p>}{severalUmollPatients > 0 && <p className="notice amber" role="status">{tp('{n} patient without serum creatinine in mg/dl has several µmol/l series, none under the name of the selected source: no eGFR.', '{n} patients without serum creatinine in mg/dl have several µmol/l series, none under the name of the selected source: no eGFR.', severalUmollPatients)}</p>}<ul>{[...reasons].map(([reason, n]) => <li key={reason}>{n}: {reason}</li>)}</ul>{unreadableSex.length > 0 && <p className="notice amber" role="status">{tp('Unreadable sex value: {values}. No eGFR is computed for those rows. Accepted: m / male / männlich, w / f / female / weiblich, d / divers. Correct the source file or enter the sex under Review and edit patients.', 'Unreadable sex values: {values}. No eGFR is computed for those rows. Accepted: m / male / männlich, w / f / female / weiblich, d / divers. Correct the source file or enter the sex under Review and edit patients.', unreadableSex.length, { values: unreadableSex.slice(0, 6).map(value => `"${value}"`).join(', ') + (unreadableSex.length > 6 ? ` ${t('and {n} more', { n: unreadableSex.length - 6 })}` : '') })}</p>}<p className="muted" data-testid="egfr-age-rule">{formula === 'ckid-u25-ekfc'
        ? t('From 2 to 25 years CKiD U25 where a height is available, otherwise EKFC 2021; EKFC 2021 from 26 years. This also changes adults, unlike the adult formulas. No eGFR under 2 years.')
        : paediatric === 'off' ? t('{formula} for ages 18 and over; no eGFR under 18.', { formula: egfrFormulaLabel(formula) })
        : paediatric === 'schwartz-bedside' ? t('{formula} for ages 18 and over; from 2 to 17 years bedside Schwartz where a height is available, otherwise no value. No eGFR under 2 years.', { formula: egfrFormulaLabel(formula) })
        : t('{formula} for ages 18 and over; from 2 to 17 years CKiD U25 where a height is available, otherwise EKFC 2021. No eGFR under 2 years.', { formula: egfrFormulaLabel(formula) })}</p>
      {usesHeight && <p className="muted" data-testid="egfr-heights">{heightValues > 0 ? t('Height: {days} of {patients}. A creatinine value uses a height of the same day, or one interpolated between two heights that are both at most {limit} days away; heights are never extrapolated.', { days: tp('{n} measurement day', '{n} measurement days', heightValues), patients: tp('{n} patient', '{n} patients', heights.size), limit: HEIGHT_MATCH_DAYS }) : t('No height series found, so CKiD U25 and bedside Schwartz are not used.')} {heightSourceText()}</p>}
      {rowFormulas.length > 1 && <p className="muted" data-testid="egfr-row-formulas">{t('Equations in this preview: {value}.', { value: rowFormulas.map(([name, n]) => `${rowEgfrFormulaLabel(name)} ${tp('{n} value', '{n} values', n)}`).join('; ') })}</p>}
      {switches.size > 0 && <p className="notice amber" role="status" data-testid="egfr-formula-switches">{t("{patients} whose eGFR equation changes during follow-up ({value}). Equations differ at a change (Pottel 2019: a mean jump of 23 mL/min/1.73 m² from CKiD to CKD-EPI at 18 years), so a slope fitted across a change carries a notice, and the patient's chart marks the date.", { patients: tp('{n} patient', '{n} patients', switches.size), value: switchKinds.join('; ') })}</p>}{relevantDiverseSex && <p className="muted">{t('For sex code “d”, the selected formula uses its male calculation branch.')}</p>}</>}
      {outputCollision && <p role="alert" className="notice amber">{t('“{outputName}” already exists as an imported parameter ({COMPUTED_EGFR_UNIT}). Calculation is blocked to keep imported and newly computed values separate. Use the imported series with “Off”, choose another formula, or rename the imported series before importing it again. Changing the creatinine source does not change the output name.', { outputName, COMPUTED_EGFR_UNIT })}</p>}
      {unapplied && <p className="notice amber" role="status">{t('Preview not applied: {unapplied} Trajectories, cohort models and exports use the applied calculation only.', { unapplied })}</p>}
      <button className="primary" disabled={outputCollision} onClick={apply}>{t('Apply calculation')}</button>
      {!!computed.length && <details><summary>{tp('Inspect computed value ({n})', 'Inspect computed values ({n})', computed.length)}</summary><div className="table-scroll data-preview-scroll" role="region" aria-label={t('Computed value preview')} tabIndex={0}><table><thead><tr><th>{t('Patient')}</th><th>{t('Date')}</th><th>{t('Parameter')}</th><th>{t('Value')}</th></tr></thead><tbody>{computed.map((r, i) => <tr key={i}><td>{r.patientId}</td><td>{r.labDatum?.toISOString().slice(0, 10)}</td><td>{r.bezeichnung}</td><td>{r.wertOperator === '=' ? '' : r.wertOperator}{r.wertNum?.toFixed(1)} {r.einheit}</td></tr>)}</tbody></table></div></details>}
    </section><WorkspaceSeriesMerge data={data} /></>}
    <dialog ref={dialog} aria-labelledby="demographics-title" onCancel={() => setEditing(null)} onClose={() => setEditing(null)}><form onSubmit={e => { e.preventDefault(); if (editing === null) return; useAppStore.getState().setManualDemographics(editing, { ...(sex ? { sex: sex as Sex } : {}), ...(age !== '' ? { age: Number(age) } : {}) }); dialog.current?.close(); setEditing(null) }}><h2 id="demographics-title">{t('Demographics for patient {id}', { id: String(editing) })}</h2><p>{t('Manual entries take precedence. Leave fields blank to use the imported values again.')}</p><p>{t('Reference date:')} <strong>{referenceDate?.toISOString().slice(0, 10) ?? t('No lab date available')}</strong> {t('(first measurement). Age advances for subsequent measurements.')}</p><label className="field">{t('Sex')}<select value={sex} onChange={e => setSex(e.target.value)}><option value="">{t('Use imported value')}</option><option value="w">{t('Female')}</option><option value="m">{t('Male')}</option><option value="d">{t('Diverse')}</option></select></label><label className="field">{t('Age at reference date')}<input type="number" min="0" max="130" step="1" value={age} onChange={e => setAge(e.target.value)} /></label><div className="actions"><button type="button" onClick={() => { dialog.current?.close(); setEditing(null) }}>{t('Cancel')}</button><button className="primary" type="submit">{t('Save')}</button></div></form></dialog>
  </div>
}
