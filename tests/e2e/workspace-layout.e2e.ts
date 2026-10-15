import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`trajectory results lead the workspace at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
    await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
    // Measure from the initial scroll position: visibility alone permits scrolling.
    const chart = page.locator('.wt-table .wt-sparkline').first()
    await expect(chart).toBeVisible()
    const firstChart = await chart.boundingBox()
    expect(firstChart!.y + Math.min(firstChart!.height, 68)).toBeLessThan(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    for (const button of await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button').all()) {
      const box = await button.boundingBox()
      if (viewport.width === 390) expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    for (const button of await page.locator('.pv-column-sort').all()) {
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByLabel('Search patients', { exact: true })).toBeVisible()
    await page.getByLabel('Search patients', { exact: true }).fill('1')
    await expect(page.getByRole('button', { name: 'Search: 1' })).toBeVisible()
    await expect(page.getByLabel('Search patients', { exact: true })).toHaveValue('1')
    await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
    const summary = page.getByRole('region', { name: 'Fit summary', exact: true })
    await expect(summary.getByLabel('Readable formula')).toBeVisible()
    await expect(summary.locator('.cm-sample-meta')).toBeVisible()
    await expect(summary.getByRole('checkbox', { name: 'Apply preset event and AKI exclusions' })).toBeVisible()
    await expect(summary.getByRole('button', { name: /^Fit/ })).toBeVisible()
    await expect(page.getByTestId('model-preparation')).not.toBeVisible()
    await page.getByText('Preparation and fitting details', { exact: true }).click()
    await expect(page.getByTestId('model-preparation')).toBeVisible()
  })
}
