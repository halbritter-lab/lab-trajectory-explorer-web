import * as XLSX from 'xlsx'
import { zipSync } from 'fflate'

/** Rows (array of plain objects) → xlsx bytes, single sheet. Accepts any object
 * array (typed export records included). Mirrors
 * analyses/export.py:dataframe_to_xlsx_bytes. */
export function rowsToXlsxBytes(rows: readonly object[], sheetName = 'Sheet1'): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(rows as object[])
  applyColumnWidths(ws, rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const result = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  // SheetJS returns an ArrayBuffer in some environments (e.g. Node/jsdom) even
  // when type:'array' is requested; wrap to guarantee a Uint8Array with a
  // valid .buffer/.byteOffset so callers can safely slice it.
  return result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer)
}

/** Sanitise an Excel sheet name: cap at 31 chars, strip forbidden characters,
 * and disambiguate duplicates (book_append_sheet throws on a repeated name). */
function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet').trim() || 'Sheet'
  let name = base
  let i = 2
  while (used.has(name.toLowerCase())) {
    const suffix = `_${i++}`
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(name.toLowerCase())
  return name
}

/** Multiple named sheets → xlsx bytes, one worksheet per entry (order kept).
 * NOTE: cells are written as string-typed (`t:'s'`), which Excel never evaluates
 * as formulas, so formula/DDE ("CSV") injection does not apply here. If a CSV
 * export is ever added, sanitise cells starting with = + - @ before writing. */
export function sheetsToXlsxBytes(sheets: { name: string; rows: readonly object[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows as object[])
    applyColumnWidths(ws, s.rows)
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(s.name, used))
  }
  const result = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer)
}

function applyColumnWidths(ws: XLSX.WorkSheet, rows: readonly object[]): void {
  const headers = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : []
  if (headers.length === 0) return
  ws['!cols'] = headers.map((header) => {
    const values = rows.map((r) => (r as Record<string, unknown>)[header])
    const maxLen = Math.max(
      header.length,
      ...values.map((v) => v == null ? 0 : String(v).length),
    )
    const isDateColumn = /(^|_)(datum|date)(_|$)/i.test(header) || /datum|date/i.test(header)
    return { wch: Math.min(Math.max(maxLen + 2, isDateColumn ? 12 : 8), 48) }
  })
}

/** Pack named byte buffers into a zip. */
export function zipBytes(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files)
}

/** Serialise an <svg> DOM element to a standalone string (ensures xmlns). */
export function svgElementToString(svg: SVGSVGElement | SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

/** Local timestamp `YYYYMMDD-HHmm` for export filenames, so repeated exports
 * with different configs do not overwrite each other. */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** Trigger a browser download of a byte buffer / string as a file. */
export function downloadBlob(data: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Defer revocation: revoking synchronously right after click() can abort
  // large downloads in some browsers before they start reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Rasterise an SVG string to a PNG blob via a canvas (browser-only). */
export function svgStringToPngBlob(svgString: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(svgUrl)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error('svg image load failed')) }
    img.src = svgUrl
  })
}
