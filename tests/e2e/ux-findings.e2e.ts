import { expect, test } from '@playwright/test'

// Paths the simulated-user case studies of 2026-11-16 could not find.
test('names parameters, attributes and AKI episodes on the Data page and in the patient view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByText('Imported parameters (10)', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'Imported parameters' }).getByRole('row')).toHaveCount(11)
  await page.getByText('Patient attributes (4)', { exact: true }).click()
  await expect(page.getByText('A (12), B (11), C (3); not recorded for 2 patients')).toBeVisible()
  await page.getByText('Detected AKI episodes (8)', { exact: true }).click()
  const episodes = page.getByRole('table', { name: 'Detected AKI episodes' })
  await expect(episodes.getByRole('row').nth(1)).toContainText('II')
  await expect(episodes.getByRole('row').nth(1)).toContainText('08/09/2022')
  await episodes.getByRole('button', { name: '6', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patient 6', exact: true })).toBeVisible()
  await expect(page.getByText(/^Stage II, onset 08\/09\/2022, creatinine peak 2\.9 mg\/dl/)).toBeVisible()
})

test('names the trajectory under the pointer in the overlay', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  const chart = page.getByRole('region', { name: 'Chart eGFR [ml/min/1,73m²]' })
  // Grouping from the toolbar colours the overlay by group.
  await expect(chart.getByRole('group', { name: 'Groups for eGFR [ml/min/1,73m²]' })).toHaveCount(0)
  await page.getByLabel('Group by attribute').selectOption('cohort')
  await expect(chart.getByRole('group', { name: 'Groups for eGFR [ml/min/1,73m²]' }).getByRole('button')).toHaveCount(4)
  await expect(chart.getByTestId('emphasised-patient')).toHaveCount(0)
  // Round axis values instead of fractions of the range (was 96.9 / 48.45 / 0).
  const labels = await chart.locator('svg.wt-plot text').allTextContents()
  expect(labels).toEqual(expect.arrayContaining(['0', '20', '40', '60', '80']))
  expect(labels).not.toContain('48.45')
  // Events are named in the legend once they are drawn, and the AKI legend says how to see windows.
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Events' }).check()
  await page.getByRole('checkbox', { name: 'AKI windows and episodes' }).check()
  await page.keyboard.press('Escape')
  await expect(chart.getByText(/Dashed vertical lines: clinical events of the plotted patients/)).toBeVisible()
  await expect(chart.getByText(/windows and stage labels appear once a patient is chosen/)).toBeVisible()
  await chart.getByRole('button', { name: /^Open patient 7,/ }).locator('circle').nth(3).hover()
  await expect(chart.getByTestId('emphasised-patient')).toHaveText('Patient 7')
})

test('counts medians, not measurements, beside a slope under quarterly medians', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data', exact: true }).click()
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  const label = 'eGFR [ml/min/1,73m²]'
  await page.getByRole('checkbox', { name: `Analyse trend: ${label}`, exact: true }).check()
  // Raw fit across an AKI window: the note names it.
  const row = page.getByRole('button', { name: 'Open patient 6', exact: true }).locator('xpath=ancestor::tr')
  await expect(row.getByRole('button', { name: 'Fit includes 3 values in an AKI window' }).first()).toBeVisible()
  // The slope leads the cell with two decimals and its interval; the latest value follows.
  await expect(row.locator('.pv-cell-slope')).toHaveText('-6.20 ml/min/1,73m²/yr')
  await expect(row.locator('.pv-cell-ci')).toHaveText('95% CI [-25.08, 12.68]')
  await expect(row.getByText('latest 49.5', { exact: true })).toBeVisible()
  // Decided 2026-11-17. Patient 6: an interval with zero inside is named. Patient 7: interval
  // below zero, no note. Patient 12: under a year of follow-up, so the reliability note stands
  // alone, without the flag. Decided 2026-11-21 (issue #72): both intervals of 6 and 7 reach
  // above -5, so both carry the possible level "rapid ↓?"; patient 9's lies below -5.
  await expect(row.getByRole('button', { name: 'Interval includes 0' })).toHaveCount(1)
  await expect(row.getByRole('button', { name: 'rapid ↓?' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'rapid ↓', exact: true })).toHaveCount(0)
  const seven = page.getByRole('button', { name: 'Open patient 7', exact: true }).locator('xpath=ancestor::tr')
  await expect(seven.locator('.pv-cell-ci')).toHaveText('95% CI [-26.01, -0.72]')
  await expect(seven.getByRole('button', { name: 'Interval includes 0' })).toHaveCount(0)
  await expect(seven.getByRole('button', { name: 'rapid ↓?' })).toBeVisible()
  const nine = page.getByRole('button', { name: 'Open patient 9', exact: true }).locator('xpath=ancestor::tr')
  await expect(nine.getByRole('button', { name: 'rapid ↓', exact: true })).toBeVisible()
  const twelve = page.getByRole('button', { name: 'Open patient 12', exact: true }).locator('xpath=ancestor::tr')
  await expect(twelve.getByRole('button', { name: 'Follow-up < 1 year, uncertain slope' })).toBeVisible()
  await expect(twelve.getByRole('button', { name: /^rapid ↓/ })).toHaveCount(0)
  await page.getByRole('button', { name: `Analysis settings: ${label}`, exact: true }).click()
  await page.getByRole('dialog').getByLabel('Analysis preset').selectOption('ckd_progression')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await expect(page.getByText('CKD progression · quarterly medians · this parameter only')).toBeVisible()
  await expect(row.getByRole('button', { name: /Fit includes/ })).toHaveCount(0)
  await expect(row.getByText(/^n=11, \d+ quarterly medians fitted$/)).toBeVisible()
})
