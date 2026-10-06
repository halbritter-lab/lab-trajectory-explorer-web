import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'
import { hashMixedModelInput } from '../../src/core/mixedModel/validation'

// Deterministic worker seam: echoes the patients it received so the test can
// check the complete-case population that actually reached the model.
const workerScript = `self.onmessage = async ({data:q}) => {
  const datasetHash = await (await fetch('/__factors_hash',{method:'POST',body:JSON.stringify(q.rows)})).text();
  const adjusted = q.config.factors?.some(f => f.key === 'genotype');
  const result = {
    status:'success',converged:true,warnings:[],
    metadata:{engine:q.engine,formula:q.formula,modelConfig:q.config,preparation:q.preparation,
      runtimeVersion:'browser-fixture',packageVersions:{},browserUserAgent:'playwright',
      wasmAssetSource:'local-dev',optimizer:null,reml:true,tolerance:null,datasetId:q.datasetId,
      datasetHash,randomSeed:null,fitConfigHash:q.fitConfigHash},
    nPatients:new Set(q.rows.map(r=>r.patient_id)).size,nMeasurements:q.rows.length,
    fixedEffects:{intercept:70,timeSinceBaseline:-1},
    fixedEffectTerms:[{term:'(Intercept)',estimate:70,confidenceInterval:null},{term:'time_since_baseline',estimate:-1,confidenceInterval:null},...(adjusted?[{term:'factor_0_B',estimate:2,confidenceInterval:null},{term:'time_since_baseline:factor_0_B',estimate:-0.5,confidenceInterval:null}]:[])],
    fixedEffectConfidenceIntervals:{timeSinceBaseline:null},
    randomEffects:{interceptSd:1,slopeSd:0.1,interceptSlopeCorrelation:0},residualSd:1
  };
  self.postMessage({type:'mixed-model-result',requestId:q.requestId,result});
};`

test('real workbook previews complete-case factor selection before fitting', async ({ page, context }) => {
  await context.route('**/__factors_hash', route => route.fulfill({ body: hashMixedModelInput(route.request().postDataJSON()) }))
  await context.route(/webr\.worker[^/]*\.(?:ts|js)(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: workerScript }))
  const wb = XLSX.utils.book_new()
  const ids = Array.from({ length: 9 }, (_, index) => index + 1)
  const labs = ids.flatMap((patientId) => [0, 1, 2].map((year) => ({ patientId, labDate: `${2022 + year}-01-01`, testName: 'eGFR', unit: 'ml/min/1.73m2', value: 80 - patientId - year, ageAtLab: 40 + patientId * 2 + year, sex: patientId % 2 ? 'm' : 'w' })))
  const attributes = ids.map((patientId) => ({ patientId, genotype: patientId === 9 ? '' : patientId % 3 ? 'A' : 'B' }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(labs), 'labs')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attributes), 'attributes')
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'model-factors.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) })
  await expect(page.locator('.workspace-dataset')).toContainText('9 patients')
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  await expect(page.getByLabel('Model parameter')).toHaveValue(JSON.stringify(['eGFR', 'ml/min/1.73m2']))
  const studio = page.getByRole('region', { name: 'Model Studio' })
  await expect(studio.locator('.cm-sample-meta')).toHaveText('Complete cases: 9 patients / 9 (27 measurements)')

  // Adding genotype as a covariate previews the complete-case population first.
  await studio.getByRole('button', { name: /Custom model/ }).click()
  await studio.getByLabel('Add covariate').selectOption('genotype')
  await studio.getByLabel('genotype effect').selectOption('level_slope')
  await studio.getByLabel('genotype reference').selectOption('A')
  await expect(studio.locator('.cm-sample-meta')).toHaveText('Complete cases: 8 patients / 9 (24 measurements)')
  await expect(studio.getByLabel('Readable formula')).toContainText('Time (years):"genotype"')
  await studio.getByText('Excluded patients (1)', { exact: true }).click()
  await expect(studio.getByRole('list', { name: 'Patients excluded from the model' })).toContainText('9: Missing genotype')

  await studio.getByRole('button', { name: /Fit model/ }).click()
  const row = page.getByTestId('cohort-model-row')
  await expect(row.getByRole('cell').nth(2)).toHaveText('8')
  await expect(page.getByRole('columnheader', { name: 'Reference slope', exact: true })).toBeVisible()
})
