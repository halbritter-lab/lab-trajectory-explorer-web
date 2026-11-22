import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PINNED_R_PACKAGES, R_PACKAGE_CONTRIB_PATH, R_RUNTIME_PINS, R_VERSION, WEBR_VERSION, rAssetRoot } from '../../../src/core/mixedModel/rRuntime'

// R packages that are part of R itself and ship with the webR runtime.
const BASE_PACKAGES = new Set(['R', 'base', 'compiler', 'datasets', 'grDevices', 'graphics', 'grid', 'methods', 'parallel', 'splines', 'stats', 'stats4', 'tcltk', 'tools', 'utils'])

function names(field: string): string[] {
  return field.split(',').map(entry => entry.trim().split(/[\s(]/)[0]).filter(Boolean)
}

describe('the R runtime served with the app (K43)', () => {
  it('pins the installed webr package and the R version it was built with', () => {
    const bundlePath = createRequire(import.meta.url).resolve('webr')
    const pkg = JSON.parse(readFileSync(resolve(dirname(bundlePath), '..', 'package.json'), 'utf8')) as { version: string }
    expect(pkg.version).toBe(WEBR_VERSION)
    const bundle = readFileSync(bundlePath, 'utf8')
    expect(bundle).toContain(`"${R_VERSION}"`)
    expect(R_PACKAGE_CONTRIB_PATH).toBe('r-packages/bin/emscripten/contrib/4.6')
  })

  it('pins exactly the dependency closure of lme4 and jsonlite, each once', () => {
    const byName = new Map(R_RUNTIME_PINS.packages.map(pkg => [pkg.name, pkg]))
    expect(byName.size).toBe(PINNED_R_PACKAGES.length)
    const needed = new Set<string>()
    const visit = (name: string) => {
      if (BASE_PACKAGES.has(name) || needed.has(name)) return
      const pkg = byName.get(name)
      expect(pkg, `${name} is needed but not pinned`).toBeDefined()
      needed.add(name)
      for (const dep of [...names(pkg!.depends), ...names(pkg!.imports)]) visit(dep)
    }
    visit('lme4')
    visit('jsonlite')
    expect([...needed].sort()).toEqual([...PINNED_R_PACKAGES].sort())
  })

  it('pins the versions the first self-hosted fit loaded on 2026-11-22', () => {
    expect(Object.fromEntries(R_RUNTIME_PINS.packages.map(pkg => [pkg.name, pkg.version]))).toEqual({
      lme4: '2.0-6', Matrix: '1.7-6', jsonlite: '2.0.0', MASS: '7.3-66', Rcpp: '1.1.2', Rdpack: '2.6.6', boot: '1.3-32',
      lattice: '0.23-1', minqa: '1.2.8', nlme: '3.1-171', nloptr: '2.2.1.9000', rbibutils: '2.4.1', reformulas: '0.4.4',
    })
    expect([WEBR_VERSION, R_VERSION]).toEqual(['0.6.0', '4.6.0'])
  })

  it('finds the app\'s address from the worker under a project subpath', () => {
    expect(rAssetRoot('https://example.org/lab/explorer/assets/webr.worker-abc.js', false).href).toBe('https://example.org/lab/explorer/')
    expect(new URL('webr/', rAssetRoot('https://example.org/lab/explorer/assets/webr.worker-abc.js', false)).href).toBe('https://example.org/lab/explorer/webr/')
    expect(rAssetRoot('http://127.0.0.1:5173/src/core/mixedModel/webr.worker.ts?worker_file&type=module', true).href).toBe('http://127.0.0.1:5173/')
  })
})
