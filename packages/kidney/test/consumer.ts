// Type-checked against the built declarations (`pnpm test:kidney`), resolved
// through the package name the way a Node consumer resolves it. Mirrors the
// README's cohort example so that example keeps compiling.
import {
  buildCohortRows,
  ckdEpi2021,
  ckdProgressionConfig,
  clinicalEventsByPatient,
  cohortExportRecords,
  cohortSeriesSpec,
  computeAnalysisResult,
  computedEgfrName,
  COMPUTED_EGFR_UNIT,
  creatinineSourceOptions,
  defaultAnalysisSettings,
  defaultCreatinineSource,
  fitPresetById,
  loadDatasetFromWorkbook,
  type CohortExportRecord,
} from '@halbritter-lab/kidney-trajectories'

// @ts-expect-error a wrong argument type must be rejected, proving the types resolved rather than falling back to any
ckdEpi2021('1.2')

const { rows, events, patientAttributes } = loadDatasetFromWorkbook(new Uint8Array())
const source = defaultCreatinineSource(creatinineSourceOptions(rows))
const settings = { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021' as const, source } }
const analysis = computeAnalysisResult({ rows, events, patientAttributes, manualDemographics: {}, settings })
const parameter = { bezeichnung: computedEgfrName('ckd-epi-2021'), einheit: COMPUTED_EGFR_UNIT }
const spec = cohortSeriesSpec(parameter, ckdProgressionConfig(parameter), {
  clinicalEventsByPatient: clinicalEventsByPatient(events),
  fitInputs: analysis.fitInputs,
})
const patientIds = [...new Set(analysis.rows.map((r) => r.patientId))]
const records: CohortExportRecord[] = cohortExportRecords(buildCohortRows(analysis.rows, patientIds, [spec]))
const preset = fitPresetById('ckd_progression')?.buildConfig(parameter)

export { records, preset }
