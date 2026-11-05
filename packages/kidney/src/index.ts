/**
 * Public entry point of the kidney-trajectories package.
 *
 * Every export is re-exported unchanged from the web app's `src/core/` (and the
 * DOM-free workbook reader in `src/io/`), so the package and the app compute
 * identical numbers. Rules, boundaries and worked examples are specified in
 * `docs/method-algorithms.md`. Research use only; not for clinical decisions.
 *
 * Adding or removing a name here changes the public API: update the API test in
 * `packages/kidney/test/` and the package README in the same change.
 *
 * @packageDocumentation
 */

// Shared data types
export type { LabRow, RawRow, PatientId, Sex, WertOperator, OlsFit, FitReason } from '../../../src/core/types'
export { patientIdKey, comparePatientIds } from '../../../src/core/types'

// Workbook and CSV import (SheetJS; runs in Node and bundlers)
export { loadDatasetFromWorkbook, type LoadedDataset, type ImportDiagnostic } from '../../../src/io/loadDataset'
export { readWorkbook, readWorkbookSheets, type WorkbookSheets } from '../../../src/io/readWorkbook'
export { loadLabRows, loadLabRowsWithDiagnostics, REQUIRED_COLUMNS, type LoadedLabRows, type LabImportIssue } from '../../../src/core/parse/loader'
export {
  normalizeClinicalEvents,
  validateClinicalEvents,
  type ClinicalEvent,
  type ClinicalEventType,
  type DialysisIntent,
  type RawClinicalEvent,
  type RejectedClinicalEvent,
  type ClinicalEventValidationResult,
} from '../../../src/core/events/events'

// eGFR equations, units and series classification
export { ckdEpi2021, mdrd4, ekfc2021, normaliseSex, isUnrecognisedSex, type EgfrInput } from '../../../src/core/domains/nephrology/egfr/formulas'
export {
  appendComputedEgfr,
  creatinineSourceOptions,
  defaultCreatinineSource,
  isSerumCreatinineSource,
  type EgfrOptions,
  type Source,
} from '../../../src/core/domains/nephrology/egfr/series'
export {
  EGFR_FORMULA_LABELS,
  COMPUTED_EGFR_UNIT,
  SERUM_CREATININE_UNITS,
  computedEgfrName,
  normaliseUnit,
  isCreatinineName,
  isUrineName,
  isSerumCreatinineSeries,
  isKdigoCreatinineSeries,
  isEgfrUnit,
  mentionsEgfr,
  type FormulaName,
} from '../../../src/core/domains/nephrology/analytes'
export {
  MGDL_PER_UMOLL,
  CKD_G4_EGFR_THRESHOLD,
  CKD_G5_EGFR_THRESHOLD,
  KDIGO_ABSOLUTE_RISE_MGDL,
  KDIGO_RELATIVE_RISE_RATIO,
  DEFAULT_AKI_EXCLUSION_DAYS,
  DEFAULT_CONFIRMATION_DAYS,
  DEFAULT_RAPID_EGFR_DECLINE,
} from '../../../src/core/domains/nephrology/constants'

// KDIGO creatinine AKI detection and exclusion windows
export { findKdigoAkiEpisodes, kdigoStage, type AkiEpisode } from '../../../src/core/domains/nephrology/aki/kdigo'
export { akiExclusionWindows, episodesForSeries, fitAkiAware, type AkiAwareFit } from '../../../src/core/domains/nephrology/aki/akiAware'
export {
  applyExclusionWindows,
  exclusionReasonsAt,
  fixedLengthWindow,
  windowContains,
  type ExclusionWindow,
  type ReasonedExclusionWindow,
  type ExclusionResult,
} from '../../../src/core/exclusions/windows'

// Per-patient slope fits and the reliability rule
export { fitGlobal, fitTheilSen, type SeriesPoint } from '../../../src/core/stats/series'
export { fitOls } from '../../../src/core/stats/ols'
export { datesToYears } from '../../../src/core/stats/time'
export { balanceSeriesPoints } from '../../../src/core/stats/timeBalancing'
export { summarizeByBezeichnung, type SeriesSummary, type SlopeMode, type SummarizeParams } from '../../../src/core/stats/summarize'
export { isUnstableSlope, type SlopeQualityInput, type SlopeReason } from '../../../src/core/stats/slopeQuality'
export type { FitModel, TimeBalancing, FitXAxis } from '../../../src/core/fitPipeline/types'

// Observed CKD endpoints and the linear G5 projection
export {
  computeCkdEndpoints,
  type CkdEndpoints,
  type CkdEndpointSettings,
  type ComputeCkdEndpointsInput,
  type CkdProjectionReason,
  type EndpointAgeBasis,
  type EndpointPoint,
} from '../../../src/core/domains/nephrology/endpoints/ckdEndpoints'
export { projectLinearThreshold, projectedCrossingTime, type ProjectionTarget, type LinearProjectionInput, type LinearProjectionResult, type ProjectionStatus } from '../../../src/core/projection/linearProjection'

// Fit presets
export { generalExplorationConfig, theilSenConfig, STANDARD_PRESETS, type FitConfig, type FitPreset, type FitPresetDefinition } from '../../../src/core/analysis/fitConfig'
export { ckdProgressionConfig, acuteReviewConfig, NEPHROLOGY_PRESETS } from '../../../src/core/domains/nephrology/fitConfig'

/**
 * Cohort pipeline as the web app runs it: dataset modules (demographics, eGFR,
 * events), one series spec per parameter, one row per patient, export records.
 *
 * @experimental Everything from here to the end of this file mirrors the web
 * app's internal pipeline (settings objects, cohort cells with chart overlays,
 * export records with the app's column names). It will change with the domain
 * decoupling in issue #23, without a deprecation period.
 */
export {
  computeAnalysisResult,
  defaultAnalysisSettings,
  defaultColumnModuleSettings,
  parseAnalysisSettings,
  fitPresetCatalog,
  fitPresetById,
  type AnalysisSettings,
  type ComputeAnalysisResultOptions,
} from '../../../src/core/analysis/registry'
export type { AnalysisResult, AnalysisMessage, ManualDemographics, CohortFlag } from '../../../src/core/analysis/types'
export { cohortSeriesSpec, clinicalEventsByPatient } from '../../../src/core/cohort/specs'
// Inputs of cohortSeriesSpec and cohortExportRecords as the app derives them.
export { patientBirthAnchor, exactBirthDateByPatient, type PatientBirthAnchor } from '../../../src/core/demographics/exactBirthDate'
export { demographicWarningsByPatient } from '../../../src/core/demographics/describe'
export {
  buildCohortRows,
  cohortCellFlags,
  cohortExportRecords,
  cohortSheetRecord,
  EXPORT_DISCLAIMER_ROWS,
  type CohortSeriesSpec,
  type CohortCell,
  type CohortRow,
  type CohortExportRecord,
} from '../../../src/core/cohort/screening'
