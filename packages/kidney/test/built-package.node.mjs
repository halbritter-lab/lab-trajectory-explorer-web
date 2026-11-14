// Runs in plain Node against the built package (`pnpm build:kidney` first),
// imported by its package name so the `exports` map is exercised too.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as kidney from '@halbritter-lab/kidney-trajectories'

const dist = new URL('../dist/', import.meta.url)
const day = (iso) => new Date(`${iso}T00:00:00Z`)

test('public API names are pinned', () => {
  // Changing this list changes the package's public API: update the README too.
  assert.deepEqual(Object.keys(kidney).sort(), [
    'CKD_G4_EGFR_THRESHOLD', 'CKD_G5_EGFR_THRESHOLD', 'COMPUTED_EGFR_UNIT', 'DEFAULT_AKI_EXCLUSION_DAYS',
    'DEFAULT_CONFIRMATION_DAYS', 'DEFAULT_RAPID_EGFR_DECLINE', 'EGFR_FORMULA_LABELS', 'KDIGO_ABSOLUTE_RISE_MGDL', 'KDIGO_RELATIVE_RISE_RATIO', 'MGDL_PER_UMOLL', 'NEPHROLOGY_PRESETS',
    'REQUIRED_COLUMNS', 'SERUM_CREATININE_UNITS', 'STANDARD_PRESETS', 'acuteReviewConfig',
    'akiExclusionWindows', 'appendComputedEgfr', 'applyExclusionWindows', 'balanceSeriesPoints',
    'ckdEpi2009', 'ckdEpi2021', 'ckdProgressionConfig', 'comparePatientIds',
    'computeCkdEndpoints', 'computedEgfrName', 'creatinineSourceOptions',
    'datesToYears', 'defaultCreatinineSource', 'distinctDateCount', 'ekfc2021',
    'episodesForSeries', 'exclusionReasonsAt', 'findKdigoAkiEpisodes', 'fitAkiAware',
    'fitGlobal', 'fitOls', 'fitTheilSen', 'fixedLengthWindow', 'generalExplorationConfig', 'isCreatinineName',
    'isEgfrUnit', 'isKdigoCreatinineSeries', 'isNonSerumName', 'isSerumCreatinineSeries', 'isSerumCreatinineSource',
    'isUnrecognisedSex', 'isUnstableSlope', 'kdigoStage',
    'loadDatasetFromWorkbook', 'loadLabRows', 'loadLabRowsWithDiagnostics', 'mdrd4',
    'mentionsEgfr', 'normaliseSex', 'normaliseUnit', 'normalizeClinicalEvents',
    'patientIdKey', 'projectLinearThreshold', 'projectedCrossingTime',
    'readWorkbook', 'readWorkbookSheets', 'summarizeByBezeichnung', 'theilSenConfig',
    'validateClinicalEvents', 'windowContains',
  ])
})

test('the bundle reaches no browser, React, webR or mixed-model code', () => {
  const code = readFileSync(new URL('index.js', dist), 'utf8')
  const bare = [...code.matchAll(/^(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  assert.deepEqual([...new Set(bare)], ['xlsx'])
  // tsconfig keeps vite/client types for the app's demo loaders; none may reach the bundle.
  assert.doesNotMatch(code, /import\.meta/)
  const { sources } = JSON.parse(readFileSync(new URL('index.js.map', dist), 'utf8'))
  const outside = sources.filter((s) => !/^\.\.\/\.\.\/\.\.\/src\/(core|io)\//.test(s) && s !== '../src/index.ts')
  assert.deepEqual(outside, [])
  assert.deepEqual(sources.filter((s) => /mixedModel|webr|workspace|\/io\/export/i.test(s)), [])
})

test('CKD-EPI 2021 reproduces the reference values', () => {
  assert.equal(kidney.ckdEpi2021({ scrMgdl: 1.2, ageYears: 60, sex: 'm' }).toFixed(6), '69.231128')
  assert.equal(kidney.ckdEpi2021({ scrMgdl: 1.2, ageYears: 60, sex: 'w' }).toFixed(6), '51.821330')
})

test('CKD-EPI 2009 (race-free) reproduces the reference value', () => {
  assert.equal(kidney.ckdEpi2009({ scrMgdl: 1.0, ageYears: 50, sex: 'm' }).toFixed(1), '87.4')
})

test('urine creatinine is not a serum name', () => {
  assert.equal(kidney.isNonSerumName('Kreatinin i.U.'), true)
})

test('isUnstableSlope flags two fitted dates over a long span', () => {
  const points = [{ date: new Date(Date.UTC(2020, 0, 1)), value: 60 }, { date: new Date(Date.UTC(2021, 1, 4)), value: 50 }]
  const input = { reason: null, nFittedDates: kidney.distinctDateCount(points), fittedSpanDays: 400, fitModel: 'ols' }
  assert.equal(kidney.isUnstableSlope(input), true)
})

test('KDIGO detects a 0.3 mg/dl rise within 48 h as a stage 1 episode', () => {
  const episodes = kidney.findKdigoAkiEpisodes([
    { date: day('2024-01-01'), value: 1.0 },
    { date: day('2024-01-02'), value: 1.6 },
    { date: day('2024-01-20'), value: 1.0 },
  ])
  assert.equal(episodes.length, 1)
  assert.equal(episodes[0].criterion, 'absolute_0_3_mg_dl_48h')
  assert.equal(episodes[0].stage, 1)
  assert.equal(kidney.kdigoStage(1.0, 3.1), 3)
})

test('fitGlobal fits a per-year slope', () => {
  const fit = kidney.fitGlobal([
    { date: day('2020-01-01'), value: 60 },
    { date: day('2021-01-01'), value: 55 },
    { date: day('2022-01-01'), value: 50 },
  ])
  assert.equal(fit.reason, null)
  assert.ok(Math.abs(fit.slope + 5) < 0.01, `slope ${fit.slope}`)
})

test('a workbook read from disk yields computed eGFR and a slope', () => {
  const dataset = kidney.loadDatasetFromWorkbook(readFileSync(new URL('../../../tests/fixtures/test_labs.xlsx', import.meta.url)))
  assert.ok(dataset.rows.length > 0)
  const source = kidney.defaultCreatinineSource(kidney.creatinineSourceOptions(dataset.rows))
  assert.ok(source)
  const rows = kidney.appendComputedEgfr(dataset.rows, { formula: 'ckd-epi-2021', source })
  const name = kidney.computedEgfrName('ckd-epi-2021')
  const egfr = rows.filter((r) => r.bezeichnung === name)
  assert.ok(egfr.length > 0, 'computed eGFR rows')
  const summaries = [...new Set(egfr.map((r) => r.patientId))]
    .flatMap((id) => kidney.summarizeByBezeichnung(rows, id).filter((s) => s.bezeichnung === name))
  assert.ok(summaries.some((s) => Number.isFinite(s.slope)), 'at least one fitted slope')
})
