import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Owner decisions of 2026-11-22 (rows akifirst and akiwin, issue #4): the first value of an
// admission against the mean of the values 7 to 365 days before, a retrospective option, and AKI
// windows to 90 days after the episode end with a labelled 30-day fallback.

const HEADER = 'patientId,labDate,testName,unit,value,sex,ageAtLab'
const rows = [
  // Outpatient values, then an admission on 10 April: 2.0 is 1.82 times the mean 1.1.
  ...[['2024-01-01', 1.0], ['2024-01-31', 1.2], ['2024-04-10', 2.0], ['2024-04-11', 1.9]].map(([date, value]) => `ADM,${date},Kreatinin,mg/dl,${value},m,60`),
  // No earlier value: an episode only with the retrospective option (a fall of 0.4 mg/dl).
  ...[['2024-01-01', 2.0], ['2024-01-02', 1.8], ['2024-01-04', 1.6]].map(([date, value]) => `RETRO,${date},Kreatinin,mg/dl,${value},w,55`),
]
const EGFR = 'eGFR [ml/min/1,73m²]'

test('detects an AKI at the first value of an admission and offers the retrospective fall', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n')) })
  await page.locator('.workspace-dataset').waitFor()
  await page.locator('summary', { hasText: 'Detected AKI episodes (1)' }).click()
  const table = page.getByRole('table', { name: 'Detected AKI episodes' })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.locator('tbody tr').first()).toContainText('mean 1.1 of 2 values 7 to 365 days before, latest 31/01/2024')
  await expect(table.locator('tbody tr').first()).toContainText('first value of an admission ≥ 1.5 times the mean of the values 7 to 365 days before')
  const option = page.getByLabel(/Retrospective detection/)
  await expect(option).not.toBeChecked()
  await option.check()
  await expect(page.locator('summary', { hasText: 'Detected AKI episodes (2)' })).toBeVisible()
  await expect(table.locator('tbody tr', { hasText: 'RETRO' })).toContainText('1.6 on 04/01/2024, lowest later value of the admission')
})

test('excludes AKI windows to 90 days after the end and falls back to 30 days with a label', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset').waitFor()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  await page.getByRole('checkbox', { name: `Analyse trend: ${EGFR}`, exact: true }).check()
  await page.getByRole('button', { name: `Analysis settings: ${EGFR}`, exact: true }).click()
  await page.getByLabel('Analysis preset').selectOption('ckd_progression')
  await expect(page.getByLabel('AKI window after episode end (days)')).toHaveValue('90')
  await expect(page.getByLabel('Shorter AKI window from onset (days)')).toHaveValue('30')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const cohort = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort)
  const egfr = (id: number) => cohort.find(row => row.PatientID === id && row.Parameter === 'eGFR')!
  expect(egfr(11)).toMatchObject({ aki: 'AKI I', aki_window: 'episode_end_plus_90d', n_aki_excluded: 3 })
  expect(egfr(11).slope as number).toBeCloseTo(-6.511, 3)
  expect(egfr(7)).toMatchObject({ aki_window: 'episode_end_plus_90d', n_aki_excluded: 8 })
  expect(egfr(12)).toMatchObject({ aki_window: 'onset_plus_30d_fallback', n_aki_excluded: 6 })

  await page.getByRole('button', { name: 'Open patient 12', exact: true }).click()
  await expect(page.getByText('AKI window 30 d').first()).toBeVisible()
})
