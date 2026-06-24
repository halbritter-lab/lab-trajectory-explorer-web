import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'

const workbookPath = 'public/test_labs.xlsx'
const headers = ['PatientID', 'LabDatum', 'Bezeichnung', 'Einheit', 'Wert', 'LOINC', 'PatientSex', 'PatientAgeAtLab']

const isoDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const serialToDate = (serial) => {
  const millis = Math.round((serial - 25569) * 86400000)
  return new Date(millis)
}

const row = ({ patientId, date, name, unit, value, loinc, sex, age }) => ({
  PatientID: patientId,
  LabDatum: isoDate(date),
  Bezeichnung: name,
  Einheit: unit,
  Wert: String(value).replace('.', ','),
  LOINC: loinc ?? null,
  PatientSex: sex,
  PatientAgeAtLab: age,
})

const transplantRows = [
  ['2020-01-10', 55, 1.35, 58],
  ['2020-07-10', 48, 1.55, 58],
  ['2021-01-10', 42, 1.8, 59],
  ['2021-07-10', 35, 2.15, 59],
  ['2022-01-10', 29, 2.55, 60],
  ['2022-06-10', 24, 3.05, 60],
  ['2022-08-10', 72, 1.1, 60],
  ['2023-02-10', 68, 1.18, 61],
  ['2023-08-10', 64, 1.26, 61],
].flatMap(([date, egfr, creatinine, age]) => [
  row({
    patientId: 13,
    date,
    name: 'eGFR',
    unit: 'ml/min/1,73m²',
    value: egfr,
    loinc: '62238-1',
    sex: 'w',
    age,
  }),
  row({
    patientId: 13,
    date,
    name: 'Kreatinin',
    unit: 'mg/dl',
    value: creatinine,
    loinc: '2160-0',
    sex: 'w',
    age,
  }),
])

const sameMonthRows = [
  ['2020-03-10', 40, 1.9, 47],
  ['2020-09-10', 35, 2.2, 47],
  ['2021-03-05', 30, 2.65, 48],
  ['2021-03-20', 80, 0.95, 48],
  ['2021-09-10', 75, 1.02, 48],
].flatMap(([date, egfr, creatinine, age]) => [
  row({
    patientId: 14,
    date,
    name: 'eGFR',
    unit: 'ml/min/1,73m²',
    value: egfr,
    loinc: '62238-1',
    sex: 'm',
    age,
  }),
  row({
    patientId: 14,
    date,
    name: 'Kreatinin',
    unit: 'mg/dl',
    value: creatinine,
    loinc: '2160-0',
    sex: 'm',
    age,
  }),
])

const workbook = XLSX.read(readFileSync(workbookPath))
const sheetName = workbook.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null })
const baseRows = rows
  .filter((item) => item.PatientID !== 13 && item.PatientID !== 14)
  .map((item) => ({
    ...item,
    LabDatum: typeof item.LabDatum === 'number' ? serialToDate(item.LabDatum) : item.LabDatum,
  }))
const nextRows = [...baseRows, ...transplantRows, ...sameMonthRows]

workbook.Sheets[sheetName] = XLSX.utils.json_to_sheet(nextRows, { header: headers, cellDates: true, dateNF: 'yyyy-mm-dd' })
writeFileSync(workbookPath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Wrote ${nextRows.length} rows to ${workbookPath}`)
