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
  await page.locator('main input[type=file]').setInputFiles({
    name: 'study.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
  })
  await expect(page.getByRole('status')).toContainText('Loaded 2 rows, 1 events, 2 attribute rows')
  await expect(page.getByRole('status')).toContainText('1 rejected row(s), 1 warning(s)')
  await page.getByText('Import details (2)', { exact: true }).click()
  const details = page.getByRole('table', { name: 'Workbook import details' })
  await expect(details.getByRole('row').filter({ hasText: 'invalid date' })).toContainText('events')
  await expect(details.getByRole('row').filter({ hasText: 'unknown patient' })).toContainText('999')
  const series = page.getByRole('combobox', { name: 'Series 1 parameter' })
  await series.fill('Creatinine')
  await page.getByRole('option', { name: /^Creatinine \(mg\/dl\)$/ }).click()
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()
})
