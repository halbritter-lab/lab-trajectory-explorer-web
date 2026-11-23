import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

test('uploads a workbook and exposes rejected events and attribute warnings', async ({ page }) => {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries({
    labs: [
      { patientId: 1, labDate: '2024-01-15', testName: 'Creatinine', unit: 'mg/dl', value: 1.2 },
      { patientId: 1, labDate: '2025-01-15', testName: 'Creatinine', unit: 'mg/dl', value: 1.4 },
    ],
    events: [
      { patientId: 1, type: 'dialysis', date: 'invalid', title: 'Bad start', intent: 'chronic' },
      { patientId: 1, type: 'other', date: '2024-02-01', title: 'Study visit' },
    ],
    attributes: [{ patientId: 1, genotype: 'A' }, { patientId: 999, genotype: 'B' }],
  })) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({
    name: 'study.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
  })
  await expect(page.locator('.workspace-dataset')).toContainText('1 patient,')
  await expect(page.getByText('2 lab values, 1 event and 2 attribute rows loaded. 1 row rejected; 1 warning.')).toBeVisible()
  // One list per source table, side by side, each naming the source row.
  const diagnostics = page.getByRole('group', { name: 'Import diagnostics' })
  await diagnostics.getByText('Events', { exact: true }).click()
  await diagnostics.getByText('Attributes', { exact: true }).click()
  await expect(diagnostics.getByText(/^events, row 2, patient 1, rejected: Event date "invalid" is not a recognised date/)).toBeVisible()
  await expect(diagnostics.getByText(/^attributes, row 3, patient 999, warning: Patient 999 has no lab values/)).toBeVisible()
  // The rejected event row is listed beside the accepted one, not only counted.
  const rejected = page.getByRole('table', { name: 'Rejected events' })
  await expect(rejected.getByRole('row').filter({ hasText: 'Bad start' })).toContainText('is not a recognised date')
  await page.getByText('Loaded events (1)', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'Loaded events' })).toContainText('Study visit')
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open patient 1', exact: true })).toBeVisible()
})

test('reads a German semicolon CSV as text and lists its import diagnostics', async ({ page }) => {
  // Windows-1252 bytes, as Excel writes "CSV (semicolon-separated)" on German systems.
  const csv = 'patientId;labDate;testName;unit;value\n0012;03/01/2024;Kreatinin;µmol/l;88\n0012;15.02.2024;Kreatinin;umol/L;1,5\n12;2021-02-30;Kreatinin;µmol/l;90\n12;01.03.2024;Kreatinin;µmol/l;<20\n'
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'labs.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') })
  await expect(page.locator('.workspace-dataset')).toContainText('2 patients')
  await expect(page.getByText(/3 lab values.*1 row rejected; 4 warnings\./)).toBeVisible()
  await page.getByText(/import diagnostics — show details/).click()
  await expect(page.getByText('labs.csv, row 4, patient 12, rejected: Lab date "2021-02-30" is not a valid calendar date; row not imported.')).toBeVisible()
  await expect(page.getByText(/Patient IDs "0012" and "12" differ only in leading zeros, spaces or letter case and are kept as separate patients\./)).toBeVisible()
  await expect(page.getByText(/read day-first/)).toBeVisible()
  await expect(page.getByText('labs.csv, warning: Kreatinin: unit spellings "µmol/l" (2), "umol/L" (1) were merged as "µmol/l".')).toBeVisible()
  await expect(page.getByText(/Kreatinin \[µmol\/l\]: 1 censored value/)).toBeVisible()
})

test('orders several creatinine values of one day by time of day, whatever the row order of the file', async ({ page }) => {
  // Decided 2026-11-21: with the newest row first a fall within a day was an episode and a rise was missed.
  const timed = [
    ['FALL', '2026-09-02 06:00', 0.9], ['FALL', '2026-09-01 20:00', 1.0], ['FALL', '2026-09-01 06:00', 1.4],
    ['RISE', '2026-09-04 06:00', 1.2], ['RISE', '2026-09-01 20:00', 1.6], ['RISE', '2026-09-01 06:00', 1.0],
  ] as const
  const untimed = timed.map(([id, date, value]) => [`${id}-NOTIME`, date.slice(0, 10), value] as const)
  const csv = (rows: readonly (readonly [string, string, number])[]) => `patientId,labDate,testName,unit,value\n${rows.map(r => `${r[0]},${r[1]},Kreatinin,mg/dl,${r[2]}`).join('\n')}\n`
  const cells = (text: string) => { const [y, m, d, h = 0, min = 0] = text.split(/[- :]/).map(Number); return new Date(y, m - 1, d, h, min) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...timed, ...untimed].map(([patientId, date, value]) => ({ patientId, labDate: cells(date), testName: 'Kreatinin', unit: 'mg/dl', value })), { cellDates: true }), 'labs')
  const files = [
    { name: 'newest-first.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([...timed, ...untimed])) },
    { name: 'oldest-first.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([...timed, ...untimed].reverse())) },
    { name: 'date-cells.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer },
  ]
  await page.goto('/')
  for (const file of files) {
    await page.getByLabel('Import lab values').setInputFiles(file)
    await expect(page.locator('.workspace-dataset')).toContainText(file.name)
    await page.getByRole('button', { name: 'Data', exact: true }).click()
    await expect(page.getByText(/^2 patient-days in 2 patients with several serum creatinine values whose order within the day is unknown/)).toBeVisible()
    // The list stays open across imports; open it without toggling.
    const list = page.locator('details').filter({ has: page.getByText('Detected AKI episodes (1)', { exact: true }) })
    await list.evaluate((details: HTMLDetailsElement) => { details.open = true })
    const episode = list.getByRole('row').nth(1)
    await expect(episode).toContainText('RISE')
    await expect(episode).toContainText('1 on 01/09/2026')
    await expect(episode).not.toContainText('NOTIME')
  }
})

test('redirects links to the former workspace.html to the application', async ({ page }) => {
  await page.goto('/workspace.html?source=bookmark#methods')
  await expect(page).toHaveURL(/\/index\.html\?source=bookmark#methods$/)
  await expect(page.getByRole('heading', { name: 'Start here', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Data' }).first().click()
  await expect(page.getByRole('button', { name: 'Load demo data' })).toBeVisible()
})

test('import diagnostics name source rows, survive an attributes upload and a reload, and are exported', async ({ page }) => {
  const labs = ['patientId;labDate;testName;unit;value;sex',
    'Z1;2023-01-10;Kreatinin;mg/dl;0,9;x', 'Z1;31.02.2023;Kreatinin;mg/dl;1,0;x', 'Z1;3024-05-08;Kreatinin;mg/dl;1,1;x',
    'Z2;2023-10-01;Kreatinin;mg/dl;1,1;m', 'Z2;2023-10-01;Kreatinin;mg/dl;1,9;m', ';2023-10-02;Kreatinin;mg/dl;1,0;m', 'Z2;2024-10-01;Kreatinin;mg/dl;neg;m'].join('\n')
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'register.csv', mimeType: 'text/csv', buffer: Buffer.from(labs) })
  await expect(page.getByText(/5 lab values.*2 rows rejected; 3 warnings\./)).toBeVisible()
  const diagnostics = page.getByRole('group', { name: 'Import diagnostics' })
  await diagnostics.getByText('Lab values', { exact: true }).click()
  await expect(diagnostics.getByText('register.csv, row 3, patient Z1, rejected: Lab date "31.02.2023" is not a valid calendar date; row not imported.')).toBeVisible()
  await expect(diagnostics.getByText('register.csv, row 7, patient without ID, rejected: Patient ID missing; row not imported.')).toBeVisible()
  await expect(diagnostics.getByText(/patient Z1, warning: 1 lab row with an implausible lab date: 3024-05-08 \(after the import day \d{4}-\d{2}-\d{2}\); the row is used unchanged\./)).toBeVisible()
  await expect(diagnostics.getByText(/Unreadable sex value: "x" \(2 rows, 1 patient\)/)).toBeVisible()
  // A collective warning opens the rows it counts.
  const sameDay = diagnostics.getByRole('listitem').filter({ hasText: 'Kreatinin [mg/dl]: 1 patient-day with differing values on the same day for 1 patient' })
  await sameDay.getByText('Show the 2 affected rows').click()
  await expect(sameDay.getByRole('row')).toHaveText(['RowPatientDateParameterValue', '5Z22023-10-01Kreatinin [mg/dl]1,1', '6Z22023-10-01Kreatinin [mg/dl]1,9'])
  // The count of values without a number opens its rows as well.
  await page.getByText('Show the values without a numeric measurement').click()
  await expect(page.getByRole('region', { name: 'Show the values without a numeric measurement' }).getByRole('row').nth(1)).toHaveText('8Z22024-10-01Kreatinin [mg/dl]neg')

  // An attributes upload adds its own list and leaves the lab findings in place.
  await page.getByLabel('Replace attributes').setInputFiles({ name: 'centres.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,centre\nZ1,A\nZ1,B\nZ9,C\n') })
  await expect(page.getByText('2 attribute rows imported; 1 row rejected.')).toBeVisible()
  await expect(diagnostics.locator('summary').filter({ hasText: 'import diagnostics' })).toHaveText([
    'Lab values (register.csv, 2 rows rejected): 5 import diagnostics — show details',
    'Attributes (centres.csv, 1 row rejected): 2 import diagnostics — show details'])

  // Saved with the dataset and restored after a reload.
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  await expect(page.getByLabel('Data workspace').getByText(/^Saved on \d{4}-\d{2}-\d{2} /)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^Dataset and analysis settings .* restored from this device/)).toBeVisible()
  await expect(diagnostics.locator('summary').filter({ hasText: 'import diagnostics' })).toHaveCount(2)
  await diagnostics.getByText('Lab values', { exact: true }).click()
  await expect(diagnostics.getByText('register.csv, row 3, patient Z1, rejected: Lab date "31.02.2023" is not a valid calendar date; row not imported.')).toBeVisible()

  // The same table as a file and as the last sheet of the cohort workbook.
  const read = async (trigger: () => Promise<void>) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
    const chunks: Buffer[] = []
    for await (const chunk of (await download.createReadStream())!) chunks.push(chunk as Buffer)
    return { name: download.suggestedFilename(), workbook: XLSX.read(Buffer.concat(chunks), { type: 'buffer' }) }
  }
  const file = await read(() => diagnostics.getByRole('button', { name: 'Download import diagnostics (XLSX)' }).click())
  expect(file.name).toMatch(/^lab-trajectory-import-diagnostics-.*\.xlsx$/)
  const fileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(file.workbook.Sheets.import_diagnostics, { defval: '' })
  expect(fileRows.filter(row => row.kind === 'rejected').map(row => [row.source, row.sheet, row.row, row.patient_id])).toEqual([
    ['labs', 'register.csv', 3, 'Z1'], ['labs', 'register.csv', 7, ''], ['attributes', 'centres.csv', 3, 'Z1']])
  expect(fileRows.filter(row => row.kind === 'data check').map(row => [row.row, row.value])).toEqual([[8, 'neg']])
  await page.getByRole('button', { name: 'Open trajectories →' }).click()
  const cohort = await read(() => page.getByRole('button', { name: /^Export cohort/ }).first().click())
  // anchor_comparison (2026-11-22) follows import_diagnostics.
  expect(cohort.workbook.SheetNames.at(-3)).toBe('import_diagnostics')
  expect(cohort.workbook.SheetNames.slice(0, -3)).toEqual(['measurements', 'raw_measurements', 'cohort', 'events', 'aki_episodes', 'patient_attributes', 'demographics', 'parameters', 'settings', 'about', 'columns', 'rolling_windows'])
  expect(cohort.workbook.SheetNames.slice(-2)).toEqual(['anchor_comparison', 'peri_event_creatinine'])
  expect(XLSX.utils.sheet_to_json(cohort.workbook.Sheets.import_diagnostics, { defval: '' })).toEqual(fileRows)
})

test('reads a semicolon CSV whose rows hold more commas than semicolons, and names the wide layout', async ({ page }) => {
  await page.goto('/')
  const many = 'patientId;labDate;testName;unit;value\n101;10.01.2021;Kreatinin, Serum, enzymatisch, IFCC;mg/dl;1,0\n101;10.02.2021;Kreatinin, Serum, enzymatisch, IFCC;mg/dl;1,2\n'
  await page.getByLabel('Import lab values').setInputFiles({ name: 'commas.csv', mimeType: 'text/csv', buffer: Buffer.from(many) })
  await expect(page.getByText('2 lab values, 0 events and 0 attribute rows loaded. 0 rows rejected; 0 warnings.')).toBeVisible()
  const wide = 'Patient;Geschlecht;Datum;Kreatinin (mg/dl);Harnstoff (mg/dl)\nP01;w;14.01.2020;1,1;38\n'
  await page.getByLabel('Import lab values').setInputFiles({ name: 'wide.csv', mimeType: 'text/csv', buffer: Buffer.from(wide) })
  await expect(page.getByRole('alert')).toContainText('This file seems to have one column per lab test; one row per measurement is required.')
  // The rejected file leaves the loaded dataset in place.
  await expect(page.locator('.workspace-dataset')).toContainText('commas.csv')
})

test('urine creatinine marked only by its LOINC code becomes its own parameter without AKI episodes or eGFR', async ({ page }) => {
  const days = [['2021-01-10', 0.98, 3.92], ['2021-07-09', 1.1, 4.4], ['2022-01-05', 1.17, 4.68], ['2022-07-04', 1.21, 4.84], ['2022-12-31', 1.35, 5.4]]
  const csv = ['patientId,labDate,testName,unit,value,loinc,sex,ageAtLab',
    ...days.flatMap(([date, serum, urine]) => [`103,${date},Kreatinin,mg/dl,${serum},2160-0,m,47`, `103,${date},Kreatinin,mg/dl,${urine},2161-8,m,47`])].join('\n')
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'loinc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText('10 lab values, 0 events and 0 attribute rows loaded. 0 rows rejected; 1 warning.')).toBeVisible()
  await page.getByText(/import diagnostics — show details/).click()
  await expect(page.getByText(/Kreatinin: 5 values with LOINC code 2161-8 were imported as the separate parameter "Kreatinin \(urine, LOINC 2161-8\)"/)).toBeVisible()
  await page.getByText('Imported parameters (2)', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'Imported parameters' }).getByRole('row')).toHaveText([
    'ParameterUnitLOINCValuesPatientsPatients with fewer than 3 dated numeric values', 'Kreatininmg/dl2160-0510', 'Kreatinin (urine, LOINC 2161-8)mg/dl2161-8510'])
  // Mixed in one series, every same-day pair was a stage 3 episode.
  await expect(page.getByText('Detected AKI episodes (0)', { exact: true })).toBeVisible()
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await expect(page.getByLabel('Creatinine source').locator('option')).toHaveText(['Automatic: Kreatinin (mg/dl)', 'Kreatinin (mg/dl)'])
  await expect(page.getByText('5 computed values in preview', { exact: true })).toBeVisible()
})
