// Endpoint decisions of 2026-11-22 (issues #81, #82, #85, #4): the
// extrapolation to CKD G5 off by default, the confirmed 50 % decline, the
// unconfirmed single value below 15, the 28-day preset and the badge choice.
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

const PARAMETER = /^eGFR \[ml\/min\/1\.73m2\]$/
const rows: [number, string, number][] = [
  // Patient 1: baseline 59, then 40 % and 50 % declines, each confirmed.
  [1, '2020-01-15', 60], [1, '2020-03-01', 58], [1, '2021-01-15', 31], [1, '2021-06-01', 29], [1, '2021-09-01', 27], [1, '2022-03-01', 24],
  // Patient 2: one isolated value below 15.
  [2, '2020-01-15', 40], [2, '2021-01-15', 36], [2, '2021-06-01', 12], [2, '2022-01-15', 33], [2, '2023-01-15', 29],
]

async function upload(page: Page): Promise<void> {
  const lines = ['patientId,labDate,testName,unit,value,ageAtLab', ...rows.map(([id, date, value]) => `${id},${date},eGFR,ml/min/1.73m2,${value},60`)]
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'endpoints-2611.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('2 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: /^Parameters/ }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: PARAMETER }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByLabel('Cell details', { exact: true }).selectOption('full')
  await page.getByLabel('Warning display').selectOption('text')
  await page.keyboard.press('Escape')
}

const badge = (page: Page, id: string) => page.getByRole('button', { name: `Open patient ${id}`, exact: true }).locator('xpath=ancestor::tr').locator('.wt-badge-endpoint')

test('CKD progression: no extrapolation by default, 50 % decline and single low value, badges chosen in the view', async ({ page }) => {
  await upload(page)
  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Analysis preset').selectOption('ckd_progression')
  if (!(await dialog.getByLabel('Extrapolation to CKD G5').isVisible())) await dialog.getByText('Calculation settings', { exact: true }).click()
  await expect(dialog.getByLabel('Extrapolation to CKD G5')).not.toBeChecked()
  await expect(dialog.getByLabel('Confirmation preset')).toHaveValue('90')
  await expect(dialog.getByLabel('Confirmation preset').locator('option')).toHaveText(['90 days (default)', '28 days (ISN trial definition)'])
  await dialog.getByLabel('Confirmed 50% eGFR decline').check()
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await page.getByRole('checkbox', { name: /^Analyse trend:/ }).check()

  await expect(badge(page, '1')).toHaveText('-60%, CKD G4, 40% decline, 50% decline')
  await expect(badge(page, '2')).toHaveText('-28%, single value <15, unconfirmed (possible AKI)')

  // The badge choice is display only: the export keeps every result.
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.locator('summary', { hasText: 'Endpoint badges' }).click()
  await page.getByRole('checkbox', { name: '50% decline' }).uncheck()
  await page.getByRole('checkbox', { name: 'Total eGFR change' }).uncheck()
  await expect(page.locator('summary', { hasText: 'Endpoint badges' })).toHaveText('Endpoint badges (7 of 9)')
  await page.keyboard.press('Escape')
  await expect(badge(page, '1')).toHaveText('CKD G4, 40% decline')

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const exported = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const cohort = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.cohort)
  expect(cohort.find(row => String(row.PatientID) === '1')).toMatchObject({ endpoint_observed_decline_40: 'yes', endpoint_observed_decline_50: 'yes', endpoint_decline_50_first_date: '2021-06-01', endpoint_decline_50_confirmed_date: '2021-09-01' })
  const second = cohort.find(row => String(row.PatientID) === '2')!
  expect(second.endpoint_g5_single_value_unconfirmed).toBe('yes')
  expect(second.endpoint_observed_ckd_g5 ?? '').toBe('')
  expect(second.endpoint_projected_age_to_ckd_g5 ?? '').toBe('')
  const fitConfig = JSON.parse(String(XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.settings)[0].fit_config))
  expect(fitConfig.endpoints).toMatchObject({ projectedAgeToCkdG5: false, observedDecline50: true })

  // Switched on, and remembered: the badge choice comes back and the notice names the extrapolation.
  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  if (!(await dialog.getByLabel('Extrapolation to CKD G5').isVisible())) await dialog.getByText('Calculation settings', { exact: true }).click()
  await dialog.getByLabel('Extrapolation to CKD G5').check()
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await expect(badge(page, '1')).toHaveText('CKD G4, 40% decline, G5 < 4 dates/3 yrs')
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  await expect(page.locator('.workspace-dataset')).toContainText('Saved on this device')
  await page.reload()
  await expect(page.getByText(/The extrapolation to CKD G5 is switched on in own settings of eGFR \[ml\/min\/1\.73m2\], as saved: a conditional extrapolation of the fitted trend, not a prognosis\./)).toBeVisible()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(badge(page, '1')).toHaveText('CKD G4, 40% decline, G5 < 4 dates/3 yrs')
})

test('the former address of the projection section opens it', async ({ page }) => {
  await page.goto('/#methods/endpoints/prediction')
  await expect(page.locator('#methods-extrapolation')).toBeVisible()
  await expect(page.locator('#methods-extrapolation')).toBeFocused()
})
