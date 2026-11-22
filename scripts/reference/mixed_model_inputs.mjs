/** Writes the mixed-model reference inputs (issue #79) and, with --webr, the
 * browser fits of the same requests.
 *
 *   node scripts/reference/mixed_model_inputs.mjs          # tests/reference/inputs/mixed_models.json
 *   node scripts/reference/mixed_model_inputs.mjs --webr   # also tests/reference/mixed_models_webr.json
 *
 * The inputs come from tests/reference/mixedModelCases.ts, i.e. from the app's
 * own cohort-model preparation. --webr fits each case with the production
 * worker (src/core/mixedModel/webr.worker.ts) in headless Chromium against the
 * vendored runtime (run `pnpm vendor:r` first). CHROMIUM_PATH selects the
 * browser binary when Playwright's own build is not installed.
 * Research use only. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const withWebR = process.argv.includes('--webr')
const server = await createServer({ optimizeDeps: { include: ['webr'] }, server: { host: '127.0.0.1', port: 4191, strictPort: true, hmr: false, watch: null } })
let browser
try {
  const { mixedModelReferenceCases } = await server.ssrLoadModule('/tests/reference/mixedModelCases.ts')
  const { mixedModelFormulaKey } = await server.ssrLoadModule('/src/core/mixedModel/config.ts')
  const cases = mixedModelReferenceCases()
  mkdirSync('tests/reference/inputs', { recursive: true })
  writeFileSync('tests/reference/inputs/mixed_models.json', `${JSON.stringify({
    about: 'Mixed-model reference inputs (issue #79), written by scripts/reference/mixed_model_inputs.mjs from tests/reference/mixedModelCases.ts. Synthetic data. Research use only.',
    cases,
  }, null, 1)}\n`)
  console.log(`Wrote ${cases.length} mixed-model inputs.`)

  if (withWebR) {
    await server.listen()
    const { chromium } = await import('@playwright/test')
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:4191')
    const results = []
    for (const item of cases) {
      const request = {
        type: 'run-mixed-model', requestId: `reference-${item.name}`, engine: 'webr-lme4', config: item.config, rows: item.rows,
        formula: item.formula, formulaKey: mixedModelFormulaKey(item.config), datasetId: item.name,
        fitConfigHash: 'reference', wasmAssetSource: 'local-dev',
      }
      const result = await page.evaluate((request) => new Promise((resolve, reject) => {
        const worker = new Worker('/src/core/mixedModel/webr.worker.ts', { type: 'module' })
        const timer = setTimeout(() => reject(new Error('webR fit exceeded 300 seconds')), 300_000)
        worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data.result) }
        worker.postMessage(request)
      }), request)
      if (result.status !== 'success') throw new Error(`${item.name}: ${JSON.stringify(result)}`)
      results.push({
        name: item.name,
        converged: result.converged,
        singular: result.singular,
        warnings: result.warnings,
        fixedEffectTerms: result.fixedEffectTerms.map(({ term, estimate, standardError, confidenceInterval }) => ({ term, estimate, standardError, confidenceInterval })),
        randomEffects: result.randomEffects,
        residualSd: result.residualSd,
        nObservations: item.rows.length,
        optimizer: result.metadata.optimizer,
        runtimeVersion: result.metadata.runtimeVersion,
        packageVersions: result.metadata.packageVersions,
      })
      console.log(`webR fit ${item.name}: ${result.fixedEffectTerms.map((t) => `${t.term}=${t.estimate}`).join(', ')}`)
    }
    writeFileSync('tests/reference/mixed_models_webr.json', `${JSON.stringify({
      about: 'Browser (webR) fits of tests/reference/inputs/mixed_models.json with the production worker, written by scripts/reference/mixed_model_inputs.mjs --webr. Research use only.',
      generated: new Date().toISOString().slice(0, 10),
      results,
    }, null, 1)}\n`)
    console.log('Wrote the webR fits.')
  }
} finally {
  await browser?.close()
  await server.close()
}
