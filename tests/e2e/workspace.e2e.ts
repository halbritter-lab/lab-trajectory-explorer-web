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
  await page.goto('/workspace.html')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'research.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: researchWorkbook() })
  await expect(page.locator('.workspace-dataset')).toContainText('3 patients')
}

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
  await second.goto('/workspace.html')
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
  await expect(table.getByRole('cell', { name: 'Excluded: Study transplant', exact: true })).toHaveCount(3)
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
  await page.goto('/workspace.html')
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
  await expect(page.getByText(/invalid_date/)).toBeVisible()
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
  await page.goto('/workspace.html')
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
  await expect(page.getByRole('heading', { name: 'Theory & Methods' })).not.toBeVisible()
  await page.getByText('Full application reference', { exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Theory & Methods' })).toBeVisible()
})

test('back navigation: explicit in-app back button and browser history integration', async ({ page }) => {
  await page.goto('/workspace.html')
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
