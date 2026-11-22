import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Issue #69 (decided 2026-11-21): serum creatinine after selected events, one row per event,
// on the Data page and in the last sheet of the workbook. Demo labs with a synthetic events file.

const EVENTS = ['patientId,type,date,title,description,endDate,intent',
  '11,other,2022-07-10,Contrast CT,,,', '11,other,2022-05-15,Study medication,,,', '13,other,2022-06-10,Contrast CT,,,',
  '7,dialysis,2020-08-01,Temporary dialysis during AKI,,2020-08-14,acute']

test('lists the creatinine after the selected events, states the day resolution and exports one row per event', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset', { hasText: 'patients' }).waitFor()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from(EVENTS.join('\n') + '\n') })

  const summary = page.locator('summary', { hasText: 'Creatinine after selected events (none selected)' })
  await summary.click()
  await expect(page.getByText(/Event dates have no time of day, so the window is counted in calendar days/)).toBeVisible()
  await page.getByLabel('Events for the creatinine analysis').selectOption('title:Contrast CT')
  await expect(page.locator('summary', { hasText: 'Creatinine after selected events (2)' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Creatinine after selected events' })
  await expect(table.locator('thead th')).toHaveText(['Patient', 'Event', 'Baseline', 'Highest in window', 'Rise (mg/dl)', 'Relative to baseline', 'KDIGO criterion', 'Creatinine parameter', 'Notes'])
  const cells = async (patient: string) => (await table.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) }).locator('th, td').allInnerTexts()).map(text => text.trim())
  expect(await cells('11')).toEqual(['11', '10/07/2022 Contrast CT (other)', '1.1 on 10/07/2022', '1.8 on 12/07/2022', '0.7', '1.64 ×', 'Met: rise ≥ 0.3 mg/dl and to ≥ 1.5 times baseline', 'Kreatinin [mg/dl]', '–'])
  expect((await cells('13')).slice(2, 7)).toEqual(['3.05 on 10/06/2022', '–', '–', '–', 'Not evaluable: no value in the window'])
  await expect(page.getByText('2 events: criterion met for 1, not met for 0, not evaluable for 1.')).toBeVisible()
  await page.screenshot({ path: 'test-results/peri-event-desktop.png', fullPage: true })

  await page.getByLabel('Window after the event').selectOption('72')
  await page.getByLabel('Events for the creatinine analysis').selectOption('type:dialysis')
  expect((await cells('7')).slice(-3, -2)).toEqual(['Not evaluable: event day under dialysis'])

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Events for the creatinine analysis').selectOption('title:Contrast CT')
  await table.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/peri-event-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(workbook.SheetNames.at(-1)).toBe('peri_event_creatinine')
  const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.peri_event_creatinine)
  expect(sheet.map(row => [row.PatientID, row.event_date, row.window_hours, row.baseline_value_mg_dl, row.peak_value_mg_dl ?? '', row.criterion_met ?? '', row.criterion ?? '', row.status, row.reason ?? ''])).toEqual([
    [11, '2022-07-10', 72, 1.1, 1.8, true, 'both', 'met', ''],
    [13, '2022-06-10', 72, 3.05, '', '', '', 'not_evaluable', 'no_value_in_window'],
  ])
  const settings = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.settings)
  expect(JSON.parse(settings[0].peri_event_creatinine)).toEqual({ rule: { kind: 'title', value: 'Contrast CT' }, windowHours: 72 })
})
