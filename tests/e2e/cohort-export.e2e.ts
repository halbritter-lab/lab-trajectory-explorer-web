import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Persona review 2026-11-21 (issue #35): the cohort workbook as a script reads it.

async function exportCohort(page: Page): Promise<{ bytes: Buffer; workbook: XLSX.WorkBook }> {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const bytes = await readFile((await (await pending).path())!)
  return { bytes, workbook: XLSX.read(bytes, { type: 'buffer' }) }
}
const header = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1 })[0]
const about = (workbook: XLSX.WorkBook) => XLSX.utils.sheet_to_json<{ note: string }>(workbook.Sheets.about).map(row => row.note)

test('the cohort export keeps one layout with and without grouping, is compressed and describes its columns', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset').waitFor()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  const plain = await exportCohort(page)
  await page.getByLabel('Group by attribute').selectOption('genotype')
  const grouped = await exportCohort(page)

  expect(plain.workbook.SheetNames).toEqual(['measurements', 'raw_measurements', 'cohort', 'events', 'aki_episodes', 'patient_attributes', 'demographics', 'parameters', 'settings', 'about', 'columns', 'rolling_windows', 'import_diagnostics', 'anchor_comparison', 'peri_event_creatinine'])
  const columns = header(plain.workbook, 'cohort')
  // 2026-11-22: eight endpoint columns (50 % decline, unconfirmed single value below 15) before group, which stays last.
  expect(columns).toHaveLength(88)
  expect(columns.slice(-4)).toEqual(['endpoint_decline_50_confirmed_value', 'endpoint_decline_50_recovery_value', 'endpoint_g5_single_value_unconfirmed', 'group'])
  expect(columns.slice(75, 79)).toEqual(['first_eligible_value', 'last_eligible_value', 'sex', 'baseline_age'])
  expect(header(grouped.workbook, 'cohort')).toEqual(columns)
  expect(grouped.workbook.Sheets.cohort.F1.v).toBe('slope')
  const groups = (workbook: XLSX.WorkBook) => new Set(XLSX.utils.sheet_to_json<{ group?: string }>(workbook.Sheets.cohort).map(row => row.group ?? ''))
  expect([...groups(plain.workbook)]).toEqual([''])
  expect(groups(grouped.workbook).size).toBeGreaterThan(1)

  // PatientID with one cell type in every sheet; no trend is selected, so slope is an empty cell.
  for (const name of ['measurements', 'raw_measurements', 'cohort', 'events', 'aki_episodes', 'patient_attributes', 'demographics']) {
    expect(plain.workbook.Sheets[name].A1.v, name).toBe('PatientID')
    expect(plain.workbook.Sheets[name].A2.t, name).toBe('n')
  }
  expect(plain.workbook.Sheets.cohort.F2).toBeUndefined()

  // First and last eligible value of patient 13 (eGFR 55 … 24 before the transplant, 64 after it).
  const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(plain.workbook.Sheets.cohort).find(r => r.PatientID === 13 && r.Parameter === 'eGFR')!
  expect(row).toMatchObject({ first_eligible_value: 55, last_eligible_value: 24, last_eligible_date: '2022-06-10', sex: 'w', baseline_age: 58 })

  expect(XLSX.utils.sheet_to_json<{ column: string }>(plain.workbook.Sheets.columns).map(r => r.column)).toEqual(columns)
  const notes = about(plain.workbook)
  for (const key of ['app_version', 'exported_at', 'export_id', 'input_data_id']) expect(notes.filter(note => note.startsWith(`${key}: `)), key).toHaveLength(1)
  const value = (list: string[], key: string) => list.find(note => note.startsWith(`${key}: `))
  expect(value(about(grouped.workbook), 'input_data_id')).toBe(value(notes, 'input_data_id'))
  expect(value(about(grouped.workbook), 'export_id')).not.toBe(value(notes, 'export_id'))

  // Every ZIP entry deflated (method 8); the stored file was about three times as large.
  const methods = new Set<number>()
  for (let i = 0; i + 30 <= plain.bytes.length; i++) if (plain.bytes.readUInt32LE(i) === 0x04034b50) methods.add(plain.bytes.readUInt16LE(i + 8))
  expect([...methods]).toEqual([8])
  expect(plain.bytes.length).toBeLessThan(400_000)
})

test('an exported cohort workbook loads again as a dataset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset').waitFor()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  const { bytes, workbook } = await exportCohort(page)
  const imported = XLSX.utils.sheet_to_json(workbook.Sheets.raw_measurements).length

  await page.getByRole('button', { name: 'Data', exact: true }).first().click()
  await page.getByLabel('Import lab values').setInputFiles({ name: 'exported.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes })
  await expect(page.getByText(new RegExp(`^${imported} lab values, 8 events and 28 attribute rows loaded\\. 0 rows rejected`))).toBeVisible()
  await expect(page.getByText(/missing required column/)).toHaveCount(0)
  // The derived and resolved rows of `measurements` are not taken for lab data: three imported parameters.
  await expect(page.locator('.workspace-dataset')).toContainText('3 parameters')
})
