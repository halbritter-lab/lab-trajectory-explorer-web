import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import { unzipSync, strFromU8 } from 'fflate'

test.use({ timezoneId: 'America/Los_Angeles' })

function researchWorkbook(): Buffer {
  const labs: object[] = []
  for (const [index, patientId] of ['A-01', 'B-02', 'C-03'].entries()) {
    for (let year = 0; year < 4; year++) {
      for (let parameter = 0; parameter < 12; parameter++) labs.push({
        patientId, labDate: `${2020 + year}-01-15`,
        testName: parameter < 2 ? 'Creatinine' : `Marker ${parameter}`,
        unit: parameter === 0 ? 'mg/dl' : 'U/L',
        value: parameter === 0 ? 1 + year * .1 + index * .2 : parameter * 10 + year,
        sex: index === 1 ? 'm' : 'f', ageAtLab: index === 2 ? null : 50 + index * 10 + year,
      })
    }
  }
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries({
    labs,
    attributes: [{ patientId: 'A-01', studyArm: 'Control' }, { patientId: 'B-02', studyArm: 'Intervention' }, { patientId: 'C-03', studyArm: 'Control' }],
    events: [{ patientId: 'A-01', type: 'other', date: '2021-01-15', title: 'Research visit' }, { patientId: 'A-01', type: 'other', date: 'bad-date', title: 'Rejected visit' }],
  })) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

async function upload(page: Page) {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'research.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: researchWorkbook() })
  await expect(page.locator('.workspace-dataset')).toContainText('3 patients')
}

test('2000-patient table navigation updates in under two seconds without losing detail focus', async ({ page }) => {
  const rows = ['patientId,labDate,testName,unit,value', ...Array.from({ length: 2000 }, (_, index) => `P-${String(index + 1).padStart(4, '0')},2020-01-01,Marker,U/L,${index + 1}`)]
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('2000 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.locator('.wt-table tbody tr')).toHaveCount(50)
  const elapsedMs = await page.evaluate(async () => {
    const next = document.querySelector<HTMLButtonElement>('[aria-label="Next table page"]')!
    const start = performance.now()
    next.click()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - start
  })
  expect(elapsedMs).toBeLessThan(2000)
  await expect(page.getByRole('button', { name: 'Open patient P-0051' })).toBeVisible()
  await page.getByRole('button', { name: 'Open patient P-0051' }).click()
  await expect(page.getByRole('heading', { name: 'Patient P-0051' })).toBeFocused()
  await page.getByRole('button', { name: 'Back to table' }).click()
  await expect(page.getByRole('button', { name: 'Open patient P-0051' })).toBeFocused()
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('approved endpoint rules: configurable confirmation, visible recovery and workbook provenance', async ({ page }, testInfo) => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([14, 13, 20].map((value, i) => ({ patientId: 'P-1', labDate: ['2020-01-01', '2020-02-01', '2020-05-01'][i], testName: 'eGFR', unit: 'mL/min/1.73m²', value, ageAtLab: 60, sex: 'f' }))), 'labs')
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'endpoints.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) })
  await expect(page.locator('.workspace-dataset')).toContainText('1 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByText('Display and analysis', { exact: true }).click()
  await page.getByLabel('Analysis preset').selectOption('ckd_progression')
  await page.getByText('Advanced pipeline settings', { exact: true }).click()
  await page.getByLabel('Minimum confirmation interval (days)').fill('30')
  await expect(page.locator('.wt-badge-endpoint')).toContainText('G5 recovery')
  await page.getByText('Endpoint details', { exact: true }).click()
  await expect(page.locator('.wt-cell-summary details')).toContainText('event 2020-01-01')
  await expect(page.locator('.wt-cell-summary details')).toContainText('confirmed 2020-02-01')
  await expect(page.locator('.wt-cell-summary details')).toContainText('recovery 2020-05-01')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const exported = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(XLSX.utils.sheet_to_json(exported.Sheets.cohort)[0]).toMatchObject({ endpoint_confirmation_days: 30, endpoint_observed_ckd_g4: 'yes', endpoint_observed_ckd_g5: 'yes', endpoint_g5_first_date: '2020-01-01', endpoint_g5_confirmed_date: '2020-02-01', endpoint_g5_recovery_date: '2020-05-01', endpoint_prediction_anchor: 'fitted curve' })
  const settings = XLSX.utils.sheet_to_json<{ fit_config: string }>(exported.Sheets.settings)
  expect(JSON.parse(settings[0].fit_config).endpoints.confirmationDays).toBe(30)
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.locator('.wt-cell-summary details').scrollIntoViewIfNeeded()
  expect(await page.locator('.wt-cell-summary details').evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(240)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('endpoint-recovery-mobile.png') })
  await page.getByLabel('Minimum confirmation interval (days)').fill('90')
  await expect(page.locator('.wt-badge-endpoint')).not.toContainText('CKD G5')
})

test('workspace saves the complete data preparation, resumes and removes the saved copy', async ({ page }, testInfo) => {
  await upload(page)
  await page.getByText('Review and edit patients (3)', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit demographics: C-03' }).click()
  await page.getByRole('dialog').getByLabel('Age at reference date').fill('40')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  await expect(page.locator('.workspace-dataset')).toContainText('Saved on this device')
  await page.reload()
  await expect(page.locator('.workspace-dataset')).toContainText('research.xlsx')
  await expect(page.locator('.workspace-dataset')).toContainText('13 parameters')
  await expect(page.getByRole('checkbox', { name: 'Remember on this device' })).toBeChecked()
  await expect(page.getByLabel('eGFR formula')).toHaveValue('ckd-epi-2021')
  await expect(page.getByText('12 computed values in preview', { exact: true })).toBeVisible()
  await expect(page.getByText('1 events', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('option', { name: 'studyArm', exact: true })).toBeAttached()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  // A rejected file must not overwrite the saved, usable dataset.
  await page.getByLabel('Import lab values').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong,header\nx,y\n') })
  await expect(page.getByRole('alert')).toBeVisible()
  await page.reload()
  await expect(page.locator('.workspace-dataset')).toContainText('research.xlsx')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.workspace-storage').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`storage-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Clear saved data' }).click()
  await expect(page.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked()
  await expect(page.locator('.workspace-dataset')).toContainText('research.xlsx')
  await page.reload()
  await expect(page.locator('.workspace-dataset')).toContainText('No data loaded yet')
})

test('model preview exports actual SVG and PNG with chart context', async ({ page }, testInfo) => {
  await upload(page)
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  const preview = page.locator('.cm-plot-card')
  for (const format of ['SVG', 'PNG']) {
    const pending = page.waitForEvent('download')
    await preview.getByRole('button', { name: `Download ${format}` }).click()
    const download = await pending
    const bytes = await readFile((await download.path())!)
    if (format === 'SVG') {
      expect(bytes.toString()).toContain('Research use only')
      expect(bytes.toString()).toContain('Years since baseline')
    } else {
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      expect(bytes.length).toBeGreaterThan(1000)
    }
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await preview.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await preview.screenshot({ path: testInfo.outputPath(`model-preview-${width}.png`) })
  }
})

test('another tab cannot recreate a cleared workspace snapshot', async ({ page, context }) => {
  await upload(page)
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  await expect(page.locator('.workspace-dataset')).toContainText('Saved on this device')
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.locator('.workspace-dataset')).toContainText('research.xlsx')
  await page.getByRole('button', { name: 'Clear saved data' }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('This session only')
  await second.getByText('Review and edit patients (3)', { exact: true }).click()
  await second.getByRole('button', { name: 'Edit demographics: A-01' }).click()
  await second.getByRole('dialog').getByLabel('Age at reference date').fill('42')
  await second.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('another tab')
  await expect(second.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked()
  await page.reload()
  await expect(page.locator('.workspace-dataset')).toContainText('No data loaded yet')
})

test('patient bundle contains the selected patient workbook and chart SVGs', async ({ page }) => {
  await upload(page)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'All parameters', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Open patient A-01', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export patient bundle (ZIP)' }).click()
  const download = await pending
  const files = unzipSync(await readFile((await download.path())!))
  const charts = Object.keys(files).filter(name => name.endsWith('.svg'))
  expect(charts).toHaveLength(12)
  for (const chart of charts) {
    expect(strFromU8(files[chart])).toContain('Patient A-01')
    expect(strFromU8(files[chart])).toContain('Research use only')
  }
  const workbook = XLSX.read(files[Object.keys(files).find(name => name.endsWith('.xlsx'))!], { type: 'array' })
  const measurements = XLSX.utils.sheet_to_json<{ PatientID: string }>(workbook.Sheets.measurements)
  expect(measurements).toHaveLength(48)
  expect(measurements.every(row => row.PatientID === 'A-01')).toBe(true)
})

test('patient measurements identify the clinical event responsible for an exclusion', async ({ page }) => {
  await upload(page)
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,type,date,title\nA-01,kidney_transplant,2021-01-01,Study transplant\n') })
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByText('Display and analysis', { exact: true }).click()
  await page.getByText('Advanced pipeline settings', { exact: true }).click()
  await page.getByLabel('Censor after kidney transplant').check()
  await page.getByRole('button', { name: 'Open patient A-01', exact: true }).click()
  await page.getByText('Show measurements (4)', { exact: true }).first().click()
  const table = page.getByRole('table', { name: 'Measurements Creatinine [mg/dl]', exact: true })
  await expect(table.getByRole('cell', { name: 'Excluded: after kidney transplant', exact: true })).toHaveCount(3)
  await expect(table.getByRole('cell', { name: 'Available before time aggregation', exact: true })).toHaveCount(1)
})

test('large synthetic cohort remains searchable and exports the filtered scope', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  const labs = Array.from({ length: 200 }, (_, patient) =>
    Array.from({ length: 12 }, (_, parameter) =>
      Array.from({ length: 8 }, (_, year) => ({ patientId: `P-${patient}`, labDate: `${2015 + year}-01-01`, testName: `Marker ${parameter}`, unit: 'u', value: 100 - year + parameter, sex: 'f', ageAtLab: 40 + year })))).flat(2)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(labs), 'labs')
  const started = Date.now()
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'large.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) })
  await expect(page.locator('.workspace-dataset')).toContainText('200 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'All parameters', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByLabel('Search patients').fill('P-199')
  await expect(page.getByRole('button', { name: 'Open patient P-199', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open patient P-1', exact: true })).toHaveCount(0)
  await testInfo.attach('large-cohort-timing', { body: JSON.stringify({ patients: 200, parameters: 12, measurements: 19200, importBrowseSearchMs: Date.now() - started }), contentType: 'application/json' })
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const exported = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const measurements = XLSX.utils.sheet_to_json<{ PatientID: string }>(exported.Sheets.measurements)
  expect(measurements).toHaveLength(96)
  expect(measurements.every(row => row.PatientID === 'P-199')).toBe(true)
})

test('column analysis settings stay independent and export on desktop and mobile', async ({ page }, testInfo) => {
  await upload(page)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByText('Display and analysis', { exact: true }).click()
  const scope = page.getByLabel('Edit analysis settings for')
  const key = await scope.locator('option').nth(1).getAttribute('value')
  await scope.selectOption(key!)
  await page.getByText('Advanced pipeline settings', { exact: true }).click()
  await page.getByLabel('Fit model', { exact: true }).selectOption('theil-sen')
  await page.getByLabel('Rapid decline threshold').fill('7.5')
  await scope.selectOption('')
  await page.getByLabel('Analysis preset', { exact: true }).selectOption('acute_review')
  await scope.selectOption(key!)
  await expect(page.getByLabel('Fit model', { exact: true })).toHaveValue('theil-sen')
  await expect(page.getByLabel('Rapid decline threshold')).toHaveValue('7.5')
  await expect(page.getByLabel('AKI exclusion days')).toBeDisabled()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const panel = page.locator('.wt-analysis-card')
    await panel.scrollIntoViewIfNeeded()
    const overflow = await panel.evaluate(element => element.scrollWidth > element.clientWidth)
    expect(overflow).toBe(false)
    await panel.screenshot({ path: testInfo.outputPath(`analysis-${width}.png`) })
  }
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export cohort/ }).click()
  const download = await downloadEvent
  const workbook = XLSX.read(await readFile((await download.path())!), { type: 'buffer' })
  const settings = XLSX.utils.sheet_to_json<{ parameter_key: string; fit_config: string; rapid_egfr_threshold: number }>(workbook.Sheets.settings)
  const own = settings.find(row => row.parameter_key === key)!
  expect(JSON.parse(own.fit_config).fitModel).toBe('theil-sen')
  expect(own.rapid_egfr_threshold).toBe(7.5)
  expect(settings.filter(row => row.parameter_key !== key).every(row => JSON.parse(row.fit_config).fitModel === 'none')).toBe(true)
  await page.getByRole('button', { name: 'Use shared settings' }).click()
  await expect(page.getByLabel('Fit model', { exact: true })).toHaveValue('none')
})

test('real workbook: quality, derivation, many parameters, shared scope and actual exports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await upload(page)
  await page.getByText(/import diagnostics — show details/).click()
  await expect(page.getByRole('listitem').filter({ hasText: /Event date "bad-date" is not a recognised date/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Rejected events' })).toContainText('Rejected visit')
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await expect(page.getByText('8 computed values in preview', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('13 parameters')

  // A rejected replacement must preserve current data and derived settings.
  await page.getByLabel('Import lab values').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong,header\nx,y\n') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.workspace-dataset')).toContainText('research.xlsx')
  await expect(page.locator('.workspace-dataset')).toContainText('13 parameters')

  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'All parameters', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('13 parameters selected', { exact: true })).toBeVisible()
  expect(await page.locator('.wt-table svg').count()).toBeGreaterThan(30)
  await page.getByLabel('Search patients', { exact: true }).fill('A-01')
  await expect(page.getByRole('button', { name: 'Open patient B-02', exact: true })).toHaveCount(0)
  await page.getByLabel('Group by').selectOption('studyArm')
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await expect(page.locator('.wt-plot-grid svg')).toHaveCount(13)

  const workbookDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /cohort.*xlsx/i }).click()
  const downloaded = await workbookDownload
  const bytes = await readFile((await downloaded.path())!)
  const result = XLSX.read(bytes, { type: 'buffer' })
  const measurements = XLSX.utils.sheet_to_json<{ PatientID: string; Date: string; origin: string }>(result.Sheets.measurements)
  expect(measurements.length).toBeGreaterThan(0)
  expect(new Set(measurements.map(row => row.PatientID))).toEqual(new Set(['A-01']))
  expect(measurements.some(row => row.origin === 'derived')).toBe(true)
  expect(measurements.every(row => row.Date.endsWith('-01-15'))).toBe(true)
  expect(XLSX.utils.sheet_to_json<{ date: string }>(result.Sheets.events)[0].date).toBe('2021-01-15')
  expect(XLSX.utils.sheet_to_json(result.Sheets.parameters)).toHaveLength(13)

  const svgDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /SVG/ }).first().click()
  const svg = await readFile((await (await svgDownload).path())!, 'utf8')
  expect(svg).toContain('Research use only')
  expect(svg).toContain('Creatinine')
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /PNG/ }).first().click()
  const png = await readFile((await (await pngDownload).path())!)
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  await page.getByRole('button', { name: /^Open patient A-01,/ }).first().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Patient A-01', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next patient' })).toBeDisabled()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByLabel('Search patients', { exact: true })).toHaveValue('A-01')
  expect(errors).toEqual([])
})

test('manual demographics and formula updates reach the selected derived trajectory', async ({ page }) => {
  await upload(page)
  await page.getByText('Review and edit patients (3)', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit demographics: C-03', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2020-01-15')
  await page.getByLabel('Age at reference date').fill('55')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await expect(page.getByText('12 computed values in preview', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('checkbox', { name: /eGFR.*computed/ }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: /eGFR.*CKD/ })).toBeVisible()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('mdrd-4')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: /eGFR.*MDRD/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /eGFR.*CKD/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open patient C-03', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patient C-03', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('off')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByText('0 parameters selected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Export.*\(XLSX\)/ })).toBeDisabled()
})

test('workspace stays within a narrow viewport and replacement resets selections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await upload(page)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'All parameters', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  const table = page.getByRole('region', { name: 'Patient table, horizontal scrolling' })
  await table.evaluate(element => { element.scrollLeft = 500 })
  await page.getByRole('button', { name: 'Open patient A-01', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patient A-01', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(table).toHaveJSProperty('scrollLeft', 500)
  await page.getByLabel('Search patients', { exact: true }).fill('A-01')
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('Import lab values').setInputFiles({ name: 'replacement.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,labDate,testName,unit,value\nnew-person,2025-01-01,Potassium,mmol/L,4.2\n') })
  await expect(page.locator('.workspace-dataset')).toContainText('1 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByLabel('Search patients', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Open patient new-person', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
})

test('review fixes: active views, stable value scales, visible derivation and scoped methods', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: /eGFR.*CKD.*computed/ })).toBeVisible()
  const tableButton = page.getByRole('button', { name: 'Table', exact: true })
  const overlayButton = page.getByRole('button', { name: 'Overlay', exact: true })
  const background = (button: typeof tableButton) => button.evaluate(node => getComputedStyle(node).backgroundColor)
  await expect(tableButton).toHaveAttribute('aria-pressed', 'true')
  expect(await background(tableButton)).not.toBe(await background(overlayButton))
  await overlayButton.click()
  await expect(overlayButton).toHaveAttribute('aria-pressed', 'true')
  expect(await background(overlayButton)).not.toBe(await background(tableButton))
  const chart = page.locator('svg.wt-plot').first()
  const sharedMin = Number(await chart.getAttribute('data-y-min'))
  const sharedMax = Number(await chart.getAttribute('data-y-max'))
  expect(sharedMin).toBeLessThanOrEqual(0)
  expect(sharedMax).toBeGreaterThan(4)
  await page.getByRole('button', { name: /^Open patient 1,/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Patient 1', exact: true })).toBeVisible()
  await expect(chart).toHaveAttribute('data-y-min', String(sharedMin))
  await expect(chart).toHaveAttribute('data-y-max', String(sharedMax))
  await page.getByLabel('Value scale').selectOption('zoom')
  const zoomSpan = Number(await chart.getAttribute('data-y-max')) - Number(await chart.getAttribute('data-y-min'))
  expect(zoomSpan).toBeLessThan((sharedMax - sharedMin) / 10)
  await expect(chart).toHaveAttribute('data-export-context', /Zoom/i)
  await page.getByRole('button', { name: 'Methods', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Available in this workspace' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Theory & Methods' })).toBeVisible()
  await expect(page.getByText('Full application reference', { exact: false })).toHaveCount(0)
})

test('back navigation: explicit in-app back button and browser history integration', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()

  // 1. Open patient from table
  await page.getByRole('button', { name: 'Open patient 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patient 1', exact: true })).toBeVisible()

  // In-app back button shows "← Back to table" and returns to table
  const backToTableBtn = page.getByRole('button', { name: 'Back to table', exact: true })
  await expect(backToTableBtn).toBeVisible()
  await backToTableBtn.click()
  await expect(page.getByRole('table')).toBeVisible()

  // 2. Open patient from overlay
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await expect(page.locator('.wt-plot-grid')).toBeVisible()
  await page.getByRole('button', { name: /^Open patient 1,/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Patient 1', exact: true })).toBeVisible()

  // In-app back button shows "← Back to overlay"
  const backToOverlayBtn = page.getByRole('button', { name: 'Back to overlay', exact: true })
  await expect(backToOverlayBtn).toBeVisible()

  // 3. Browser back returns to overlay
  await page.goBack()
  await expect(page.locator('.wt-plot-grid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Overlay', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // 4. Browser back returns to detail from previous in-app flow or table
  // Let's test browser back navigation through the stack
  await page.goBack()
  await expect(page.getByRole('table')).toBeVisible()
})

test('removes data saved by the former interface once and says so', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    // Recreate what the former interface left in idb-keyval's shared database.
    const request = indexedDB.open('keyval-store')
    request.onupgradeneeded = () => request.result.createObjectStore('keyval')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const tx = request.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put({ rows: [], fileName: 'old.xlsx', savedAt: 0 }, 'lab-explorer:dataset')
      tx.objectStore('keyval').put({ cohortZoom: 'm' }, 'lab-explorer:settings')
      tx.objectStore('keyval').put('keep', 'another-app:state')
      tx.oncomplete = () => { request.result.close(); resolve() }
    }
  }))
  await page.reload()
  await expect(page.getByText(/by the former version of Lab Trajectory Explorer were removed/)).toBeVisible()
  const remaining = await page.evaluate(() => new Promise<IDBValidKey[]>((resolve) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => {
      const keys = request.result.transaction('keyval').objectStore('keyval').getAllKeys()
      keys.onsuccess = () => { request.result.close(); resolve(keys.result) }
    }
  }))
  expect(remaining).toEqual(['another-app:state'])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Load demo data' })).toBeVisible()
  await expect(page.getByText(/former version/)).toHaveCount(0)
})


test('model fitting availability explains the demo limit and enables an eligible sample', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  const studio = page.getByRole('region', { name: 'Model Studio' })
  const preview = page.locator('.cm-plot-card')
  await expect(studio).toContainText('Complete cases: 5 patients')
  await expect(studio.getByRole('button', { name: /Fit model/ })).toBeDisabled()
  await expect(preview.getByRole('button', { name: /Fit model/ })).toBeDisabled()
  await expect(studio.getByRole('status')).toContainText('at least 10 patients')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await preview.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`fit-availability-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  const rows = ['patientId,labDate,testName,unit,value', ...Array.from({ length: 10 }, (_, i) =>
    [0, 1, 2].map(year => `P-${i},${2020 + year}-01-01,Marker,U/L,${60 - year - i}`)).flat()]
  await page.getByLabel('Import lab values').setInputFiles({ name: 'eligible.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('10 patients')
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  await expect(studio.getByRole('button', { name: /Fit model/ })).toBeEnabled()
  await expect(preview.getByRole('button', { name: /Fit model/ })).toBeEnabled()
})

const navigationPatientIds = ['A', 'B-patient-with-a-long-imported-identifier-123456789', ...Array.from({ length: 49 }, (_, index) => `C-${String(index + 1).padStart(3, '0')}`)]

async function uploadNavigationPatients(page: Page) {
  const rows = ['patientId,labDate,testName,unit,value', ...navigationPatientIds.flatMap(id => Array.from({ length: 4 }, (_, parameter) => `${id},2020-01-01,Marker ${parameter},U/L,10`))]
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'navigation.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('51 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
}

test('patient navigation targets retain size, full names and keyboard focus at desktop and narrow widths', async ({ page }, testInfo) => {
  await uploadNavigationPatients(page)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const id of navigationPatientIds.slice(0, 2)) {
      const button = page.getByRole('button', { name: `Open patient ${id}`, exact: true })
      await expect(button).toHaveAttribute('title', id)
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Open patient A', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`patient-navigation-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 844 })
  const id = navigationPatientIds[1]
  const button = page.getByRole('button', { name: `Open patient ${id}`, exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: `Patient ${id}`, exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Back to table', exact: true }).click()
  await expect(button).toBeFocused()
})

test.describe('patient navigation targets on touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('tap opens the complete long ID and returns to its origin independently of selection and pagination', async ({ page }) => {
    await uploadNavigationPatients(page)
    const id = navigationPatientIds[1]
    const button = page.getByRole('button', { name: `Open patient ${id}`, exact: true })
    await expect(button).toHaveAttribute('title', id)
    const box = await button.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    const checkbox = page.getByRole('checkbox', { name: `Select patient ${id}`, exact: true })
    await checkbox.tap()
    await expect(checkbox).toBeChecked()
    await expect(button).toBeVisible()
    await button.tap()
    await expect(page.getByRole('heading', { name: `Patient ${id}`, exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Back to table', exact: true }).tap()
    await expect(button).toBeFocused()
    await expect(checkbox).toBeChecked()
    await page.getByRole('button', { name: 'Next table page' }).tap()
    await expect(page.getByRole('button', { name: 'Open patient C-049', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: `Patient ${id}`, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Previous table page' }).tap()
    await expect(checkbox).toBeChecked()
    await checkbox.tap()
    await expect(checkbox).not.toBeChecked()
    await expect(button).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
