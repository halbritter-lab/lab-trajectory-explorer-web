// Extends the demo data so every cohort model preset can be demonstrated with the
// default settings: attributes for patients 1, 2, 4 and 6, and twelve synthetic
// patients (15-26) with serum creatinine and lab-style eGFR. Cohorts A and B then
// each reach the ten-patient model minimum, and so do both sexes.
//
// The new patients have smooth creatinine courses without AKI or events; cohort B
// progresses faster than cohort A. eGFR is CKD-EPI 2021 (LOINC 98979-8) from the
// creatinine of the same date. A fixed seed makes the output reproducible.
// Idempotent: patients already present in the labs sheet or attribute rows that
// already exist are left unchanged.
//
// Usage: node scripts/add_demo_cohort_patients.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const LABS_FILE = new URL('../public/test_labs.xlsx', import.meta.url)
const ATTRIBUTES_FILE = new URL('../public/test_attributes.csv', import.meta.url)

const ATTRIBUTES = [
  [1, 'UMOD', 'AD', 'A'], [2, 'UMOD', 'AD', 'A'], [4, 'MUC1', 'AD', 'B'], [6, 'PKD1', 'AD', 'B'],
  [15, 'UMOD', 'AD', 'A'], [16, 'UMOD', 'AD', 'A'], [17, 'UMOD', 'AD', 'A'], [18, 'UMOD', 'AD', 'A'], [19, 'UMOD', 'AD', 'A'],
  [20, 'MUC1', 'AD', 'B'], [21, 'PKD1', 'AD', 'B'], [22, 'MUC1', 'AD', 'B'], [23, 'PKD1', 'AD', 'B'],
  [24, 'MUC1', 'AD', 'B'], [25, 'PKD1', 'AD', 'B'], [26, 'MUC1', 'AD', 'B'],
]
// patient, sex, age at first measurement, cohort
const NEW_PATIENTS = [
  [15, 'w', 41, 'A'], [16, 'm', 53, 'A'], [17, 'w', 62, 'A'], [18, 'm', 47, 'A'], [19, 'm', 68, 'A'],
  [20, 'w', 39, 'B'], [21, 'm', 45, 'B'], [22, 'w', 57, 'B'], [23, 'm', 50, 'B'], [24, 'w', 64, 'B'],
  [25, 'w', 36, 'B'], [26, 'm', 59, 'B'],
]

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(20261012)

function ckdEpi2021(scr, age, female) {
  const kappa = female ? 0.7 : 0.9
  const alpha = female ? -0.241 : -0.302
  const ratio = scr / kappa
  return 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1)
}

// The shipped date cells are Excel serials written in Europe/Berlin local time
// (midnight there, so 01:00 or 02:00 UTC); new cells follow the same convention.
function berlinSerial(year, month, day) {
  const utcMidnight = Date.UTC(year, month - 1, day)
  const berlinHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(utcMidnight)))
  return (utcMidnight - Date.UTC(1899, 11, 30)) / 86400000 + berlinHour / 24
}
const decimal = (value, digits) => value.toFixed(digits).replace('.', ',')

const book = XLSX.read(readFileSync(LABS_FILE), { cellNF: true })

function appendRows(sheet, rows) {
  const range = XLSX.utils.decode_range(sheet['!ref'])
  for (const cells of rows) {
    range.e.r += 1
    cells.forEach((cell, c) => { if (cell) sheet[XLSX.utils.encode_cell({ r: range.e.r, c })] = cell })
  }
  sheet['!ref'] = XLSX.utils.encode_range(range)
}
const columnValues = (sheet, c) => {
  const range = XLSX.utils.decode_range(sheet['!ref'])
  return Array.from({ length: range.e.r - range.s.r }, (_, i) => sheet[XLSX.utils.encode_cell({ r: range.s.r + 1 + i, c })]?.v)
}

// Attributes sheet (patientId, genotype, inheritance, cohort) and the CSV twin.
const attributeSheet = book.Sheets.attributes
const knownAttributes = new Set(columnValues(attributeSheet, 0))
const newAttributes = ATTRIBUTES.filter(([id]) => !knownAttributes.has(id))
appendRows(attributeSheet, newAttributes.map(([id, genotype, inheritance, cohort]) => [
  { t: 'n', v: id, z: 'General' }, { t: 's', v: genotype }, { t: 's', v: inheritance }, { t: 's', v: cohort },
]))
const csv = readFileSync(ATTRIBUTES_FILE, 'utf8')
const csvIds = new Set(csv.split(/\r?\n/).slice(1).map(line => Number(line.split(',')[0])))
const csvAdditions = ATTRIBUTES.filter(([id]) => !csvIds.has(id)).map(row => row.join(','))
if (csvAdditions.length) writeFileSync(ATTRIBUTES_FILE, `${csv.replace(/\s*$/, '')}\n${csvAdditions.join('\n')}\n`)

// Labs sheet (patientId, labDate, testName, unit, value, loinc, sex, ageAtLab).
const labSheet = book.Sheets.labs
const knownPatients = new Set(columnValues(labSheet, 0))
const dateFormat = labSheet.B2.z
const labRows = []
for (const [id, sex, startAge, cohort] of NEW_PATIENTS) {
  if (knownPatients.has(id)) continue
  const female = sex === 'w'
  const startYear = 2020 + Math.floor(random() * 3)
  const startMonth = 1 + Math.floor(random() * 12)
  const baseline = (female ? 0.72 : 0.92) + random() * 0.35
  const growth = cohort === 'A' ? 0.02 + random() * 0.05 : 0.05 + random() * 0.08
  for (let visit = 0; visit < 8; visit++) {
    const monthIndex = startMonth - 1 + visit * 6
    const year = startYear + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    const day = 5 + Math.floor(random() * 20)
    const years = visit / 2
    const age = startAge + Math.floor(years)
    const creatinine = Math.round(baseline * Math.exp(growth * years) * (1 + (random() - 0.5) * 0.08) * 100) / 100
    const egfr = Math.round(ckdEpi2021(creatinine, age, female) * 10) / 10
    const date = { t: 'n', v: berlinSerial(year, month, day), z: dateFormat }
    const common = (testName, unit, value, loinc) => [
      { t: 'n', v: id, z: 'General' }, { ...date }, { t: 's', v: testName }, { t: 's', v: unit },
      { t: 's', v: value }, { t: 's', v: loinc }, { t: 's', v: sex }, { t: 'n', v: age, z: 'General' },
    ]
    labRows.push(common('Kreatinin', 'mg/dl', decimal(creatinine, 2), '2160-0'))
    labRows.push(common('eGFR', 'ml/min/1,73m²', decimal(egfr, 1), '98979-8'))
  }
}
appendRows(labSheet, labRows)

writeFileSync(LABS_FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }))
console.log(`attributes added: ${newAttributes.length}; csv rows added: ${csvAdditions.length}; lab rows added: ${labRows.length}`)
