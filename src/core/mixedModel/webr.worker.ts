import { WebR } from 'webr'
import { mixedModelFormula, mixedModelFormulaKey } from './config'
import { isRecord } from './guards'
import {
  MIXED_MODEL_TOLERANCE,
  type MixedModelEngine,
  type MixedModelFailure,
  type MixedModelFailureStage,
  type MixedModelMetadata,
  type MixedModelResult,
  type MixedModelSpikeRow,
} from './types'
import { hashMixedModelInput, validateMixedModelRows } from './validation'
import {
  normalizeExtractedFitResult,
  ResultExtractionError,
  type FitExtractionResult,
} from './webrResultNormalization'
import type { MixedModelWorkerRequest, MixedModelWorkerResponse } from './workerProtocol'

type WebREngine = Extract<MixedModelEngine, 'webr-lme4' | 'webr-nlme'>

const ENGINE_PACKAGES: Record<WebREngine, 'lme4' | 'nlme'> = {
  'webr-lme4': 'lme4',
  'webr-nlme': 'nlme',
}

let webRRuntimePromise: Promise<WebR> | null = null
const loadedPackagePromises = new Map<WebREngine, Promise<void>>()
let inFlightRequestId: string | null = null

self.onmessage = (event: MessageEvent<MixedModelWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'run-mixed-model') return

  if (inFlightRequestId !== null) {
    postResult(
      request,
      failure(
        request,
        'runtime-error',
        'fit',
        'WORKER_BUSY',
        `Mixed-model worker is already processing request ${inFlightRequestId}.`,
        [],
        createBaseMetadata(request),
      ),
    )
    return
  }

  inFlightRequestId = request.requestId
  void handleRequest(request)
    .then((result) => {
      postResult(request, result)
    })
    .finally(() => {
      inFlightRequestId = null
    })
}

async function handleRequest(request: MixedModelWorkerRequest): Promise<MixedModelResult> {
  try {
    return await runRequest(request)
  } catch (error) {
    return failure(
      request,
      'runtime-error',
      'fit',
      'UNHANDLED_WORKER_ERROR',
      errorMessage(error),
      [],
      createBaseMetadata(request),
    )
  }
}

async function runRequest(request: MixedModelWorkerRequest): Promise<MixedModelResult> {
  const baseMetadata = createBaseMetadata(request)

  if (!isWebREngine(request.engine)) {
    return failure(request, 'unsupported', 'runtime-load', 'UNSUPPORTED_ENGINE', `${request.engine} is not supported by the webR worker.`, [], baseMetadata)
  }

  const modelCall = modelCallForRequest(request)
  if (modelCall === null) {
    return unsupportedConfigFailure(request, baseMetadata)
  }

  const validation = validateMixedModelRows(request.rows, request.config)
  if (!validation.ok) {
    return failure(request, 'fit-error', validation.stage, validation.code, validation.message, validation.warnings, baseMetadata)
  }

  let webR: WebR
  try {
    webR = await getWebRRuntime()
  } catch (error) {
    return failure(request, 'runtime-error', 'runtime-load', 'WEBR_INIT_FAILED', errorMessage(error), [], baseMetadata)
  }

  try {
    await ensurePackages(webR, request.engine)
  } catch (error) {
    return failure(
      request,
      'unsupported',
      'package-load',
      'PACKAGE_UNAVAILABLE',
      `${ENGINE_PACKAGES[request.engine]} or jsonlite is unavailable in this webR package repository.`,
      [errorMessage(error)],
      runtimeMetadata(webR, baseMetadata),
    )
  }

  try {
    await bindRows(webR, request.rows)
    const extracted = await extractFit(webR, request.engine, modelCall)
    return normalizeExtractedFitResult(request, runtimeMetadata(webR, baseMetadata), extracted)
  } catch (error) {
    if (error instanceof ResultExtractionError) {
      return failure(request, 'runtime-error', 'result-extraction', 'RESULT_EXTRACTION_FAILED', error.message, [], runtimeMetadata(webR, baseMetadata))
    }
    if (error instanceof ModelFitError) {
      return failure(request, 'fit-error', 'fit', 'MODEL_FIT_FAILED', error.message, [], runtimeMetadata(webR, baseMetadata))
    }
    return failure(request, 'runtime-error', 'fit', 'UNHANDLED_WORKER_ERROR', errorMessage(error), [], runtimeMetadata(webR, baseMetadata))
  }
}

function getWebRRuntime(): Promise<WebR> {
  if (!webRRuntimePromise) {
    webRRuntimePromise = (async () => {
      const webR = new WebR()
      await webR.init()
      return webR
    })().catch((error) => {
      webRRuntimePromise = null
      throw error
    })
  }
  return webRRuntimePromise
}

function ensurePackages(webR: WebR, engine: WebREngine): Promise<void> {
  const existing = loadedPackagePromises.get(engine)
  if (existing) return existing

  const packageName = ENGINE_PACKAGES[engine]
  const promise = (async () => {
    await webR.installPackages([packageName, 'jsonlite'], { quiet: true })
    await webR.evalRVoid(`library(${packageName}); library(jsonlite)`)
  })().catch((error) => {
    loadedPackagePromises.delete(engine)
    throw error
  })
  loadedPackagePromises.set(engine, promise)
  return promise
}

async function bindRows(webR: WebR, rows: readonly MixedModelSpikeRow[]): Promise<void> {
  const patientIds = rows.map((row) => row.patient_id)
  const egfr = rows.map((row) => row.eGFR)
  const time = rows.map((row) => row.time_since_baseline)
  const baselineAgeCentered = rows.map((row) => row.baseline_age_centered ?? null)

  await webR.evalRVoid(`
    mm_patient_id <- jsonlite::fromJSON(${rStringLiteral(JSON.stringify(patientIds))})
    mm_egfr <- jsonlite::fromJSON(${rStringLiteral(JSON.stringify(egfr))})
    mm_time <- jsonlite::fromJSON(${rStringLiteral(JSON.stringify(time))})
    mm_baseline_age_centered <- jsonlite::fromJSON(${rStringLiteral(JSON.stringify(baselineAgeCentered))})
  `)
}

async function extractFit(webR: WebR, engine: WebREngine, modelCall: string): Promise<FitExtractionResult> {
  let json: string
  try {
    json = await webR.evalRString(engine === 'webr-lme4' ? lme4FitCode(modelCall) : nlmeFitCode(modelCall))
  } catch (error) {
    throw new ModelFitError(errorMessage(error))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new ResultExtractionError(`webR returned invalid result JSON: ${errorMessage(error)}`)
  }
  if (!isRecord(parsed)) {
    throw new ResultExtractionError('webR returned a non-object fit result.')
  }
  return parsed as unknown as FitExtractionResult
}

function createBaseMetadata(request: MixedModelWorkerRequest): MixedModelMetadata {
  return {
    engine: request.engine,
    formula: request.formula,
    modelConfig: request.config,
    runtimeVersion: null,
    packageVersions: {},
    browserUserAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    wasmAssetSource: request.wasmAssetSource,
    optimizer: null,
    reml: true,
    tolerance: MIXED_MODEL_TOLERANCE,
    datasetId: request.datasetId,
    datasetHash: hashMixedModelInput(request.rows),
    randomSeed: null,
    fitConfigHash: request.fitConfigHash,
  }
}

function runtimeMetadata(webR: WebR, metadata: MixedModelMetadata): MixedModelMetadata {
  return {
    ...metadata,
    runtimeVersion: webR.versionR || webR.version || null,
  }
}

function failure(
  request: MixedModelWorkerRequest,
  status: MixedModelFailure['status'],
  stage: MixedModelFailureStage,
  code: string,
  message: string,
  warnings: string[],
  metadata: Partial<MixedModelMetadata>,
): MixedModelFailure {
  return {
    status,
    engine: request.engine,
    stage,
    code,
    message,
    warnings,
    metadata,
  }
}

function isWebREngine(engine: MixedModelEngine): engine is WebREngine {
  return engine === 'webr-lme4' || engine === 'webr-nlme'
}

function modelCallForRequest(request: MixedModelWorkerRequest): string | null {
  if (
    mixedModelFormulaKey(request.config) !== request.formulaKey ||
    mixedModelFormula(request.config) !== request.formula
  ) {
    return null
  }
  if (request.engine === 'webr-lme4') return lme4ModelCall(request.formulaKey)
  if (request.engine === 'webr-nlme') return nlmeModelCall(request.formulaKey)
  return null
}

function unsupportedConfigFailure(
  request: MixedModelWorkerRequest,
  baseMetadata: MixedModelMetadata,
): MixedModelFailure {
  return failure(
    request,
    'unsupported',
    'data-validation',
    'UNSUPPORTED_MIXED_MODEL_CONFIG',
    'Mixed model config and generated formula do not match a supported formula.',
    [],
    baseMetadata,
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rStringLiteral(value: string): string {
  return JSON.stringify(value)
}

function postResult(request: MixedModelWorkerRequest, result: MixedModelResult): void {
  const response: MixedModelWorkerResponse = { type: 'mixed-model-result', requestId: request.requestId, result }
  self.postMessage(response)
}

class ModelFitError extends Error {}

/** Shared R scaffold: build the data.frame, capture warnings, define numeric
 * helpers, then run the engine-specific extraction block (which must assign
 * `mm_out`) and serialize it. Keeping the prologue/epilogue in one place stops
 * the lme4 and nlme paths from drifting apart. */
function buildFitCode(modelCall: string, extraction: string): string {
  return `
    mm_data <- data.frame(
      patient_id = factor(mm_patient_id),
      eGFR = as.numeric(mm_egfr),
      time_since_baseline = as.numeric(mm_time),
      baseline_age_centered = as.numeric(mm_baseline_age_centered)
    )
    mm_warnings <- character()
    mm_fit <- withCallingHandlers(
      ${modelCall},
      warning = function(w) {
        mm_warnings <<- c(mm_warnings, conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    )
    mm_nullable_number <- function(x) {
      if (length(x) == 0 || is.na(x[[1]]) || is.nan(x[[1]]) || is.infinite(x[[1]])) NA_real_ else as.numeric(x[[1]])
    }
    mm_named_number <- function(vec, name) {
      if (!is.null(names(vec)) && name %in% names(vec)) mm_nullable_number(vec[[name]]) else NA_real_
    }
    mm_require_finite_fixed <- function(intercept, slope) {
      if (!all(is.finite(c(intercept, slope)))) {
        stop("Mixed model produced non-finite fixed effects (degenerate fit).")
      }
    }
    mm_ci_pair <- function(value) {
      if (is.null(value) || length(value) < 2 || any(!is.finite(as.numeric(value[1:2])))) {
        NULL
      } else {
        as.numeric(value[1:2])
      }
    }
    ${extraction}
    jsonlite::toJSON(mm_out, auto_unbox = TRUE, null = "null", na = "null")
  `
}

function lme4ModelCall(formulaKey: string): string | null {
  if (formulaKey === 'time_since_baseline__none__intercept') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + (1 | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__none__intercept_slope') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__baseline_age__intercept') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + baseline_age_centered + (1 | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__baseline_age__intercept_slope') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + baseline_age_centered + (1 + time_since_baseline | patient_id), data = mm_data, REML = TRUE)'
  }
  return null
}

function nlmeModelCall(formulaKey: string): string | null {
  if (formulaKey === 'time_since_baseline__none__intercept_slope') {
    return `nlme::lme(
        eGFR ~ time_since_baseline,
        random = ~ time_since_baseline | patient_id,
        data = mm_data,
        method = "REML"
      )`
  }
  return null
}

function lme4FitCode(modelCall: string): string {
  return buildFitCode(
    modelCall,
    `
    mm_first <- function(values, mask) {
      idx <- which(mask)
      if (length(idx) == 0) NA_real_ else values[idx[[1]]]
    }
    mm_fixed <- lme4::fixef(mm_fit)
    mm_intercept <- as.numeric(mm_fixed[["(Intercept)"]])
    mm_slope <- as.numeric(mm_fixed[["time_since_baseline"]])
    mm_baseline_age <- if ("baseline_age_centered" %in% names(mm_fixed)) as.numeric(mm_fixed[["baseline_age_centered"]]) else NA_real_
    mm_require_finite_fixed(mm_intercept, mm_slope)
    mm_time_ci <- tryCatch(
      confint(mm_fit, parm = "time_since_baseline", method = "Wald"),
      error = function(e) NULL
    )
    mm_time_ci_pair <- if (is.null(mm_time_ci)) NULL else mm_ci_pair(mm_time_ci[1, ])
    mm_vc <- as.data.frame(lme4::VarCorr(mm_fit))
    mm_patient_vc <- mm_vc[mm_vc$grp == "patient_id", ]
    mm_corr_mask <- mm_patient_vc$var1 == "(Intercept)" & mm_patient_vc$var2 == "time_since_baseline"
    if (!any(mm_corr_mask, na.rm = TRUE)) {
      mm_corr_mask <- mm_patient_vc$var1 == "time_since_baseline" & mm_patient_vc$var2 == "(Intercept)"
    }
    mm_lme4_messages <- mm_fit@optinfo$conv$lme4$messages
    if (is.null(mm_lme4_messages)) mm_lme4_messages <- character()
    # A boundary (singular) fit is a variance-boundary note, not an optimizer
    # convergence failure, so it must not flip converged to FALSE (it is still
    # surfaced as a warning below).
    mm_nonconv_messages <- mm_lme4_messages[!grepl("singular", mm_lme4_messages, ignore.case = TRUE)]
    mm_opt_conv <- mm_fit@optinfo$conv$opt
    mm_optimizer <- mm_fit@optinfo$optimizer
    if (is.null(mm_optimizer)) mm_optimizer <- "lme4-default"
    mm_out <- list(
      converged = (is.null(mm_opt_conv) || identical(mm_opt_conv, 0L) || identical(mm_opt_conv, 0)) && length(mm_nonconv_messages) == 0,
      warnings = unname(unique(c(mm_warnings, as.character(mm_lme4_messages)))),
      fixedEffects = list(
        intercept = mm_intercept,
        timeSinceBaseline = mm_slope,
        baselineAge = mm_nullable_number(mm_baseline_age)
      ),
      fixedEffectConfidenceIntervals = list(
        timeSinceBaseline = mm_time_ci_pair
      ),
      randomEffects = list(
        interceptSd = mm_nullable_number(mm_first(mm_patient_vc$sdcor, mm_patient_vc$var1 == "(Intercept)" & is.na(mm_patient_vc$var2))),
        slopeSd = mm_nullable_number(mm_first(mm_patient_vc$sdcor, mm_patient_vc$var1 == "time_since_baseline" & is.na(mm_patient_vc$var2))),
        interceptSlopeCorrelation = mm_nullable_number(mm_first(mm_patient_vc$sdcor, mm_corr_mask))
      ),
      residualSd = mm_nullable_number(stats::sigma(mm_fit)),
      optimizer = as.character(mm_optimizer),
      packageVersions = list(
        lme4 = as.character(utils::packageVersion("lme4")),
        jsonlite = as.character(utils::packageVersion("jsonlite"))
      )
    )`,
  )
}

function nlmeFitCode(modelCall: string): string {
  return buildFitCode(
    modelCall,
    `
    mm_fixed <- nlme::fixed.effects(mm_fit)
    mm_intercept <- as.numeric(mm_fixed[["(Intercept)"]])
    mm_slope <- as.numeric(mm_fixed[["time_since_baseline"]])
    mm_require_finite_fixed(mm_intercept, mm_slope)
    mm_fixed_intervals <- tryCatch(
      nlme::intervals(mm_fit, which = "fixed")$fixed,
      error = function(e) NULL
    )
    mm_time_ci_pair <- if (
      is.null(mm_fixed_intervals) ||
        !("time_since_baseline" %in% rownames(mm_fixed_intervals)) ||
        !all(c("lower", "upper") %in% colnames(mm_fixed_intervals))
    ) NULL else mm_ci_pair(mm_fixed_intervals["time_since_baseline", c("lower", "upper")])
    mm_vc <- nlme::VarCorr(mm_fit)
    mm_stddev <- suppressWarnings(as.numeric(mm_vc[, "StdDev"]))
    names(mm_stddev) <- rownames(mm_vc)
    mm_corr <- NA_real_
    if ("Corr" %in% colnames(mm_vc) && "time_since_baseline" %in% rownames(mm_vc)) {
      mm_corr <- suppressWarnings(as.numeric(mm_vc["time_since_baseline", "Corr"]))
    }
    # nlme::lme raises an error (not a warning) on hard non-convergence, so any
    # convergence problem that survives as a warning is the signal here.
    mm_conv_warnings <- mm_warnings[grepl("converg", mm_warnings, ignore.case = TRUE)]
    mm_out <- list(
      converged = length(mm_conv_warnings) == 0,
      warnings = unname(unique(mm_warnings)),
      fixedEffects = list(
        intercept = mm_intercept,
        timeSinceBaseline = mm_slope
      ),
      fixedEffectConfidenceIntervals = list(
        timeSinceBaseline = mm_time_ci_pair
      ),
      randomEffects = list(
        interceptSd = mm_named_number(mm_stddev, "(Intercept)"),
        slopeSd = mm_named_number(mm_stddev, "time_since_baseline"),
        interceptSlopeCorrelation = mm_nullable_number(mm_corr)
      ),
      residualSd = mm_named_number(mm_stddev, "Residual"),
      optimizer = "nlme-default",
      packageVersions = list(
        nlme = as.character(utils::packageVersion("nlme")),
        jsonlite = as.character(utils::packageVersion("jsonlite"))
      )
    )`,
  )
}
