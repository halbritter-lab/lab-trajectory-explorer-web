import { expect, test, type Page } from '@playwright/test'

// Logarithmic value axis with doubling time and events in the table charts (issue #70).
const HEADER = 'patientId,labDate,testName,unit,value,loinc,sex,ageAtLab'
const LINES = [
  ...[['2021-01-04', 2.0], ['2021-07-05', 2.6], ['2022-01-03', 3.9], ['2022-07-04', 5.1], ['2023-01-02', 7.8]].map(([date, value]) => `A,${date},CEA,ng/ml,${value},,w,60`),
  ...[['2021-01-04', 40], ['2021-07-05', 21], ['2022-01-03', 9.5], ['2022-07-04', 5.2], ['2023-01-02', 2.4]].map(([date, value]) => `B,${date},CEA,ng/ml,${value},,m,58`),
]
const EVENTS = 'patientId,type,date,title,description,endDate,intent\nA,other,2022-02-01,Chemotherapy,,2022-06-15,\nB,other,2021-03-01,Surgery,,,\n'
/** Set SHOT_DIR to keep screenshots of the changed charts for review. */
async function shot(page: Page, name: string, target?: ReturnType<Page['locator']>) {
  if (!process.env.SHOT_DIR) return
  const path = `${process.env.SHOT_DIR}/${name}.png`
  await (target ? target.screenshot({ path }) : page.screenshot({ path, fullPage: true }))
}

async function load(page: Page) {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'markers.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...LINES].join('\n')) })
  await expect(page.locator('.workspace-dataset')).toBeVisible()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from(EVENTS) })
  await expect(page.getByText('Loaded events (2)')).toBeVisible()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
}

for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`draws a log column with the doubling time and events in the table (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await load(page)
    await page.getByRole('button', { name: 'Logarithmic value axis: CEA [ng/ml]' }).click()
    // The column controls wrap on a phone, so the settings button stays in reach.
    const settings = (await page.getByRole('button', { name: 'Analysis settings: CEA [ng/ml]' }).boundingBox())!
    const region = (await page.getByRole('region', { name: 'Patient table, horizontal scrolling' }).boundingBox())!
    expect(settings.x + settings.width).toBeLessThanOrEqual(region.x + region.width)
    await page.getByRole('checkbox', { name: 'Analyse trend: CEA [ng/ml]' }).check()
    const sparkA = page.getByRole('img', { name: /patient A, CEA/ })
    await expect(sparkA).toHaveAttribute('data-y-scale', 'log')
    await expect(page.getByTestId('doubling-time').first()).toHaveText('doubles in 1.02 y')
    await expect(page.getByTestId('doubling-time').nth(1)).toHaveText(/^halves in /)
    await page.getByRole('button', { name: 'Display', exact: true }).click()
    await page.getByRole('checkbox', { name: /^Events/ }).check()
    await page.keyboard.press('Escape')
    await expect(sparkA.getByTestId('spark-event-band')).toHaveCount(1)
    await expect(sparkA.getByTestId('spark-event-line')).toHaveCount(1)
    await expect(page.getByRole('img', { name: /patient B, CEA/ }).getByTestId('spark-event-line')).toHaveCount(1)
    // The chart stays inside its cell: no horizontal page scroll on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await shot(page, `table-${label}`)

    await page.getByRole('button', { name: 'Open patient A', exact: true }).click()
    const chart = page.getByRole('region', { name: 'Chart CEA [ng/ml]' })
    await expect(chart.locator('svg.wt-plot')).toHaveAttribute('data-y-scale', 'log')
    await expect(chart.getByTestId('log-axis-note')).toBeVisible()
    await expect(page.getByTestId('doubling-time')).toContainText('Doubling time 1.02 years (95% CI 0.888 to 1.19 years)')
    await shot(page, `patient-${label}`, chart)
  })
}
