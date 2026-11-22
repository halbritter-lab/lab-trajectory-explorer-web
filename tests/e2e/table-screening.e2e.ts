import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import { hashMixedModelInput } from '../../src/core/mixedModel/validation'

// Trajectories table after the persona review of 2026-11-21: order of uncertain slopes,
// decimals per parameter, mark filters, paging with collapsed groups, export scope.
const EGFR = 'eGFR [ml/min/1,73m²]'
const CREATININE = 'Kreatinin [mg/dl]'

async function demoTrajectories(page: Page, trends: string[]) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  for (const label of trends) await page.getByRole('checkbox', { name: `Analyse trend: ${label}`, exact: true }).check()
}
const tableOrder = (page: Page) => page.locator('.wt-table tbody th[scope=row] button').allTextContents()
const rowOf = (page: Page, id: string) => page.getByRole('button', { name: `Open patient ${id}`, exact: true }).locator('xpath=ancestor::tr')

test('sorts uncertain slopes after the reliable ones, says so, and exports in that order', async ({ page }) => {
  await demoTrajectories(page, [EGFR])
  await page.getByRole('button', { name: `Sort: ${EGFR}`, exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Slope: ascending', exact: true }).click()
  // Decided 2026-11-21. Patient 12 (-7.35 per year over 151 days) stood at rank 9, between 9 and 6.
  const expected = ['4', '7', '26', '24', '20', '21', '25', '9', '6', '27', '22', '17', '19', '23', '2', '28', '18', '16', '15', '11', '8', '1', '13', '14', '12', '3', '5', '10']
  expect(await tableOrder(page)).toEqual(expected)
  await expect(page.locator('.pv-scope')).toContainText('1 uncertain slope placed after the reliable ones')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const cohort = XLSX.utils.sheet_to_json<{ PatientID: number; Parameter: string; slope: number | string; unstable_slope: string }>(workbook.Sheets.cohort).filter(row => row.Parameter === 'eGFR')
  expect(cohort.map(row => String(row.PatientID))).toEqual(expected)
  // The values are untouched: only the place of the row changed.
  expect(cohort[24]).toMatchObject({ PatientID: 12, unstable_slope: 'yes' })
  expect(Number(cohort[24].slope)).toBeCloseTo(-7.35, 2)
  await page.getByRole('checkbox', { name: 'Uncertain slopes last' }).uncheck()
  expect((await tableOrder(page)).slice(7, 10)).toEqual(['9', '12', '6'])
  await expect(page.locator('.pv-scope')).toContainText('1 uncertain slope ranked among the reliable ones')
})

test('writes small slopes with the decimals of their parameter in table and patient view', async ({ page }) => {
  await demoTrajectories(page, [CREATININE, EGFR])
  // Creatinine: median absolute slope 0.0948 mg/dl per year, so three decimals. Was "+0.01 [0.01, 0.01]".
  const eight = rowOf(page, '8')
  await expect(eight.locator('.pv-cell-slope').first()).toHaveText('+0.010 mg/dl/yr')
  await expect(eight.locator('.pv-cell-ci').first()).toHaveText('95% CI [0.007, 0.014]')
  await expect(rowOf(page, '12').locator('.pv-cell-ci').first()).toHaveText('95% CI [-1.697, 2.246]')
  // eGFR keeps two decimals.
  await expect(eight.locator('.pv-cell-slope').nth(1)).toHaveText('-1.23 ml/min/1,73m²/yr')
  await expect(eight.locator('.pv-cell-ci').nth(1)).toHaveText('95% CI [-1.50, -0.97]')
  await page.getByRole('button', { name: 'Open patient 8', exact: true }).click()
  await expect(page.getByText('OLS: +0.010 mg/dl/year, R² 0.81', { exact: true })).toBeVisible()
  await expect(page.getByText('95% slope CI [0.007, 0.014] mg/dl/year', { exact: true })).toBeVisible()
  await expect(page.getByText('95% slope CI [-1.50, -0.97] ml/min/1,73m²/year', { exact: true })).toBeVisible()
})

test('filters by mark and event type, and names the scope on the export button', async ({ page }) => {
  await demoTrajectories(page, [EGFR])
  const filters = page.getByRole('group', { name: 'Show only patients with' })
  await expect(filters.getByRole('button', { name: 'Kidney transplant: 3 patients' })).toBeVisible()
  // Decided 2026-11-21 (issue #72): the whole interval below -5 (7 patients) and the possible level (6).
  await expect(filters.getByRole('button', { name: 'Possible rapid decline: 6 patients' })).toBeVisible()
  await filters.getByRole('button', { name: 'Rapid decline: 7 patients' }).click()
  const shown = await tableOrder(page)
  expect(shown.length).toBeGreaterThan(0)
  expect(shown).not.toContain('12')
  expect([...shown].sort()).toEqual(['20', '21', '24', '25', '26', '4', '9'])
  for (const id of shown.slice(0, 3)) await expect(rowOf(page, id).getByRole('button', { name: 'rapid ↓', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: `Select all ${shown.length} matching` })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: `Export ${shown.length} of 28 patients (XLSX)` }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const exported = XLSX.utils.sheet_to_json<{ PatientID: number; Parameter: string; rapid_progression: string }>(workbook.Sheets.cohort).filter(row => row.Parameter === 'eGFR')
  expect(exported.map(row => String(row.PatientID)).sort()).toEqual([...shown].sort())
  expect(exported.every(row => row.rapid_progression === 'yes')).toBe(true)
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(page.getByRole('button', { name: 'Export cohort (XLSX)' })).toBeVisible()
})

test('names the reason for a missing computed eGFR in the cell', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  // Patient 5: four creatinine values, neither sex nor age. Patient 10: creatinine in µmol/l only.
  const hint = rowOf(page, '5').getByRole('button', { name: 'No eGFR: sex and age missing' })
  await expect(hint).toBeVisible()
  await hint.hover()
  await expect(page.getByRole('tooltip')).toContainText('No eGFR for this patient: sex missing (4 creatinine values); age missing (4 creatinine values). Enter the sex and the age under Data → “Review and edit patients”.')
  await expect(rowOf(page, '10').getByRole('button', { name: 'No eGFR: no creatinine in the source' })).toBeVisible()
})

function centres(): Buffer {
  const lines = ['patientId,labDate,testName,unit,value']
  const attributes = ['patientId,centre']
  for (let i = 1; i <= 120; i++) {
    const id = `P-${String(i).padStart(3, '0')}`
    for (const year of [2020, 2021, 2022]) lines.push(`${id},${year}-03-01,Marker,U/L,${40 + i % 7 + (year - 2020)}`)
    attributes.push(`${id},${i <= 70 ? 'A' : 'B'}`)
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(lines.map(line => line.split(','))), 'labs')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(attributes.map(line => line.split(','))), 'attributes')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('pages below the table, returns to its top, and gives collapsed groups no page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'centres.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: centres() })
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  const above = page.getByRole('navigation', { name: 'Patient table pages', exact: true })
  const below = page.getByRole('navigation', { name: 'Patient table pages, below the table' })
  await expect(above.getByRole('status')).toHaveText('Showing 1–50 of 120 patients')
  await below.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(2000)
  await expect(below).toContainText('Page 1 of 3 · patients 1–50 of 120')
  await below.getByRole('button', { name: 'Below the table: next page' }).click()
  await expect(page.getByRole('button', { name: 'Open patient P-051', exact: true })).toBeVisible()
  // The new page starts at the top of the table, not where the last one ended.
  const table = page.getByRole('region', { name: 'Patient table, horizontal scrolling' })
  await expect.poll(async () => (await table.boundingBox())!.y).toBeLessThan(40)
  expect((await table.boundingBox())!.y).toBeGreaterThanOrEqual(0)
  await expect(table).toBeFocused()

  await page.getByLabel('Patients per page').selectOption('100')
  await expect(above.getByRole('status')).toHaveText('Showing 1–100 of 120 patients')
  await expect(page.locator('.wt-table tbody th[scope=row]')).toHaveCount(100)
  await page.getByLabel('Go to page').selectOption({ label: '2' })
  await expect(page.locator('.wt-table tbody th[scope=row]')).toHaveCount(20)
  await page.getByLabel('Patients per page').selectOption('50')

  // 70 patients in centre A: collapsed, they held pages 1 and 2 with nothing but their header.
  await page.getByLabel('Group by attribute').selectOption('centre')
  await page.getByRole('button', { name: 'Collapse group A' }).click()
  await expect(page.getByRole('button', { name: 'Expand group A' })).toContainText('70 patients')
  await expect(page.locator('.wt-table tbody th[scope=row]')).toHaveCount(50)
  await expect(page.getByRole('button', { name: 'Open patient P-071', exact: true })).toBeVisible()
  await expect(above.getByRole('button', { name: 'Next table page', exact: true })).toHaveCount(0)
  // Selection reaches the visible rows; the export keeps every patient.
  await page.getByRole('checkbox', { name: 'Select visible patients on this page' }).check()
  await expect(page.getByText('50 selected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export cohort (XLSX)' })).toBeVisible()
})

test('on a phone the marks are a toolbar menu, so the first charts stay on the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await demoTrajectories(page, [EGFR])
  await expect(page.getByRole('group', { name: 'Show only patients with' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Show only/ }).click()
  const menu = page.getByRole('group', { name: 'Show only patients with' })
  for (const button of await menu.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await menu.getByRole('button', { name: 'Kidney transplant: 3 patients' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.wt-table tbody th[scope=row]')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Show only/ })).toContainText('1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

// A fixed worker result in place of R: the test is about how the page writes the numbers.
const modelWorker = `self.onmessage = async ({data:q}) => {
  const datasetHash = await (await fetch('/__screening_hash',{method:'POST',body:JSON.stringify(q.rows)})).text();
  const result = {
    status:'success',converged:true,singular:false,warnings:[],
    metadata:{engine:q.engine,formula:q.formula,modelConfig:q.config,preparation:q.preparation,
      runtimeVersion:'browser-fixture',packageVersions:{},browserUserAgent:'playwright',
      wasmAssetSource:'local-dev',optimizer:null,reml:true,datasetId:q.datasetId,
      datasetHash,randomSeed:null,fitConfigHash:q.fitConfigHash},
    nPatients:new Set(q.rows.map(r=>r.patient_id)).size,nMeasurements:q.rows.length,
    fixedEffects:{intercept:1.4567,timeSinceBaseline:0.0213},
    fixedEffectTerms:[{term:'(Intercept)',estimate:1.4567,confidenceInterval:[1.2,1.7134]},{term:'time_since_baseline',estimate:0.0213,confidenceInterval:[0.0152,0.0274]}],
    fixedEffectConfidenceIntervals:{timeSinceBaseline:[0.0152,0.0274]},
    randomEffects:{interceptSd:0.3,slopeSd:0.0041,interceptSlopeCorrelation:0},residualSd:0.05
  };
  self.postMessage({type:'mixed-model-result',requestId:q.requestId,result});
};`

test('the Cohort models page writes a slope with the decimals of its parameter', async ({ page, context }) => {
  await context.route('**/__screening_hash', route => route.fulfill({ body: hashMixedModelInput(route.request().postDataJSON()) }))
  await context.route(/webr\.worker[^/]*\.(?:ts|js)(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: modelWorker }))
  // Ten patients rising by 0.02 per year: the median absolute slope asks for three decimals.
  const labs = Array.from({ length: 10 }, (_, i) => [0, 1, 2].map(year => ({ patientId: i + 1, labDate: `${2020 + year}-01-01`, testName: 'Small marker', unit: 'mg/L', value: 1 + 0.02 * year + i / 10 }))).flat()
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(labs), 'labs')
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'small-slopes.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) })
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Analyse trend: Small marker [mg/L]', exact: true }).check()
  await expect(page.locator('.pv-cell-slope').first()).toHaveText('+0.020 mg/L/yr')
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  const results = page.getByRole('region', { name: 'Cohort mixed model' })
  await results.getByRole('button', { name: 'Fit selected', exact: true }).click()
  const row = results.getByTestId('cohort-model-row')
  // Was "0.02 mg/L/yr [0.02, 0.03]" beside "0.021 [0.02, 0.03]" among the coefficients.
  await expect(row).toContainText('+0.021 mg/L/yr')
  await expect(row).toContainText('[0.015, 0.027]')
  await expect(page.locator('.cm-slope-badge')).toContainText('+0.021 mg/L/yr')
  await results.getByRole('button', { name: 'Details', exact: true }).click()
  const coefficients = results.getByRole('table', { name: 'Fixed effect coefficients' })
  await expect(coefficients.getByRole('row').nth(1)).toContainText('1.457[1.200, 1.713]')
  await expect(coefficients.getByRole('row').nth(2)).toContainText('0.021[0.015, 0.027]')
  await expect(results.getByText('Patient slope SD', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('0.004')
})
