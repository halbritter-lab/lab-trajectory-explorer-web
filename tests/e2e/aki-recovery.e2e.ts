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
  // Review 2026-11-22: CVVHDF 3 to 13 March removes every value; the rise on 16 March continues the episode.
  ...[[1, 1.0], [2, 3.2], [14, 4.0], [15, 4.2], [16, 6.5]].map(([n, value]) => `ICU,${day(n)},Kreatinin,mg/dl,${value},m,65`),
  // Review 2026-11-22: chronic dialysis from 4 March; 1.2 on 3 March does not end the episode.
  ...[[1, 1.0], [2, 1.6], [3, 1.2]].map(([n, value]) => `CHR,${day(n)},Kreatinin,mg/dl,${value},w,55`),
  // Second review 2026-11-22: a gap of more than seven days ends the episode without an observed end.
  ...[[1, 1.0], [2, 1.6], [20, 1.0]].map(([n, value]) => `GAPX,${day(n)},Kreatinin,mg/dl,${value},m,50`),
  // One episode with 48 hours of recovery, two with 24 hours.
  ...[[1, 1.0], [2, 1.6], [3, 1.0], [5, 1.6]].map(([n, value]) => `TWO,${day(n)},Kreatinin,mg/dl,${value},w,45`),
]
const EVENTS = ['patientId,type,date,title,description,endDate,intent', 'RRT,dialysis,2026-03-05,CVVHDF,,2026-03-08,acute',
  'ICU,dialysis,2026-03-03,CVVHDF,,2026-03-13,acute', 'CHR,dialysis,2026-03-04,HD,,,chronic']

test('lists one episode for a sustained rise and the dialysis that starts during an episode', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n')) })
  await page.locator('.workspace-dataset').waitFor()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from(EVENTS.join('\n') + '\n') })

  await page.locator('summary', { hasText: 'Detected AKI episodes (6)' }).click()
  const table = page.getByRole('table', { name: 'Detected AKI episodes' })
  await expect(table.locator('thead th')).toHaveText(['Patient', 'Stage', 'Onset', 'Peak', 'Peak value', 'Baseline', 'Criterion', 'Creatinine parameter', 'End', 'Dialysis start'])
  const cells = async (patient: string) => (await table.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) }).locator('th, td').allInnerTexts()).map(text => text.trim())
  expect(await cells('RISE')).toEqual(['RISE', 'III', '02/03/2026', '06/03/2026', '3', '1 on 01/03/2026', 'rise ≥ 0.3 mg/dl within 48 hours', 'Kreatinin [mg/dl]', 'open at the last value', 'none'])
  expect(await cells('RRT')).toEqual(['RRT', 'III', '02/03/2026', '04/03/2026', '3.1', '1 on 01/03/2026', 'rise ≥ 0.3 mg/dl within 48 hours', 'Kreatinin [mg/dl]', '09/03/2026', '05/03/2026 (acute)'])
  expect(await cells('ICU')).toEqual(['ICU', 'III', '02/03/2026', '16/03/2026', '6.5', '1 on 01/03/2026', 'rise ≥ 0.3 mg/dl within 48 hours', 'Kreatinin [mg/dl]', 'open at the last value', '03/03/2026 (acute)'])
  expect((await cells('CHR')).slice(-2)).toEqual(['open at the last value', '04/03/2026 (chronic)'])
  expect((await cells('GAPX')).slice(-2)).toEqual(['not observed: no values for more than 7 days after 02/03/2026', 'none'])

  // The recovery length is a setting of the dataset (OD-35 resolved).
  const recovery = page.getByLabel('Recovery between episodes (hours)')
  await expect(recovery).toHaveValue('48')
  // An emptied field changes nothing (review of the combined branch, 2026-11-22).
  await recovery.fill('')
  await recovery.blur()
  await expect(recovery).toHaveValue('48')
  await expect(page.locator('summary', { hasText: 'Detected AKI episodes (6)' })).toBeVisible()
  await recovery.fill('24')
  await recovery.press('Enter')
  await expect(page.locator('summary', { hasText: 'Detected AKI episodes (7)' })).toBeVisible()
  await recovery.fill('48')
  await recovery.press('Enter')
  await expect(page.locator('summary', { hasText: 'Detected AKI episodes (6)' })).toBeVisible()

  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.aki_episodes, { header: 1 })
  expect(sheet[0]).toEqual(['PatientID', 'creatinine_parameter', 'creatinine_unit', 'stage', 'onset_date', 'peak_date', 'peak_value_mg_dl', 'baseline_date', 'baseline_value_mg_dl', 'criterion', 'end_date', 'dialysis_start', 'ended_by_gap', 'last_value_date'])
  expect(sheet.slice(1).map(row => [row[0], row[3], row[4], row[10] ?? '', row[11] ?? '', row[12], row[13]])).toEqual([
    ['CHR', 1, '2026-03-02', '', '2026-03-04 (chronic)', false, '2026-03-03'],
    ['GAPX', 1, '2026-03-02', '', '', true, '2026-03-02'],
    ['ICU', 3, '2026-03-02', '', '2026-03-03 (acute)', false, '2026-03-16'],
    ['RISE', 3, '2026-03-02', '', '', false, '2026-03-06'],
    ['RRT', 3, '2026-03-02', '2026-03-09', '2026-03-05 (acute)', false, '2026-03-04'],
    ['TWO', 1, '2026-03-02', '', '', false, '2026-03-05'],
  ])
  const settings = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.settings)
  expect(JSON.parse(settings[0].analysis_settings).aki).toMatchObject({ recoveryHours: 48 })

  await page.getByRole('button', { name: 'Open patient RRT', exact: true }).click()
  await expect(page.locator('section.card', { hasText: 'AKI episodes for this patient' }).locator('li')).toHaveText(/; end 09\/03\/2026; dialysis start 05\/03\/2026 \(acute\)$/)
})
