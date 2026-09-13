/** Real webR verification of the production worker. Run: node scripts/verify_mixed_model_factors.mjs */
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const server = await createServer({ optimizeDeps: {include:['webr']}, server: { host: '127.0.0.1', port: 4187, strictPort: true, hmr:false, watch:null } })
await server.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', msg => console.log(`[browser] ${msg.text()}`))
await page.goto('http://127.0.0.1:4187')
await page.evaluate(() => { window.verificationWorker = new Worker('/src/core/mixedModel/webr.worker.ts', {type:'module'}) })
const { mixedModelFormula, mixedModelFormulaKey } = await server.ssrLoadModule('/src/core/mixedModel/config.ts')

const config = {
  timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope',
  factors: [
    { key: 'genotype', kind: 'categorical', effect: 'level_slope', reference: 'A' },
    { key: 'dose', kind: 'numeric', effect: 'level_slope' },
  ],
}
// Balanced deterministic patient offsets and residuals avoid a degenerate perfect fit.
const rows = Array.from({ length: 48 }, (_, i) => {
  const group = i % 2
  const numeric = Math.floor(i / 2) % 4 - 1.5
  const replicate = Math.floor(i / 8)
  const interceptOffset = [-2,-1,0,0,1,2][replicate]
  const slopeOffset = [-0.2,0.1,0.3,-0.3,-0.1,0.2][replicate]
  return Array.from({ length: 6 }, (_, t) => ({
    patient_id: `p${i}`, time_since_baseline: t,
    eGFR: 70 + 6 * group + 2 * numeric + interceptOffset + (-2 - group + 0.4 * numeric + slopeOffset) * t + [0.2,-0.3,0.1,0.1,-0.3,0.2][t],
    factorValues: { factor_0_: group ? 'B' : 'A', factor_1_: numeric },
  }))
}).flat()

async function fit(engine, selectedConfig = config, selectedRows = rows) {
  console.log(`Running ${engine}: ${mixedModelFormula(selectedConfig)}`)
  const result = await page.evaluate(request => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Real runtime fit exceeded 180 seconds')), 180_000)
    window.verificationWorker.onmessage = event => { clearTimeout(timer); resolve(event.data.result) }
    window.verificationWorker.postMessage(request)
  }), {
    type: 'run-mixed-model', requestId: `${engine}-${Date.now()}`, engine,
    config: selectedConfig, rows: selectedRows, formula: mixedModelFormula(selectedConfig), formulaKey: mixedModelFormulaKey(selectedConfig),
    datasetId: 'synthetic-factor-verification', fitConfigHash: 'verification', wasmAssetSource: 'cdn',
  })
  // Worker resets its in-flight guard in a following microtask.
  await new Promise(resolve => setTimeout(resolve, 0))
  return result
}

try {
  for (const engine of ['webr-lme4', 'webr-nlme']) {
    const result = await fit(engine)
    assert.equal(result.status, 'success', JSON.stringify(result))
    const expected = { '(Intercept)':70, time_since_baseline:-2, factor_0_B:6, factor_1_:2, 'time_since_baseline:factor_0_B':-1, 'time_since_baseline:factor_1_':0.4 }
    assert.equal(result.fixedEffectTerms.length, 6)
    for (const [term, estimate] of Object.entries(expected)) {
      const actual = result.fixedEffectTerms.find(item => item.term === term)
      assert.ok(actual, `Missing ${term}`)
      assert.ok(Math.abs(actual.estimate - estimate) < 0.02, `${term}: ${actual.estimate} vs ${estimate}`)
      assert.ok(actual.confidenceInterval?.every(Number.isFinite), `Missing interval: ${term}`)
    }
    assert.equal(result.nMeasurements, rows.length)
    console.log(JSON.stringify({engine,terms:result.fixedEffectTerms,warnings:result.warnings}))
    const deficient = await fit(engine, config, rows.map(row => ({...row, factorValues:{...row.factorValues,factor_1_:row.factorValues.factor_0_ === 'B' ? 1 : 0}})))
    assert.equal(deficient.status, 'fit-error', JSON.stringify(deficient))
    assert.match(deficient.message, /rank deficient/)
    console.log(`${engine}: rank-deficient model correctly rejected`)
  }
  await browser.close()
  await server.close()
  process.exit(0)
} catch (error) {
  console.error(error)
  await browser.close()
  await server.close()
  process.exit(1)
}
