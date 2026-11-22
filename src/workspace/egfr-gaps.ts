import { patientIdKey, type LabRow } from '../core/types'
import { COMPUTED_EGFR_UNIT, computedEgfrName, DEFAULT_PAEDIATRIC_RULE, normaliseUnit } from '../core/domains/nephrology/analytes'
import { creatinineSourceOptions, defaultCreatinineSource, equationUsesSex, HEIGHT_MATCH_DAYS, isSerumCreatinineSource, patientCreatinineSources, patientHeights, rowEgfrFormula, type EgfrRule, type HeightPoint, type Source } from '../core/domains/nephrology/egfr/series'
import { parameterLabel } from './workspace-labels'
import type { WorkspaceData } from './workspace-data'
import { msg, t, tp, type MessageKey } from '../i18n'

/** Why no eGFR is computed from one row of the creatinine source, in the order
 * the reasons are checked. One rule for the counts on the Data page (first
 * reason per row) and for the note in a patient's empty eGFR cell (every
 * reason per row, so the note names all that has to be supplied). */
export type EgfrGapReason = 'date' | 'value' | 'non_positive' | 'sex' | 'age' | 'under_18' | 'under_2' | 'no_height' | 'height_gap'

type GapRow = Pick<LabRow, 'labDatum' | 'wertNum' | 'patientSex' | 'patientAgeAtLab'> & Partial<Pick<LabRow, 'patientId'>>

/** What the age and height conditions depend on: the formula setting and the
 * patients' measured heights (issue #66). */
export interface EgfrGapContext {
  rule: EgfrRule
  heights: ReadonlyMap<string, readonly HeightPoint[]>
}

/** The rule before issue #66: adult formulas only, so every row under 18 fails. */
const ADULT_ONLY: EgfrGapContext = { rule: { formula: 'ckd-epi-2021', paediatric: 'off' }, heights: new Map() }

/** The context of the analysis settings and rows (heights from `rows`). */
export function egfrGapContext(settings: { formula: string; paediatric?: EgfrRule['paediatric'] }, rows: readonly LabRow[]): EgfrGapContext {
  const formula = (settings.formula === 'off' ? 'ckd-epi-2021' : settings.formula) as EgfrRule['formula']
  return { rule: { formula, paediatric: settings.paediatric ?? DEFAULT_PAEDIATRIC_RULE }, heights: patientHeights(rows) }
}

/** Every condition a source row (with resolved sex and age) fails, in the
 * order they are checked: date, value, sex and age are independent, so a row
 * without sex and age reports both. Sex is not a reason for a row that bedside
 * Schwartz applies to or would apply to with a height (no sex term). The age condition follows the formula
 * setting (`rowEgfrFormula`): under 18 with the under-18 rule "None", under 2
 * otherwise, and, for bedside Schwartz, a missing height. A row without a
 * date reports no height reason. Without a context the rule before issue #66
 * applies (no eGFR under 18). Empty when the row gives an eGFR. */
export function egfrGapReasons(row: GapRow, context: EgfrGapContext = ADULT_ONLY): EgfrGapReason[] {
  const reasons: EgfrGapReason[] = []
  if (!row.labDatum) reasons.push('date')
  if (row.wertNum === null) reasons.push('value')
  else if (!(row.wertNum > 0)) reasons.push('non_positive')
  const heights = row.labDatum && row.patientId !== undefined ? context.heights.get(patientIdKey(row.patientId)) : undefined
  const chosen = rowEgfrFormula(row.patientAgeAtLab, row.labDatum ?? new Date(0), context.rule, heights)
  // Bedside Schwartz has no sex term: a row it applies to, or would apply to
  // once a height is supplied, needs no sex.
  const schwartz = 'gap' in chosen ? chosen.gap === 'no_height' || chosen.gap === 'height_gap' : !equationUsesSex(chosen.formula)
  if (!row.patientSex && !schwartz) reasons.push('sex')
  if ('gap' in chosen && (row.labDatum || (chosen.gap !== 'no_height' && chosen.gap !== 'height_gap'))) reasons.push(chosen.gap)
  return reasons
}

/** The first reason that keeps a source row from giving an eGFR; null when
 * nothing does. The Data page counts every row once, under this reason. */
export function egfrGapReason(row: GapRow, context?: EgfrGapContext): EgfrGapReason | null {
  return egfrGapReasons(row, context)[0] ?? null
}

/** Wording of the counts on the Data page (message keys; `{days}` is HEIGHT_MATCH_DAYS). */
const EGFR_GAP_MESSAGES: Record<EgfrGapReason, MessageKey> = {
  date: msg('Date missing'),
  value: msg('Numeric value missing'),
  non_positive: msg('Creatinine must be positive'),
  sex: msg('Sex missing or unresolved'),
  age: msg('Age missing'),
  under_18: msg('Age under 18 — adult eGFR formulas do not apply'),
  under_2: msg('Age under 2 — no eGFR formula is used below 2 years'),
  no_height: msg('Height missing — bedside Schwartz needs a height in cm'),
  height_gap: msg('No height within {days} days before and after — bedside Schwartz needs a height'),
}
export const egfrGapText = (reason: EgfrGapReason): string => t(EGFR_GAP_MESSAGES[reason], { days: HEIGHT_MATCH_DAYS })
const SHORT_MESSAGES: Record<EgfrGapReason, MessageKey> = {
  date: msg('date missing'), value: msg('numeric value missing'), non_positive: msg('creatinine not positive'),
  sex: msg('sex missing'), age: msg('age missing'), under_18: msg('age under 18'), under_2: msg('age under 2'),
  no_height: msg('height missing'), height_gap: msg('no height within {days} days before and after'),
}
const short = (reason: EgfrGapReason): string => t(SHORT_MESSAGES[reason], { days: HEIGHT_MATCH_DAYS })
/** Where the height comes from, for the notes that name a height reason. */
export const heightSourceText = () => t('Height is read from a series named Größe, Körpergröße or height in cm, or with LOINC 8302-2.')
const ORDER = Object.keys(EGFR_GAP_MESSAGES) as EgfrGapReason[]

export interface MissingEgfrNote {
  /** Short form for the cell: the first reason, e.g. "No eGFR: sex missing",
   * or "No eGFR: sex and age missing" when both have to be entered. */
  label: string
  /** The sentence for the hint and the patient view. */
  text: string
}

/** The parameter key of the computed eGFR, or null while the derivation is off. */
export function computedEgfrKey(data: Pick<WorkspaceData, 'analysisSettings'>): string | null {
  const formula = data.analysisSettings.egfr?.formula
  return formula && formula !== 'off' ? JSON.stringify([computedEgfrName(formula), COMPUTED_EGFR_UNIT]) : null
}

/** For every patient without a single computed eGFR value: why. Keyed by
 * patientIdKey. Patients with at least one computed value are not listed, nor
 * is anyone while the derivation is off, has no source or reads a source that
 * is not serum creatinine (the Data page says so). The reasons are counted on
 * the rows of the patient's own creatinine series (`patientCreatinineSources`:
 * the selected source, or the patient's µmol/l fallback). */
export function missingEgfrNotes(data: Pick<WorkspaceData, 'rows' | 'rawRows' | 'patients' | 'analysisSettings'>): Map<string, MissingEgfrNote> {
  const notes = new Map<string, MissingEgfrNote>()
  const computedKey = computedEgfrKey(data)
  if (!computedKey) return notes
  const source = data.analysisSettings.egfr?.source ?? defaultCreatinineSource(creatinineSourceOptions(data.rawRows))
  if (!source || !isSerumCreatinineSource(source)) return notes
  // data.rows are the imported rows with resolved sex and age, followed by the computed ones.
  const perPatient = patientCreatinineSources(data.rows, source)
  const context = egfrGapContext(data.analysisSettings.egfr, data.rows)
  const computed = new Set<string>()
  const reasons = new Map<string, Map<EgfrGapReason, number>>()
  for (const row of data.rows) {
    const patient = patientIdKey(row.patientId)
    if (JSON.stringify([row.bezeichnung, row.einheit]) === computedKey && row.sourceSeries) { computed.add(patient); continue }
    const own = perPatient.get(patient)?.source
    if (!own || row.bezeichnung !== own[0] || row.einheit !== own[1]) continue
    const counts = reasons.get(patient) ?? new Map<EgfrGapReason, number>()
    reasons.set(patient, counts)
    for (const reason of egfrGapReasons(row, context)) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const labels = (pairs: readonly Source[]) => pairs.map(([name, unit]) => parameterLabel(name, unit)).join(', ')
  const selected = parameterLabel(source[0], source[1])
  for (const patient of data.patients) {
    const key = patientIdKey(patient.id)
    if (computed.has(key)) continue
    const resolved = perPatient.get(key)
    if (!resolved) {
      notes.set(key, { label: t('No eGFR: no serum creatinine'), text: t('No eGFR for this patient: no serum creatinine value in mg/dl or µmol/l.') })
      continue
    }
    if (resolved.gap === 'other_mgdl') {
      notes.set(key, { label: t('No eGFR: creatinine under another name'), text: t('No eGFR for this patient: no value in the creatinine source {selected}. Serum creatinine in mg/dl under another name ({others}) is not used, and µmol/l values are used only for patients without any serum creatinine in mg/dl.', { selected, others: labels(resolved.others.filter(([, unit]) => normaliseUnit(unit) === 'mg/dl')) }) })
      continue
    }
    if (resolved.gap === 'several_umoll') {
      notes.set(key, { label: t('No eGFR: several µmol/l series'), text: t('No eGFR for this patient: no serum creatinine in mg/dl and several series in µmol/l ({others}), none under the name of the creatinine source {selected}. Series are not merged, so none is used.', { others: labels(resolved.others), selected }) })
      continue
    }
    if (resolved.gap === 'no_source') {
      notes.set(key, { label: t('No eGFR: no creatinine in the source'), text: `${t('No eGFR for this patient: no value in the creatinine source {selected}.', { selected })} ${resolved.others.length === 1 ? t("{series} is not used: only a source in mg/dl falls back to a patient's µmol/l series.", { series: labels(resolved.others) }) : t("{series} are not used: only a source in mg/dl falls back to a patient's µmol/l series.", { series: labels(resolved.others) })}` })
      continue
    }
    const counts = reasons.get(key)
    if (!counts) continue
    const found = ORDER.filter(reason => counts.has(reason))
    // Every row could be computed, yet nothing was: not a per-patient reason.
    if (!found.length) continue
    const sex = found.includes('sex'), age = found.includes('age')
    const own = resolved.source!
    notes.set(key, {
      label: t('No eGFR: {reason}', { reason: found[0] === 'sex' && counts.has('age') ? t('sex and age missing') : short(found[0]) }),
      text: t('No eGFR for this patient: {reasons}.', { reasons: found.map(reason => `${short(reason)} (${tp('{n} creatinine value', '{n} creatinine values', counts.get(reason)!)})`).join('; ') })
        + (sex && age ? ` ${t('Enter the sex and the age under Data → “Review and edit patients”.')}` : sex ? ` ${t('Enter the sex under Data → “Review and edit patients”.')}` : age ? ` ${t('Enter the age under Data → “Review and edit patients”.')}` : '')
        + (found.some(reason => reason === 'no_height' || reason === 'height_gap') ? ` ${heightSourceText()}` : '')
        + (resolved.fallback ? ` ${t('Creatinine source of this patient: {source}, because the patient has no serum creatinine in mg/dl.', { source: parameterLabel(own[0], own[1]) })}` : ''),
    })
  }
  return notes
}
