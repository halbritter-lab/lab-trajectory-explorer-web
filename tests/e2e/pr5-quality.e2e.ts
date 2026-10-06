import { expect, test, type Page } from '@playwright/test'

function collectBrowserProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`console ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

async function loadDemo(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await expect(page.getByText(/216 lab values/)).toBeVisible()
}

async function uploadCsv(page: Page, name: string, csv: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) })
}

/** Open Trajectories with exactly one parameter column and its fit shown. */
async function showOnlyParameter(page: Page, label: RegExp, fit = true): Promise<void> {
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Choose parameters' }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: label }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByText('Display and analysis', { exact: true }).click()
  if (fit) await page.getByRole('checkbox', { name: /slope and R²/ }).check()
}

const patientRow = (page: Page, id: string) => page.getByRole('button', { name: `Open patient ${id}`, exact: true }).locator('xpath=ancestor::tr')

test('shows the same slope-quality caveat in the cohort table and the patient view', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await showOnlyParameter(page, /^Kreatinin \[mg\/dl\]$/)

  for (const [patient, label] of [['3', 'n < 3'], ['5', 'Follow-up < 1 year'], ['12', 'Follow-up < 1 year']] as const) {
    const caveat = patientRow(page, patient).locator('.wt-cell-summary span.wt-warning')
    await expect(caveat).toHaveText(`${label} · uncertain slope`)
    expect(await caveat.getAttribute('title')).toMatch(/caution|unstable|Two points/i)
    // The same explanation is reachable without a pointer.
    const why = patientRow(page, patient).getByText('Why is the slope uncertain?', { exact: true })
    await why.click()
    await expect(why.locator('xpath=..')).toContainText(/interpret with caution/)
  }

  await page.getByRole('button', { name: 'Open patient 3', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patient 3', exact: true })).toBeVisible()
  const note = page.locator('.wt-plot-grid').getByRole('note')
  await expect(note).toContainText('n < 3 · uncertain slope')
  await expect(note).toContainText('interpret with caution')
  await expect(page.locator('.wt-plot-grid svg [data-fit-quality="uncertain"]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Back to table', exact: true }).click()
  await page.getByLabel('Analysis preset').selectOption('acute_review')
  await expect(page.locator('.wt-cell-summary .wt-warning')).toHaveCount(0)
  // The August 2026 defect class: no quality caveat may survive a disabled fit.
  for (const summary of await page.locator('.wt-cell-summary').all()) {
    expect(await summary.innerText()).not.toMatch(/n < 3|< 1 year/)
  }
  await expect(page.locator('.wt-cell-summary').first()).toContainText('Fit model disabled')
  expect(problems).toEqual([])
})

test('renders every G5 projection outcome in its patient row', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  const csv = [
    'patientId,labDate,testName,unit,value,ageAtLab',
    '1,2022-01-01,eGFR,ml/min/1.73m2,40,50',
    '1,2023-01-01,eGFR,ml/min/1.73m2,42,51',
    '1,2024-01-01,eGFR,ml/min/1.73m2,44,52',
    '2,2022-01-01,eGFR,ml/min/1.73m2,30,60',
    '2,2023-01-01,eGFR,ml/min/1.73m2,20,61',
    '2,2024-01-01,eGFR,ml/min/1.73m2,14,62',
    '3,2022-01-01,eGFR,ml/min/1.73m2,60,',
    '3,2023-01-01,eGFR,ml/min/1.73m2,50,',
    '3,2024-01-01,eGFR,ml/min/1.73m2,40,',
    '4,2022-01-01,eGFR,ml/min/1.73m2,60,70',
    '4,2024-01-01,eGFR,ml/min/1.73m2,40,72',
    '5,2024-01-01,eGFR,ml/min/1.73m2,60,70',
    '5,2024-04-01,eGFR,ml/min/1.73m2,50,70',
    '5,2024-07-01,eGFR,ml/min/1.73m2,40,70',
  ].join('\n')

  await uploadCsv(page, 'g5-reasons.csv', csv)
  await expect(page.locator('.workspace-dataset')).toContainText('5 patients')
  await showOnlyParameter(page, /^eGFR \[ml\/min\/1\.73m2\]$/, false)
  await page.getByLabel('Analysis preset').selectOption('ckd_progression')

  // The G5 label is the last token of the endpoint badge; pin it exactly.
  const expected = new Map([
    ['1', 'G5 not projected'],
    ['2', 'G5 now'],
    ['3', 'G5 no age'],
    ['4', 'G5 n < 3'],
    ['5', 'G5 < 1 yr'],
  ])
  for (const [patient, label] of expected) {
    const badge = patientRow(page, patient).locator('.wt-badge-endpoint')
    await expect(badge).toBeVisible()
    expect((await badge.innerText()).split(' · ').at(-1)).toBe(label)
    expect(await badge.getAttribute('title')).toBeTruthy()
  }
  expect(problems).toEqual([])
})

test('keeps the AKI chip visible next to endpoint badges', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await page.getByRole('button', { name: 'Apply calculation' }).click()
  await showOnlyParameter(page, /^eGFR \(CKD-EPI 2021, computed\)/, false)
  await page.getByLabel('Analysis preset').selectOption('ckd_progression')

  const row = patientRow(page, '12')
  await expect(row.locator('.wt-badge-aki')).toBeVisible()
  await expect(row.locator('.wt-badge-endpoint')).toBeVisible()
  // KRT is recorded independently of the AKI badge and withholds future G5 projection.
  await expect(row.locator('.wt-badge-endpoint')).toContainText('Kidney failure reached')
  await expect(row.locator('.wt-badge-endpoint')).toContainText('G5 not projected after KRT')
  await expect(row.locator('.wt-badge-endpoint')).not.toContainText('AKI')
  expect(problems).toEqual([])
})

const sexValuesCsv = [
  'patientId,labDate,testName,unit,value,sex,ageAtLab',
  '1,2024-01-01,Kreatinin,mg/dl,1.0,female,50',
  '2,2024-01-01,Kreatinin,mg/dl,1.1,M,51',
  '3,2024-01-01,Kreatinin,mg/dl,1.2,1,52',
  '4,2024-01-01,Kreatinin,mg/dl,1.3,unknown,53',
].join('\n')

test('surfaces unreadable sex values and clears them after manual correction', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await uploadCsv(page, 'sex-values.csv', sexValuesCsv)
  await expect(page.getByText('2 patients without resolved sex', { exact: false })).toBeVisible()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await expect(page.getByText('2: Sex missing or unresolved')).toBeVisible()
  const warning = page.getByText(/^Unreadable sex values:/)
  await expect(warning).toContainText('"1", "unknown"')
  await expect(warning).not.toContainText('"female"')

  await page.getByText('Review and edit patients (4)', { exact: true }).click()
  for (const patient of ['3', '4']) {
    await page.getByRole('button', { name: `Edit demographics: ${patient}` }).click()
    await page.getByRole('dialog').getByLabel('Sex').selectOption('w')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  }
  await expect(page.getByText('0 patients without resolved sex', { exact: false })).toBeVisible()
  await expect(page.getByText(/Sex missing or unresolved/)).toHaveCount(0)
  await expect(warning).toHaveCount(0)
  expect(problems).toEqual([])
})

test('shows a grey, not amber, no-fit note for a single measurement', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await uploadCsv(page, 'sex-values.csv', sexValuesCsv)
  await showOnlyParameter(page, /^Kreatinin \[mg\/dl\]$/)
  const note = patientRow(page, '1').locator('.wt-cell-summary').getByText('n < 3', { exact: true })
  await expect(note).toHaveClass('wt-muted')
  await expect(patientRow(page, '1').locator('.wt-warning')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('rejects ambiguous normalized CSV headers visibly', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  const ambiguous = [
    'Patient ID,patient_id,labDate,testName,unit,value',
    '1,1,2024-01-01,Kreatinin,mg/dl,1.0',
  ].join('\n')
  await uploadCsv(page, 'ambiguous.csv', ambiguous)
  await expect(page.getByRole('alert')).toContainText(/Ambiguous columns: "Patient ID" and "patient_id"/)
  expect(problems).toEqual([])
})

test('downloads the empty templates and demo files with stable filenames', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await page.goto('/')
  for (const [link, file] of [
    ['Lab template', 'template_labs.csv'],
    ['Event template', 'template_events.csv'],
    ['Attribute template', 'template_attributes.csv'],
    ['Demo workbook', 'test_labs.xlsx'],
    ['Demo events', 'test_events.csv'],
    ['Demo attributes', 'test_attributes.csv'],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: link, exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe(file)
  }
  expect(problems).toEqual([])
})

test('reports a patient whose ages fit no single birth date', async ({ page }) => {
  await uploadCsv(page, 'age-conflict.csv', [
    'patientId,labDate,testName,unit,value,sex,ageAtLab',
    '1,2022-01-15,Kreatinin,mg/dl,1.0,w,46',
    '1,2022-07-20,Kreatinin,mg/dl,1.2,w,46',
    '1,2023-03-02,Kreatinin,mg/dl,1.4,w,64',
  ].join('\n'))
  await expect(page.getByText('1 conflicts', { exact: false })).toBeVisible()
  await page.getByText('Conflicts and their resolution', { exact: true }).click()
  await expect(page.getByText(/no single birth date/i)).toBeVisible()
})

test('keeps methodology usable on a mobile viewport', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Methods', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Methods and interpretation' })).toBeInViewport()
  await expect(page.getByRole('heading', { name: 'Theory & Methods' })).toBeVisible()
  await page.getByRole('link', { name: 'Methodology Reference' }).click()
  await expect(page.getByRole('heading', { name: 'Choosing a Fit Model' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Methodology Reference' })).toBeInViewport()
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(problems).toEqual([])
})
