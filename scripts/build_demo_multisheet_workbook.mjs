import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const LABS_FILE = new URL('../public/test_labs.xlsx', import.meta.url)
const EVENTS_FILE = new URL('../public/test_events.csv', import.meta.url)
const ATTRIBUTES_FILE = new URL('../public/test_attributes.csv', import.meta.url)

// 1. Read existing labs
const labsBook = XLSX.read(readFileSync(LABS_FILE), { cellDates: true })
const labsSheet = labsBook.Sheets[labsBook.SheetNames[0]]
const rawLabRows = XLSX.utils.sheet_to_json(labsSheet)

const canonicalLabRows = rawLabRows.map((r) => ({
  patientId: r.PatientID ?? r.patientId,
  labDate: r.LabDatum ?? r.labDate,
  testName: r.Bezeichnung ?? r.testName,
  unit: r.Einheit ?? r.unit,
  value: r.Wert ?? r.value,
  loinc: r.LOINC ?? r.loinc,
  sex: r.PatientSex ?? r.sex,
  ageAtLab: r.PatientAgeAtLab ?? r.ageAtLab,
}))

// 2. Read events
const eventsCsv = readFileSync(EVENTS_FILE, 'utf8')
const eventsBook = XLSX.read(eventsCsv, { type: 'string', cellDates: true })
const eventsRows = XLSX.utils.sheet_to_json(eventsBook.Sheets[eventsBook.SheetNames[0]])

// 3. Read attributes
const attributesCsv = readFileSync(ATTRIBUTES_FILE, 'utf8')
const attributesBook = XLSX.read(attributesCsv, { type: 'string' })
const attributesRows = XLSX.utils.sheet_to_json(attributesBook.Sheets[attributesBook.SheetNames[0]])

// 4. Assemble 3-sheet workbook
const newBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(newBook, XLSX.utils.json_to_sheet(canonicalLabRows), 'labs')
XLSX.utils.book_append_sheet(newBook, XLSX.utils.json_to_sheet(eventsRows), 'events')
XLSX.utils.book_append_sheet(newBook, XLSX.utils.json_to_sheet(attributesRows), 'attributes')

writeFileSync(LABS_FILE, XLSX.write(newBook, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Created multi-sheet test_labs.xlsx:`)
console.log(`  labs: ${canonicalLabRows.length} rows`)
console.log(`  events: ${eventsRows.length} rows`)
console.log(`  attributes: ${attributesRows.length} rows`)
