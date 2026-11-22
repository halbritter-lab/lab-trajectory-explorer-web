import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Issue #68 (decided 2026-11-21, timing 2026-11-22): compare series in the patient view and merge
// them deliberately on the Data page. Demo patient 2 has creatinine in mg/dl and in µmol/l.

test('compares two creatinine series, merges them deliberately and exports the source of each merged value', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset', { hasText: 'patients' }).waitFor()

  // Nothing is merged until the button is pressed; the LOINC code only ticks the series.
  const section = page.locator('#data-series-merge')
  await expect(section.getByRole('heading', { name: '4. Merge series' })).toBeVisible()
  await section.getByLabel('Choose series by LOINC code').selectOption('2160-0')
  await expect(section.getByRole('list', { name: 'Merged series' })).toHaveCount(0)
  await section.getByRole('button', { name: 'Merge selected series' }).click()
  await expect(section.getByRole('list', { name: 'Merged series' })).toContainText('Kreatinin (merged) [mg/dl] (chosen by LOINC 2160-0): Kreatinin [mg/dl], 234 values, unchanged; Kreatinin [µmol/l], 11 values, ÷ 88.42 into mg/dl.')
  // The merged series is offered as a creatinine source, but not chosen automatically.
  await expect(page.getByLabel('Creatinine source').locator('option', { hasText: 'Kreatinin (merged) (mg/dl) – merged series' })).toHaveCount(1)
  await expect(page.getByLabel('Creatinine source')).toHaveValue('null')

  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  await page.getByRole('button', { name: /^Parameters/ }).click()
  const picker = page.getByRole('group', { name: 'Parameter options' })
  await page.getByRole('button', { name: 'No parameters' }).click()
  await picker.getByLabel('Kreatinin (merged) [mg/dl]').check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()

  await page.getByRole('button', { name: 'Open patient 2', exact: true }).click()
  await expect(page.getByTestId('merged-sources-legend')).toContainText('● Kreatinin [mg/dl]; ■ Kreatinin [µmol/l]')
  await expect(page.locator('[data-source-shape="square"]')).toHaveCount(4)

  const comparison = page.getByTestId('series-comparison')
  const options = comparison.getByRole('group', { name: 'Series to compare' })
  await options.getByLabel(/^Kreatinin \[mg\/dl\]/).check()
  await expect(options.getByLabel(/^eGFR \[ml\/min\/1,73m²\]/)).toBeDisabled()
  await options.getByLabel(/^Kreatinin \[µmol\/l\]/).check()
  await expect(comparison.locator('[data-testid="comparison-line"]')).toHaveCount(2)
  const table = comparison.getByRole('table', { name: 'Compared series' })
  await expect(table.locator('tbody tr').first()).toContainText('+0.250')
  await comparison.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/series-comparison-desktop.png', fullPage: false })

  await page.setViewportSize({ width: 390, height: 844 })
  await comparison.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export patient|Export cohort/ }).first().click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const header = (XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.measurements, { header: 1 })[0])
  expect(header.slice(-3)).toEqual(['lab_method', 'source_parameter', 'source_unit'])
  const measurements = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.measurements)
  const converted = measurements.find(row => row.PatientID === 2 && row.Parameter === 'Kreatinin (merged)' && row.source_unit === 'µmol/l')!
  expect(converted).toMatchObject({ Date: '2023-01-10', Value: '1,24', origin: 'derived', formula: 'series_merge', source_parameter: 'Kreatinin' })
  expect(converted.NumericValue as number).toBeCloseTo(110 / 88.42, 10)
  const settings = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.settings)
  expect(JSON.parse(settings[0].analysis_settings).seriesMerge.merges[0].name).toBe('Kreatinin (merged)')
})
