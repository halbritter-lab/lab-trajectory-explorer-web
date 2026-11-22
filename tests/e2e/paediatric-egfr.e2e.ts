import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Issue #66 (2026-11-22): CKiD U25 with a height under 18, CKD-EPI 2021 from 18, the
// change of equation counted on the Data page, drawn in the chart and named beside the slope.
const HEADER = 'patientId,labDate,testName,unit,value,sex,ageAtLab'
const rows = [
  'KID,2020-01-01,Kreatinin,mg/dl,0.8,m,16', 'KID,2020-01-01,Größe,cm,170,m,16',
  'KID,2021-01-01,Kreatinin,mg/dl,0.85,m,17', 'KID,2021-01-01,Größe,cm,175,m,17',
  'KID,2022-01-01,Kreatinin,mg/dl,0.9,m,18', 'KID,2023-01-01,Kreatinin,mg/dl,0.95,m,19',
  'ADU,2020-01-01,Kreatinin,mg/dl,1.0,w,50', 'ADU,2022-01-01,Kreatinin,mg/dl,1.1,w,52',
]
const EGFR = 'eGFR (CKD-EPI 2021, computed) [ml/min/1,73m²]'

test('computes CKiD U25 for a child with heights and marks the change of equation', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n')) })
  await page.locator('.workspace-dataset').waitFor()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await expect(page.getByLabel('Under 18 years')).toHaveValue('ckid-u25-ekfc')
  await expect(page.getByTestId('egfr-heights')).toContainText('Height: 2 measurement days of 1 patient.')
  await expect(page.getByTestId('egfr-row-formulas')).toHaveText('Equations in this preview: CKiD U25 2 values; CKD-EPI 2021 4 values.')
  await expect(page.getByTestId('egfr-formula-switches')).toContainText('1 patient whose eGFR equation changes during follow-up (CKiD U25 → CKD-EPI 2021)')
  await page.getByRole('button', { name: 'Apply calculation' }).click()

  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  await page.getByRole('checkbox', { name: `Analyse trend: ${EGFR}`, exact: true }).check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const cohort = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort, { defval: '' }).filter(row => row.Parameter === 'eGFR (CKD-EPI 2021, computed)')
  expect(cohort.map(row => [row.PatientID, row.egfr_formula_switch])).toEqual([['ADU', ''], ['KID', 'CKiD U25 → CKD-EPI 2021 on 2022-01-01']])
  const measurements = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.measurements, { defval: '' }).filter(row => row.PatientID === 'KID' && row.origin === 'derived')
  expect(measurements.map(row => [row.NumericValue, row.egfr_equation, row.egfr_height_cm])).toEqual([[98.8, 'ckid-u25', 170], [100.1, 'ckid-u25', 175], [127, 'ckd-epi-2021', ''], [118.2, 'ckd-epi-2021', '']])

  await page.getByRole('button', { name: 'Open patient KID', exact: true }).click()
  const chart = page.getByRole('region', { name: `Chart ${EGFR}` })
  await expect(chart.getByTestId('egfr-formula-switch')).toHaveCount(1)
  await expect(chart.getByTestId('egfr-switch-legend')).toContainText('Dotted vertical line: the eGFR equation changes (CKiD U25 → CKD-EPI 2021 on 2022-01-01).')
  await expect(page.getByTestId('formula-switch-note').first()).toContainText('Formula change in fit: This slope is fitted across a change of the eGFR equation')
})
