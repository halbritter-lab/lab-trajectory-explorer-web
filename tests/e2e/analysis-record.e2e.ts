// Issue #83: the analysis record lists the effective settings, leads to their
// controls and applies the settings of a downloaded export again.
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function uploadDecline(page: Page): Promise<void> {
  const lines = ['patientId,labDate,testName,unit,value,ageAtLab']
  for (const [i, value] of [60, 52, 45, 37, 30].entries()) lines.push(`1,${2020 + i}-01-01,eGFR,ml/min/1.73m2,${value},${60 + i}`)
  for (const [i, value] of [61, 50, 47, 35, 31].entries()) lines.push(`2,${2020 + i}-03-01,eGFR,ml/min/1.73m2,${value},${50 + i}`)
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'decline.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('2 patients')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('checkbox', { name: /^Analyse trend:/ }).check()
}

const record = (page: Page) => page.getByRole('dialog', { name: 'Analysis record' })
async function openRecord(page: Page) {
  await page.getByRole('button', { name: 'Analysis record', exact: true }).click()
  await expect(record(page)).toBeVisible()
}
async function sharedFitModel(page: Page) {
  await openRecord(page)
  const value = await record(page).getByRole('region', { name: 'Trajectories: shared settings' }).locator('li').filter({ hasText: 'Fit model' }).locator('.ar-value').innerText()
  await record(page).getByRole('button', { name: 'Close', exact: true }).click()
  return value
}

test('lists changed settings, leads to their control and applies an export again', async ({ page }) => {
  await uploadDecline(page)
  await openRecord(page)
  await expect(record(page).getByRole('region', { name: 'Data' })).toContainText('eGFR formula')
  // The record leads to the control: the shared settings open with the fit model.
  await record(page).getByRole('region', { name: 'Trajectories: shared settings' }).getByRole('button', { name: /^Change Fit model/ }).click()
  await expect(record(page)).toHaveCount(0)
  const fitModel = page.getByRole('dialog', { name: 'General defaults' }).getByLabel('Fit model', { exact: true })
  await expect(fitModel).toBeFocused()
  await fitModel.selectOption('theil-sen')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  expect(await sharedFitModel(page)).toBe('Theil–Sen (changed)')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Export cohort \(XLSX\)$/ }).click()
  const file = await (await download).path()

  // Back to OLS, then the export's settings again.
  await openRecord(page)
  await record(page).getByRole('region', { name: 'Trajectories: shared settings' }).getByRole('button', { name: /^Change Fit model/ }).click()
  await expect(fitModel).toBeFocused()
  await fitModel.selectOption('ols')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  expect(await sharedFitModel(page)).toBe('OLS')
  await openRecord(page)
  await record(page).getByLabel('Apply settings from an exported workbook').setInputFiles({ name: 'cohort.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await readFile(file) })
  await expect(record(page).getByRole('status')).toContainText('Every setting of the file was applied.')
  await expect(record(page).getByRole('region', { name: 'Trajectories: shared settings' }).locator('li').filter({ hasText: 'Fit model' })).toContainText('Theil–Sen')
  await record(page).getByRole('button', { name: 'Close', exact: true }).click()
  // The table follows: the column's method is Theil-Sen again, and so is its interval.
  await expect(page.getByRole('region', { name: 'Trajectory workspace' }).locator('thead select').first()).toHaveValue('theil-sen')
  await expect(page.getByRole('region', { name: 'Trajectory workspace' }).locator('tbody tr').first()).toContainText('95% CI [-8.01, -7.00]')
})

test('leads from the record to the Trend switch and to a control on the Data page', async ({ page }) => {
  await uploadDecline(page)
  await openRecord(page)
  await record(page).getByRole('button', { name: 'Change Trend (Trajectories: eGFR [ml/min/1.73m2])' }).click()
  await expect(page.getByRole('checkbox', { name: 'Analyse trend: eGFR [ml/min/1.73m2]' })).toBeFocused()
  await openRecord(page)
  await record(page).getByRole('button', { name: 'Change Recovery between AKI episodes (hours) (Data)' }).click()
  await expect(page.getByRole('button', { name: 'Data', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('Recovery between episodes (hours)')).toBeFocused()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await openRecord(page)
  await record(page).getByRole('button', { name: 'Change Random effects (Cohort models)' }).click()
  await expect(page.getByRole('button', { name: 'Cohort models', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#cohort-model-settings :focus')).toHaveCount(1)
})

test('fits a phone screen without horizontal scrolling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await uploadDecline(page)
  await openRecord(page)
  const box = await record(page).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(390)
  expect(await record(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  expect(await record(page).locator('.ar-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  if (process.env.RECORD_SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.RECORD_SCREENSHOTS}/record-phone-top.png` })
    await record(page).locator('.ar-body').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.screenshot({ path: `${process.env.RECORD_SCREENSHOTS}/record-phone-bottom.png` })
  }
  await context.close()
})
