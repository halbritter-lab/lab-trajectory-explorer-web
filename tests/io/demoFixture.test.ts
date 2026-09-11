import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows } from '../../src/core/parse/loader'
import { resolveDemographics } from '../../src/core/demographics/resolve'

describe('shipped demo workbook', () => {
  it('carries demographics that resolve without conflict', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const rows = loadLabRows(
      readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    )
    const { rows: resolved, conflicts } = resolveDemographics(rows, {}, {})
    expect(conflicts).toEqual([])
    // The guarantee, exercised on the file we actually ship.
    expect(resolved).toBe(rows)
  })
})
