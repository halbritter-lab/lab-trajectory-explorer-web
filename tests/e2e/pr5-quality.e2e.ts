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
  await expect(page.getByText(/Loaded 216 rows/)).toBeVisible()
}

async function selectSeries(page: Page, query: string, optionName: RegExp): Promise<void> {
  const input = page.getByRole('combobox', { name: 'Series 1 parameter' })
  await input.click()
  await input.fill(query)
  const option = page.getByRole('option', { name: optionName }).first()
  await expect(option).toBeVisible()
  await option.click()
}

async function uploadCsv(page: Page, name: string, csv: string): Promise<void> {
  await page.goto('/')
  await page.locator('main input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
}

test('shows the same slope-quality caveat in the cohort and patient plot', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await page.getByRole('button', { name: 'Cohort', exact: true }).click()
  await selectSeries(page, 'Kreatinin mg/dl', /^Kreatinin \(mg\/dl\)$/)

  for (const [patient, label] of [['3', 'n < 3'], ['5', '< 1 yr'], ['12', '< 1 yr']] as const) {
    const row = page.getByRole('button', { name: patient, exact: true }).locator('xpath=ancestor::tr')
    const badge = row.locator('.quality-badge', { hasText: label })
    await expect(badge).toBeVisible()
    await expect(badge).toHaveClass(/quality-badge-caveat/)
    expect(await badge.getAttribute('title')).toMatch(/caution|unstable|Two points/i)
  }

  await page.getByRole('button', { name: '3', exact: true }).click()
  await expect(page.locator('.plot-quality-note')).toContainText('n < 3')
  await expect(page.locator('.plot-quality-note')).toContainText('interpret with caution')

  await page.getByRole('button', { name: 'Cohort', exact: true }).click()
  await page.getByRole('combobox', { name: 'Fit preset' }).selectOption({ label: 'Acute review' })
  await expect(page.locator('.quality-badge')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('renders every unavailable-G5 reason in its patient row', async ({ page }) => {
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
  await expect(page.getByText(/Loaded 14 rows/)).toBeVisible()
  await selectSeries(page, 'eGFR', /^eGFR \(ml\/min\/1\.73m2\)$/)
  await page.getByRole('combobox', { name: 'Fit preset' }).selectOption({ label: 'CKD progression' })

  const expected = new Map([
    ['1', 'G5 unlikely'],
    ['2', 'G5 now'],
    ['3', 'G5 no age'],
    ['4', 'G5 n < 3'],
    ['5', 'G5 < 1 yr'],
  ])
  for (const [patient, label] of expected) {
    const row = page.getByRole('button', { name: patient, exact: true }).locator('xpath=ancestor::tr')
    const badge = row.locator('.endpoint-badge')
    await expect(badge).toContainText(label)
    expect(await badge.getAttribute('title')).toBeTruthy()
  }
  expect(problems).toEqual([])
})

test('keeps AKI visible when lower-priority badges collapse into more', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await page.getByRole('combobox', { name: 'Compute eGFR' }).selectOption({ label: 'CKD-EPI 2021' })
  await page.getByRole('combobox', { name: 'Fit preset' }).selectOption({ label: 'CKD progression' })
  await page.getByRole('button', { name: 'Cohort', exact: true }).click()
  await selectSeries(page, 'eGFR', /^ƒ eGFR \(CKD-EPI 2021, computed\)/)
  await page.getByRole('checkbox', { name: 'Show AKI episodes' }).check()

  const row = page.getByRole('button', { name: '12', exact: true }).locator('xpath=ancestor::tr')
  await expect(row.locator('.aki-badge')).toBeVisible()
  await expect(row.locator('.more-badge')).toBeVisible()
  const hiddenTitle = await row.locator('.more-badge').getAttribute('title')
  expect(hiddenTitle).toContain('G5 n < 3')
  expect(hiddenTitle).not.toContain('AKI')
  expect(problems).toEqual([])
})

const sexValuesCsv = [
  'patientId,labDate,testName,unit,value,sex,ageAtLab',
  '1,2024-01-01,Kreatinin,mg/dl,1.0,female,50',
  '2,2024-01-01,Kreatinin,mg/dl,1.1,M,51',
  '3,2024-01-01,Kreatinin,mg/dl,1.2,1,52',
  '4,2024-01-01,Kreatinin,mg/dl,1.3,unknown,53',
].join('\n')

test('surfaces unreadable sex values and clears the warning after manual correction', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await uploadCsv(page, 'sex-values.csv', sexValuesCsv)
  await page.getByRole('combobox', { name: 'Compute eGFR' }).selectOption({ label: 'CKD-EPI 2021' })
  const warning = page.locator('.sidebar-warning')
  await expect(warning).toContainText('"1", "unknown"')
  await expect(warning).not.toContainText('female,')

  await page.getByRole('checkbox', { name: 'Show missing demographics' }).check()
  for (const patient of ['3', '4']) {
    await page.getByRole('button', { name: `Enter demographics for patient ${patient}` }).click()
    await page.getByRole('combobox', { name: `Manual sex for patient ${patient}` }).selectOption('w')
    await page.getByRole('button', { name: 'Apply demographics' }).click()
  }
  await expect(warning).toHaveCount(0)
  expect(problems).toEqual([])
})

test('shows a grey no-fit badge for a single measurement', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await uploadCsv(page, 'sex-values.csv', sexValuesCsv)
  await page.getByRole('button', { name: 'One', exact: true }).click()
  await selectSeries(page, 'Kreatinin', /^Kreatinin \(mg\/dl\)$/)
  const badge = page.locator('.plot-quality-note .quality-badge')
  await expect(badge).toHaveText('n < 3')
  await expect(badge).not.toHaveClass(/quality-badge-caveat/)
  const style = await badge.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      borderStyle: computed.borderStyle,
    }
  })
  expect(style).toEqual({
    backgroundColor: 'rgb(248, 250, 252)',
    color: 'rgb(71, 85, 105)',
    borderStyle: 'dashed',
  })
  expect(problems).toEqual([])
})

test('rejects ambiguous normalized CSV headers visibly', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  const ambiguous = [
    'Patient ID,patient_id,labDate,testName,unit,value',
    '1,1,2024-01-01,Kreatinin,mg/dl,1.0',
  ].join('\n')
  await uploadCsv(page, 'ambiguous.csv', ambiguous)
  await expect(page.getByText(/Ambiguous columns: "Patient ID" and "patient_id"/)).toBeVisible()
  expect(problems).toEqual([])
})

test('downloads all three empty templates with stable filenames', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await page.goto('/')
  const [labs] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download empty template' }).click(),
  ])
  expect(labs.suggestedFilename()).toBe('template_labs.csv')

  await loadDemo(page)
  for (const [link, file] of [
    ['Download events template', 'template_events.csv'],
    ['Download attributes template', 'template_attributes.csv'],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: link }).click(),
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
  await expect(page.getByText(/no single birth date/i)).toBeVisible()
})

test('keeps methodology usable on a mobile viewport', async ({ page }) => {
  const problems = collectBrowserProblems(page)
  await loadDemo(page)
  await page.getByRole('button', { name: 'Theory & Methods' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByRole('heading', { name: 'Theory & Methods' })).toBeInViewport()
  await expect(page.getByRole('heading', { name: 'Choosing a Fit Model' })).toBeVisible()
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(problems).toEqual([])
})
