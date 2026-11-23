import { describe, expect, it } from 'vitest'
import { datasetEnd, mixedModelDropout } from '../../../src/core/mixedModel/dropout'
import { DEFAULT_MIXED_MODEL_CONFIG, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import { jointModelSuggestionLines, lmerTestLines, mixedModelRScript } from '../../../src/core/mixedModel/rCode'
import { mixedModelExportSheets } from '../../../src/core/mixedModel/modelExport'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { MixedModelSpikeRow, MixedModelSuccess } from '../../../src/core/mixedModel/types'

// Decisions `dropout` and `inference` of 2026-11-22 (issue #4).
const config: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [{ key: 'genotype', kind: 'categorical', effect: 'level', reference: 'A', referenceSource: 'default' }] }

/** Patient pN: rows on 2020-01-01, 2021-01-01 and 2022-01-01, genotype A for p1–p5, B else. */
function rows(n: number): MixedModelSpikeRow[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`).flatMap((patient_id, i) => [0, 1, 2].map(t => ({
    patient_id, time_since_baseline: t, value: 60 - t, date: `202${t}-01-01`, factorValues: { factor_0_: i < 5 ? 'A' : 'B' },
  })))
}
const event = (patientId: string, type: ClinicalEvent['type'], date: string, intent: ClinicalEvent['intent'] = null): ClinicalEvent =>
  ({ patientId, type, date: new Date(`${date}T00:00:00Z`), title: type, description: null, endDate: null, intent, warning: '' })

describe('dropout by reason', () => {
  const end = new Date('2024-06-30T00:00:00Z')

  it('classifies KRT, loss and follow-up per patient and counts them per level', () => {
    const data = rows(10).filter(row => !(row.patient_id === 'p3' && row.time_since_baseline === 2))
    const events = [
      event('p1', 'kidney_transplant', '2022-06-01'),
      event('p2', 'dialysis', '2022-03-01', 'chronic'),
      // Acute dialysis and an event before the first model row are not KRT dropout.
      event('p6', 'dialysis', '2022-03-01', 'acute'),
      event('p7', 'kidney_transplant', '2019-06-01'),
    ]
    // Everyone's last row is 2022-01-01 (p3: 2021-01-01); the data end at 2024-06-30
    // is more than 365 days later, so all others are lost to follow-up.
    const dropout = mixedModelDropout(data, config, events, end)
    // The event type `death` exists since 2026-11-22 (issue #78): counted, 0 here.
    expect(dropout.deathRecorded).toBe(true)
    expect(dropout.patients.find(p => p.patientId === 'p1')).toEqual({ patientId: 'p1', levels: { genotype: 'A' }, baselineDate: '2020-01-01', lastModelDate: '2022-01-01', reason: 'krt', eventDate: '2022-06-01', yearsToEnd: 2.4147843943 })
    expect(dropout.patients.find(p => p.patientId === 'p3')).toMatchObject({ reason: 'loss', eventDate: '', yearsToEnd: 1.0020533881 })
    expect(dropout.counts).toEqual([
      { factor: '', level: 'all', patients: 10, krt: 2, death: 0, loss: 8, inFollowUp: 0, krtOrDeathShare: 0.2 },
      { factor: 'genotype', level: 'A', patients: 5, krt: 2, death: 0, loss: 3, inFollowUp: 0, krtOrDeathShare: 0.4 },
      { factor: 'genotype', level: 'B', patients: 5, krt: 0, death: 0, loss: 5, inFollowUp: 0, krtOrDeathShare: 0 },
    ])
    expect(dropout.informative).toBe(true)
    expect(dropout.dataEnd).toBe('2024-06-30')
  })

  it('treats exactly 365 days before the data end as still in follow-up and 10 % as not above the threshold', () => {
    const data = rows(10)
    const dropout = mixedModelDropout(data, config, [event('p1', 'kidney_transplant', '2022-02-01')], new Date('2023-01-01T00:00:00Z'))
    expect(dropout.counts[0]).toMatchObject({ krt: 1, loss: 0, inFollowUp: 9, krtOrDeathShare: 0.1 })
    expect(dropout.informative).toBe(false)
    expect(mixedModelDropout(data, config, [], new Date('2023-01-02T00:00:00Z')).counts[0]).toMatchObject({ loss: 10, inFollowUp: 0 })
  })

  it('takes the latest lab date of the dataset as the data end', () => {
    expect(datasetEnd([{ labDatum: new Date('2020-01-01') }, { labDatum: null }, { labDatum: new Date('2023-05-01T08:00:00Z') }])?.toISOString()).toBe('2023-05-01T08:00:00.000Z')
    expect(datasetEnd([])).toBeNull()
  })
})

describe('R script: lmerTest and the joint-model suggestion', () => {
  it('refits with lmerTest for an omnibus F test per factor, contrasts exploratory and unadjusted, Holm commented', () => {
    const lines = lmerTestLines(config)
    expect(lines).toContain('  print(anova(mm_fit_satterthwaite, type = "III", ddf = "Satterthwaite"))')
    expect(lines.join('\n')).toContain('lmerTest::lmer(value ~ time_since_baseline + factor_0_ + (1 + time_since_baseline | patient_id), data = mm_data, REML = TRUE, na.action = na.fail)')
    expect(lines).toContain('  # Contrasts against the reference level: exploratory, unadjusted for multiple comparisons.')
    expect(lines).toContain('  # print(p.adjust(mm_contrasts[-1, "Pr(>|t|)"], method = "holm"))')
    expect(lines[1]).toBe('if (requireNamespace("lmerTest", quietly = TRUE)) {')
    // A valid R string: single quotes around the double-quoted package name.
    expect(lines.at(-1)).toBe(`} else message('lmerTest is not installed; install.packages("lmerTest") adds the Satterthwaite F tests.')`)
  })

  it('suggests JMbayes2, commented, only above 10 % KRT or death', () => {
    const informative = mixedModelDropout(rows(10), config, [event('p1', 'kidney_transplant', '2022-06-01'), event('p2', 'kidney_transplant', '2022-06-01')], new Date('2022-06-01T00:00:00Z'))
    const lines = jointModelSuggestionLines(config, informative, 'cohort')
    expect(lines.every(line => line.startsWith('#'))).toBe(true)
    expect(lines[0]).toBe('# Dropout: 2 of 10 patients (20.0 %) reached kidney replacement therapy or died within')
    expect(lines).toContain('#   mm_lme <- nlme::lme(value ~ time_since_baseline + factor_0_, random = ~ time_since_baseline | patient_id, data = mm_data, method = "REML")')
    expect(lines).toContain('#   mm_joint <- JMbayes2::jm(mm_cox, mm_lme, time_var = "time_since_baseline", id_var = "patient_id")')
    const notInformative = mixedModelDropout(rows(10), config, [event('p1', 'kidney_transplant', '2022-06-01')], new Date('2022-06-01T00:00:00Z'))
    expect(jointModelSuggestionLines(config, notInformative, 'cohort')).toEqual([])
  })

  const result = {
    status: 'success', converged: true, singular: false, warnings: [], nPatients: 10, nMeasurements: 30,
    fixedEffects: { intercept: 60, timeSinceBaseline: -1 }, fixedEffectConfidenceIntervals: { timeSinceBaseline: null },
    randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null }, residualSd: null,
    metadata: { engine: 'webr-lme4', formula: 'value ~ time_since_baseline + factor_0_ + (1 + time_since_baseline | patient_id)', runtimeVersion: 'R 4.6.0', packageVersions: {}, browserUserAgent: '', wasmAssetSource: 'self-hosted', modelConfig: config, optimizer: null, reml: true, datasetId: 'cohort', datasetHash: '', randomSeed: null, fitConfigHash: '',
      preparation: { nPatientsBefore: 10, nMeasurementsBefore: 30, excludedPatients: [], centers: {}, levelPooling: [
        { factor: 'genotype', column: 'factor_0_', level: 'A', modelLevel: 'A', patients: 5, patientsWithRepeated: 5, action: 'kept' },
        { factor: 'genotype', column: 'factor_0_', level: 'C', modelLevel: 'other (pooled)', patients: 2, patientsWithRepeated: 2, action: 'pooled' },
      ] } },
  } as unknown as MixedModelSuccess

  it('puts both into the unit block of the script and names pooled levels', () => {
    const dropout = mixedModelDropout(rows(10), config, [event('p1', 'kidney_transplant', '2022-06-01'), event('p2', 'kidney_transplant', '2022-06-01')], new Date('2022-06-01T00:00:00Z'))
    const script = mixedModelRScript([{ entity: 'Whole cohort', result, dropout }]).join('\n')
    expect(script).toContain('  # factor_0_ = genotype: categorical (automatic type), reference A (default: first level among these model rows); levels C pooled into "other (pooled)"')
    expect(script).toContain('  if (requireNamespace("lmerTest", quietly = TRUE)) {')
    expect(script).toContain('  #   mm_dp <- mm_dp[mm_dp$unit_key == "cohort", , drop = FALSE]')
    expect(script.indexOf('JMbayes2::jm')).toBeLessThan(script.indexOf('\n  mm_fit\n'))
    expect(script).not.toContain('replace lme4::lmer with lmerTest::lmer')
  })

  it('exports factor_levels, dropout and dropout_patients last, and the versions at the end of models', () => {
    const dropout = mixedModelDropout(rows(10), config, [event('p1', 'kidney_transplant', '2022-06-01')], new Date('2022-06-01T00:00:00Z'))
    const sheets = mixedModelExportSheets([{ entity: 'Whole cohort', result, identity: { seriesKey: 'eGFR|ml' }, dropout }], 'x.xlsx', 'id', { appVersion: '1.2.3', egfrFormula: 'ckd-epi-2021' })
    expect(sheets.map(sheet => sheet.name).slice(-3)).toEqual(['factor_levels', 'dropout', 'dropout_patients'])
    const sheet = (name: string) => sheets.find(item => item.name === name)!.rows as Record<string, unknown>[]
    expect(sheet('factor_levels')[1]).toEqual({ entity: 'Whole cohort', unit_key: 'cohort', factor: 'genotype', column: 'factor_0_', level: 'C', model_level: 'other (pooled)', patients: 2, patients_with_2_or_more_measurements: 2, action: 'pooled' })
    expect(sheet('dropout')[0]).toEqual({ entity: 'Whole cohort', unit_key: 'cohort', factor: '', level: 'all', patients: 10, krt: 1, death: 0, loss: 0, in_follow_up: 9, krt_or_death_share: 0.1, data_end: '2022-06-01' })
    expect(sheet('dropout_patients')[0]).toEqual({ entity: 'Whole cohort', unit_key: 'cohort', patient_id: 'p1', baseline_date: '2020-01-01', last_model_date: '2022-01-01', reason: 'krt', event_date: '2022-06-01', years_to_end: 2.4147843943, level_genotype: 'A' })
    const models = sheet('models')[0]
    expect(Object.keys(models).slice(-2)).toEqual(['app_version', 'egfr_formula'])
    expect(models).toMatchObject({ app_version: '1.2.3', egfr_formula: 'ckd-epi-2021' })
  })
})
