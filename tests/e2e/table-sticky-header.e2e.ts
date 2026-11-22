import { expect, test } from '@playwright/test'

// K21 (2026-11-22): the header row of the Trajectories table stays in sight while the rows scroll,
// inside the box that also scrolls sideways, and a phone shows the position beside the page buttons.
test('keeps the header row in sight while the rows scroll and shows the position on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  const box = page.locator('.pv-explorer > .wt-table-scroll')
  await box.evaluate(element => element.scrollIntoView({ block: 'start' }))
  await box.evaluate(element => { element.scrollTop = 1500 })
  const geometry = () => box.evaluate(element => {
    const head = element.querySelector('thead th:nth-child(3)')!.getBoundingClientRect()
    const corner = element.querySelector('thead th:nth-child(2)')!.getBoundingClientRect()
    return { box: Math.round(element.getBoundingClientRect().top), head: Math.round(head.top), corner: Math.round(corner.top), scrollTop: element.scrollTop, fitsWindow: element.getBoundingClientRect().height <= innerHeight }
  })
  const scrolled = await geometry()
  expect(scrolled.scrollTop).toBeGreaterThan(1000)
  expect(scrolled.fitsWindow).toBe(true)
  expect(Math.abs(scrolled.head - scrolled.box)).toBeLessThanOrEqual(2)
  expect(scrolled.corner).toBe(scrolled.head)
  // Sideways the ID column stays at the left edge and the header row at the top.
  await box.evaluate(element => { element.scrollLeft = 200 })
  const id = await box.evaluate(element => Math.round(element.querySelector('thead th:nth-child(2)')!.getBoundingClientRect().left - element.getBoundingClientRect().left))
  expect(id).toBeLessThanOrEqual(40)
  expect((await geometry()).head).toBe(scrolled.head)
  // A new page starts at its first row, also inside the box.
  await page.getByLabel('Patients per page').selectOption('25')
  await page.setViewportSize({ width: 390, height: 844 })
  const status = page.getByRole('navigation', { name: 'Patient table pages' }).getByRole('status')
  await expect(status).toBeVisible()
  // The words around the numbers are hidden at this width.
  await expect.poll(() => status.innerText()).toBe('1–25 of 28')
  await expect(status).toHaveText('Showing 1–25 of 28 patients')
  await page.getByRole('button', { name: 'Next table page', exact: true }).click()
  await expect.poll(() => status.innerText()).toBe('26–28 of 28')
  expect(await box.evaluate(element => element.scrollTop)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
