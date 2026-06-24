import type { LabRow, PatientId } from '../types'
import { buildCohortRows, slopeUnit, EXPORT_DISCLAIMER_ROWS, type CohortSeriesSpec } from '../cohort/screening'
import { COMPUTED_BEZEICHNUNG_SUFFIX } from '../egfr/series'
import type { SlopeMode } from '../stats/summarize'
import type { ClinicalEvent } from '../events/events'
import { clinicalEventAffectsFit } from '../events/fitExclusions'

/** One row per measurement for a single patient. Includes synthesised eGFR rows
 * when the caller passes display rows with computed eGFR appended. */
export interface PatientMeasurementRecord {
  PatientID: PatientId
  Datum: string
  Bezeichnung: string
  Einheit: string
  Wert: string
  WertNum: number | ''
  Operator: string
}

/** One row per configured series, carrying its fitted slope and quality flag. */
export interface PatientSlopeRecord {
  PatientID: PatientId
  Bezeichnung: string
  Einheit: string
  Mode: string
  n: number
  span_days: number
  slope: number | ''
  slope_unit: string
  r2: number | ''
  ci_low: number | ''
  ci_high: number | ''
  reason: string
  aki: string
  endpoint_percent_decline: number | ''
  endpoint_observed_ckd_g5: string
  endpoint_projected_age_to_ckd_g5: number | ''
}

function isoDate(d: Date): string {
  // Local calendar date (yyyy-mm-dd) without timezone shifting.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Long-format measurement table for one patient, sorted by date then name.
 * Rows without a name are skipped; rows without a date sort last. */
export function patientMeasurementRecords(rows: LabRow[], patientId: PatientId): PatientMeasurementRecord[] {
  return rows
    .filter((r) => r.patientId === patientId && r.bezeichnung !== null)
    .slice()
    .sort((a, b) => {
      const ta = a.labDatum?.getTime() ?? Number.POSITIVE_INFINITY
      const tb = b.labDatum?.getTime() ?? Number.POSITIVE_INFINITY
      return ta - tb || (a.bezeichnung ?? '').localeCompare(b.bezeichnung ?? '')
    })
    .map((r) => ({
      PatientID: r.patientId,
      Datum: r.labDatum ? isoDate(r.labDatum) : '',
      Bezeichnung: r.bezeichnung ?? '',
      Einheit: r.einheit ?? '',
      Wert: r.wert ?? '',
      WertNum: r.wertNum ?? '',
      Operator: r.wertOperator,
    }))
}

/** Distinct computed-eGFR (ƒ) series present for a patient, as slope specs.
 * Empty unless display rows carry synthesised eGFR (i.e. eGFR computation is on
 * and the data has the inputs). Default mode 'global' for a single summary slope. */
export function computedEgfrSpecs(rows: LabRow[], patientId: PatientId, mode: SlopeMode = 'global'): CohortSeriesSpec[] {
  const seen = new Map<string, CohortSeriesSpec>()
  for (const r of rows) {
    if (r.patientId !== patientId || r.bezeichnung == null) continue
    if (!r.bezeichnung.includes(COMPUTED_BEZEICHNUNG_SUFFIX)) continue
    const key = `${r.bezeichnung}|${r.einheit ?? ''}`
    if (!seen.has(key)) seen.set(key, { bezeichnung: r.bezeichnung, einheit: r.einheit, mode })
  }
  return [...seen.values()]
}

/** Configured specs plus any computed-eGFR series not already among them, so the
 * eGFR slope is exported automatically whenever eGFR computation is active. */
export function slopeSpecsWithComputedEgfr(specs: CohortSeriesSpec[], rows: LabRow[], patientId: PatientId): CohortSeriesSpec[] {
  const out = [...specs]
  for (const e of computedEgfrSpecs(rows, patientId)) {
    if (!out.some((s) => s.bezeichnung === e.bezeichnung && (s.einheit ?? null) === (e.einheit ?? null))) out.push(e)
  }
  return out
}

/** Slope summary table for one patient, one row per configured series spec.
 * Reuses buildCohortRows so the slope/reason/AKI logic stays in one place. */
export function patientSlopeRecords(rows: LabRow[], patientId: PatientId, specs: CohortSeriesSpec[]): PatientSlopeRecord[] {
  if (specs.length === 0) return []
  const cohortRow = buildCohortRows(rows, [patientId], specs)[0]
  if (!cohortRow) return []
  const numOrBlank = (v: number): number | '' => (Number.isNaN(v) ? '' : v)
  return cohortRow.cells.map((c, i) => ({
    PatientID: patientId,
    Bezeichnung: c.bezeichnung,
    Einheit: c.einheit ?? '',
    Mode: specs[i].mode,
    n: c.nNumeric,
    span_days: c.spanDays,
    slope: numOrBlank(c.slope),
    slope_unit: slopeUnit(c.einheit),
    r2: numOrBlank(c.r2),
    ci_low: numOrBlank(c.ciLow),
    ci_high: numOrBlank(c.ciHigh),
    reason: c.reason ?? '',
    aki: c.akiChip,
    endpoint_percent_decline: c.endpoints.percentDecline.value ?? '',
    endpoint_observed_ckd_g5: c.endpoints.observedCkdG5.met ? 'yes' : '',
    endpoint_projected_age_to_ckd_g5: c.endpoints.projectedAgeToCkdG5.value ?? '',
  }))
}

/** Assemble the named sheets for a patient workbook: long-format measurements,
 * the per-series slope summary (with computed eGFR auto-included so its slope is
 * exported even when not picked in the series strip), and the disclaimer.
 * Pure — pass to sheetsToXlsxBytes to serialise. */
export function patientWorkbookSheets(
  displayRows: LabRow[],
  patientId: PatientId,
  specs: CohortSeriesSpec[],
  clinicalEvents: ClinicalEvent[] = [],
): { name: string; rows: readonly object[] }[] {
  const measurements = patientMeasurementRecords(displayRows, patientId)
  const patientEvents = clinicalEvents.filter((event) => event.patientId === patientId)
  const slopeSpecs = slopeSpecsWithComputedEgfr(specs, displayRows, patientId)
    .map((spec) => {
      const fitEvents = patientEvents.filter((event) => clinicalEventAffectsFit(event, spec.fitConfig?.censoring))
      return {
        ...spec,
        clinicalEvents: spec.clinicalEvents ?? patientEvents,
        eventDates: spec.eventDates ?? fitEvents.map((event) => event.date),
      }
    })
  const slopes = patientSlopeRecords(displayRows, patientId, slopeSpecs)
  return [
    { name: 'measurements', rows: measurements },
    { name: 'slopes', rows: slopes },
    { name: 'about', rows: EXPORT_DISCLAIMER_ROWS },
  ]
}
