import type { LabRow, PatientId } from '../types'

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
