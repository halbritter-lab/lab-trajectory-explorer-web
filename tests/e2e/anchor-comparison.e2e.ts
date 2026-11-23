import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'

// Before/after comparison at an anchor event (issue #64) and the "Years since event" axis (K16), demo data.
const EGFR = 'eGFR [ml/min/1,73m²]'

test('compares the slopes at the transplant, exports them and aligns the overlay at the anchor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.locator('.workspace-dataset').waitFor()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).first().click()
  await page.getByRole('checkbox', { name: `Analyse trend: ${EGFR}`, exact: true }).check()
  await page.getByRole('button', { name: `Analysis settings: ${EGFR}`, exact: true }).click()
  await page.getByText('Calculation settings', { exact: true }).click()
  await page.getByLabel('Compare slopes before and after an anchor event').check()
  await page.getByLabel('Anchor event', { exact: true }).selectOption('type:kidney_transplant')
  await expect(page.getByLabel('Analysis preset')).toHaveValue('general_exploration')
  // Since 2026-11-22 every preset censors from the transplant on; the after side needs the values
  // after it, which the column then fits as a separate segment.
  await page.getByRole('checkbox', { name: 'Censor after kidney transplant' }).uncheck()
  await page.getByRole('button', { name: 'Close analysis settings' }).click()

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export cohort (XLSX)' }).click()
  const workbook = XLSX.read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(workbook.SheetNames.at(-2)).toBe('anchor_comparison')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.anchor_comparison)
  expect(rows).toHaveLength(28)
  const p13 = rows.find(row => row.PatientID === 13)!
  expect(p13).toMatchObject({ anchor_date: '2022-07-01', before_n: 6, before_span_days: 882, after_n: 3, after_span_days: 365 })
  expect(p13.slope_difference as number).toBeCloseTo(4.823, 3)
  expect(p13.difference_ci_low as number).toBeCloseTo(4.320, 3)
  expect(p13.difference_ci_high as number).toBeCloseTo(5.326, 3)
  // The column's own slope is that of the values before the transplant; the segment is exported beside it.
  const cohort = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort).find(row => row.PatientID === 13 && row.Parameter === 'eGFR')!
  expect(cohort.slope as number).toBeCloseTo(-12.828, 3)
  expect(cohort).toMatchObject({ krt_segment_start: '2022-07-01', krt_segment_n_fitted: 3, krt_segment_fitted_span_days: 365, slope_tier: 'reliable' })
  expect(cohort.krt_segment_slope as number).toBeCloseTo(-8.005, 3)

  // A 60-day window: the value of 2022-08-10 leaves the after slope and is drawn grey.
  await page.getByRole('button', { name: `Analysis settings: ${EGFR}`, exact: true }).click()
  await page.getByLabel('Anchor exclusion days').fill('60')
  await page.getByLabel('Anchor exclusion days').press('Enter')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await page.getByRole('button', { name: 'Open patient 13', exact: true }).click()
  await expect(page.getByTestId('anchor-comparison')).toContainText('difference after − before +4.76')
  await expect(page.getByTestId('anchor-comparison')).toContainText('1 measurement in the 60-day window after the anchor left out of the after slope.')
  const chart = page.getByRole('region', { name: `Chart ${EGFR}` })
  // The values after the transplant are the separate segment, outside the column's own slope (2026-11-22).
  await expect(chart.locator('[data-testid="excluded-point"][data-exclusion="krt_segment anchor-exclusion-window"]')).toHaveCount(1)
  await expect(chart.getByTestId('excluded-legend')).toHaveText('Grey open circles: 3 measurements excluded from the fit (after kidney replacement therapy, fitted as a separate segment). They stay visible but do not enter the slope.')
  await expect(chart.getByTestId('krt-segment-line')).toHaveCount(1)
  await expect(page.getByTestId('krt-segment')).toContainText('After kidney transplant (01/07/2022), fitted as a separate segment: -8.01')

  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByLabel('Time axis').selectOption('event')
  await page.keyboard.press('Escape')
  const overlay = page.getByRole('region', { name: `Chart ${EGFR}` })
  await expect(overlay.getByText('Years since anchor event (first event of type kidney_transplant)', { exact: true })).toBeVisible()
  await expect(overlay).toContainText('2 of 28 trajectories; 3 without numeric measurements; 23 trajectories without a matching anchor event (not drawn)')
  expect(await overlay.getByTestId('x-tick').allTextContents()).toEqual(['-2', '-1', '0', '1'])
  await expect(page.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' }).getByTestId('event-axis-note')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })).not.toContainText('without a matching anchor event')
})
