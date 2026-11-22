// Browser paths added between 0.3.7 and the release review of 2026-11-15:
// CKD-EPI 2009, the plausibility warnings, the withheld G5 projection under
// AKI exclusion and the cohort export's date columns.
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

async function uploadCsv(page: Page, name: string, csv: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) })
}

async function showOnlyParameter(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: /^Parameters/ }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: label }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  // Badges as text, so their wording is in the page.
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByLabel('Cell details', { exact: true }).selectOption('full')
  await page.getByLabel('Warning display').selectOption('text')
  await page.keyboard.press('Escape')
}

test('offers CKD-EPI 2009 (race-free) and warns about implausible creatinine and eGFR', async ({ page }) => {
  await uploadCsv(page, 'plausibility.csv', [
    'patientId,labDate,testName,unit,value,sex,ageAtLab',
    '1,2024-01-01,Kreatinin,mg/dl,1.0,m,50',
    // A µmol/l value in a mg/dl column.
    '1,2024-06-01,Kreatinin,mg/dl,120,m,50',
    '2,2024-01-01,Kreatinin,mg/dl,0.1,m,20',
  ].join('\n'))
  await expect(page.locator('.workspace-dataset')).toContainText('2 patients')
  await expect(page.getByText('1 serum creatinine value above 25 mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.')).toBeVisible()

  const formula = page.getByLabel('eGFR formula')
  await formula.selectOption('ckd-epi-2009')
  await expect(formula.locator('option:checked')).toHaveText('CKD-EPI 2009 (race-free)')
  // 0.1 mg/dl at age 20 computes far above 200; 1.0 and 120 mg/dl do not.
  await expect(page.getByText('1 computed eGFR value above 200 mL/min/1.73 m²: not plausible, check the creatinine source and its unit. The values are used unchanged.')).toBeVisible()
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await expect(page.getByText(/^Active: CKD-EPI 2009 \(race-free\), 3 computed values$/)).toBeVisible()

  await showOnlyParameter(page, /^eGFR \(CKD-EPI 2009 \(race-free\), computed\)/)
  await expect(page.getByRole('columnheader', { name: /eGFR \(CKD-EPI 2009 \(race-free\), computed\)/ })).toBeVisible()
})

test('names the AKI exclusion in a withheld G5 projection and exports the eligible dates', async ({ page }) => {
  // Creatinine 4.5 and 4.85 mg/dl on consecutive days every two weeks: each
  // +0.35 mg/dl rise is a KDIGO episode, so 103 of 104 eGFR values lie in AKI windows.
  const lines = ['patientId,labDate,testName,unit,value,ageAtLab']
  for (let i = 0; i < 52; i++) for (const second of [0, 1]) {
    const date = new Date(Date.UTC(2020, 0, 1) + (i * 14 + second) * 86_400_000).toISOString().slice(0, 10)
    lines.push(`1,${date},eGFR,ml/min/1.73m2,${second ? 38 : 40},60`, `1,${date},Kreatinin,mg/dl,${second ? 4.85 : 4.5},60`)
  }
  await uploadCsv(page, 'aki-exclusion.csv', lines.join('\n'))
  await expect(page.locator('.workspace-dataset')).toContainText('1 patient')
  await showOnlyParameter(page, /^eGFR \[ml\/min\/1\.73m2\]$/)
  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  await page.getByRole('dialog').getByLabel('Analysis preset').selectOption('ckd_progression')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await page.getByRole('checkbox', { name: /^Analyse trend:/ }).check()

  const badge = page.locator('.wt-badge-endpoint')
  await expect(badge).toContainText('G5 < 3 dates')
  const title = await badge.getAttribute('title')
  expect(title).toContain('Measurements inside AKI exclusion windows are left out of the projection. The measurements used fall on fewer than three distinct dates, so no projection was made.')
  expect(title).not.toContain('Usable measurements on fewer than three distinct dates')

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const exported = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const header = XLSX.utils.sheet_to_json<string[]>(exported.Sheets.cohort, { header: 1 })[0]
  expect(header.slice(-14)).toEqual(['index_date', 'last_fitted_date', 'first_eligible_date', 'last_eligible_date', 'intercept', 'slope_se', 'n_fitted_dates',
    'first_eligible_value', 'last_eligible_value', 'sex', 'baseline_age', 'aki_window', 'n_aki_excluded', 'group'])
  // The eligible dates ignore the AKI windows; the fit keeps only the first day.
  expect(XLSX.utils.sheet_to_json(exported.Sheets.cohort)[0]).toMatchObject({
    first_eligible_date: '2020-01-01', last_eligible_date: '2021-12-16', index_date: '2020-01-01', last_fitted_date: '2020-01-01',
    endpoint_input_policy: expect.stringContaining('AKI exclusion windows excluded from decline baseline and projection'),
  })
})
