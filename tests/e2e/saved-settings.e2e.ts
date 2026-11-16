// "Remember on this device" keeps the analysis settings of the Trajectories
// page with the dataset, and the browser asks before session-only data are lost.
import { expect, test, type Page } from '@playwright/test'

const PARAMETER = /^eGFR \[ml\/min\/1\.73m2\]$/

/** One patient, eGFR falling from 60 to 30 over four years. */
async function uploadDecline(page: Page): Promise<void> {
  const lines = ['patientId,labDate,testName,unit,value,ageAtLab']
  for (const [i, value] of [60, 52, 45, 37, 30].entries()) lines.push(`1,${2020 + i}-01-01,eGFR,ml/min/1.73m2,${value},${60 + i}`)
  await page.goto('/')
  await page.getByLabel('Import lab values').setInputFiles({ name: 'decline.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
  await expect(page.locator('.workspace-dataset')).toContainText('1 patient')
}

async function analyseWithCkdPreset(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: /^Parameters/ }).click()
  await page.getByRole('button', { name: 'No parameters', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: PARAMETER }).check()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  await page.getByLabel('Cell details', { exact: true }).selectOption('full')
  await page.getByLabel('Warning display').selectOption('text')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  await page.getByRole('dialog').getByLabel('Analysis preset').selectOption('ckd_progression')
  await page.getByRole('button', { name: 'Close analysis settings' }).click()
  await page.getByRole('checkbox', { name: /^Analyse trend:/ }).check()
}

async function remember(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Remember on this device' }).check()
  await expect(page.locator('.workspace-dataset')).toContainText('Saved on this device')
}

const patientRow = (page: Page) => page.getByRole('region', { name: 'Trajectory workspace' }).locator('tbody tr').first()

test('a reload shows the same slopes, badges and settings when the dataset is remembered', async ({ page }) => {
  await uploadDecline(page)
  await analyseWithCkdPreset(page)
  await expect(patientRow(page).locator('.wt-badge-endpoint')).toContainText('-50%')
  const before = await patientRow(page).innerText()
  expect(before).toContain('OLS: -7.5 ml/min/1.73m2/year')

  await remember(page)
  await page.reload()

  await expect(page.getByText(/^Dataset and analysis settings \(presets, trend and display choices\) restored from this device\. Cohort model settings and results are not saved/)).toBeVisible()
  await expect(page.getByText(/Not restored/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /^Analyse trend:/ })).toBeChecked()
  await expect(patientRow(page).locator('.wt-badge-endpoint')).toContainText('-50%')
  expect(await patientRow(page).innerText()).toBe(before)
  await page.getByRole('button', { name: /^Analysis settings:/ }).click()
  await expect(page.getByRole('dialog').getByLabel('Analysis preset')).toHaveValue('ckd_progression')
})

test('a stored setting that no longer fits falls back to its default and is named', async ({ page }) => {
  await uploadDecline(page)
  await analyseWithCkdPreset(page)
  await remember(page)
  // What a later version or another dataset would leave behind: settings of a
  // parameter that is not there, and an option that no longer exists.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('lab-trajectory-explorer')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('keyval', 'readwrite')
      const store = tx.objectStore('keyval')
      const read = store.get('lab-explorer:workspace-settings:v1')
      read.onsuccess = () => {
        const settings = read.result
        settings.trajectoryFitSettings.columns['["Gone",null]'] = settings.trajectoryFitSettings.shared
        settings.trajectoryView.axis = 'weeks'
        store.put(settings, 'lab-explorer:workspace-settings:v1')
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
  }))
  await page.reload()

  await expect(page.locator('.workspace-dataset')).toContainText('decline.csv')
  await expect(page.getByText('Not restored, the defaults are used instead: own settings of Gone [no unit] (parameter not in this dataset); time axis.', { exact: false })).toBeVisible()
  // Everything else came back.
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /^Analyse trend:/ })).toBeChecked()
  await expect(patientRow(page).locator('.wt-badge-endpoint')).toContainText('-50%')
})

test('the browser asks before a reload discards a dataset that is not remembered', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.accept() })

  // Nothing loaded: no question.
  await page.goto('/')
  await page.getByRole('button', { name: 'Methods', exact: true }).click()
  await page.reload()
  expect(dialogs).toEqual([])

  await uploadDecline(page)
  // In-app navigation does not unload the page.
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await page.getByRole('button', { name: 'Methods', exact: true }).click()
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  expect(dialogs).toEqual([])
  await page.reload()
  expect(dialogs).toEqual(['beforeunload'])
  await expect(page.locator('.workspace-dataset')).toContainText('No data loaded yet')

  // Remembered: no question, and the data are back.
  await uploadDecline(page)
  await remember(page)
  await page.reload()
  expect(dialogs).toEqual(['beforeunload'])
  await expect(page.locator('.workspace-dataset')).toContainText('decline.csv')
})

test('changing analysis settings does not extend the seven days of the saved copy', async ({ page }) => {
  const savedAt = () => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('lab-trajectory-explorer')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const read = open.result.transaction('keyval').objectStore('keyval').get('lab-explorer:workspace:v1')
      read.onsuccess = () => resolve(read.result.savedAt)
      read.onerror = () => reject(read.error)
    }
  }))
  await uploadDecline(page)
  await remember(page)
  const before = await savedAt()
  await analyseWithCkdPreset(page)
  await page.reload()
  // Restoring with the workspace open does not restart the clock either.
  await page.getByRole('button', { name: 'Trajectories', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /^Analyse trend:/ })).toBeChecked()
  expect(await savedAt()).toBe(before)
})

test('the browser does not ask for the unchanged demo data, but asks once they were edited', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.accept() })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('(Demo)')
  await page.reload()
  expect(dialogs).toEqual([])

  await page.getByRole('button', { name: 'Load demo data' }).click()
  await expect(page.locator('.workspace-dataset')).toContainText('(Demo)')
  // Deriving eGFR changes the dataset's derivation settings: now there is something to lose.
  await page.getByLabel('eGFR formula').selectOption('ckd-epi-2021')
  await page.getByRole('button', { name: /^Apply/ }).click()
  await page.reload()
  expect(dialogs).toEqual(['beforeunload'])
})
