import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

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
