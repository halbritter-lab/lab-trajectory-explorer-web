// Adds lab-reported eGFR rows to the demo workbook for patients who have serum
// creatinine (mg/dl), sex and age but no imported eGFR, so that the imported eGFR
// reaches the ten-patient minimum of the cohort mixed model with default settings.
//
// Values are CKD-EPI 2021 (LOINC 98979-8), computed from the creatinine row of the
// same date and rounded to one decimal, in the style of a laboratory report. The
// original synthetic eGFR rows (LOINC 62238-1) are not formula-derived. Each new
// row copies the cells of its creatinine row, so dates and formats are unchanged.
// Idempotent: patients that already have any imported eGFR series are skipped.
//
// Usage: node scripts/add_demo_egfr_coverage.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const LABS_FILE = new URL('../public/test_labs.xlsx', import.meta.url)
const EGFR_NAME = 'eGFR'
const EGFR_UNIT = 'ml/min/1,73m²'
const EGFR_LOINC = '98979-8'

function ckdEpi2021(scr, age, female) {
  const kappa = female ? 0.7 : 0.9
  const alpha = female ? -0.241 : -0.302
  const ratio = scr / kappa
  return 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1)
}

const book = XLSX.read(readFileSync(LABS_FILE), { cellNF: true })
const sheet = book.Sheets.labs
const range = XLSX.utils.decode_range(sheet['!ref'])
const header = []
for (let c = range.s.c; c <= range.e.c; c++) header.push(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v)
const col = name => {
  const index = header.indexOf(name)
  if (index < 0) throw new Error(`labs sheet has no ${name} column`)
  return index
}
const C = { patientId: col('patientId'), testName: col('testName'), unit: col('unit'), value: col('value'), loinc: col('loinc'), sex: col('sex'), ageAtLab: col('ageAtLab') }
const cell = (r, c) => sheet[XLSX.utils.encode_cell({ r, c })]

const withEgfr = new Set()
const sources = []
for (let r = range.s.r + 1; r <= range.e.r; r++) {
  const patientId = cell(r, C.patientId)?.v
  const testName = cell(r, C.testName)?.v
  const unit = cell(r, C.unit)?.v
  // Any eGFR series counts, also differently named ones such as 'eGFR (CKD-EPI)'.
  if (/egfr/i.test(String(testName ?? ''))) withEgfr.add(patientId)
  if (testName === 'Kreatinin' && unit === 'mg/dl') sources.push(r)
}

let next = range.e.r + 1
const added = new Map()
for (const r of sources) {
  const patientId = cell(r, C.patientId).v
  const sex = cell(r, C.sex)?.v
  const age = Number(cell(r, C.ageAtLab)?.v)
  const scr = Number(String(cell(r, C.value)?.v).replace(',', '.'))
  if (withEgfr.has(patientId) || (sex !== 'w' && sex !== 'm') || !Number.isFinite(age) || !(scr > 0)) continue
  const egfr = Math.round(ckdEpi2021(scr, age, sex === 'w') * 10) / 10
  for (let c = range.s.c; c <= range.e.c; c++) {
    const source = cell(r, c)
    if (source) sheet[XLSX.utils.encode_cell({ r: next, c })] = { ...source }
  }
  sheet[XLSX.utils.encode_cell({ r: next, c: C.testName })] = { t: 's', v: EGFR_NAME }
  sheet[XLSX.utils.encode_cell({ r: next, c: C.unit })] = { t: 's', v: EGFR_UNIT }
  sheet[XLSX.utils.encode_cell({ r: next, c: C.value })] = { t: 's', v: egfr.toFixed(1).replace('.', ',') }
  sheet[XLSX.utils.encode_cell({ r: next, c: C.loinc })] = { t: 's', v: EGFR_LOINC }
  added.set(patientId, (added.get(patientId) ?? 0) + 1)
  next++
}

range.e.r = next - 1
sheet['!ref'] = XLSX.utils.encode_range(range)
writeFileSync(LABS_FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
console.log(added.size ? [...added].map(([p, n]) => `patient ${p}: ${n} eGFR rows`).join('\n') : 'nothing to add')
