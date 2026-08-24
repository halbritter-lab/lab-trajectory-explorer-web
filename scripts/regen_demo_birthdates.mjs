// Rewrite PatientAgeAtLab in the shipped demo workbook so every patient's ages
// derive from one birth date. The anchor is the midpoint of the interval implied
// by that patient's earliest row, so the data moves as little as possible.
// One-off: run it, commit the workbook, done.
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const FILE = new URL('../public/test_labs.xlsx', import.meta.url)

const addYears = (date, delta) => {
  const month = date.getUTCMonth()
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + delta, month, date.getUTCDate()))
  if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0)
  return shifted
}

const completedYears = (birth, ref) => {
  let years = ref.getUTCFullYear() - birth.getUTCFullYear()
  const reached =
    ref.getUTCMonth() > birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() >= birth.getUTCDate())
  return reached ? years : years - 1
}

const book = XLSX.read(readFileSync(FILE), { cellDates: true })
const sheetName = book.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName])

const earliest = new Map()
for (const row of rows) {
  if (row.LabDatum == null || row.PatientAgeAtLab == null) continue
  const date = new Date(row.LabDatum)
  const seen = earliest.get(row.PatientID)
  if (!seen || date < seen.date) earliest.set(row.PatientID, { date, age: Number(row.PatientAgeAtLab) })
}

const anchors = new Map()
for (const [patientId, { date, age }] of earliest) {
  const hi = addYears(date, -age)
  const lo = addYears(date, -(age + 1))
  lo.setUTCDate(lo.getUTCDate() + 1)
  anchors.set(patientId, new Date(Math.round((lo.getTime() + hi.getTime()) / 2)))
}

let rewritten = 0
for (const row of rows) {
  const anchor = anchors.get(row.PatientID)
  if (!anchor || row.LabDatum == null) continue
  if (row.PatientAgeAtLab == null) continue
  const nextAge = completedYears(anchor, new Date(row.LabDatum))
  if (nextAge === row.PatientAgeAtLab) continue
  row.PatientAgeAtLab = nextAge
  rewritten += 1
}

// Only PatientAgeAtLab changes. Rewrite via the same header order and cell-date
// handling the sheet already used, so every other column (including the
// German comma-decimal Wert strings and the unit text) round-trips untouched.
const headers = Object.keys(rows[0])
const nextSheet = XLSX.utils.json_to_sheet(rows, { header: headers, cellDates: true, dateNF: 'yyyy-mm-dd' })
book.Sheets[sheetName] = nextSheet
writeFileSync(FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Rewrote PatientAgeAtLab for ${rewritten} of ${rows.length} rows across ${anchors.size} patients.`)
