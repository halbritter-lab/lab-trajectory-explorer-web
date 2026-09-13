import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'
import { readFile } from 'node:fs/promises'
import { hashMixedModelInput } from '../../src/core/mixedModel/validation'

// Deterministic worker seam tests the production browser flow and real download.
// scripts/verify_mixed_model_projections.mjs separately verifies actual R fits.
const workerScript = `self.onmessage = async ({data:q}) => {
  const datasetHash = await (await fetch('/__projection_hash',{method:'POST',body:JSON.stringify(q.rows)})).text();
  const adjusted = q.config.factors?.some(f => f.key === 'genotype');
  const intercept = q.rows[0].eGFR < 80 ? 60 : 80;
  const slope = intercept === 60 ? -3 : 5;
  const result = {
    status:'success',converged:true,warnings:[],
    metadata:{engine:q.engine,formula:q.formula,modelConfig:q.config,preparation:q.preparation,
      runtimeVersion:'browser-fixture',packageVersions:{},browserUserAgent:'playwright',
      wasmAssetSource:'local-dev',optimizer:null,reml:true,tolerance:null,datasetId:q.datasetId,
      datasetHash,randomSeed:null,fitConfigHash:q.fitConfigHash},
    nPatients:new Set(q.rows.map(r=>r.patient_id)).size,nMeasurements:q.rows.length,
    fixedEffects:{intercept,timeSinceBaseline:slope},
    fixedEffectTerms:[{term:'(Intercept)',estimate:intercept,confidenceInterval:null},{term:'time_since_baseline',estimate:slope,confidenceInterval:null},...(adjusted?[{term:'factor_0_B',estimate:6,confidenceInterval:null},{term:'time_since_baseline:factor_0_B',estimate:-1,confidenceInterval:null}]:[])],
    fixedEffectConfidenceIntervals:{timeSinceBaseline:null},
    randomEffects:{interceptSd:1,slopeSd:0.1,interceptSlopeCorrelation:0},residualSd:1
  };
  self.postMessage({type:'mixed-model-result',requestId:q.requestId,result});
};`

test('projects a custom nonrenal target and downloads the applied settings', async ({page,context}) => {
  await context.route('**/__projection_hash', route => route.fulfill({body:hashMixedModelInput(route.request().postDataJSON())}))
  await context.route(/webr\.worker[^/]*\.(?:ts|js)(?:\?.*)?$/, route => route.fulfill({contentType:'application/javascript',body:workerScript}))
  const wb = XLSX.utils.book_new()
  const labs = Array.from({length:9},(_,i) => [0,1,2].map(year => ({patientId:i+1,labDate:`${2020+year}-01-01`,testName:'Study marker',unit:'U/L',value:80+5*year+i}))).flat()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(labs),'labs')
  await page.goto('/')
  await page.locator('main input[type=file]').setInputFiles({name:'projection-study.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
  await expect(page.getByRole('status')).toContainText('Loaded 27 rows')
  await page.getByRole('button',{name:'Cohort',exact:true}).click()
  await page.getByRole('combobox',{name:'Series 1 parameter'}).fill('Study marker')
  await page.getByRole('option',{name:'Study marker (U/L)',exact:true}).click()
  await page.getByRole('button',{name:/Open .*cohort model/}).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Study marker')
  await dialog.getByRole('button',{name:'Fit selected',exact:true}).click()
  await expect(dialog.getByTestId('cohort-model-row')).toContainText('5.00')
  // Remaining interactions use the projection editor's accessible controls.
  await dialog.getByRole('button',{name:'Details',exact:true}).click()
  await expect(dialog.getByRole('button',{name:/G4/})).toHaveCount(0)
  await dialog.getByRole('button',{name:'Add custom target',exact:true}).click()
  await dialog.getByLabel('Target 1 label').fill('Study boundary')
  await dialog.getByLabel('Target 1 threshold').fill('100')
  await dialog.getByLabel('Target 1 direction').selectOption('above')
  await expect(dialog.getByRole('button',{name:'Export models (xlsx)'})).toBeDisabled()
  await dialog.getByRole('button',{name:'Apply projection settings'}).click()
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button',{name:'Export models (xlsx)'}).click()
  const download = await downloadPromise
  const path = await download.path()
  const exported = XLSX.read(await readFile(path!))
  const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(exported.Sheets.projections)
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({status:'crossing',model_time_years:4,remaining_years:4})]))
  expect(JSON.stringify(rows)).toContain('Study boundary')
  expect(JSON.stringify(rows)).toContain('U/L')
  expect(JSON.stringify(rows)).toContain('not estimated')
  await dialog.getByLabel('Horizon (years)').fill('2')
  await dialog.getByRole('button',{name:'Apply projection settings'}).click()
  await expect(dialog.getByRole('table',{name:'Projected boundary intersections'})).toContainText(/horizon/i)
  await dialog.getByLabel('Target 1 enabled').uncheck()
  await dialog.getByRole('button',{name:'Apply projection settings'}).click()
  const disabledDownloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button',{name:'Export models (xlsx)'}).click()
  const disabledDownload = await disabledDownloadPromise
  const disabledWorkbook = XLSX.read(await readFile((await disabledDownload.path())!))
  const disabledRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(disabledWorkbook.Sheets.projections)
  expect(disabledRows).toEqual(expect.arrayContaining([expect.objectContaining({status:'disabled'})]))
  expect(disabledRows[0].remaining_years).toBeUndefined()
  await dialog.getByLabel('Target 1 threshold').fill('120')
  await expect(dialog.getByRole('button',{name:'Export models (xlsx)'})).toBeDisabled()
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  await expect(dialog.getByLabel('Target 1 threshold')).toHaveValue('100')
  await expect(dialog.getByRole('button',{name:'Export models (xlsx)'})).toBeEnabled()
})


test('uses renal presets and the selected fitted genotype profile in exports', async ({page,context}) => {
  await context.route('**/__projection_hash', route => route.fulfill({body:hashMixedModelInput(route.request().postDataJSON())}))
  await context.route(/webr\.worker[^/]*\.(?:ts|js)(?:\?.*)?$/, route => route.fulfill({contentType:'application/javascript',body:workerScript}))
  const wb = XLSX.utils.book_new()
  const ids = Array.from({length:9},(_,i) => i+1)
  const labs = ids.flatMap(id => [0,1,2].map(year => ({patientId:id,labDate:`${2020+year}-01-01`,testName:'eGFR',unit:'ml/min/1.73m2',value:60+6*(id%2)-3*year})))
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(labs),'labs')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ids.map(id => ({patientId:id,genotype:id%2?'B':'A'}))),'attributes')
  await page.goto('/')
  await page.locator('main input[type=file]').setInputFiles({name:'projection-genotype.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
  await expect(page.getByRole('status')).toContainText('Loaded 27 rows')
  await page.getByRole('button',{name:'Cohort',exact:true}).click()
  await page.getByRole('combobox',{name:'Series 1 parameter'}).fill('eGFR')
  await page.getByRole('option',{name:'eGFR (ml/min/1.73m2)',exact:true}).click()
  await page.getByRole('button',{name:'Open cohort model'}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('genotype effect').selectOption('level_slope')
  await dialog.getByLabel('genotype reference').selectOption('A')
  await dialog.getByRole('button',{name:'Apply settings',exact:true}).click()
  await dialog.getByRole('button',{name:'Fit selected',exact:true}).click()
  await expect(dialog.getByTestId('cohort-model-row')).toContainText('-3.00')
  await dialog.getByRole('button',{name:'Details',exact:true}).click()
  await expect(dialog.getByLabel('Target 1 threshold')).toHaveValue('30')
  await expect(dialog.getByLabel('Target 2 threshold')).toHaveValue('15')
  await dialog.getByLabel('Profile genotype').selectOption('B')
  await dialog.getByRole('button',{name:'Apply projection settings'}).click()
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button',{name:'Export models (xlsx)'}).click()
  const download = await downloadPromise
  const exported = XLSX.read(await readFile((await download.path())!))
  const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(exported.Sheets.projections)
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({threshold:30,model_time_years:9,remaining_years:9,profile:JSON.stringify({genotype:'B'})}),
    expect.objectContaining({threshold:15,model_time_years:12.75,remaining_years:12.75}),
  ]))
  await dialog.getByRole('table',{name:'Projected boundary intersections'}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'test-results/projection-genotype-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await dialog.getByLabel('Profile genotype').scrollIntoViewIfNeeded()
  await expect(dialog.getByLabel('Profile genotype')).toBeVisible()
  const layout = await dialog.getByRole('region',{name:'Trend projection',exact:true}).evaluate(element => ({width:element.getBoundingClientRect().width,scroll:element.scrollWidth,right:element.getBoundingClientRect().right}))
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 2)
  const dialogRight = await dialog.evaluate(element => element.getBoundingClientRect().right)
  expect(layout.right).toBeLessThanOrEqual(dialogRight)
  await page.screenshot({path:'test-results/projection-genotype-mobile.png',fullPage:true})
})
