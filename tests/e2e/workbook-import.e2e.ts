import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

test('uploads a workbook and exposes rejected events and attribute warnings', async ({ page }) => {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries({
    labs: [
      { patientId: 1, labDate: '2024-01-15', testName: 'Creatinine', unit: 'mg/dl', value: 1.2 },
      { patientId: 1, labDate: '2025-01-15', testName: 'Creatinine', unit: 'mg/dl', value: 1.4 },
    ],
    events: [
      { patientId: 1, type: 'dialysis', date: 'invalid', title: 'Bad start', intent: 'chronic' },
      { patientId: 1, type: 'other', date: '2024-02-01', title: 'Study visit' },
    ],
    attributes: [{ patientId: 1, genotype: 'A' }, { patientId: 999, genotype: 'B' }],
  })) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({
    name: 'study.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
  })
  await expect(page.locator('.workspace-dataset')).toContainText('1 patients')
  await expect(page.getByText('2 lab values, 1 events and 2 attribute rows loaded. 1 rows rejected; 1 warnings.')).toBeVisible()
  await page.getByText(/import diagnostics — show details/).click()
  await expect(page.getByText(/^events · 1 · rejected: Event date "invalid" is not a recognised date/)).toBeVisible()
  await expect(page.getByText(/^attributes · 999 · Warning: Patient 999 has no lab values/)).toBeVisible()
  // The rejected event row is listed beside the accepted one, not only counted.
  const rejected = page.getByRole('table', { name: 'Rejected events' })
  await expect(rejected.getByRole('row').filter({ hasText: 'Bad start' })).toContainText('is not a recognised date')
  await page.getByText('Loaded events (1)', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'Loaded events' })).toContainText('Study visit')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open patient 1', exact: true })).toBeVisible()
})

test('reads a German semicolon CSV as text and lists its import diagnostics', async ({ page }) => {
  // Windows-1252 bytes, as Excel writes "CSV (semicolon-separated)" on German systems.
  const csv = 'patientId;labDate;testName;unit;value\n0012;03/01/2024;Kreatinin;µmol/l;88\n0012;15.02.2024;Kreatinin;umol/L;1,5\n12;2021-02-30;Kreatinin;µmol/l;90\n12;01.03.2024;Kreatinin;µmol/l;<20\n'
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') })
  await expect(page.locator('.workspace-dataset')).toContainText('2 patients')
  await expect(page.getByText(/3 lab values.*1 rows rejected; 3 warnings\./)).toBeVisible()
  await page.getByText(/import diagnostics — show details/).click()
  await expect(page.getByText('Sheet1 · 12 · rejected: Lab date "2021-02-30" is not a valid calendar date; row not imported.')).toBeVisible()
  await expect(page.getByText(/read day-first/)).toBeVisible()
  await expect(page.getByText('Sheet1 · Warning: Kreatinin: unit spellings "µmol/l" (2), "umol/L" (1) were merged as "µmol/l".')).toBeVisible()
  await expect(page.getByText(/Kreatinin \[µmol\/l\]: 1 censored value/)).toBeVisible()
})

test('redirects links to the former workspace.html to the application', async ({ page }) => {
  await page.goto('/workspace.html?source=bookmark#methods')
  await expect(page).toHaveURL(/\/index\.html\?source=bookmark#methods$/)
  await expect(page.getByRole('button', { name: 'Load demo data' })).toBeVisible()
})
