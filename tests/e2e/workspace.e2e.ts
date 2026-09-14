import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

test.use({ timezoneId: 'America/Los_Angeles' })

function researchWorkbook(): Buffer {
  const labs: object[] = []
  for (const [index, patientId] of ['A-01', 'B-02', 'C-03'].entries()) {
    for (let year = 0; year < 4; year++) {
      for (let parameter = 0; parameter < 12; parameter++) labs.push({
        patientId, labDate: `${2020 + year}-01-15`,
        testName: parameter < 2 ? 'Creatinine' : `Marker ${parameter}`,
        unit: parameter === 0 ? 'mg/dl' : 'U/L',
        value: parameter === 0 ? 1 + year * .1 + index * .2 : parameter * 10 + year,
        sex: index === 1 ? 'm' : 'f', ageAtLab: index === 2 ? null : 50 + index * 10 + year,
      })
    }
  }
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries({
    labs,
    attributes: [{ patientId: 'A-01', studyArm: 'Control' }, { patientId: 'B-02', studyArm: 'Intervention' }, { patientId: 'C-03', studyArm: 'Control' }],
    events: [{ patientId: 'A-01', type: 'other', date: '2021-01-15', title: 'Research visit' }, { patientId: 'A-01', type: 'other', date: 'bad-date', title: 'Rejected visit' }],
  })) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

async function upload(page: Page) {
  await page.goto('/workspace.html')
  await page.getByLabel('Laborwerte importieren').setInputFiles({ name: 'research.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: researchWorkbook() })
  await expect(page.locator('.workspace-dataset')).toContainText('3 Personen')
}

test('real workbook: quality, derivation, many parameters, shared scope and actual exports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await upload(page)
  await page.getByText(/Importdiagnosen anzeigen/).click()
  await expect(page.getByText(/invalid_date/)).toBeVisible()
  await page.getByLabel('eGFR-Formel').selectOption('ckd-epi-2021')
  await expect(page.getByText('8 berechnete Werte in der Vorschau', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Berechnung anwenden' }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('13 Parameter')

  // A rejected replacement must preserve current data and derived settings.
  await page.getByLabel('Laborwerte importieren').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong,header\nx,y\n') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.workspace-dataset')).toContainText('research.xlsx')
  await expect(page.locator('.workspace-dataset')).toContainText('13 Parameter')

  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await page.getByRole('button', { name: 'Parameter wählen' }).click()
  await page.getByRole('button', { name: 'Alle Parameter', exact: true }).click()
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  await expect(page.getByText('13 Parameter ausgewählt', { exact: true })).toBeVisible()
  expect(await page.locator('.wt-table svg').count()).toBeGreaterThan(30)
  await page.getByLabel('Person suchen', { exact: true }).fill('A-01')
  await expect(page.getByRole('button', { name: 'Person B-02 öffnen', exact: true })).toHaveCount(0)
  await page.getByLabel('Gruppieren nach').selectOption('studyArm')
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await expect(page.locator('.wt-plot-grid svg')).toHaveCount(13)

  const workbookDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /Kohorte.*xlsx/i }).click()
  const downloaded = await workbookDownload
  const bytes = await readFile((await downloaded.path())!)
  const result = XLSX.read(bytes, { type: 'buffer' })
  const measurements = XLSX.utils.sheet_to_json<{ PatientID: string; Datum: string; origin: string }>(result.Sheets.measurements)
  expect(measurements.length).toBeGreaterThan(0)
  expect(new Set(measurements.map(row => row.PatientID))).toEqual(new Set(['A-01']))
  expect(measurements.some(row => row.origin === 'derived')).toBe(true)
  expect(measurements.every(row => row.Datum.endsWith('-01-15'))).toBe(true)
  expect(XLSX.utils.sheet_to_json<{ date: string }>(result.Sheets.events)[0].date).toBe('2021-01-15')
  expect(XLSX.utils.sheet_to_json(result.Sheets.parameters)).toHaveLength(13)

  const svgDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /SVG/ }).first().click()
  const svg = await readFile((await (await svgDownload).path())!, 'utf8')
  expect(svg).toContain('Nur für Forschungszwecke')
  expect(svg).toContain('Creatinine')
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /PNG/ }).first().click()
  const png = await readFile((await (await pngDownload).path())!)
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  await page.getByRole('button', { name: /^Person A-01 öffnen,/ }).first().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Person A-01', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nächste Person' })).toBeDisabled()
  await page.getByRole('button', { name: 'Daten', exact: true }).click()
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await expect(page.getByLabel('Person suchen', { exact: true })).toHaveValue('A-01')
  expect(errors).toEqual([])
})

test('manual demographics and formula updates reach the selected derived trajectory', async ({ page }) => {
  await upload(page)
  await page.getByText('Personen prüfen und bearbeiten (3)', { exact: true }).click()
  await page.getByRole('button', { name: 'Demografie bearbeiten: C-03', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2020-01-15')
  await page.getByLabel('Alter am Referenzdatum').fill('55')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await page.getByLabel('eGFR-Formel').selectOption('ckd-epi-2021')
  await expect(page.getByText('12 berechnete Werte in der Vorschau', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Berechnung anwenden' }).click()
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await page.getByRole('button', { name: 'Parameter wählen' }).click()
  await page.getByRole('button', { name: 'Keine Parameter', exact: true }).click()
  await page.getByRole('checkbox', { name: /eGFR.*computed/ }).check()
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: /eGFR.*CKD/ })).toBeVisible()
  await page.getByRole('button', { name: 'Daten', exact: true }).click()
  await page.getByLabel('eGFR-Formel').selectOption('mdrd-4')
  await page.getByRole('button', { name: 'Berechnung anwenden' }).click()
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: /eGFR.*MDRD/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /eGFR.*CKD/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Person C-03 öffnen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Person C-03', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Daten', exact: true }).click()
  await page.getByLabel('eGFR-Formel').selectOption('off')
  await page.getByRole('button', { name: 'Berechnung anwenden' }).click()
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await expect(page.getByText('0 Parameter ausgewählt', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /exportieren \(XLSX\)/ })).toBeDisabled()
})

test('workspace stays within a narrow viewport and replacement resets selections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await upload(page)
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await page.getByRole('button', { name: 'Parameter wählen' }).click()
  await page.getByRole('button', { name: 'Alle Parameter', exact: true }).click()
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  const table = page.getByRole('region', { name: 'Patiententabelle, horizontal scrollbar' })
  await table.evaluate(element => { element.scrollLeft = 500 })
  await page.getByRole('button', { name: 'Person A-01 öffnen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Person A-01', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Tabelle', exact: true }).click()
  await expect(table).toHaveJSProperty('scrollLeft', 500)
  await page.getByLabel('Person suchen', { exact: true }).fill('A-01')
  await page.getByRole('button', { name: 'Daten', exact: true }).click()
  await page.getByLabel('Laborwerte importieren').setInputFiles({ name: 'replacement.csv', mimeType: 'text/csv', buffer: Buffer.from('patientId,labDate,testName,unit,value\nnew-person,2025-01-01,Potassium,mmol/L,4.2\n') })
  await expect(page.locator('.workspace-dataset')).toContainText('1 Personen')
  await page.getByRole('button', { name: 'Verläufe', exact: true }).click()
  await expect(page.getByLabel('Person suchen', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Person new-person öffnen', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
})
