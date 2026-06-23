import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('sidebar layout CSS', () => {
  it('keeps long sidebar content scrollable above the footer', () => {
    const css = readFileSync(resolve(__dirname, '../../src/ui/app.css'), 'utf8')
    expect(css).toMatch(/\.sidebar\s*\{[^}]*overflow-y:\s*auto/s)
  })
})
