// Store every labDate of the shipped demo workbook at midnight. The dates were
// written as serials with a time-zone remainder (01:00, or 02:00 in summer
// time); since lab dates carry a time of day, that remainder showed as a
// measured time. The calendar day of each row stays the same; only the labs
// sheet's labDate column is touched. One-off: run it, commit the workbook, done.
// Written compressed, as the app writes its exports.
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const FILE = new URL('../public/test_labs.xlsx', import.meta.url)

const book = XLSX.read(readFileSync(FILE))
const sheet = book.Sheets.labs
const range = XLSX.utils.decode_range(sheet['!ref'])
let column = -1
for (let c = range.s.c; c <= range.e.c; c++) {
  if (sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v === 'labDate') column = c
}
if (column < 0) throw new Error('labDate column not found')

let rewritten = 0
for (let r = range.s.r + 1; r <= range.e.r; r++) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c: column })]
  if (!cell || cell.t !== 'n' || Number.isInteger(cell.v)) continue
  cell.v = Math.floor(cell.v)
  delete cell.w
  rewritten++
}

writeFileSync(FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }))
console.log(`labDate cells moved to midnight: ${rewritten}`)
