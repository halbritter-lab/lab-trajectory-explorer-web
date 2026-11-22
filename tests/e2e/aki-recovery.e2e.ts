import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Issue #67 and review item K29 (2026-11-22): AKI episodes are separated by 48 hours of
// recovery, and the episode list names the episode end and the first dialysis start.

const HEADER = 'patientId,labDate,testName,unit,value,sex,ageAtLab'
const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}`
const rows = [
  // A sustained daily rise: four episodes until 2026-11-22, one now (open at the last value).
  ...[1.0, 1.4, 1.8, 2.2, 2.6, 3.0].map((value, i) => `RISE,${day(i + 1)},Kreatinin,mg/dl,${value},m,60`),
  // A stage-III rise, an acute dialysis from 5 to 8 March and recovery from 9 March.
  ...[[1, 1.0], [2, 1.6], [3, 2.4], [4, 3.1], [9, 2.0], [10, 1.4], [11, 1.2]].map(([n, value]) => `RRT,${day(n)},Kreatinin,mg/dl,${value},w,70`),
]

test('lists one episode for a sustained rise and the dialysis that starts during an episode', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n')) })
  await page.locator('.workspace-dataset').waitFor()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,type,date,title,description,endDate,intent\nRRT,dialysis,2026-03-05,CVVHDF,,2026-03-08,acute\n') })

  await page.locator('summary', { hasText: 'Detected AKI episodes (2)' }).click()
  const table = page.getByRole('table', { name: 'Detected AKI episodes' })
  await expect(table.locator('thead th')).toHaveText(['Patient', 'Stage', 'Onset', 'Peak', 'Peak value', 'Baseline', 'Criterion', 'Creatinine parameter', 'End', 'Dialysis start'])
  const cells = async (patient: string) => (await table.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) }).locator('th, td').allInnerTexts()).map(text => text.trim())
  expect(await cells('RISE')).toEqual(['RISE', 'III', '02/03/2026', '06/03/2026', '3', '1 on 01/03/2026', 'rise ≥ 0.3 mg/dl within 48 hours', 'Kreatinin [mg/dl]', 'open at the last value', 'none'])
  expect(await cells('RRT')).toEqual(['RRT', 'III', '02/03/2026', '04/03/2026', '3.1', '1 on 01/03/2026', 'rise ≥ 0.3 mg/dl within 48 hours', 'Kreatinin [mg/dl]', '09/03/2026', '05/03/2026 (acute)'])

  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.aki_episodes, { header: 1 })
  expect(sheet[0]).toEqual(['PatientID', 'creatinine_parameter', 'creatinine_unit', 'stage', 'onset_date', 'peak_date', 'peak_value_mg_dl', 'baseline_date', 'baseline_value_mg_dl', 'criterion', 'end_date', 'dialysis_start'])
  expect(sheet.slice(1).map(row => [row[0], row[3], row[4], row[10] ?? '', row[11] ?? ''])).toEqual([
    ['RISE', 3, '2026-03-02', '', ''],
    ['RRT', 3, '2026-03-02', '2026-03-09', '2026-03-05 (acute)'],
  ])

  await page.getByRole('button', { name: 'Open patient RRT', exact: true }).click()
  await expect(page.locator('section.card', { hasText: 'AKI episodes for this patient' }).locator('li')).toHaveText(/; end 09\/03\/2026; dialysis start 05\/03\/2026 \(acute\)$/)
})
