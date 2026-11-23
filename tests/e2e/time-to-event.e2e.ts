import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Issue #78 (decisions `km`, `death`, `taxonomy` of 2026-11-22): the Time to event
// area of Cohort models with the demo data, its workbook, the PNG of the curve
// (a real canvas) and the layout at phone width.

async function openArea(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset').waitFor()
  await page.getByRole('button', { name: 'Cohort models', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Time to event' }).click()
  const area = page.getByRole('region', { name: 'Time to event' })
  await area.getByLabel('Time-to-event endpoint').selectOption('kidneyFailure')
  return area
}

test('estimates the time to kidney replacement therapy in the demo and exports it', async ({ page }) => {
  const area = await openArea(page)
  await expect(area.getByLabel('Endpoint definition')).toContainText('Kidney replacement therapy: the first kidney transplant or chronic dialysis start')
  const row = area.getByRole('table', { name: 'Time to event by group' }).getByRole('row').nth(1)
  await expect(row).toContainText('All patients')
  // The demo has KRT for patients 9, 10, 12, 13 and 14; patients 3, 5 and 10 have no eligible
  // imported eGFR, so 25 patients with 4 events are in the analysis.
  await expect(row.getByRole('cell').nth(1)).toHaveText('25')
  await expect(row.getByRole('cell').nth(2)).toHaveText('4')
  await expect(area.getByText('Patients not in the analysis (3)')).toBeVisible()
  await expect(area.getByRole('table', { name: 'Number at risk' })).toBeVisible()

  await area.getByLabel('Time-to-event grouping').selectOption('genotype')
  await expect(area.getByLabel('Log-rank test')).toContainText('Log-rank test between')

  const pending = page.waitForEvent('download')
  await area.getByRole('button', { name: 'Export time to event (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(workbook.SheetNames).toEqual(['time_to_event', 'km', 'km_summary', 'logrank', 'tte_settings', 'about', 'r_script'])
  // Code review of wave 3: the settings behind the numbers travel with the workbook.
  const [settings] = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.tte_settings)
  expect(settings).toMatchObject({ endpoint: 'kidneyFailure', time_scale: 'age', grouping: 'genotype' })
  expect(String(settings.input_data_id)).toMatch(/^[0-9a-f]{8}$/)
  expect(JSON.parse(String(settings.analysis_settings))).toHaveProperty('egfr')
  const patients = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.time_to_event)
  expect(patients.filter(p => p.status === 1)).toHaveLength(4)
  expect(Object.keys(patients[0]).slice(0, 4)).toEqual(['patient_id', 'group', 'included', 'exclusion_reason'])

  const png = page.waitForEvent('download')
  await area.getByRole('button', { name: 'Download PNG' }).click()
  const bytes = await readFile((await (await png).path())!)
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  expect(bytes.length).toBeGreaterThan(2000)
})

test('lists the area settings in the analysis record and leads back to them', async ({ page }) => {
  const area = await openArea(page)
  await area.getByLabel('Time-to-event grouping').selectOption('genotype')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  await page.getByRole('button', { name: 'Analysis record', exact: true }).click()
  const record = page.getByRole('dialog', { name: 'Analysis record' })
  const section = record.getByRole('region', { name: 'Cohort models: time to event' })
  await expect(section).toContainText('genotype')
  await section.getByRole('button', { name: /^Change Time to event: grouping/ }).click()
  await expect(record).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Time to event' }).getByLabel('Time-to-event parameter')).toBeFocused()
  await expect(page.getByRole('region', { name: 'Time to event' }).getByLabel('Time-to-event grouping')).toHaveValue('genotype')
})

test('fits a phone screen without horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openArea(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
