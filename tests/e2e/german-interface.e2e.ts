import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Issue #71: the interface in German; exports stay English. The other browser
// tests run in English (the browser language of the test runner).
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`German interface at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.getByRole('button', { name: 'Deutsch' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' })
    await expect(nav.getByRole('button', { name: 'Daten', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText(/^Nur für Forschungszwecke\. Kein Medizinprodukt/)).toBeVisible()
    await page.getByRole('button', { name: 'Demodaten laden', exact: true }).click()
    await expect(page.getByRole('heading', { name: '2. Demografie und Datenqualität' })).toBeVisible()
    // Imported names and units stay as imported.
    await nav.getByRole('button', { name: 'Verläufe', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Verläufe erkunden' })).toBeVisible()
    await expect(page.locator('.wt-table .wt-sparkline').first()).toBeVisible()
    await expect(page.locator('.wt-table thead')).toContainText('Kreatinin [mg/dl]')
    await expect(page.getByLabel('Patienten suchen', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    if (viewport.width === 390) {
      for (const button of await nav.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      for (const button of await page.getByRole('group', { name: 'Sprache der Oberfläche' }).getByRole('button').all()) {
        const box = (await button.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
    }
    await nav.getByRole('button', { name: /^Kohorten/ }).click()
    await expect(page.getByRole('button', { name: /^Modell(e)? anpassen/ }).first()).toBeVisible()
    await nav.getByRole('button', { name: 'Methoden', exact: true }).click()
    await expect(page.getByTestId('methods-english-only')).toHaveText('Die Methodenseite ist derzeit nur auf Englisch verfügbar.')
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByTestId('methods-english-only')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Data', exact: true })).toBeVisible()
  })
}

test('exports stay English in the German interface', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Deutsch' }).click()
  await page.getByRole('button', { name: 'Demodaten laden', exact: true }).click()
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Verläufe', exact: true }).click()
  await page.getByRole('button', { name: 'Überlagerung', exact: true }).click()
  const card = page.locator('.wt-plot-card').first()
  await expect(card.locator('svg.wt-plot text', { hasText: 'Jahre seit der ersten Messung' })).toBeVisible()
  const download = page.waitForEvent('download')
  await card.getByRole('button', { name: 'SVG herunterladen' }).click()
  const svg = readFileSync((await (await download).path())!, 'utf8')
  expect(svg).toContain('Years since first measurement of this parameter')
  expect(svg).toContain('Research use only')
  expect(svg).not.toContain('Jahre seit')
  // The page is German again after the export.
  await expect(card.locator('svg.wt-plot text', { hasText: 'Jahre seit der ersten Messung' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
})
