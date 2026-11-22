import { expect, test } from '@playwright/test'

// K21 (2026-11-22): a phone shows the position beside the page buttons. The sticky header row was
// tried and left out: it needs the rows to scroll inside a box of their own, which wheel scrolling
// fills before the page and which hides its lower part and, at its end, the header row
// (decision record of 2026-11-22). The rows scroll with the page.
test('scrolls the rows with the page and shows the position on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  const box = page.locator('.pv-explorer > .wt-table-scroll')
  await expect(box).toBeVisible()
  expect(await box.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  await page.getByLabel('Patients per page').selectOption('25')
  await page.setViewportSize({ width: 390, height: 844 })
  const status = page.getByRole('navigation', { name: 'Patient table pages' }).getByRole('status')
  await expect(status).toBeVisible()
  // The words around the numbers are hidden at this width.
  await expect.poll(() => status.innerText()).toBe('1–25 of 28')
  await expect(status).toHaveText('Showing 1–25 of 28 patients')
  await page.getByRole('button', { name: 'Next table page', exact: true }).click()
  await expect.poll(() => status.innerText()).toBe('26–28 of 28')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
