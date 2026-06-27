import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mixedModelFormula,
  mixedModelFormulaKey,
  type MixedModelConfig,
} from '../../../src/core/mixedModel/config'
import { syntheticMixedModelRows } from '../../../src/core/mixedModel/syntheticData'
import type { MixedModelWorkerRequest, MixedModelWorkerResponse } from '../../../src/core/mixedModel/workerProtocol'

type MockWebRBehavior = {
  init?: () => Promise<unknown>
  installPackages?: () => Promise<void>
  evalRVoid?: () => Promise<void>
  evalRString?: (code: string) => Promise<string>
}

const rows = syntheticMixedModelRows()

const LEGACY_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}

const baseRequest: MixedModelWorkerRequest = {
  type: 'run-mixed-model',
  requestId: 'req-1',
  engine: 'webr-lme4',
  config: LEGACY_MIXED_MODEL_CONFIG,
  formula: mixedModelFormula(LEGACY_MIXED_MODEL_CONFIG),
  formulaKey: mixedModelFormulaKey(LEGACY_MIXED_MODEL_CONFIG),
  rows,
  datasetId: 'dataset-1',
  fitConfigHash: 'fit-1',
  wasmAssetSource: 'local-dev',
}

const validFitJson = JSON.stringify({
  converged: true,
  warnings: [],
  fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
  fixedEffectConfidenceIntervals: { timeSinceBaseline: [-2.8, -1.2] },
  randomEffects: { interceptSd: null, slopeSd: 0.5, interceptSlopeCorrelation: null },
  residualSd: 1.2,
  optimizer: 'test-optimizer',
  packageVersions: { lme4: '1.1-37', jsonlite: '2.0.0' },
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  self.onmessage = null
})

describe('webR worker runtime behavior', () => {
  it('rejects a second concurrent request while R globals are in use', async () => {
    let resolveInit: (value: unknown) => void = () => {}
    const initPromise = new Promise((resolve) => {
      resolveInit = resolve
    })
    const { messages, postRequest } = await setupWorker({
      init: () => initPromise,
    })

    postRequest(baseRequest)
    postRequest({ ...baseRequest, requestId: 'req-2' })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      requestId: 'req-2',
      result: { status: 'runtime-error', stage: 'fit', code: 'WORKER_BUSY' },
    })

    resolveInit(undefined)
    await waitForMessages(messages, 2)
  })

  it('clears failed webR init and package-load promises so later requests can retry', async () => {
    let initCalls = 0
    let installCalls = 0
    const { messages, postRequest } = await setupWorker({
      init: () => {
        initCalls += 1
        return initCalls === 1 ? Promise.reject(new Error('init failed')) : Promise.resolve()
      },
      installPackages: () => {
        installCalls += 1
        return installCalls === 1 ? Promise.reject(new Error('install failed')) : Promise.resolve()
      },
    })

    postRequest(baseRequest)
    await waitForMessages(messages, 1)
    postRequest({ ...baseRequest, requestId: 'req-2' })
    await waitForMessages(messages, 2)
    postRequest({ ...baseRequest, requestId: 'req-3' })
    await waitForMessages(messages, 3)

    expect(initCalls).toBe(2)
    expect(installCalls).toBe(2)
    expect(messages.map((message) => message.result.status)).toEqual(['runtime-error', 'unsupported', 'success'])
    expect(messages[0].result).toMatchObject({ stage: 'runtime-load', code: 'WEBR_INIT_FAILED' })
    expect(messages[1].result).toMatchObject({ stage: 'package-load', code: 'PACKAGE_UNAVAILABLE' })
  })

  it('classifies R model evaluation failures as fit errors', async () => {
    const { messages, postRequest } = await setupWorker({
      evalRString: () => Promise.reject(new Error('model failed')),
    })

    postRequest(baseRequest)
    await waitForMessages(messages, 1)

    expect(messages[0].result).toMatchObject({
      status: 'fit-error',
      stage: 'fit',
      code: 'MODEL_FIT_FAILED',
    })
  })

  it('uses the lme4 namespace when extracting fixed effects', async () => {
    let fitCode = ''
    const { messages, postRequest } = await setupWorker({
      evalRString: (code) => {
        fitCode = code
        return Promise.resolve(validFitJson)
      },
    })

    postRequest(baseRequest)
    await waitForMessages(messages, 1)

    expect(messages[0].result.status).toBe('success')
    expect(fitCode).toContain('lme4::fixef(mm_fit)')
    expect(fitCode).toContain('confint(mm_fit, parm = "time_since_baseline", method = "Wald")')
    expect(fitCode).not.toContain('stats::fixef')
    expect(fitCode).toContain('warnings = unname(unique(c(mm_warnings, as.character(mm_lme4_messages))))')
  })

  it('fits no-covariate requests when rows do not include baseline age', async () => {
    const { messages, postRequest } = await setupWorker()

    postRequest({
      ...baseRequest,
      rows: rows.map(({ baseline_age: _baselineAge, ...row }) => row),
    })
    await waitForMessages(messages, 1)

    expect(messages[0].result).toMatchObject({ status: 'success' })
  })

  it('treats a singular boundary fit as converged and guards non-finite fixed effects (lme4)', async () => {
    let fitCode = ''
    const { messages, postRequest } = await setupWorker({
      evalRString: (code) => {
        fitCode = code
        return Promise.resolve(validFitJson)
      },
    })

    postRequest(baseRequest)
    await waitForMessages(messages, 1)

    // converged must not be flipped to FALSE purely by a singular-fit note...
    expect(fitCode).toContain('mm_nonconv_messages <- mm_lme4_messages[!grepl("singular"')
    expect(fitCode).toContain('length(mm_nonconv_messages) == 0')
    // ...but the singular message is still surfaced as a warning.
    expect(fitCode).toContain('as.character(mm_lme4_messages)')
    // a degenerate fit with non-finite fixed effects is a fit error, not extraction.
    expect(fitCode).toContain('mm_require_finite_fixed(mm_intercept, mm_slope)')
  })

  it('derives nlme convergence from warnings and reads VarCorr by safe name lookup', async () => {
    let fitCode = ''
    const { messages, postRequest } = await setupWorker({
      evalRString: (code) => {
        fitCode = code
        return Promise.resolve(validFitJson)
      },
    })

    postRequest({ ...baseRequest, engine: 'webr-nlme' })
    await waitForMessages(messages, 1)

    expect(messages[0].result.status).toBe('success')
    expect(fitCode).toContain('nlme::lme(')
    expect(fitCode).not.toContain('converged = TRUE')
    expect(fitCode).toContain('mm_conv_warnings <- mm_warnings[grepl("converg"')
    expect(fitCode).toContain('mm_named_number(mm_stddev, "Residual")')
    expect(fitCode).toContain('mm_named_number(mm_stddev, "(Intercept)")')
    expect(fitCode).toContain('nlme::intervals(mm_fit, which = "fixed")')
  })

  it('returns a structured failure for unsupported mixed-model configs', async () => {
    const { messages, postRequest } = await setupWorker()

    postRequest({
      ...baseRequest,
      config: { timeAxis: 'age', covariates: [], randomEffects: 'intercept' },
      formula: '',
      formulaKey: 'unsupported__age',
    })
    await waitForMessages(messages, 1)

    expect(messages[0].result).toMatchObject({
      status: 'unsupported',
      stage: 'data-validation',
      code: 'UNSUPPORTED_MIXED_MODEL_CONFIG',
    })
  })
})

async function setupWorker(behavior: MockWebRBehavior = {}): Promise<{
  messages: MixedModelWorkerResponse[]
  postRequest: (request: MixedModelWorkerRequest) => void
}> {
  vi.resetModules()
  vi.doMock('webr', () => ({
    WebR: class MockWebR {
      version = '0.6.0'
      versionR = 'R-test'

      init(): Promise<unknown> {
        return behavior.init?.() ?? Promise.resolve()
      }

      installPackages(): Promise<void> {
        return behavior.installPackages?.() ?? Promise.resolve()
      }

      evalRVoid(): Promise<void> {
        return behavior.evalRVoid?.() ?? Promise.resolve()
      }

      evalRString(code: string): Promise<string> {
        return behavior.evalRString?.(code) ?? Promise.resolve(validFitJson)
      }
    },
  }))

  const messages: MixedModelWorkerResponse[] = []
  vi.spyOn(self, 'postMessage').mockImplementation((message) => {
    messages.push(message as MixedModelWorkerResponse)
  })
  await import('../../../src/core/mixedModel/webr.worker')
  const postRequest = (request: MixedModelWorkerRequest) => {
    self.onmessage?.(new MessageEvent('message', { data: request }))
  }
  return { messages, postRequest }
}

async function waitForMessages(messages: readonly MixedModelWorkerResponse[], count: number): Promise<void> {
  const start = Date.now()
  while (messages.length < count && Date.now() - start < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(messages).toHaveLength(count)
}
