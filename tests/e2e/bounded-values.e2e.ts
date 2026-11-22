import { expect, test, type Page } from '@playwright/test'

// Issue #73: bounded values enter the fit at their limit by default, the cell
// warns at 20 % bounded, and the parameter's setting changes the slope.

async function loadDemo(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await expect(page.getByText(/506 lab values/)).toBeVisible()
}

const patientRow = (page: Page, id: string) => page.getByRole('button', { name: `Open patient ${id}`, exact: true }).locator('xpath=ancestor::tr')

test('the demo UACR of patient 2 warns and follows the bounded-value setting', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: /^Parameters/ }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /^Albumin\/Kreatinin-Quotient/ }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByLabel('Cell details', { exact: true }).selectOption('full')
  await page.getByLabel('Warning display').selectOption('text')
  await page.keyboard.press('Escape')
  await page.getByRole('checkbox', { name: /^Analyse trend:/ }).check()

  const cell = patientRow(page, '2')
  await expect(cell.getByText(/\+159\.1/).first()).toBeVisible()
  await expect(cell.getByText('60 % bounded').first()).toBeVisible()

  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Calculation settings').click()
  await expect(dialog.getByLabel('Bounded values')).toHaveValue('limit')
  await dialog.getByLabel('Bounded values').selectOption('half-limit')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await expect(cell.getByText(/\+165\.1/).first()).toBeVisible()

  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  await page.getByRole('dialog').getByLabel('Bounded values').selectOption('exclude')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await expect(cell.getByText(/\+148\.9/).first()).toBeVisible()
  await expect(cell.getByText('60 % bounded')).toHaveCount(0)
})
