import { describe, expect, it } from 'vitest'
import { PINNED_R_PACKAGES } from '../../src/core/mixedModel/rRuntime'
import pins from '../../src/core/mixedModel/rRuntimePins.json'
import inputs from './inputs/mixed_models.json'
import native from './mixed_models.json'
import webr from './mixed_models_webr.json'
import { mixedModelReferenceCases } from './mixedModelCases'
import { expectClose } from './tolerance'

// Native R lme4 against the browser's webR lme4 on the same model rows,
// R data code and lmer call (issue #79). Tolerances: docs/reference-comparisons.md.
const FIXED = { rel: 1e-6, abs: 1e-8 }
const VARIANCE = { rel: 1e-4, abs: 1e-6 }

describe('mixed-model reference inputs', () => {
  it('are still what the app builds and sends to webR', () => {
    // A change to the preparation, the formula or the R data code makes the
    // stored fits stale: regenerate with `pnpm reference:generate -- --webr`.
    expect(JSON.parse(JSON.stringify(mixedModelReferenceCases()))).toEqual(inputs.cases)
  })

  it('native and webR fits used the pinned versions, except nloptr', () => {
    expect(native.environment.R).toBe(pins.webr.rVersion)
    for (const result of webr.results) expect(result.runtimeVersion).toBe(pins.webr.rVersion)
    const pinned = Object.fromEntries(pins.packages.map((p) => [p.name, p.version.replace(/-/g, '.')]))
    for (const name of ['lme4', 'Matrix', 'minqa', 'jsonlite'] as const) {
      expect(native.environment.packages[name], name).toBe(pinned[name])
      for (const result of webr.results) expect((result.packageVersions as Record<string, string>)[name], name).toBe(pinned[name])
    }
    // The browser serves nloptr 2.2.1.9000 (a development build); CRAN has 2.2.1.
    expect(pinned.nloptr).toBe('2.2.1.9000')
    expect(native.environment.packages.nloptr).toBe('2.2.1')
    expect(PINNED_R_PACKAGES).toContain('nloptr')
  })
})

describe(`lme4 in webR against native R ${native.environment.R}`, () => {
  it.each(native.cases.map((c) => [c.name, c] as const))('%s', (name, nat) => {
    const browser = webr.results.find((r) => r.name === name)!
    expect(browser, name).toBeDefined()
    const input = inputs.cases.find((c) => c.name === name)!
    expect(nat.formula).toBe(input.formula)
    expect(nat.nObservations).toBe(input.rows.length)
    expect(browser.nObservations).toBe(input.rows.length)
    expect(nat.converged && browser.converged).toBe(true)
    expect(nat.singular).toBe(browser.singular)
    expect(nat.optimizer).toBe(browser.optimizer)
    expect(browser.fixedEffectTerms.map((t) => t.term)).toEqual(nat.fixedEffectTerms.map((t) => t.term))
    nat.fixedEffectTerms.forEach((term, index) => {
      const b = browser.fixedEffectTerms[index]
      expectClose(b.estimate, term.estimate, FIXED, `${term.term} estimate`)
      expectClose(b.standardError, term.standardError, FIXED, `${term.term} SE`)
      // The app's Wald interval: estimate ± 1.96 SE (confint method "Wald").
      expectClose(b.confidenceInterval?.[0], term.waldInterval[0], FIXED, `${term.term} CI low`)
      expectClose(b.confidenceInterval?.[1], term.waldInterval[1], FIXED, `${term.term} CI high`)
    })
    for (const key of ['interceptSd', 'slopeSd', 'interceptSlopeCorrelation'] as const) {
      expectClose(browser.randomEffects[key], nat.randomEffects[key], VARIANCE, key)
    }
    expectClose(browser.residualSd, nat.residualSd, VARIANCE, 'residual SD')
  })
})
