import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { WEBR_PACKAGE_HOST, WEBR_RUNTIME_HOST } from '../../../src/core/mixedModel/runtimeHosts'

// The worker starts webR without baseUrl or repos, so the hosts the interface
// names are the defaults of the installed package. This fails when an update
// of `webr` moves them.
describe('hosts of the R runtime and the R packages', () => {
  it('are the only r-wasm.org hosts in the installed webr package', () => {
    const bundle = readFileSync(createRequire(import.meta.url).resolve('webr'), 'utf8')
    const hosts = [...new Set([...bundle.matchAll(/https:\/\/([a-z0-9.-]*r-wasm\.org)/g)].map(match => match[1]))].sort()
    expect(hosts).toEqual([WEBR_PACKAGE_HOST, WEBR_RUNTIME_HOST].sort())
  })
})
