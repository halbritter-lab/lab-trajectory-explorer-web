/** Real webR check of the R reproduction export: fit with the production worker,
 * build the model workbook, run its r_script in webR and compare the refit.
 * Run: node scripts/verify_mixed_model_r_export.mjs
 * Optional: COMPARE_WORKER=/src/.../other.worker.ts fits the same request with
 * another worker (e.g. a copy from main) and requires identical estimates and intervals. */
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const server = await createServer({ optimizeDeps: { include: ['webr'] }, server: { host: '127.0.0.1', port: 4189, strictPort: true, hmr: false, watch: null } })
await server.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (msg) => console.log(`[browser] ${msg.text()}`))
await page.goto('http://127.0.0.1:4189')
const load = (path) => server.ssrLoadModule(path)
const { mixedModelFormula, mixedModelFormulaKey } = await load('/src/core/mixedModel/config.ts')
const { workspaceModelEntities } = await load('/src/workspace/workspace-model-results.ts')
const { generalExplorationConfig } = await load('/src/core/analysis/fitConfig.ts')
const { mixedModelExportSheets } = await load('/src/core/mixedModel/modelExport.ts')
const { sheetsToXlsxBytes } = await load('/src/io/export.ts')

const config = {
  timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope',
  factors: [
    { key: 'genotype', kind: 'categorical', effect: 'level_slope', reference: 'A' },
    { key: 'dose', kind: 'numeric', effect: 'level' },
  ],
}
// 24 patients, two measurements per quarter (aggregated into quarterly medians),
// one patient without genotype (excluded by the factor) and one bound value.
const attributes = {}
const labRows = []
for (let i = 0; i < 24; i++) {
  const id = `p${i}`
  const group = i % 2
  if (i !== 23) attributes[id] = { genotype: group ? 'B' : 'A', dose: String(10 + (i % 4)) }
  for (let t = 0; t < 6; t++) {
    for (const [day, noise] of [[1, 0.3], [20, -0.2]]) {
      const value = 70 + 6 * group + (i % 5) - 1 + (-2 - group + (i % 3 - 1) * 0.2) * t + noise + [0.2, -0.3, 0.1, 0.1, -0.3, 0.2][t]
      labRows.push({ patientId: id, labDatum: new Date(Date.UTC(2020 + t, 0, day)), bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 50 + t })
    }
  }
}
labRows.push({ ...labRows[0], labDatum: new Date(Date.UTC(2020, 5, 1)), wert: '<5', wertNum: 5, wertOperator: '<' })
const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
fitConfig.timeBalancing = 'quarterly-median'
const spec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global', fitConfig }
const [entity] = workspaceModelEntities(labRows, Object.keys(attributes).concat('p23'), spec, config, attributes, [])

async function fit(workerPath) {
  return page.evaluate(({ workerPath, request }) => new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { type: 'module' })
    const timer = setTimeout(() => reject(new Error('Real runtime fit exceeded 180 seconds')), 180_000)
    worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data.result) }
    worker.postMessage(request)
  }), { workerPath, request: {
    type: 'run-mixed-model', requestId: `export-${Date.now()}`, engine: 'webr-lme4', config, rows: entity.rows,
    formula: mixedModelFormula(config), formulaKey: mixedModelFormulaKey(config), datasetId: 'cohort',
    fitConfigHash: 'verification', wasmAssetSource: 'cdn', preparation: entity.preparation,
  } })
}

try {
  const result = await fit('/src/core/mixedModel/webr.worker.ts')
  assert.equal(result.status, 'success', JSON.stringify(result))
  if (process.env.COMPARE_WORKER) {
    const other = await fit(process.env.COMPARE_WORKER)
    assert.deepEqual(result.fixedEffectTerms.map(({ term, estimate, confidenceInterval }) => ({ term, estimate, confidenceInterval })), other.fixedEffectTerms)
    assert.deepEqual(result.fixedEffectConfidenceIntervals, other.fixedEffectConfidenceIntervals)
    assert.deepEqual(result.randomEffects, other.randomEffects)
    console.log('Estimates and intervals identical to', process.env.COMPARE_WORKER)
  }
  const { terms, matrix } = result.fixedEffectCovariance
  result.fixedEffectTerms.forEach((term, index) => {
    assert.equal(terms[index], term.term)
    assert.ok(Math.abs(term.standardError - Math.sqrt(matrix[index][index])) < 1e-12, term.term)
  })
  const sheets = mixedModelExportSheets([{ entity: 'Whole cohort', result, identity: { seriesKey: 'eGFR|ml/min/1.73m2' }, rows: entity.rows, inputFlags: entity.inputFlags }])
  const flags = sheets.find((sheet) => sheet.name === 'model_input_flags').rows
  for (const status of ['aggregated_into_median', 'excluded']) assert.ok(flags.some((flag) => flag.status === status), status)
  assert.ok(flags.some((flag) => flag.reason === 'bound_value') && flags.some((flag) => flag.reason.startsWith('patient_excluded')))
  const script = sheets.find((sheet) => sheet.name === 'r_script').rows.map((row) => row.line).join('\n')
  const refit = await page.evaluate(async ({ bytes, script }) => {
    const { WebR } = await import('https://webr.r-wasm.org/v0.6.0/webr.mjs')
    const webR = new WebR()
    await webR.init()
    await webR.installPackages(['lme4', 'readxl', 'jsonlite'], { quiet: true })
    await webR.FS.writeFile('/home/web_user/cohort-models.xlsx', new Uint8Array(bytes))
    return JSON.parse(await webR.evalRString(`setwd("/home/web_user")
      source(textConnection(${JSON.stringify(script)}))
      jsonlite::toJSON(lapply(mm_fits, function(f) list(fixef = as.list(lme4::fixef(f)), vcov = unname(as.matrix(vcov(f))))), auto_unbox = TRUE, digits = NA)`))
  }, { bytes: [...sheetsToXlsxBytes(sheets)], script })
  const refitted = refit['Whole cohort']
  for (const [index, term] of result.fixedEffectTerms.entries()) {
    // Browser estimates carry jsonlite's four decimal places (OD-30); vcov is full precision.
    assert.ok(Math.abs(refitted.fixef[term.term] - term.estimate) <= 5e-5, `${term.term}: ${refitted.fixef[term.term]} vs ${term.estimate}`)
    matrix[index].forEach((value, column) => assert.ok(Math.abs(refitted.vcov[index][column] - value) < 1e-9))
  }
  console.log(JSON.stringify({ terms: result.fixedEffectTerms, packageVersions: result.metadata.packageVersions, rows: entity.rows.length, flags: flags.length }))
  console.log('R script refit matches the browser fit.')
  await browser.close()
  await server.close()
  process.exit(0)
} catch (error) {
  console.error(error)
  await browser.close()
  await server.close()
  process.exit(1)
}
