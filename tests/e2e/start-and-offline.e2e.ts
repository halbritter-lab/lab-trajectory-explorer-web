// What jsdom cannot see about starting and losing the connection: the app
// keeps running when the network is gone after loading, the built page shows
// a notice instead of a blank page when its script cannot load, the build's
// Content-Security-Policy does not block the app's own work, and the saved
// copy states its save and removal time.
import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const labsCsv = ['patientId,labDate,testName,unit,value,sex,ageAtLab',
  ...['P-01', 'P-02', 'P-03'].flatMap((id, p) => [0, 1, 2, 3].map(year => `${id},${2020 + year}-03-01,Creatinine,mg/dl,${(1 + p * 0.2 + year * 0.1).toFixed(1)},${p === 1 ? 'm' : 'f'},${50 + year}`)),
].join('\n')
const labsFile = { name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from(labsCsv) }
const builtIndex = resolve(process.cwd(), 'dist/index.html')

test('importing a file without a connection keeps the app, and the demo says why it cannot load', async ({ page, context }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(String(error)))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Load demo data', exact: true })).toBeVisible()
  // The started app has replaced the static notice of index.html.
  await expect(page.locator('.app-not-started')).toHaveCount(0)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load the demo dataset: the demo file could not be fetched from this app\'s address.')
  await page.getByLabel('Import lab values').setInputFiles(labsFile)
  // Until 2026-11-21 the import unmounted the whole app here: the Cohort models
  // page, rendered while hidden, fetched its results table as a separate chunk.
  await expect(page.locator('.workspace-dataset')).toContainText('3 patients')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Model results' })).toBeVisible()
  await expect(page.getByTestId('runtime-download-note')).toContainText('downloads the R runtime from webr.r-wasm.org and R packages from repo.r-wasm.org')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByLabel('Trajectory workspace').getByText('P-01').first()).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('the built page shows a notice instead of a blank page when opened from a folder', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Firefox starts the app from file://; Chromium blocks its module script')
  test.skip(!existsSync(builtIndex), 'needs the production build in dist/')
  await page.goto(pathToFileURL(builtIndex).href)
  const notice = page.locator('#root .app-not-started')
  // Hidden for the first two seconds, so it does not flash during a normal start.
  await expect(notice).toBeHidden()
  await expect(notice).toBeVisible({ timeout: 5000 })
  await expect(notice.getByRole('heading', { name: 'Lab Trajectory Explorer has not started' })).toBeVisible()
  await expect(notice).toContainText('The page was opened directly from a folder. This browser does not start the application from there. Serve the folder through a web server')
})

test('the Content-Security-Policy of the build blocks nothing of import, charts and exports', async ({ page }) => {
  test.skip(!process.env.CI, 'the policy is added by the build; the development server page has none')
  const blocked: string[] = []
  page.on('console', message => { if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) blocked.push(message.text()) })
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = []
    document.addEventListener('securitypolicyviolation', event => (window as unknown as { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`))
  })
  await page.goto('/')
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("connect-src 'self' https://webr.r-wasm.org https://repo.r-wasm.org")
  // The policy is in force: a request to another host is refused by the
  // policy. The refusal alone would not show it, since the request also fails
  // on a machine without outbound network; the violation event does.
  expect(await page.evaluate(() => fetch('https://example.org/').then(() => 'allowed', () => 'refused'))).toBe('refused')
  await expect.poll(() => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual(['connect-src https://example.org/'])
  await page.evaluate(() => { (window as unknown as { cspViolations: string[] }).cspViolations.length = 0 })
  blocked.length = 0
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('28 patients')
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  // PNG export: the chart is drawn from a blob: image onto a canvas.
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).first().click()])
  expect(png.suggestedFilename()).toMatch(/\.png$/)
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).first().click()])
  expect(svg.suggestedFilename()).toMatch(/\.svg$/)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  const [workbook] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()])
  expect(workbook.suggestedFilename()).toMatch(/\.xlsx$/)
  expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([])
  expect(blocked).toEqual([])
})

test('the saved copy states when it was saved and after which time the next start removes it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles(labsFile)
  await expect(page.locator('.workspace-dataset')).toContainText('3 patients')
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  const status = page.locator('.workspace-storage .actions [role=status]')
  await expect(status).toHaveText(/^Saved on \d{4}-\d\d-\d\d \d\d:\d\d; removed when the app is next opened after \d{4}-\d\d-\d\d \d\d:\d\d$/)
  const [, saved, removed] = /^Saved on (.+); removed when the app is next opened after (.+)$/.exec(await status.innerText())!
  // Seven days later (the same clock time unless a clock change lies between).
  expect(Math.round((new Date(removed.replace(' ', 'T')).getTime() - new Date(saved.replace(' ', 'T')).getTime()) / 3_600_000 / 24)).toBe(7)
  // A reload restores the copy and shows the time of the save, not of the reload.
  await page.reload()
  await expect(status).toHaveText(`Saved on ${saved}; removed when the app is next opened after ${removed}`)
  await page.getByText('What is saved', { exact: true }).click()
  await expect(page.locator('.workspace-storage-details')).toContainText('Not saved: sorting, grouping and patient selection, and cohort model settings and results.')
})

test('a tab whose saved copy another tab replaced stops showing its save time when it is shown again', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles(labsFile)
  await expect(page.locator('.workspace-dataset')).toContainText('3 patients')
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  const status = page.locator('.workspace-storage .actions [role=status]')
  await expect(status).toHaveText(/^Saved on /)
  // A second tab resumes the copy and changes the data: the copy is rewritten.
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('.workspace-dataset')).toContainText('3 patients')
  await other.getByLabel('Import lab values').setInputFiles({ ...labsFile, name: 'other.csv', buffer: Buffer.from(labsCsv.replace(/P-03/g, 'P-04')) })
  await expect(other.locator('.workspace-dataset')).toContainText('other.csv')
  await expect(other.locator('.workspace-storage .actions [role=status]')).toHaveText(/^Saved on /)
  // Headless pages are always visible; a real tab gets this event when the user returns to it.
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.workspace-storage .actions [role=alert]')).toHaveText('The saved copy was changed or removed in another tab. Reload to resume that copy, or enable saving again to save this tab instead.')
  await expect(page.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked()
  // The other tab's copy is untouched.
  await page.reload()
  await expect(page.locator('.workspace-dataset')).toContainText('other.csv')
})
