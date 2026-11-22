import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Plot axes, event drawing and the dense overlay (review of 2026-11-21, issues #70 and #2).
const HEADER = 'patientId,labDate,testName,unit,value,loinc,sex,ageAtLab'
async function importLabs(page: Page, name: string, lines: string[]) {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...lines].join('\n')) })
  await expect(page.locator('.workspace-dataset')).toBeVisible()
}
async function display(page: Page, change: () => Promise<void>) {
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await change()
  await page.keyboard.press('Escape')
}
const ticks = (page: Page) => page.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' }).getByTestId('x-tick').allTextContents()
const march = (day: number) => `2026-03-${String(day).padStart(2, '0')}`

test('shows a short stay in days, the dialysis interval as a band and the values left out of AKI detection', async ({ page }) => {
  const values = [0.9, 1.0, 1.9, 3.1, 4.6, 4.4, 3.9, 3.0, 2.2, 1.6, 1.2, 1.0]
  await importLabs(page, 'icu.csv', [...values.map((value, i) => `ICU,${march(i + 1)},Kreatinin,mg/dl,${value},,m,64`), 'SHORT,2026-09-01,Kreatinin,mg/dl,1.0,,w,50', 'SHORT,2026-09-02,Kreatinin,mg/dl,1.6,,w,50'])
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,type,date,title,description,endDate,intent\nICU,dialysis,2026-03-05,CVVH,,2026-03-07,acute\nICU,other,2026-02-20,Admission,,,\n') })
  await expect(page.getByText('Loaded events (2)')).toBeVisible()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Open patient ICU', exact: true }).click()
  const chart = page.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
  // Years stay the default; eleven days are 0.03 years.
  expect(await ticks(page)).toEqual(['0', '0.005', '0.01', '0.015', '0.02', '0.025', '0.03'])
  await display(page, async () => {
    await page.getByLabel('Time axis').selectOption('baselineDays')
    await page.getByRole('checkbox', { name: 'Events' }).check()
    await page.getByRole('checkbox', { name: 'AKI windows and episodes' }).check()
  })
  // The admission of 20 February lies nine days before the first value.
  expect(await ticks(page)).toEqual(['-5', '0', '5', '10'])
  await expect(chart.getByText('Days since first measurement of this parameter', { exact: true })).toBeVisible()
  const band = chart.getByTestId('event-band')
  await expect(band.locator('title')).toHaveText('Patient ICU: CVVH, 05/03/2026 to 07/03/2026')
  const bandBox = (await band.boundingBox())!
  const dayFive = (await chart.locator('circle[data-aki-skipped]').first().boundingBox())!
  expect(Math.abs(bandBox.x - (dayFive.x + dayFive.width / 2))).toBeLessThan(1)
  await expect(chart.locator('circle[data-aki-skipped]')).toHaveCount(3)
  await expect(chart.getByTestId('aki-skipped-note')).toContainText('3 creatinine values measured under dialysis are not used for AKI detection')
  await expect(chart.getByTestId('aki-band-legend')).toContainText('the configured 30 days after each onset (not the duration of the episode); this column has no fit, so nothing is excluded')
  // Stage labels are drawn whole: inside the chart and not on top of each other.
  const plot = (await chart.locator('svg.wt-plot').boundingBox())!
  const labels = await Promise.all((await chart.getByTestId('marker-label').all()).map(async label => (await label.boundingBox())!))
  expect(labels.length).toBeGreaterThan(0)
  for (const label of labels) { expect(label.x).toBeGreaterThanOrEqual(plot.x); expect(label.x + label.width).toBeLessThanOrEqual(plot.x + plot.width) }
  labels.forEach((a, i) => labels.slice(i + 1).forEach(b => expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)))
  // The measurement table carries the events at their dates and the detection column.
  await page.getByText('Show measurements (12)').click()
  const table = page.getByRole('table', { name: 'Measurements Kreatinin [mg/dl]' })
  await expect(table.getByRole('row').nth(1)).toHaveText('20/02/2026Event: Admission')
  await expect(table.getByRole('row').nth(6)).toHaveText('05/03/2026Event: CVVH to 07/03/2026')
  await expect(table.getByRole('row').nth(7)).toContainText('Not used for AKI detection (dialysis)')
  await expect(table.getByText('Not used for AKI detection (dialysis)')).toHaveCount(3)
  // Calendar axis: no date twice on a range of one day.
  await display(page, () => page.getByLabel('Time axis').selectOption('calendar').then(() => undefined))
  await page.getByLabel('Open patient directly').selectOption({ label: 'SHORT' })
  expect(await ticks(page)).toEqual(['01/09/2026', '02/09/2026'])
})

test('lists the Rolling OLS windows, names the window lines and exports the same rows', async ({ page }) => {
  // One value at the start of every quarter, 2018 to 2022: flat at 60, then falling by 8 per year.
  const lines = Array.from({ length: 17 }, (_, i) => {
    const date = `${2018 + Math.floor(i / 4)}-${String(1 + 3 * (i % 4)).padStart(2, '0')}-01`
    const years = Math.max(0, (Date.parse(date) - Date.parse('2020-01-01')) / (365.25 * 86_400_000))
    return `R,${date},Marker,u,${(60 - 8 * years).toFixed(4)},,w,50`
  })
  await importLabs(page, 'rolling.csv', lines)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Open patient R', exact: true }).click()
  await page.getByLabel('Trend method: Marker [u]').selectOption('rolling-ols')
  await page.getByRole('checkbox', { name: 'Analyse trend: Marker [u]' }).check()
  await page.getByText('Show windows (5)').click()
  const windows = page.getByRole('table', { name: 'Rolling OLS windows' })
  await expect(windows.getByRole('row')).toHaveCount(6)
  await expect(windows.getByRole('row').nth(5)).toHaveText('22/12/2019 to 21/12/202101/01/202001/10/20218-8.00')
  const chart = page.getByRole('region', { name: 'Chart Marker [u]' })
  await expect(chart.getByText('Dashed: Rolling OLS window lines from the prepared analyses; each line names its window.')).toBeVisible()
  await expect(chart.locator('polyline[data-fit-quality] title').first()).toHaveText('Rolling OLS window 01/01/2018 to 01/01/2020: 9 fitted measurements (01/01/2018 to 01/01/2020), slope 0.00 u/year')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export patient (XLSX)' }).click()
  const exported = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(exported.SheetNames.slice(-5)).toEqual(['about', 'columns', 'rolling_windows', 'import_diagnostics', 'anchor_comparison'])
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.rolling_windows)
  expect(rows).toHaveLength(5)
  expect(rows[1]).toMatchObject({ PatientID: 'R', Parameter: 'Marker', Unit: 'u', window: 2, window_start: '2018-06-30', window_end: '2020-06-29', first_date: '2018-07-01', last_date: '2020-04-01', n: 8 })
  const [slopes] = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.slopes)
  expect(Math.min(...rows.map(row => Number(row.slope)))).toBe(slopes.rolling_slope_min)
  expect(slopes.rolling_windows).toBe(5)
})

// Review finding 2026-11-21: at 390 px the date and n cells of the window list and the date
// and "AKI detection" cells of the measurement table broke character by character.
test('keeps dates and notes whole in the window list and the measurement table on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const values = [0.9, 1.0, 1.9, 3.1, 4.6, 4.4, 3.9, 3.0, 2.2, 1.6, 1.2, 1.0]
  const quarterly = Array.from({ length: 17 }, (_, i) => `R,${2018 + Math.floor(i / 4)}-${String(1 + 3 * (i % 4)).padStart(2, '0')}-01,Marker,u,${60 - i},,w,50`)
  await importLabs(page, 'phone.csv', [...values.map((value, i) => `ICU,${march(i + 1)},Kreatinin,mg/dl,${value},,m,64`), ...quarterly])
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByLabel('Replace events').setInputFiles({ name: 'events.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,type,date,title,description,endDate,intent\nICU,dialysis,2026-03-05,CVVH,,2026-03-07,acute\n') })
  await expect(page.getByText('Loaded events (1)')).toBeVisible()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Open patient ICU', exact: true }).click()
  await page.getByText('Show measurements (12)').click()
  const measurements = page.getByRole('table', { name: 'Measurements Kreatinin [mg/dl]' })
  // The lines the text of a cell is laid out in: a date used to break into four.
  const textLines = (cell: ReturnType<Page['locator']>) => cell.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size
  })
  expect(await textLines(measurements.getByRole('cell', { name: '01/03/2026', exact: true }))).toBe(1)
  const note = measurements.getByRole('cell', { name: 'Not used for AKI detection (dialysis)' }).first()
  await note.scrollIntoViewIfNeeded()
  expect((await note.boundingBox())!.width).toBeGreaterThanOrEqual(150)
  // "Not used for AKI detection (dialysis)" in whole words, on two or three lines.
  expect(await textLines(note)).toBeLessThanOrEqual(3)
  // The table scrolls inside its frame; the page does not scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.getByLabel('Open patient directly').selectOption({ label: 'R' })
  await page.getByLabel('Trend method: Marker [u]').selectOption('rolling-ols')
  await page.getByRole('checkbox', { name: 'Analyse trend: Marker [u]' }).check()
  await page.getByText('Show windows (5)').click()
  const windows = page.getByRole('table', { name: 'Rolling OLS windows' })
  for (const cell of await windows.locator('tbody tr').first().getByRole('cell').all()) expect(await textLines(cell)).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('draws a large overlay without points and emphasises the trajectory under the pointer on top', async ({ page }) => {
  const lines = Array.from({ length: 60 }, (_, p) => [0, 1, 2, 3].map(year => `P${String(p).padStart(2, '0')},${2020 + year}-01-01,Marker,u,${(10 + p + year * (p % 5)).toFixed(1)},,w,50`)).flat()
  await importLabs(page, 'cohort.csv', lines)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  const chart = page.getByRole('region', { name: 'Chart Marker [u]' })
  await expect(chart.locator('svg.wt-plot')).toHaveAttribute('data-density', '2')
  await expect(chart.locator('svg.wt-plot circle')).toHaveCount(0)
  await expect(chart.getByTestId('density-note')).toContainText('60 trajectories in this chart: lines are drawn paler and measurement points are hidden.')
  // The top trajectory (P59) is alone at the upper right: the pointer on its line emphasises it.
  const line = chart.locator('.wt-series-layer > g').last().locator('polyline').first()
  await chart.locator('svg.wt-plot').scrollIntoViewIfNeeded()
  // A point on the line itself, near its right end (the bounding box includes the stroke).
  const onLine = async (fraction: number) => {
    const spot = await line.evaluate((element, at) => {
      const polyline = element as SVGPolylineElement
      const point = polyline.getPointAtLength(polyline.getTotalLength() * at).matrixTransform(polyline.getScreenCTM()!)
      return { x: point.x, y: point.y }
    }, fraction)
    await page.mouse.move(spot.x, spot.y)
  }
  await onLine(.97)
  await expect(chart.getByTestId('emphasised-patient')).toHaveText('Patient P59')
  await expect(chart.locator('use.wt-emphasis-layer')).toHaveCount(1)
  await expect(chart.locator('.wt-series-layer')).toHaveAttribute('opacity', '0.4')
  // The copy on top takes no pointer events: the emphasis stays while the pointer rests.
  await onLine(.96)
  await expect(chart.getByTestId('emphasised-patient')).toHaveText('Patient P59')
  await page.mouse.move(5, 5)
  // The switch takes precedence over the density rule.
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Measurement points' })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Measurement points' }).check()
  await expect(chart.locator('svg.wt-plot circle')).toHaveCount(240)
  // Fifty trajectories or fewer keep their points without the switch.
  await page.keyboard.press('Escape')
  await page.getByLabel('Search patients').fill('P0')
  await expect(chart.locator('svg.wt-plot')).toHaveAttribute('data-density', '1')
  await expect(chart.getByTestId('density-note')).toHaveCount(0)
})
