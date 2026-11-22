// K43: the build serves the R runtime and the pinned R packages itself. A real
// webR fit on the demo data with every other host blocked must succeed and
// request nothing from another address. Needs the production build (CI runs
// the suite against `pnpm preview`); about 10 to 20 seconds.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pins = JSON.parse(readFileSync(resolve(process.cwd(), 'src/core/mixedModel/rRuntimePins.json'), 'utf8')) as { packages: { name: string, version: string, license: string }[] }

test('a real cohort model fit loads R only from the app\'s own address', async ({ page, context, baseURL }) => {
  test.skip(!process.env.CI, 'needs the production build with the vendored R runtime')
  test.setTimeout(120_000)
  const origin = new URL(baseURL!).origin
  const foreign: string[] = []
  const rFiles: string[] = []
  context.on('request', request => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    if (!url.startsWith(origin)) foreign.push(url)
    else if (/\/(webr|r-packages)\//.test(url)) rFiles.push(new URL(url).pathname)
  })
  await context.route(url => !url.href.startsWith(origin) && url.protocol.startsWith('http'), route => route.abort('blockedbyclient'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('28 patients')
  await page.getByRole('button', { name: 'Cohort models', exact: true }).click()
  await page.getByRole('button', { name: /^Fit model/ }).first().click()
  await expect(page.getByTestId('cohort-model-status').first()).toContainText('Fitted', { timeout: 100_000 })
  expect(foreign).toEqual([])
  expect(rFiles).toContain('/webr/R.wasm')
  for (const pkg of pins.packages) expect(rFiles).toContain(`/r-packages/bin/emscripten/contrib/4.6/${pkg.name}_${pkg.version}.tgz`)
  const notices = await page.request.get('THIRD-PARTY-NOTICES.txt')
  expect(notices.ok()).toBe(true)
  for (const pkg of pins.packages) expect(await notices.text()).toContain(`${pkg.name} ${pkg.version}\n  Licence: ${pkg.license}`)
})
